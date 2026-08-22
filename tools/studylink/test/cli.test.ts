/**
 * The CLI shell: dispatch, the argument guards, and the real entry point.
 *
 * The I/O and edge-case matrix is covered in config.test.ts. What lives here is
 * everything else the shell owes stories 2 to 5: that an unimplemented command
 * fails rather than reporting success, that the flags it accepts are validated,
 * and that running the module as a program actually produces those exit codes.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { CODE_DIR_NAME, DEFAULT_STALE_DAYS, NOTES_DIR_NAME } from '../src/config.ts';
import {
    COMMANDS,
    EXIT_FAILURE,
    EXIT_OK,
    parseArgs,
    run,
    UsageError,
    type Io,
} from '../src/index.ts';

const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

let fixtureRoot: string;
/** A parent holding both checkouts, so config resolution succeeds. */
let commonParent: string;
/** A directory with no checkout anywhere above it. */
let orphanDir: string;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-cli-'));
    commonParent = path.join(fixtureRoot, 'workspace');
    mkdirSync(path.join(commonParent, NOTES_DIR_NAME), { recursive: true });
    mkdirSync(path.join(commonParent, CODE_DIR_NAME), { recursive: true });

    orphanDir = mkdtempSync(path.join(tmpdir(), 'studylink-cli-orphan-'));
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(orphanDir, { recursive: true, force: true });
});

function captureIo(cwd: string): Io & { out: string[]; err: string[] } {
    const out: string[] = [];
    const err: string[] = [];
    return {
        cwd,
        out,
        err,
        stdout: (text: string) => void out.push(text),
        stderr: (text: string) => void err.push(text),
    };
}

/** The commands still waiting for their own story. */
const UNIMPLEMENTED = COMMANDS.filter((command) => command !== 'validate');

describe('dispatch', () => {
    it('fails every command that has no implementation yet', () => {
        // Guards the mutation that turns this into EXIT_OK, which would let an
        // unbuilt command report success to a caller or a CI job.
        assert.deepEqual(UNIMPLEMENTED, ['index', 'status', 'migrate']);

        for (const command of UNIMPLEMENTED) {
            const io = captureIo(commonParent);
            const code = run([command], io);

            assert.equal(code, EXIT_FAILURE, `${command} must not report success`);
            assert.match(io.err.join(''), /is not implemented yet/);
            assert.match(io.err.join(''), new RegExp(`studylink ${command} `));
            assert.equal(io.out.length, 0, `${command} must not write to stdout`);
        }
    });

    it('routes validate to its implementation instead of the stub', () => {
        const io = captureIo(commonParent);
        const code = run(['validate'], io);

        assert.equal(code, EXIT_OK, 'an empty vault has nothing to violate');
        assert.equal(io.err.length, 0);
        assert.match(io.out.join(''), /0 files checked, 0 violations/);
    });

    it('reports validate findings as JSON under --json', () => {
        const io = captureIo(commonParent);
        const code = run(['validate', '--json'], io);

        assert.equal(code, EXIT_OK);
        assert.deepEqual(JSON.parse(io.out.join('')), {
            ok: true,
            summary: { files: 0, violations: 0, warnings: 0, plannedNotes: 0 },
            violations: [],
            warnings: [],
            plannedNotes: [],
        });
    });

    it('reduces validate to a summary under --quiet', () => {
        const io = captureIo(commonParent);

        assert.equal(run(['validate', '--quiet'], io), EXIT_OK);
        assert.equal(
            io.out.join(''),
            '0 files checked, 0 violations, 0 warnings, 0 planned notes\n'
        );
    });

    it('accepts --stale on validate, which owns the stalled warning', () => {
        const io = captureIo(commonParent);

        assert.equal(run(['validate', '--stale', '7'], io), EXIT_OK);
        assert.throws(() => parseArgs(['validate', '--stale', 'nope']), UsageError);
    });

    it('reports the roots it resolved', () => {
        const io = captureIo(commonParent);
        run(['migrate'], io);
        const err = io.err.join('');

        assert.match(err, new RegExp(`notes: .*${NOTES_DIR_NAME}`));
        assert.match(err, new RegExp(`code: .*${CODE_DIR_NAME}`));
    });

    it('carries a supplied --stale through to the resolved config', () => {
        // Guards the mutation that drops the staleDays wiring in run() and
        // substitutes the default.
        const io = captureIo(commonParent);
        const code = run(['status', '--stale', '7'], io);

        assert.equal(code, EXIT_FAILURE);
        assert.match(io.err.join(''), /stale: 7 days/);
    });

    it('falls back to the default threshold when --stale is absent', () => {
        const io = captureIo(commonParent);
        run(['status'], io);

        assert.match(io.err.join(''), new RegExp(`stale: ${String(DEFAULT_STALE_DAYS)} days`));
    });

    it('rejects a --stale that is not a positive whole number', () => {
        for (const bad of ['0', '-2', '1.5', 'abc']) {
            const io = captureIo(commonParent);
            const code = run(['status', '--stale', bad], io);

            assert.equal(code, EXIT_FAILURE, `--stale ${bad} must be rejected`);
            assert.equal(io.out.length, 0);
        }
    });
});

