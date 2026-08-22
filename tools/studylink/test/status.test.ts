/**
 * `studylink status`, one case per row of the story's I/O matrix.
 *
 * Nothing in the corpus is active and no note carries frontmatter until story
 * 6, so the whole interesting half of this command has no live data. The
 * fixtures stand in for it: one mirrors the corpus as migration will leave it,
 * so the contract's quiet report can be asserted character for character, and
 * the rest carry the active resources the vault does not have yet.
 *
 * Dates are injected wherever the point of the case is the derivation, and read
 * from a real repository in the one case whose point is the whole chain.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    collectStatus,
    formatStatus,
    formatTriage,
    isResource,
    triageStalled,
    type Ask,
    type StatusOptions,
} from '../src/commands/status.ts';
import { DEFAULT_STALE_DAYS, toPosix, type RepoConfig } from '../src/config.ts';
import { EXIT_FAILURE, EXIT_OK, parseArgs, run, runStatus, type Io } from '../src/index.ts';
import { VaultError } from '../src/vault.ts';

const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

/** Root ignores the mode bits, so the unwritable-file cases prove nothing there. */
const IS_ROOT = process.getuid?.() === 0;

function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): void {
    const result = spawnSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
}

/**
 * Put both checkouts of `config` under git, everything committed `days` ago.
 *
 * Dated from the real clock rather than `NOW`, because the point of a case that
 * uses this is the whole chain including the clock the CLI actually reads.
 */
function commitAllAt(config: RepoConfig, days: number): void {
    const date = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const stamp = `${date}T12:00:00+0000`;

    for (const root of [path.normalize(config.notesRoot), path.normalize(config.codeRoot)]) {
        git(root, ['init', '-q', '-b', 'main']);
        // git refuses an empty commit, and an empty code checkout is normal.
        writeFileSync(path.join(root, '.keep'), '', 'utf8');
        git(root, ['add', '-A']);
        git(
            root,
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
}

/** Fixed reference date, chosen so the contract's example ages come out exact. */
const NOW = new Date('2026-09-06T12:00:00Z');

let fixtureRoot: string;
let caseCount = 0;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-status-'));
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
});

/** Build a pair of checkouts from a map of repo-relative path to contents. */
function vault(files: Record<string, string>, dirs: readonly string[] = []): RepoConfig {
    caseCount += 1;
    const root = path.join(fixtureRoot, `case-${String(caseCount)}`);
    const notesRoot = path.join(root, 'my-studies');
    const codeRoot = path.join(root, 'my-studies-code');
    mkdirSync(notesRoot, { recursive: true });
    mkdirSync(codeRoot, { recursive: true });

    for (const [relative, contents] of Object.entries(files)) {
        const target = path.join(root, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, contents, 'utf8');
    }
    for (const relative of dirs) {
        mkdirSync(path.join(root, relative), { recursive: true });
    }

    return {
        notesRoot: toPosix(notesRoot),
        codeRoot: toPosix(codeRoot),
        staleDays: DEFAULT_STALE_DAYS,
    };
}

function withThreshold(config: RepoConfig, staleDays: number): RepoConfig {
    return { ...config, staleDays };
}

/** Commit dates, keyed by repo-relative path, as the git fold produces them. */
function dates(
    notes: Record<string, string>,
    code: Record<string, string> = {}
): StatusOptions['dates'] {
    return { notes: new Map(Object.entries(notes)), code: new Map(Object.entries(code)) };
}

function report(options: StatusOptions): string {
    return formatStatus(collectStatus({ now: NOW, ...options }));
}

function captureIo(cwd: string): { io: Io; stdout: () => string; stderr: () => string } {
    let out = '';
    let err = '';
    return {
        io: { cwd, stdout: (text) => (out += text), stderr: (text) => (err += text) },
        stdout: () => out,
        stderr: () => err,
    };
}

// --------------------------------------------------------------------------
// Frontmatter blocks, shaped the way migration will write them.
// --------------------------------------------------------------------------

function platformNote(title: string, source?: string): string {
    const lines = ['---', 'kind: platform', 'status: done', 'tags: []'];
    if (source !== undefined) {
        lines.splice(1, 0, `source: ${source}`);
    }
    return `${[...lines, '---', '', `# ${title}`, ''].join('\n')}`;
}

type NoteOptions = {
    readonly status?: string;
    readonly outlineTotal?: number;
    readonly code?: readonly string[];
};

