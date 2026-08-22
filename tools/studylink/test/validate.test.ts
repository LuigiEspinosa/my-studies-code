/**
 * One case per row of the story's I/O and edge-case matrix, plus one per rule
 * and one per warning.
 *
 * Every case runs against a fixture vault built in the OS temp directory. That
 * is not a convenience: no note in the real corpus carries frontmatter until
 * story 6, the vault holds zero unresolved wikilinks, and nothing in it is
 * `status: active`, so rules 2 to 11 and all three warnings have no live
 * instances to test against at all.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import {
    formatJson,
    formatText,
    validateVault,
    type Finding,
    type ValidateOptions,
    type ValidateResult,
} from '../src/commands/validate.ts';
import {
    CODE_DIR_NAME,
    DEFAULT_STALE_DAYS,
    NOTES_DIR_NAME,
    toPosix,
    type RepoConfig,
} from '../src/config.ts';
import { EXIT_FAILURE, EXIT_OK, resourceLastTouch, runValidate, type Io } from '../src/index.ts';
import { readNote, VaultError } from '../src/vault.ts';

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

let fixtureRoot: string;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-validate-'));
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
});

type Vault = {
    readonly notesRoot: string;
    readonly codeRoot: string;
};

let vaultCount = 0;

/** A fresh pair of sibling checkouts, so relative `code` paths resolve. */
function newVault(): Vault {
    vaultCount += 1;
    const root = path.join(fixtureRoot, `vault-${String(vaultCount)}`);
    const notesRoot = path.join(root, NOTES_DIR_NAME);
    const codeRoot = path.join(root, CODE_DIR_NAME);
    mkdirSync(notesRoot, { recursive: true });
    mkdirSync(codeRoot, { recursive: true });
    return { notesRoot: toPosix(notesRoot), codeRoot: toPosix(codeRoot) };
}

function writeNote(vault: Vault, relativePath: string, contents: string): void {
    const target = path.join(vault.notesRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
}

function makeCodeDir(vault: Vault, relativePath: string): void {
    mkdirSync(path.join(vault.codeRoot, relativePath), { recursive: true });
}

function configFor(vault: Vault, staleDays = DEFAULT_STALE_DAYS): RepoConfig {
    return { notesRoot: vault.notesRoot, codeRoot: vault.codeRoot, staleDays };
}

/** Put the notes checkout under git, everything committed `days` ago. */
function commitAllAt(vault: Vault, days: number): void {
    const root = path.normalize(vault.notesRoot);
    const date = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const stamp = `${date}T12:00:00+0000`;
    const git = (args: readonly string[], env: Record<string, string> = {}): void => {
        const result = spawnSync('git', [...args], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, ...env },
        });
        if (result.status !== 0) {
            throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
        }
    };

    git(['init', '-q', '-b', 'main']);
    git(['add', '-A']);
    git(
        [
            '-c',
            'user.name=studylink test',
            '-c',
            'user.email=test@example.com',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-q',
            '-m',
            date,
        ],
        { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp }
    );
}

/** Build a frontmatter block plus a one-line body, in field order. */
function note(fields: Record<string, string>, body = '# Heading'): string {
    const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
    return ['---', ...lines, '---', '', body, ''].join('\n');
}

const LEAF: Record<string, string> = {
    source: 'tryhackme',
    slug: 'tryhackme/advent-of-cyber-2024/day-11',
    status: 'done',
    started: '2024-12-11',
    finished: '2024-12-11',
    tags: '[wifi, wpa2]',
    code: '[]',
    kind: 'note',
};

const INDEX: Record<string, string> = {
    source: 'tryhackme',
    url: 'https://tryhackme.com/room/adventofcyber24',
    slug: 'tryhackme/advent-of-cyber-2024',
    status: 'done',
    started: '2024-12-01',
    finished: '2024-12-23',
    tags: '[]',
    code: '[]',
    kind: 'index',
};

const PLATFORM: Record<string, string> = {
    source: 'tryhackme',
    status: 'done',
    tags: '[]',
    kind: 'platform',
};

