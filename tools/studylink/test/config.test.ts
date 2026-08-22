/**
 * One case per row of the story's I/O and edge-case matrix.
 *
 * Every case runs against a throwaway fixture tree under the OS temp directory,
 * never against the live checkouts, so the suite passes on a machine where the
 * two repos sit somewhere else entirely (which is the point of discovery).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
    CODE_DIR_NAME,
    ConfigError,
    DEFAULT_STALE_DAYS,
    findCommonParent,
    NOTES_DIR_NAME,
    resolveConfig,
    toPosix,
} from '../src/config.ts';
import { EXIT_FAILURE, EXIT_OK, run, type Io } from '../src/index.ts';

let fixtureRoot: string;
/** A parent holding both checkouts, mirroring the real layout. */
let commonParent: string;
/** A nested directory inside the code checkout, to walk up from. */
let nestedDir: string;
/** A directory with no checkout anywhere above it. */
let orphanDir: string;
/** A directory that is a valid checkout but sits outside the sibling layout. */
let strayNotes: string;
let strayCode: string;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-'));

    commonParent = path.join(fixtureRoot, 'workspace');
    mkdirSync(path.join(commonParent, NOTES_DIR_NAME), { recursive: true });
    nestedDir = path.join(commonParent, CODE_DIR_NAME, 'tools', 'studylink');
    mkdirSync(nestedDir, { recursive: true });

    // Deliberately its own temp root, so nothing above it holds a checkout.
    orphanDir = mkdtempSync(path.join(tmpdir(), 'studylink-orphan-'));
    mkdirSync(path.join(orphanDir, 'somewhere', 'deep'), { recursive: true });
    orphanDir = path.join(orphanDir, 'somewhere', 'deep');

    strayNotes = path.join(fixtureRoot, 'elsewhere', 'notes-checkout');
    strayCode = path.join(fixtureRoot, 'elsewhere', 'code-checkout');
    mkdirSync(strayNotes, { recursive: true });
    mkdirSync(strayCode, { recursive: true });
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
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

describe('repo discovery', () => {
    it('resolves both siblings when cwd is the common parent', () => {
        const config = resolveConfig({ cwd: commonParent });

        assert.equal(config.notesRoot, `${toPosix(commonParent)}/${NOTES_DIR_NAME}`);
        assert.equal(config.codeRoot, `${toPosix(commonParent)}/${CODE_DIR_NAME}`);
        assert.equal(config.staleDays, DEFAULT_STALE_DAYS);
    });

    it('walks up to the first parent holding both siblings', () => {
        const fromNested = resolveConfig({ cwd: nestedDir });
        const fromParent = resolveConfig({ cwd: commonParent });

        assert.equal(fromNested.notesRoot, fromParent.notesRoot);
        assert.equal(fromNested.codeRoot, fromParent.codeRoot);
    });

    it('fails naming both directories sought and the paths walked', () => {
        let thrown: unknown;
        try {
            resolveConfig({ cwd: orphanDir });
        } catch (error) {
            thrown = error;
        }

        assert.ok(thrown instanceof ConfigError, 'expected a ConfigError');
        assert.match(thrown.message, new RegExp(NOTES_DIR_NAME));
        assert.match(thrown.message, new RegExp(CODE_DIR_NAME));
        assert.match(thrown.message, /Walked:/);
        // The walk reports every directory it inspected, starting at cwd.
        assert.ok(
            thrown.message.includes(toPosix(orphanDir)),
            'failure message should name the directory the walk started from'
        );
    });
});

describe('root overrides', () => {
    it('uses both overrides verbatim and does not walk', () => {
        // cwd has no checkout above it, so a walk would fail. It must not run.
        const config = resolveConfig({
            cwd: orphanDir,
            overrides: { notes: strayNotes, code: strayCode },
        });

        assert.equal(config.notesRoot, toPosix(strayNotes));
        assert.equal(config.codeRoot, toPosix(strayCode));
    });

    it('rejects an override that is missing or is not a directory', () => {
        const missing = path.join(fixtureRoot, 'no-such-directory');

        assert.throws(
            () => resolveConfig({ cwd: commonParent, overrides: { notes: missing } }),
            ConfigError
        );
        assert.throws(
            () => resolveConfig({ cwd: commonParent, overrides: { code: missing } }),
            ConfigError
        );
    });

    it('honors a lone --notes and still discovers codeRoot by walking', () => {
        const config = resolveConfig({ cwd: nestedDir, overrides: { notes: strayNotes } });

        assert.equal(config.notesRoot, toPosix(strayNotes));
        assert.equal(config.codeRoot, `${toPosix(commonParent)}/${CODE_DIR_NAME}`);
    });

    it('exits with a ConfigError when the partial-override walk fails', () => {
        assert.throws(
            () => resolveConfig({ cwd: orphanDir, overrides: { notes: strayNotes } }),
            ConfigError
        );
    });
});