function resourceNote(
    kind: 'index' | 'note',
    source: string,
    slug: string,
    title: string,
    options: NoteOptions = {}
): string {
    const status = options.status ?? 'done';
    const lines = ['---', `source: ${source}`, `slug: ${slug}`, `status: ${status}`];
    if (options.outlineTotal !== undefined) {
        lines.push(`outline_total: ${String(options.outlineTotal)}`);
    }
    lines.push('started: 2025-02-27');
    if (status === 'done') {
        lines.push('finished: 2025-03-14');
    }
    lines.push('tags: []');
    if (options.code === undefined || options.code.length === 0) {
        lines.push('code: []');
    } else {
        lines.push('code:');
        for (const entry of options.code) {
            lines.push(`  - ${entry}`);
        }
        lines.push('code_url: https://github.com/LuigiEspinosa/my-studies-code/tree/main/x');
    }
    lines.push(`kind: ${kind}`, '---', '', `# ${title}`, '');
    return lines.join('\n');
}

// --------------------------------------------------------------------------
// The corpus as migration will leave it: 21 resources, every one of them done.
// --------------------------------------------------------------------------

/** 13 Veeva certifications, which is what makes the resource count 21. */
const VEEVA_CERTS = Array.from({ length: 13 }, (_, index) => `Certification ${String(index + 1)}`);

function postMigrationVault(outline?: {
    readonly slug: string;
    readonly total: number;
}): RepoConfig {
    const files: Record<string, string> = {
        'my-studies/README.md': platformNote('My Studies'),
        'my-studies/Books/README.md': platformNote('Books', 'books'),
        'my-studies/Midu.dev/README.md': platformNote('Midu.dev', 'midudev'),
        'my-studies/Santander Open Academy/README.md': platformNote('Santander', 'santander'),
        'my-studies/TryHackMe/README.md': platformNote('TryHackMe', 'tryhackme'),
        'my-studies/Veeva Learning/README.md': platformNote('Veeva Learning', 'veeva'),
    };

    const index = (dir: string, source: string, slug: string, title: string): void => {
        files[`my-studies/${dir}/README.md`] = resourceNote('index', source, slug, title, {
            outlineTotal: outline?.slug === slug ? outline.total : undefined,
        });
    };
    const leaf = (file: string, source: string, slug: string, title: string): void => {
        files[`my-studies/${file}`] = resourceNote('note', source, slug, title);
    };

    // Three resources represented by a README with leaf notes beside it.
    index('Books/ASP.Net Core 3 and React', 'books', 'books/asp-net-core-3-and-react', 'ASP.NET');
    index(
        'Santander Open Academy/High-Performance Leadership',
        'santander',
        'santander/high-performance-leadership',
        'High-Performance Leadership'
    );
    index('TryHackMe/Advent of Cyber 2024', 'tryhackme', 'tryhackme/advent-of-cyber-2024', 'AoC');
    for (const parent of [
        ['Books/ASP.Net Core 3 and React', 'books', 'books/asp-net-core-3-and-react'],
        [
            'Santander Open Academy/High-Performance Leadership',
            'santander',
            'santander/high-performance-leadership',
        ],
        ['TryHackMe/Advent of Cyber 2024', 'tryhackme', 'tryhackme/advent-of-cyber-2024'],
    ] as const) {
        for (const unit of ['One', 'Two', 'Three']) {
            leaf(
                `${parent[0]}/${unit}.md`,
                parent[1],
                `${parent[2]}/${unit.toLowerCase()}`,
                `${unit}`
            );
        }
    }

    // 13 Veeva certifications, one leaf note each.
    VEEVA_CERTS.forEach((cert, position) => {
        const slug = `veeva/certification-${String(position + 1)}`;
        index(`Veeva Learning/${cert}`, 'veeva', slug, cert);
        leaf(`Veeva Learning/${cert}/Lesson.md`, 'veeva', `${slug}/lesson`, 'Lesson');
    });

    // 5 Midu.dev workshops: resources represented by a leaf note, not a folder.
    for (const [file, slug] of [
        ['Experiencias 3D con Vue', 'midudev/experiencias-3d-con-vue'],
        ['Figma para Devs', 'midudev/figma-para-devs'],
        ['Introducción al Web Scraping con Python', 'midudev/introduccion-al-web-scraping'],
        ['Lo último de JavaScript', 'midudev/lo-ultimo-de-javascript'],
        ['PWA de Detección de Objetos', 'midudev/pwa-de-deteccion-de-objetos'],
    ] as const) {
        leaf(`Midu.dev/${file}.md`, 'midudev', slug, file);
    }

    return vault(files);
}

const QUIET_REPORT = [
    'active (0)',
    'done (21)   backlog (0)   dropped (0)',
    'coverage: unknown for 21 of 21 (no outlines recorded)',
    'planned notes (unresolved wikilinks): 0',
    '',
].join('\n');