const VAULT_ROOT: Record<string, string> = {
    status: 'done',
    tags: '[]',
    kind: 'platform',
};

/** A vault every rule passes, which every negative case starts from. */
function conformingVault(): Vault {
    const vault = newVault();
    writeNote(vault, 'README.md', note(VAULT_ROOT, '# Studies'));
    writeNote(vault, 'TryHackMe/README.md', note(PLATFORM, '# TryHackMe'));
    writeNote(vault, 'TryHackMe/Advent of Cyber 2024/README.md', note(INDEX, '# Advent of Cyber'));
    writeNote(vault, 'TryHackMe/Advent of Cyber 2024/Day 11.md', note(LEAF, '# Day 11'));
    return vault;
}

function check(vault: Vault, overrides: Partial<ValidateOptions> = {}): ValidateResult {
    return validateVault({ config: configFor(vault), ...overrides });
}

function rules(findings: readonly Finding[]): string[] {
    return findings.map((finding) => finding.rule);
}

function find(findings: readonly Finding[], rule: string): Finding | undefined {
    return findings.find((finding) => finding.rule === rule);
}

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

describe('matrix: the shapes validate has to get right', () => {
    it('clean vault: no violations', () => {
        const result = check(conformingVault());

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.deepEqual(result.warnings, []);
        assert.equal(result.fileCount, 4);
    });

    it('a vault with no frontmatter anywhere: one rule 1 violation per file', () => {
        // The live corpus is exactly this shape until story 6 writes
        // frontmatter, where the same behavior is one violation per note.
        const vault = newVault();
        for (const name of ['README.md', 'Books/README.md', 'Books/Chapter 1.md']) {
            writeNote(vault, name, '# Heading\n\nProse.\n');
        }

        const result = check(vault);

        assert.equal(result.fileCount, 3);
        assert.equal(result.violations.length, 3);
        assert.deepEqual(rules(result.violations), ['SL01', 'SL01', 'SL01']);
        for (const violation of result.violations) {
            assert.equal(violation.line, 1);
            assert.equal(violation.message, 'no frontmatter block');
        }
    });

    it('missing required field: names the field', () => {
        const vault = conformingVault();
        const { tags, ...withoutTags } = LEAF;
        void tags;
        writeNote(vault, 'TryHackMe/Advent of Cyber 2024/Day 11.md', note(withoutTags));

        const violation = find(check(vault).violations, 'SL01');

        assert.equal(violation?.message, 'required field missing: tags');
        assert.equal(violation?.line, 1, 'an absent field has no line of its own');
    });

    it('an index without a url conforms', () => {
        // Narrowed from "required on every kind: index". No index README in the
        // corpus carries a URL and most are behind a corporate login, so the
        // rule governed nothing it could reach and migration could not satisfy
        // it without inventing one.
        const vault = conformingVault();
        const { url, ...withoutUrl } = INDEX;
        void url;
        writeNote(vault, 'TryHackMe/Advent of Cyber 2024/README.md', note(withoutUrl));

        assert.deepEqual(check(vault).violations, []);
    });

    it('an external resource without a url still fails', () => {
        // An external resource is defined by having one, so that half of the
        // rule stays.
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, source: 'external', slug: 'external/advent-of-cyber-2024/day-11' })
        );

        assert.equal(find(check(vault).violations, 'SL01')?.message, 'required field missing: url');
    });

    it('platform reduced set: a slug on a platform file fails rule 1, not rule 5', () => {
        const vault = conformingVault();
        writeNote(vault, 'TryHackMe/README.md', note({ ...PLATFORM, slug: 'tryhackme/oops' }));

        const violations = check(vault).violations;

        assert.deepEqual(rules(violations), ['SL01']);
        assert.match(violations[0]?.message ?? '', /field not permitted on kind: platform: slug/);
        assert.equal(violations[0]?.line, 6, 'the line the offending key sits on');
    });

    it('vault-root platform file conforms without a source', () => {
        const result = check(conformingVault());

        assert.equal(
            result.violations.filter((violation) => violation.file === 'README.md').length,
            0
        );
    });

    it('vault-root rule still requires source on a platform file below the root', () => {
        const vault = conformingVault();
        const { source, ...withoutSource } = PLATFORM;
        void source;
        writeNote(vault, 'TryHackMe/README.md', note(withoutSource));

        const violation = find(check(vault).violations, 'SL01');

        assert.equal(violation?.message, 'required field missing: source');
    });

    it('dangling code entry: reports the entry and where it looked', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, code: '[../../../my-studies-code/TryHackMe/Nothing]', code_url: 'x' })
        );

        const violation = find(check(vault).violations, 'SL07');

        assert.match(violation?.message ?? '', /code entry does not resolve/);
        assert.match(violation?.message ?? '', /TryHackMe\/Nothing/);
        assert.match(violation?.message ?? '', /looked at .*my-studies-code/);
    });

    it('code entry pointing at a file: reports that it is not a directory', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'TryHackMe');
        writeFileSync(path.join(vault.codeRoot, 'TryHackMe', 'notes.md'), '# x\n', 'utf8');
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({
                ...LEAF,
                code: '[../../../my-studies-code/TryHackMe/notes.md]',
                code_url: 'https://github.com/x',
            })
        );

        const violation = find(check(vault).violations, 'SL07');

        assert.match(violation?.message ?? '', /code entry is not a directory/);
    });

    it('duplicate slug: both files are named', () => {
        const vault = conformingVault();
        writeNote(vault, 'TryHackMe/Advent of Cyber 2024/Day 12.md', note(LEAF, '# Day 12'));

        const violations = check(vault).violations.filter((violation) => violation.rule === 'SL05');

        assert.equal(violations.length, 2);
        assert.match(violations[0]?.message ?? '', /slug is not unique/);
        assert.match(violations[0]?.message ?? '', /Day 12\.md/);
        assert.match(violations[1]?.message ?? '', /Day 11\.md/);
    });

    it('done under coverage: warns, and leaves the exit code alone', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/README.md',
            note({ ...INDEX, outline_total: '24' })
        );

        const result = check(vault);

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.deepEqual(rules(result.warnings), ['SLW1']);
        assert.match(find(result.warnings, 'SLW1')?.message ?? '', /coverage 1 of 24/);
    });

    it('stale active resource: warns, and leaves the exit code alone', () => {
        const vault = conformingVault();
        const { finished, ...active } = LEAF;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...active, status: 'active' })
        );

        const result = check(vault, {
            lastTouch: () => '2026-05-01',
            now: new Date('2026-08-21T00:00:00Z'),
        });

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.deepEqual(rules(result.warnings), ['SLW2']);
        assert.match(find(result.warnings, 'SLW2')?.message ?? '', /112 days \(threshold 30\)/);
    });

    it('active resource touched inside the window: no warning', () => {
        const vault = conformingVault();
        const { finished, ...active } = LEAF;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...active, status: 'active' })
        );

        const result = check(vault, {
            lastTouch: () => '2026-08-10',
            now: new Date('2026-08-21T00:00:00Z'),
        });

        assert.deepEqual(result.warnings, []);
    });

    it('active index whose own file is old but whose units are fresh: no warning', () => {
        // SLW2 and the STALE marker in `studylink status` answer the same
        // question at the same threshold, so they have to measure the same way.
        // An index README does not change when a chapter beside it is written.
        const vault = conformingVault();
        const { finished, ...active } = INDEX;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/README.md',
            note({ ...active, status: 'active' })
        );

        const result = check(vault, {
            lastTouch: resourceLastTouch(
                new Map([
                    ['TryHackMe/Advent of Cyber 2024/README.md', '2026-01-01'],
                    ['TryHackMe/Advent of Cyber 2024/Day 11.md', '2026-08-10'],
                ])
            ),
            now: new Date('2026-08-21T00:00:00Z'),
        });

        assert.deepEqual(rules(result.warnings), [], formatText(result, false));
    });

    it('orphan code directory: warns, and leaves the exit code alone', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'Books/Orphaned Project');

        const result = check(vault);

        assert.deepEqual(result.violations, []);
        assert.deepEqual(rules(result.warnings), ['SLW3']);
        assert.equal(
            find(result.warnings, 'SLW3')?.file,
            `${CODE_DIR_NAME}/Books/Orphaned Project`
        );
        assert.equal(find(result.warnings, 'SLW3')?.line, null);
    });

    it('a claimed code directory raises no orphan warning', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'TryHackMe/Advent of Cyber 2024/day-11');
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({
                ...LEAF,
                code: '[../../../my-studies-code/TryHackMe/Advent of Cyber 2024/day-11]',
                code_url: 'https://github.com/x',
            })
        );

        const result = check(vault);

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.deepEqual(result.warnings, [], 'a deeper claim still covers the resource directory');
    });

    it('planned note: counted, never a violation', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/README.md',
            note(INDEX, '# Advent\n\n- [[Day 24]]\n- [[Day 11]]\n')
        );

        const result = check(vault);

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.equal(result.plannedNotes.length, 1, 'Day 11 exists, Day 24 does not');
        assert.equal(result.plannedNotes[0]?.target, 'Day 24');
        assert.equal(result.plannedNotes[0]?.line, 15, 'the body line the link is written on');
    });

    it('malformed frontmatter: rule 1 violation at line 1', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            '---\nkind: note\n\n# Day 11\n'
        );

        const violation = find(check(vault).violations, 'SL01');

        assert.equal(violation?.line, 1);
        assert.match(violation?.message ?? '', /never closed/);
    });

    it('the CLI supplies real commit dates, so SLW2 actually fires', { skip: !HAS_GIT }, () => {
        // Every other SLW2 case injects its own provider, so all of them stay
        // green if `runValidate` goes back to handing over `() => null`. This is
        // the one that reads a real history through the real command.
        const vault = conformingVault();
        const { finished, ...active } = LEAF;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...active, status: 'active' })
        );
        commitAllAt(vault, 200);

        const io = captureIo(vault.notesRoot);
        const code = runValidate(
            { command: 'validate', flags: new Set<string>() },
            configFor(vault),
            io
        );

        assert.equal(code, EXIT_OK, io.err.join(''));
        assert.match(io.out.join(''), /SLW2/);
        assert.match(io.out.join(''), /status: active with no commit in \d+ days/);
    });

    it('says so on stderr when it has no history to measure staleness against', () => {
        const vault = conformingVault();
        const io = captureIo(vault.notesRoot);

        runValidate({ command: 'validate', flags: new Set<string>() }, configFor(vault), io);

        // Quietly never warning looks exactly like conformance, which is the
        // one thing an advisory signal must not be mistaken for.
        assert.match(io.err.join(''), /no commit dates for .*the stalled warning cannot fire/);
    });

    it('unreadable file: VaultError, which the CLI turns into exit 2', () => {
        const vault = conformingVault();
        rmSync(vault.notesRoot, { recursive: true, force: true });
        const io = captureIo(vault.notesRoot);

        const code = runValidate(
            { command: 'validate', flags: new Set<string>() },
            configFor(vault),
            io
        );

        assert.equal(code, EXIT_FAILURE);
        assert.match(io.err.join(''), /Could not read/);
        assert.equal(io.out.length, 0);
        assert.throws(() => readNote(`${vault.notesRoot}/gone.md`), VaultError);
    });

    it('--json: one machine-readable object carrying the same counts', () => {
        const vault = conformingVault();
        writeNote(vault, 'Books/README.md', '# Books\n');

        const result = check(vault);
        const payload: unknown = JSON.parse(formatJson(result, false));

        assert.deepEqual(payload, {
            ok: false,
            summary: { files: 5, violations: 1, warnings: 0, plannedNotes: 0 },
            violations: [
                {
                    file: 'Books/README.md',
                    line: 1,
                    rule: 'SL01',
                    message: 'no frontmatter block',
                },
            ],
            warnings: [],
            plannedNotes: [],
        });
    });

    it('--quiet: the summary and nothing else', () => {
        const vault = conformingVault();
        writeNote(vault, 'Books/README.md', '# Books\n');
        const result = check(vault);

        assert.equal(
            formatText(result, true),
            '5 files checked, 1 violation, 0 warnings, 0 planned notes\n'
        );
        assert.deepEqual(JSON.parse(formatJson(result, true)), {
            ok: false,
            summary: { files: 5, violations: 1, warnings: 0, plannedNotes: 0 },
        });
    });
});