describe('staleness threshold', () => {
    it('defaults to 30 days', () => {
        assert.equal(resolveConfig({ cwd: commonParent }).staleDays, DEFAULT_STALE_DAYS);
        assert.equal(DEFAULT_STALE_DAYS, 30);
    });

    it('carries a supplied threshold through to the config', () => {
        const config = resolveConfig({ cwd: commonParent, staleDays: 7 });

        assert.equal(config.staleDays, 7);
        assert.notEqual(config.staleDays, DEFAULT_STALE_DAYS);
    });

    it('rejects zero, a negative, and a fraction', () => {
        for (const bad of [0, -1, -30, 1.5]) {
            assert.throws(
                () => resolveConfig({ cwd: commonParent, staleDays: bad }),
                (error: unknown) =>
                    error instanceof ConfigError &&
                    /--stale expects a positive whole number of days/.test(error.message),
                `expected ${String(bad)} to be rejected`
            );
        }
    });

    it('rejects a non-numeric threshold', () => {
        assert.throws(
            () => resolveConfig({ cwd: commonParent, staleDays: Number('abc') }),
            ConfigError
        );
    });
});

describe('relative working directory', () => {
    it('resolves a relative cwd without doubling the segment', () => {
        const previous = process.cwd();
        try {
            process.chdir(fixtureRoot);
            const config = resolveConfig({ cwd: 'workspace' });

            assert.ok(
                config.notesRoot.endsWith(`/workspace/${NOTES_DIR_NAME}`),
                `notesRoot should sit under workspace/, got ${config.notesRoot}`
            );
            assert.ok(
                !config.notesRoot.includes('workspace/workspace'),
                `relative cwd was doubled: ${config.notesRoot}`
            );
        } finally {
            process.chdir(previous);
        }
    });

    it('resolves a relative override against the relative cwd exactly once', () => {
        // The upward walk hides a doubled cwd, because it recovers by climbing
        // back out of the phantom directory. Override resolution does not, so
        // this is what actually pins the single resolve.
        const previous = process.cwd();
        try {
            process.chdir(fixtureRoot);
            const config = resolveConfig({
                cwd: 'workspace',
                overrides: { notes: NOTES_DIR_NAME },
            });

            assert.ok(
                config.notesRoot.endsWith(`/workspace/${NOTES_DIR_NAME}`),
                `override should resolve under workspace/, got ${config.notesRoot}`
            );
            assert.ok(!config.notesRoot.includes('workspace/workspace'));
        } finally {
            process.chdir(previous);
        }
    });

    it('starts the upward walk at the resolved cwd, not a doubled one', () => {
        const previous = process.cwd();
        try {
            process.chdir(fixtureRoot);
            const { walked } = findCommonParent('workspace', [NOTES_DIR_NAME, CODE_DIR_NAME]);
            const first = walked[0] ?? '';

            assert.ok(
                first.endsWith('/workspace'),
                `walk should start at workspace/, got ${first}`
            );
            assert.ok(!first.includes('workspace/workspace'), `walk start was doubled: ${first}`);
        } finally {
            process.chdir(previous);
        }
    });
});

describe('path separators', () => {
    it('accepts backslash input and holds every root as POSIX', () => {
        const backslashed = toPosix(strayNotes).replace(/\//g, '\\');
        const config = resolveConfig({
            cwd: orphanDir,
            overrides: { notes: backslashed, code: strayCode },
        });

        assert.equal(config.notesRoot, toPosix(strayNotes));
        assert.ok(!config.notesRoot.includes('\\'), 'notesRoot must not carry a backslash');
        assert.ok(!config.codeRoot.includes('\\'), 'codeRoot must not carry a backslash');
    });
});

describe('argument handling', () => {
    it('prints usage on stderr and exits 2 for an unknown command', () => {
        const io = captureIo(commonParent);
        const code = run(['bogus'], io);

        assert.equal(code, EXIT_FAILURE);
        assert.equal(io.out.length, 0, 'usage for a bad command belongs on stderr');
        assert.match(io.err.join(''), /Unknown command: bogus/);
        assert.match(io.err.join(''), /Usage:/);
    });

    it('prints usage on stderr and exits 2 for an unknown flag', () => {
        const io = captureIo(commonParent);
        const code = run(['validate', '--nope'], io);

        assert.equal(code, EXIT_FAILURE);
        assert.equal(io.out.length, 0);
        assert.match(io.err.join(''), /Unknown flag for validate: --nope/);
    });

    it('prints usage on stdout and exits 0 for --help', () => {
        const io = captureIo(nestedDir);
        const code = run(['--help'], io);

        assert.equal(code, EXIT_OK);
        assert.equal(io.err.length, 0);
        assert.match(io.out.join(''), /Usage:/);
    });

    it('exits 2 naming what it sought when a command names a missing checkout', () => {
        const io = captureIo(commonParent);
        const code = run(['validate', '--notes', path.join(fixtureRoot, 'nonexistent')], io);

        assert.equal(code, EXIT_FAILURE);
        assert.match(io.err.join(''), /--notes/);
        assert.match(io.err.join(''), /does not point at an existing directory/);
    });
});