describe('the quiet report', () => {
    it('prints the contract block for a corpus where every resource is done', () => {
        const config = postMigrationVault();
        const result = collectStatus({ config, now: NOW, dates: dates({}) });

        assert.equal(result.resources.length, 21, 'the corpus holds 21 resources');
        assert.equal(result.counts.done, 21);
        assert.equal(result.notesWithoutFrontmatter, 0);
        assert.equal(formatStatus(result), QUIET_REPORT);
    });

    it('counts the 5 single-note workshops as resources and the 6 platform files as not', () => {
        // The mutation this guards is treating `kind: index` as the only
        // resource kind, which silently reports 16 instead of 21.
        const result = collectStatus({
            config: postMigrationVault(),
            now: NOW,
            dates: dates({}),
        });
        const slugs = result.resources.map((resource) => resource.slug);

        assert.equal(slugs.filter((slug) => slug.startsWith('midudev/')).length, 5);
        assert.ok(slugs.includes('midudev/figma-para-devs'), 'a workshop leaf note is a resource');
        assert.ok(
            !slugs.some((slug) => slug.split('/').length === 3),
            'a unit inside a resource is not itself a resource'
        );
    });

    it('separates a resource from a unit by slug depth, not by kind alone', () => {
        assert.equal(isResource('index', 'books/asp-net-core-3-and-react'), true);
        assert.equal(isResource('note', 'midudev/figma-para-devs'), true);
        assert.equal(isResource('note', 'tryhackme/advent-of-cyber-2024/day-11'), false);
        assert.equal(isResource('platform', 'books/anything'), false);
        assert.equal(isResource('note', null), false);
        assert.equal(isResource(null, 'books/anything'), false);
    });
});

// --------------------------------------------------------------------------
// The interesting path: active resources, and the one that has gone quiet.
// --------------------------------------------------------------------------

/** Two active resources, the ages the cli-contract example uses. */
function activeVault(): RepoConfig {
    return vault({
        'my-studies/README.md': platformNote('My Studies'),
        'my-studies/Books/README.md': platformNote('Books', 'books'),
        'my-studies/Books/Some Book/README.md': resourceNote(
            'index',
            'books',
            'books/some-book',
            'Some Book',
            { status: 'active' }
        ),
        'my-studies/TryHackMe/README.md': platformNote('TryHackMe', 'tryhackme'),
        'my-studies/TryHackMe/SOC Level 1/README.md': resourceNote(
            'index',
            'tryhackme',
            'tryhackme/soc-level-1',
            'SOC Level 1',
            { status: 'active' }
        ),
    });
}

const ACTIVE_DATES = dates({
    'TryHackMe/SOC Level 1/README.md': '2026-09-02',
    'Books/Some Book/README.md': '2026-07-11',
});