describe('value flag guards', () => {
    it('rejects an empty value instead of silently meaning the cwd', () => {
        const io = captureIo(commonParent);
        const code = run(['validate', '--notes', ''], io);

        assert.equal(code, EXIT_FAILURE);
        assert.match(io.err.join(''), /--notes expects a value/);
        assert.equal(io.out.length, 0);
    });

    it('rejects an empty value for every value-taking flag', () => {
        for (const flag of ['--notes', '--code']) {
            assert.throws(() => parseArgs(['validate', flag, '']), UsageError);
        }
        assert.throws(() => parseArgs(['status', '--stale', '']), UsageError);
    });

    it('rejects a repeated value flag instead of letting the last one win', () => {
        const io = captureIo(commonParent);
        const code = run(['status', '--stale', '5', '--stale', '9'], io);

        assert.equal(code, EXIT_FAILURE);
        assert.match(io.err.join(''), /--stale was given more than once/);
    });

    it('rejects a repeated --notes and a repeated --code', () => {
        assert.throws(
            () => parseArgs(['validate', '--notes', 'a', '--notes', 'b']),
            (error: unknown) =>
                error instanceof UsageError &&
                /--notes was given more than once/.test(error.message)
        );
        assert.throws(() => parseArgs(['validate', '--code', 'a', '--code', 'b']), UsageError);
    });

    it('still rejects a value flag with nothing after it', () => {
        assert.throws(() => parseArgs(['validate', '--notes']), UsageError);
        assert.throws(() => parseArgs(['validate', '--notes', '--quiet']), UsageError);
    });
});

describe('help ordering', () => {
    it('reports an unknown command even when --help is present', () => {
        // The matrix requires an unknown command to produce usage on stderr and
        // exit 2; a trailing --help must not convert that into success.
        const io = captureIo(commonParent);
        const code = run(['bogus', '--help'], io);

        assert.equal(code, EXIT_FAILURE);
        assert.equal(io.out.length, 0, 'usage for a bad command belongs on stderr');
        assert.match(io.err.join(''), /Unknown command: bogus/);
    });

    it('honors --help for a real command', () => {
        for (const argv of [['--help'], ['-h'], ['validate', '--help'], ['status', '-h']]) {
            const io = captureIo(commonParent);
            const code = run(argv, io);

            assert.equal(code, EXIT_OK, `${argv.join(' ')} should exit 0`);
            assert.equal(io.err.length, 0);
            assert.match(io.out.join(''), /Usage:/);
        }
    });

    it('honors --help without needing a resolvable checkout', () => {
        const io = captureIo(orphanDir);
        const code = run(['--help'], io);

        assert.equal(code, EXIT_OK);
        assert.match(io.out.join(''), /Usage:/);
    });
});

describe('entry point', () => {
    it('carries a node shebang', () => {
        const firstLine = readFileSync(ENTRY, 'utf8').split('\n', 1)[0];
        assert.equal(firstLine, '#!/usr/bin/env node');
    });

    it('exits 2 and explains itself when spawned as a program', () => {
        // Guards the mutation that makes isEntryPoint() return false: the
        // in-process tests stay green while the real CLI does nothing and
        // exits 0.
        const result = spawnSync(process.execPath, [ENTRY, 'status'], {
            cwd: commonParent,
            encoding: 'utf8',
        });

        assert.equal(result.status, EXIT_FAILURE, `stderr was: ${result.stderr}`);
        assert.match(result.stderr, /studylink status is not implemented yet/);
        assert.equal(result.stdout, '');
    });

    it('exits 0 and prints usage when spawned with --help', () => {
        const result = spawnSync(process.execPath, [ENTRY, '--help'], {
            cwd: commonParent,
            encoding: 'utf8',
        });

        assert.equal(result.status, EXIT_OK, `stderr was: ${result.stderr}`);
        assert.match(result.stdout, /Usage:/);
    });

    it('exits 2 when spawned where no checkout can be found', () => {
        const result = spawnSync(process.execPath, [ENTRY, 'validate'], {
            cwd: orphanDir,
            encoding: 'utf8',
        });

        assert.equal(result.status, EXIT_FAILURE);
        assert.match(result.stderr, new RegExp(NOTES_DIR_NAME));
        assert.match(result.stderr, /Walked:/);
    });
});