describe('the 11 rules', () => {
    it('rule 2 rejects a value outside an enum', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, status: 'finished' })
        );

        const violation = find(check(vault).violations, 'SL02');

        assert.match(violation?.message ?? '', /status is not one of/);
        assert.match(violation?.message ?? '', /finished$/);
    });

    it('rule 3 requires finished when status is done', () => {
        const vault = conformingVault();
        const { finished, ...withoutFinished } = LEAF;
        void finished;
        writeNote(vault, 'TryHackMe/Advent of Cyber 2024/Day 11.md', note(withoutFinished));

        assert.equal(
            find(check(vault).violations, 'SL03')?.message,
            'status: done requires finished'
        );
    });

    it('rule 3 rejects finished when status is not done', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, status: 'active' })
        );

        assert.match(
            find(check(vault).violations, 'SL03')?.message ?? '',
            /only valid when status is done, but status is active/
        );
    });

    it('rule 3 rejects a finished date before started', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, started: '2024-12-11', finished: '2024-12-01' })
        );

        assert.match(
            find(check(vault).violations, 'SL03')?.message ?? '',
            /finished 2024-12-01 precedes started 2024-12-11/
        );
    });

    it('rule 4 requires started unless status is backlog', () => {
        const vault = conformingVault();
        const { started, finished, ...bare } = LEAF;
        void started;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...bare, status: 'dropped' })
        );

        assert.equal(
            find(check(vault).violations, 'SL04')?.message,
            'status: dropped requires started'
        );
    });

    it('rule 4 leaves a backlog resource alone', () => {
        const vault = conformingVault();
        const { started, finished, ...bare } = LEAF;
        void started;
        void finished;
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...bare, status: 'backlog' })
        );

        const result = check(vault);

        assert.deepEqual(result.violations, [], formatText(result, false));
    });

    it('rule 5 rejects a slug that does not match the shape', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, slug: 'TryHackMe/Advent of Cyber' })
        );

        assert.match(
            find(check(vault).violations, 'SL05')?.message ?? '',
            /slug does not match <source>\/<course>/
        );
    });

    it('rule 6 rejects a slug prefix that disagrees with source', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, slug: 'books/advent-of-cyber-2024/day-11' })
        );

        assert.equal(
            find(check(vault).violations, 'SL06')?.message,
            'slug prefix books does not agree with source tryhackme'
        );
    });

    it('rule 7 resolves from the containing directory, at either depth', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'Midu.dev/Experiencias 3D con Vue/lessons/starter');
        makeCodeDir(vault, 'Books/ASP.NET Core 3 and React');

        // A leaf note directly under a platform folder: two levels up.
        writeNote(
            vault,
            'Midu.dev/Experiencias 3D con Vue.md',
            note({
                source: 'midudev',
                slug: 'midudev/experiencias-3d-con-vue',
                status: 'done',
                started: '2025-01-01',
                finished: '2025-01-02',
                tags: '[]',
                code: '[../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter]',
                code_url: 'https://github.com/x',
                kind: 'note',
            })
        );
        // An index nested inside a course folder: three levels up.
        writeNote(
            vault,
            'Books/ASP.Net Core 3 and React/README.md',
            note({
                source: 'books',
                url: 'https://example.com/book',
                slug: 'books/asp-net-core-3-and-react',
                status: 'done',
                started: '2025-02-27',
                finished: '2025-02-27',
                tags: '[]',
                code: '[../../../my-studies-code/Books/ASP.NET Core 3 and React]',
                code_url: 'https://github.com/x',
                kind: 'index',
            })
        );
        writeNote(vault, 'Books/README.md', note({ ...PLATFORM, source: 'books' }, '# Books'));
        writeNote(vault, 'Midu.dev/README.md', note({ ...PLATFORM, source: 'midudev' }, '# Midu'));

        const result = check(vault);

        assert.deepEqual(result.violations, [], formatText(result, false));
        assert.deepEqual(result.warnings, [], 'both code directories are claimed');
    });

    it('rule 7 fails the same entry written at the wrong depth', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'Books/ASP.NET Core 3 and React');
        writeNote(
            vault,
            'Books/ASP.Net Core 3 and React/README.md',
            note({
                source: 'books',
                url: 'https://example.com/book',
                slug: 'books/asp-net-core-3-and-react',
                status: 'done',
                started: '2025-02-27',
                finished: '2025-02-27',
                tags: '[]',
                // Two levels up is right for a leaf note, wrong from here.
                code: '[../../my-studies-code/Books/ASP.NET Core 3 and React]',
                code_url: 'https://github.com/x',
                kind: 'index',
            })
        );

        assert.match(
            find(check(vault).violations, 'SL07')?.message ?? '',
            /code entry does not resolve/
        );
    });

    it('rule 8 requires code_url once code is non-empty', () => {
        const vault = conformingVault();
        makeCodeDir(vault, 'TryHackMe/day-11');
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, code: '[../../../my-studies-code/TryHackMe/day-11]' })
        );

        assert.equal(
            find(check(vault).violations, 'SL08')?.message,
            'code is non-empty, so code_url is required'
        );
    });

    it('rule 9 rejects a tag that is not lowercase kebab-case', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, tags: '[wifi, WPA2, packet_capture]' })
        );

        const violations = check(vault).violations.filter((violation) => violation.rule === 'SL09');

        assert.equal(violations.length, 2);
        assert.match(violations[0]?.message ?? '', /tag is not lowercase kebab-case: WPA2/);
    });

    it('rule 11 rejects outline_total outside a kind: index', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/Day 11.md',
            note({ ...LEAF, outline_total: '24' })
        );

        assert.match(
            find(check(vault).violations, 'SL11')?.message ?? '',
            /outline_total is only valid on kind: index/
        );
    });

    it('rule 11 rejects an outline_total that is not a positive integer', () => {
        const vault = conformingVault();
        writeNote(
            vault,
            'TryHackMe/Advent of Cyber 2024/README.md',
            note({ ...INDEX, outline_total: '0' })
        );

        assert.match(
            find(check(vault).violations, 'SL11')?.message ?? '',
            /outline_total must be a positive integer/
        );
    });

    it('rules 3 to 6 are skipped for a platform file', () => {
        // status: done with no finished and no started, and no slug at all:
        // four rule violations if platform were not exempt.
        const result = check(conformingVault());

        assert.equal(
            result.violations.filter((violation) =>
                ['SL03', 'SL04', 'SL05', 'SL06'].includes(violation.rule)
            ).length,
            0
        );
    });
});

describe('the text report', () => {
    it('keeps every violation for one file together, in the contract format', () => {
        const vault = conformingVault();
        writeNote(vault, 'Books/README.md', '# Books\n');
        writeNote(vault, 'Midu.dev/README.md', '# Midu\n');
        makeCodeDir(vault, 'Books/Orphaned');

        const text = formatText(check(vault), false);
        const lines = text.split('\n');

        assert.equal(lines[0], 'Books/README.md:1 SL01 no frontmatter block');
        assert.equal(lines[1], 'Midu.dev/README.md:1 SL01 no frontmatter block');
        assert.match(text, /warnings \(do not affect the exit code\):/);
        assert.match(text, /SLW3 code directory has no note counterpart/);
        assert.match(text, /6 files checked, 2 violations, 1 warning, 0 planned notes\n$/);
    });
});