describe('active resources', () => {
    it('lists each one with its date and age, flagging only the stale one', () => {
        assert.equal(
            report({ config: activeVault(), dates: ACTIVE_DATES }),
            [
                'active (2)',
                '  books/some-book          last touch 2026-07-11   57d   STALE',
                '  tryhackme/soc-level-1    last touch 2026-09-02    4d',
                'done (0)   backlog (0)   dropped (0)',
                'coverage: unknown for 2 of 2 (no outlines recorded)',
                'planned notes (unresolved wikilinks): 0',
                '',
            ].join('\n')
        );
    });

    it('leaves exactly 30 days alone and flags 31', () => {
        const config = activeVault();
        const at = (staleDays: number): string =>
            report({ config: withThreshold(config, staleDays), dates: ACTIVE_DATES });

        // 2026-08-07 is exactly 30 days before NOW, so it sits on the boundary.
        const boundary = dates({
            'TryHackMe/SOC Level 1/README.md': '2026-08-07',
            'Books/Some Book/README.md': '2026-08-06',
        });
        const lines = report({ config, dates: boundary }).split('\n');

        assert.ok(
            lines.some((line) => line.includes('tryhackme/soc-level-1') && !line.includes('STALE')),
            'exactly 30 days is not past a 30-day threshold'
        );
        assert.ok(
            lines.some((line) => line.includes('books/some-book') && line.includes('STALE')),
            '31 days is'
        );
        assert.ok(at(DEFAULT_STALE_DAYS).includes('STALE'));
    });

    it('honors a custom threshold in both directions', () => {
        const config = activeVault();

        const strict = report({ config: withThreshold(config, 7), dates: ACTIVE_DATES });
        assert.ok(strict.includes('books/some-book') && strict.includes('STALE'));
        assert.ok(
            !strict.split('\n').some((l) => l.includes('tryhackme/') && l.includes('STALE')),
            '4 days is inside a 7-day window'
        );

        const loose = report({ config: withThreshold(config, 90), dates: ACTIVE_DATES });
        assert.ok(!loose.includes('STALE'), 'nothing is stale at 90 days');
    });

    it('never flags a resource whose last touch is unknown', () => {
        // A missing date proves nothing, which is the same reason completion is
        // never inferred from one.
        const text = report({ config: activeVault(), dates: dates({}) });

        assert.ok(text.includes('last touch unknown'));
        assert.ok(!text.includes('STALE'));
    });

    it('counts a commit in the code repo as touching the resource', () => {
        const config = vault(
            {
                'my-studies/README.md': platformNote('My Studies'),
                'my-studies/Midu.dev/README.md': platformNote('Midu.dev', 'midudev'),
                'my-studies/Midu.dev/Experiencias 3D con Vue.md': resourceNote(
                    'note',
                    'midudev',
                    'midudev/experiencias-3d-con-vue',
                    'Experiencias 3D con Vue',
                    {
                        status: 'active',
                        code: [
                            '../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter',
                        ],
                    }
                ),
            },
            ['my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter']
        );

        const text = report({
            config,
            dates: dates(
                { 'Midu.dev/Experiencias 3D con Vue.md': '2026-07-08' },
                { 'Midu.dev/Experiencias 3D con Vue/lessons/starter/main.js': '2026-09-04' }
            ),
        });

        assert.ok(text.includes('last touch 2026-09-04'), `code date should win, got:\n${text}`);
        assert.ok(!text.includes('STALE'), '60-day-old notes plus 2-day-old code is not stalled');
    });

    it('counts a commit under an index as touching the index resource', () => {
        // The README itself never changes when a new chapter is written, so a
        // resource that only read its own file would look permanently stalled.
        const config = vault({
            'my-studies/README.md': platformNote('My Studies'),
            'my-studies/Books/README.md': platformNote('Books', 'books'),
            'my-studies/Books/Some Book/README.md': resourceNote(
                'index',
                'books',
                'books/some-book',
                'Some Book',
                { status: 'active' }
            ),
            'my-studies/Books/Some Book/Chapter 4.md': resourceNote(
                'note',
                'books',
                'books/some-book/chapter-4',
                'Chapter 4'
            ),
        });

        const text = report({
            config,
            dates: dates({
                'Books/Some Book/README.md': '2026-01-01',
                'Books/Some Book/Chapter 4.md': '2026-09-05',
            }),
        });

        assert.ok(text.includes('last touch 2026-09-05'), text);
        assert.ok(!text.includes('STALE'), 'a chapter written yesterday is not a stalled resource');
    });
});

describe('coverage', () => {
    /** The one coverage row, with its column padding collapsed. */
    function coverageRow(text: string): string {
        const row = text
            .split('\n')
            .find((line) => line.includes('books/asp-net-core-3-and-react'));
        return (row ?? '').trim().replace(/\s+/g, ' ');
    }

    it('reports a resource with an outline as a fraction and the rest as unknown', () => {
        const config = postMigrationVault({ slug: 'books/asp-net-core-3-and-react', total: 5 });
        const text = report({ config, dates: dates({}) });

        assert.ok(text.includes('coverage: unknown for 20 of 21'), text);
        assert.equal(coverageRow(text), 'books/asp-net-core-3-and-react 3 of 5');
    });

    it('reports a complete outline without inventing a shortfall marker', () => {
        const config = postMigrationVault({ slug: 'books/asp-net-core-3-and-react', total: 3 });
        const text = report({ config, dates: dates({}) });

        assert.equal(coverageRow(text), 'books/asp-net-core-3-and-react 3 of 3');
    });

    it('says so plainly when there are no resources at all', () => {
        const config = vault({ 'my-studies/README.md': platformNote('My Studies') });

        assert.ok(report({ config, dates: dates({}) }).includes('coverage: no resources'));
    });
});

describe('a vault with no repository behind it', () => {
    it('reports unknown dates, names the problem, and still succeeds', () => {
        const config = activeVault();
        // No injected dates, so the real reader runs against a directory that
        // was never `git init`ed.
        const result = collectStatus({ config, now: NOW });

        assert.equal(result.gitProblems.length, 2, 'one line per checkout');
        assert.ok(result.resources.every((resource) => resource.lastTouch === null));
        assert.ok(result.resources.every((resource) => !resource.stale));

        const io = captureIo(config.notesRoot);
        assert.equal(
            run(['status', '--notes', config.notesRoot, '--code', config.codeRoot], io.io),
            EXIT_OK
        );
        assert.match(io.stderr(), /no commit dates for/);
        assert.match(io.stdout(), /last touch unknown/);
    });
});

describe('a vault with no frontmatter, which is the corpus today', () => {
    it('finds no resources and names how many notes are bare', () => {
        const config = vault({
            'my-studies/README.md': '# My Studies\n',
            'my-studies/Books/README.md': '# Books\n',
            'my-studies/Books/Chapter 1.md': '# Chapter 1\n',
        });

        assert.equal(
            report({ config, dates: dates({}) }),
            [
                'active (0)',
                'done (0)   backlog (0)   dropped (0)',
                'coverage: no resources',
                'planned notes (unresolved wikilinks): 0',
                'notes with no frontmatter: 3',
                '',
            ].join('\n')
        );
    });

    it('counts an unresolved wikilink as a planned note', () => {
        const config = vault({
            'my-studies/README.md': `${platformNote('My Studies')}\n- [[Day 24]]\n- [[Chapter 1]]\n`,
            'my-studies/Chapter 1.md': '# Chapter 1\n',
        });

        assert.ok(
            report({ config, dates: dates({}) }).includes('planned notes (unresolved wikilinks): 1')
        );
    });
});

// --------------------------------------------------------------------------
// --triage, the only place the tool writes a status.
// --------------------------------------------------------------------------

/** One stalled resource, plus one that is not, so triage must pick. */
function triageVault(): RepoConfig {
    return vault({
        'my-studies/README.md': platformNote('My Studies'),
        'my-studies/Books/README.md': platformNote('Books', 'books'),
        'my-studies/Books/Some Book/README.md': resourceNote(
            'index',
            'books',
            'books/some-book',
            'Some Book',
            { status: 'active' }
        ),
    });
}

const STALE_NOTE = 'my-studies/Books/Some Book/README.md';

function read(config: RepoConfig, relative: string): string {
    return readFileSync(path.join(path.dirname(config.notesRoot), relative), 'utf8');
}

function scripted(replies: readonly (string | null)[]): { ask: Ask; asked: string[] } {
    const asked: string[] = [];
    let position = 0;
    return {
        asked,
        ask: (question) => {
            asked.push(question);
            const reply = replies[position];
            position += 1;
            return reply ?? null;
        },
    };
}

function stalledResult(config: RepoConfig): ReturnType<typeof collectStatus> {
    return collectStatus({
        config,
        now: NOW,
        dates: dates({ 'Books/Some Book/README.md': '2026-07-11' }),
    });
}

describe('--triage', () => {
    it('writes done and a finished date, leaving every other byte alone', () => {
        const config = triageVault();
        const before = read(config, STALE_NOTE);
        const outcomes = triageStalled(stalledResult(config), scripted(['done']).ask);
        const after = read(config, STALE_NOTE);

        assert.deepEqual(outcomes, [{ slug: 'books/some-book', answer: 'done', written: true }]);
        assert.ok(after.includes('status: done'));
        assert.ok(after.includes('finished: 2026-07-11'));
        assert.equal(
            after.replace('status: done', 'status: active').replace('finished: 2026-07-11\n', ''),
            before,
            'nothing outside those two lines may change'
        );
    });

    it('puts finished after started, where the schema field table has it', () => {
        const config = triageVault();
        triageStalled(stalledResult(config), scripted(['done']).ask);
        const lines = read(config, STALE_NOTE).split('\n');

        assert.ok(
            lines.indexOf('started: 2025-02-27') < lines.indexOf('finished: 2026-07-11'),
            `finished should follow started:\n${lines.join('\n')}`
        );
    });

    it('writes dropped without inventing a finished date', () => {
        const config = triageVault();
        triageStalled(stalledResult(config), scripted(['dropped']).ask);
        const after = read(config, STALE_NOTE);

        assert.ok(after.includes('status: dropped'));
        assert.ok(!after.includes('finished:'), 'finished belongs only to done');
    });

    it('takes an existing finished back out when the answer is dropped', () => {
        // Rule 3 says finished is present when and only when status is done, so
        // the only writer of status must not be able to leave one stranded.
        const config = vault({
            'my-studies/README.md': platformNote('My Studies'),
            'my-studies/Books/README.md': platformNote('Books', 'books'),
            [`my-studies/Books/Some Book/README.md`]: resourceNote(
                'index',
                'books',
                'books/some-book',
                'Some Book',
                { status: 'active' }
            ).replace('started: 2025-02-27', 'started: 2025-02-27\nfinished: 2025-03-14'),
        });

        triageStalled(stalledResult(config), scripted(['dropped']).ask);
        const after = read(config, STALE_NOTE);

        assert.ok(after.includes('status: dropped'));
        assert.ok(!after.includes('finished:'), 'the stranded finished should be gone');
        assert.ok(after.includes('started: 2025-02-27'), 'started is not touched');
    });

    it('writes nothing when the answer is still active', () => {
        const config = triageVault();
        const before = read(config, STALE_NOTE);
        const outcomes = triageStalled(stalledResult(config), scripted(['active']).ask);

        assert.equal(outcomes[0]?.written, false);
        assert.equal(read(config, STALE_NOTE), before);
    });

    it('re-asks once on an answer it does not understand, then leaves the note alone', () => {
        const config = triageVault();
        const before = read(config, STALE_NOTE);
        const prompt = scripted(['maybe', null]);
        const outcomes = triageStalled(stalledResult(config), prompt.ask);

        assert.equal(prompt.asked.length, 2, 'asked once, then once more');
        assert.deepEqual(outcomes, [{ slug: 'books/some-book', answer: null, written: false }]);
        assert.equal(read(config, STALE_NOTE), before);
        assert.match(formatTriage(outcomes, DEFAULT_STALE_DAYS), /skipped/);
    });

    it('accepts an answer whatever its case and surrounding space', () => {
        const config = triageVault();
        triageStalled(stalledResult(config), scripted([' DONE ']).ask);

        assert.ok(read(config, STALE_NOTE).includes('status: done'));
    });

    it('asks nothing and reports nothing when no resource is stalled', () => {
        const config = postMigrationVault();
        const prompt = scripted(['done']);
        const outcomes = triageStalled(
            collectStatus({ config, now: NOW, dates: dates({}) }),
            prompt.ask
        );

        assert.deepEqual(outcomes, []);
        assert.equal(prompt.asked.length, 0);
        assert.equal(formatTriage(outcomes, DEFAULT_STALE_DAYS), 'triage: nothing stalled\n');
    });

    it('names the resource and its age in the question it asks', () => {
        const config = triageVault();
        const prompt = scripted(['active']);
        triageStalled(stalledResult(config), prompt.ask);

        assert.match(prompt.asked[0] ?? '', /books\/some-book/);
        assert.match(prompt.asked[0] ?? '', /2026-07-11/);
        assert.match(prompt.asked[0] ?? '', /57d/);
        assert.match(prompt.asked[0] ?? '', /done, dropped, active\?/);
    });

    it('fails with a VaultError when the note cannot be written', { skip: IS_ROOT }, () => {
        const config = triageVault();
        const target = path.join(path.dirname(config.notesRoot), STALE_NOTE);
        chmodSync(target, 0o444);

        try {
            assert.throws(
                () => triageStalled(stalledResult(config), scripted(['done']).ask),
                VaultError
            );
        } finally {
            chmodSync(target, 0o644);
        }
    });
});

// --------------------------------------------------------------------------
// Several stalled at once, which is the case triage exists for.
// --------------------------------------------------------------------------

/** Three resources, all active and all past the threshold. */
function threeStalledVault(): RepoConfig {
    const files: Record<string, string> = {
        'my-studies/README.md': platformNote('My Studies'),
        'my-studies/Books/README.md': platformNote('Books', 'books'),
    };
    for (const name of ['One', 'Two', 'Three']) {
        files[`my-studies/Books/Book ${name}/README.md`] = resourceNote(
            'index',
            'books',
            `books/book-${name.toLowerCase()}`,
            `Book ${name}`,
            { status: 'active' }
        );
    }
    return vault(files);
}

function threeStalledResult(config: RepoConfig): ReturnType<typeof collectStatus> {
    return collectStatus({
        config,
        now: NOW,
        dates: dates({
            'Books/Book One/README.md': '2026-07-11',
            'Books/Book Two/README.md': '2026-07-11',
            'Books/Book Three/README.md': '2026-07-11',
        }),
    });
}

describe('--triage over several stalled resources', () => {
    it('asks about every one of them and writes each answer', () => {
        const config = threeStalledVault();
        // Sorted by slug: one, three, two.
        const outcomes = triageStalled(
            threeStalledResult(config),
            scripted(['done', 'dropped', 'active']).ask
        );

        assert.deepEqual(
            outcomes.map((outcome) => [outcome.slug, outcome.answer, outcome.written]),
            [
                ['books/book-one', 'done', true],
                ['books/book-three', 'dropped', true],
                ['books/book-two', 'active', false],
            ]
        );
    });

    it('keeps going after one answer it could not understand', () => {
        // A typo on the first resource must not silently abandon the other two,
        // which is what sharing one null return between "skip" and "no more
        // input" produced.
        const config = threeStalledVault();
        const prompt = scripted(['maybe', 'nonsense', 'done', 'done']);
        const outcomes = triageStalled(threeStalledResult(config), prompt.ask);

        assert.deepEqual(
            outcomes.map((outcome) => [outcome.slug, outcome.written]),
            [
                ['books/book-one', false],
                ['books/book-three', true],
                ['books/book-two', true],
            ]
        );
        assert.equal(prompt.asked.length, 4, 'two questions for the first, one each after');
    });

    it('stops asking once input runs out, and says which were skipped', () => {
        const config = threeStalledVault();
        const prompt = scripted(['done', null]);
        const outcomes = triageStalled(threeStalledResult(config), prompt.ask);

        assert.equal(prompt.asked.length, 2, 'no further question after end of input');
        assert.deepEqual(
            outcomes.map((outcome) => outcome.written),
            [true, false, false]
        );
        assert.match(
            formatTriage(outcomes, DEFAULT_STALE_DAYS),
            /triage: 3 stalled resources \(no commit in 30 days\)/
        );
    });

    it(
        'still reports the notes it already wrote when a later one fails',
        { skip: !HAS_GIT || IS_ROOT },
        () => {
            const config = threeStalledVault();
            commitAllAt(config, 57);
            // Second in slug order, so the first is written before this throws.
            const target = path.join(
                path.dirname(config.notesRoot),
                'my-studies/Books/Book Three/README.md'
            );
            chmodSync(target, 0o444);

            try {
                const io = captureIo(config.notesRoot);
                const exit = runStatus(
                    parseArgs(['status', '--triage']),
                    config,
                    io.io,
                    () => 'done'
                );

                assert.equal(exit, EXIT_FAILURE);
                assert.match(io.stderr(), /Could not write/);
                assert.match(
                    io.stdout(),
                    /books\/book-one\s+done/,
                    `the note already rewritten must still be reported:\n${io.stdout()}`
                );
                assert.ok(
                    read(config, 'my-studies/Books/Book One/README.md').includes('status: done'),
                    'and it really was rewritten'
                );
            } finally {
                chmodSync(target, 0o644);
            }
        }
    );
});

describe('--triage through the command shell', () => {
    /** A vault whose single active resource really is 57 days old on disk. */
    function gitTriageVault(): RepoConfig {
        const config = triageVault();
        commitAllAt(config, 57);
        return config;
    }

    it('prints the report, then the triage summary, and still exits 0', { skip: !HAS_GIT }, () => {
        const config = gitTriageVault();
        const io = captureIo(config.notesRoot);
        const exit = runStatus(parseArgs(['status', '--triage']), config, io.io, () => 'done');

        assert.equal(exit, EXIT_OK);
        assert.match(io.stdout(), /active \(1\)/);
        assert.match(io.stdout(), /triage: 1 stalled resource/);
        assert.ok(read(config, STALE_NOTE).includes('status: done'));
    });

    it('exits 2 when a note it must write cannot be written', { skip: !HAS_GIT || IS_ROOT }, () => {
        const config = gitTriageVault();
        const target = path.join(path.dirname(config.notesRoot), STALE_NOTE);
        chmodSync(target, 0o444);

        try {
            const io = captureIo(config.notesRoot);
            const exit = runStatus(parseArgs(['status', '--triage']), config, io.io, () => 'done');

            // The report itself never fails, but a triage write that silently
            // reported success would lose the human's answer.
            assert.equal(exit, EXIT_FAILURE);
            assert.match(io.stderr(), /Could not write/);
        } finally {
            chmodSync(target, 0o644);
        }
    });

    it('reads an answer from real stdin', { skip: !HAS_GIT }, () => {
        // The one piece of platform-specific I/O in the story, and the only way
        // to exercise it is a real process with a real pipe on stdin.
        const config = gitTriageVault();
        const result = spawnSync(
            process.execPath,
            [ENTRY, 'status', '--triage', '--notes', config.notesRoot, '--code', config.codeRoot],
            {
                cwd: path.dirname(path.normalize(config.notesRoot)),
                encoding: 'utf8',
                input: 'done\n',
            }
        );

        assert.equal(result.status, EXIT_OK, `stderr was: ${result.stderr}`);
        // The question goes to stderr, so redirecting the report to a file
        // still puts the prompt in front of the human answering it.
        assert.match(result.stderr, /done, dropped, active\?/);
        assert.doesNotMatch(result.stdout, /done, dropped, active\?/);
        assert.ok(read(config, STALE_NOTE).includes('status: done'));
        assert.ok(read(config, STALE_NOTE).includes('finished:'));
    });

    it('accepts an answer typed on a CRLF terminal', { skip: !HAS_GIT }, () => {
        const config = gitTriageVault();
        const result = spawnSync(
            process.execPath,
            [ENTRY, 'status', '--triage', '--notes', config.notesRoot, '--code', config.codeRoot],
            {
                cwd: path.dirname(path.normalize(config.notesRoot)),
                encoding: 'utf8',
                input: 'dropped\r\n',
            }
        );

        assert.equal(result.status, EXIT_OK, `stderr was: ${result.stderr}`);
        assert.ok(
            read(config, STALE_NOTE).includes('status: dropped'),
            'a trailing carriage return must not make the answer unreadable'
        );
    });

    it('leaves every stalled resource alone when nothing answers', { skip: !HAS_GIT }, () => {
        const config = gitTriageVault();
        const before = read(config, STALE_NOTE);
        const result = spawnSync(
            process.execPath,
            [ENTRY, 'status', '--triage', '--notes', config.notesRoot, '--code', config.codeRoot],
            { cwd: path.dirname(path.normalize(config.notesRoot)), encoding: 'utf8', input: '' }
        );

        assert.equal(result.status, EXIT_OK);
        assert.match(result.stdout, /skipped/);
        assert.equal(read(config, STALE_NOTE), before);
    });
});

// --------------------------------------------------------------------------
// The whole chain, from a real commit to a printed STALE marker.
// --------------------------------------------------------------------------

describe('end to end, through the CLI and a real repository', { skip: !HAS_GIT }, () => {
    /** `days` before today, as `YYYY-MM-DD`. */
    function daysAgo(days: number): string {
        const date = new Date(Date.now() - days * 86_400_000);
        return date.toISOString().slice(0, 10);
    }

    function commit(root: string, date: string): void {
        const stamp = `${date}T12:00:00+0000`;
        git(root, ['add', '-A']);
        git(
            root,
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

    it('flags the resource whose real last commit is past the threshold', () => {
        const config = activeVault();
        const notes = path.normalize(config.notesRoot);
        const code = path.normalize(config.codeRoot);

        for (const root of [notes, code]) {
            git(root, ['init', '-q', '-b', 'main']);
        }
        writeFileSync(path.join(code, '.keep'), '', 'utf8');
        commit(code, daysAgo(200));

        // Two commits, so each resource carries its own date: everything but the
        // SOC room lands 57 days ago, and the SOC room lands 4 days ago.
        const soc = path.join(notes, 'TryHackMe', 'SOC Level 1', 'README.md');
        const socText = readFileSync(soc, 'utf8');
        rmSync(soc);
        commit(notes, daysAgo(57));
        writeFileSync(soc, socText, 'utf8');
        commit(notes, daysAgo(4));

        const io = captureIo(config.notesRoot);
        const exit = run(['status', '--notes', config.notesRoot, '--code', config.codeRoot], io.io);
        const lines = io.stdout().split('\n');

        assert.equal(exit, EXIT_OK, 'the report is never a gate');
        assert.equal(io.stderr(), '', 'a real repository produces no git problems');
        assert.match(io.stdout(), /tryhackme\/soc-level-1\s+last touch \d{4}-\d{2}-\d{2}\s+4d/);
        assert.ok(
            lines.some((line) => line.includes('books/some-book') && line.includes('STALE')),
            `the 57-day resource should be STALE:\n${io.stdout()}`
        );
        assert.ok(
            !lines.some((line) => line.includes('tryhackme/') && line.includes('STALE')),
            'the 4-day resource should not be'
        );
    });

    it('carries --stale through the CLI into the derivation', () => {
        // Guards the mutation that drops `staleDays` on the way from parseArgs
        // to resolveConfig: the report would silently fall back to 30 days.
        const config = activeVault();
        const notes = path.normalize(config.notesRoot);
        const code = path.normalize(config.codeRoot);
        for (const root of [notes, code]) {
            git(root, ['init', '-q', '-b', 'main']);
        }
        writeFileSync(path.join(code, '.keep'), '', 'utf8');
        commit(code, daysAgo(200));
        commit(notes, daysAgo(10));

        const roots = ['--notes', config.notesRoot, '--code', config.codeRoot];

        const loose = captureIo(config.notesRoot);
        assert.equal(run(['status', ...roots], loose.io), EXIT_OK);
        assert.ok(!loose.stdout().includes('STALE'), '10 days is inside the 30-day default');

        const strict = captureIo(config.notesRoot);
        assert.equal(run(['status', '--stale', '7', ...roots], strict.io), EXIT_OK);
        assert.match(strict.stdout(), /STALE/);
    });
});
