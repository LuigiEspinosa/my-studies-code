/**
 * `studylink migrate`, one case per row of the story's I/O matrix.
 *
 * The derivations are the risky part, so most cases inject a commit stream
 * rather than building a repository: what is being proved is which date a rule
 * picks, not that `git log` works, which `git.test.ts` already owns. Two cases
 * do run the whole chain against a real repository, because the exclusion table
 * is written the way `git log --oneline` prints and only a real log proves the
 * prefixes match anything.
 *
 * No case asserts a live corpus count. The vault was 121 notes when the
 * contract was written and is 120 today, and story 6 changes what every one of
 * them contains, so a suite pinned to today's numbers would fail for being
 * right.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import { validateVault } from '../src/commands/validate.ts';
import {
    foldToSlug,
    formatGaps,
    formatMigration,
    isResourceLevel,
    kindFor,
    planMigration,
    slugFor,
    type MigrateResult,
} from '../src/commands/migrate.ts';
import { applyChanges } from '../src/commands/index.ts';
import { BULK_COMMITS, DEFAULT_STALE_DAYS, toPosix, type RepoConfig } from '../src/config.ts';
import { type Commit } from '../src/git.ts';
import {
    EXIT_FAILURE,
    EXIT_FINDINGS,
    EXIT_OK,
    parseArgs,
    runMigrate,
    UsageError,
    type Io,
} from '../src/index.ts';

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

let fixtureRoot: string;
let caseCount = 0;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-migrate-'));
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

function read(config: RepoConfig, relative: string): string {
    return readFileSync(path.join(path.dirname(config.notesRoot), relative), 'utf8');
}

function commit(sha: string, date: string, ...files: string[]): Commit {
    return { sha, date, files };
}

function plan(config: RepoConfig, commits: readonly Commit[]): MigrateResult {
    return planMigration({ config, commits });
}

/** The block `migrate` would put at the head of one note. */
function blockFor(result: MigrateResult, relative: string): string {
    const change = result.changes.find((entry) => entry.file.endsWith(relative));
    assert.ok(change !== undefined, `no change planned for ${relative}`);
    const after = change.after.split('\n');
    const before = (change.before ?? '').split('\n');
    return after.slice(0, after.length - before.length).join('\n');
}

/** The frontmatter value of `key` in a rendered block, or null when absent. */
function field(block: string, key: string): string | null {
    const line = block.split('\n').find((text) => text.startsWith(`${key}:`));
    return line === undefined ? null : line.slice(key.length + 1).trim();
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

function note(title: string, body = ''): string {
    return `# ${title}\n${body === '' ? '' : `\n${body}\n`}`;
}

// --------------------------------------------------------------------------
// Path to identity: kind, slug, and the folding both sides of the join use.
// --------------------------------------------------------------------------

describe('accent folding', () => {
    it('folds the four cases the story names', () => {
        assert.equal(
            foldToSlug('Introducción al Web Scraping con Python'),
            'introduccion-al-web-scraping-con-python'
        );
        assert.equal(
            foldToSlug('Lo último de JavaScript (ES2023 & ES2024)'),
            'lo-ultimo-de-javascript-es2023-es2024'
        );
        assert.equal(
            foldToSlug('PWA de Detección de Objetos con Angular 19 y TensorFlow.js'),
            'pwa-de-deteccion-de-objetos-con-angular-19-y-tensorflow-js'
        );
        assert.equal(
            foldToSlug('High-Performance Leadership - Lessons from Formula 1®'),
            'high-performance-leadership-lessons-from-formula-1'
        );
    });

    it('leaves no leading or trailing separator behind', () => {
        // `Formula 1®` ends in a character that folds to a separator, so without
        // the trim the slug ends in a hyphen and fails the contract's pattern.
        for (const text of ['Formula 1®', '- Leading -', '¿Qué?']) {
            const folded = foldToSlug(text);
            assert.ok(!folded.startsWith('-') && !folded.endsWith('-'), `got ${folded}`);
        }
    });

    it('collapses a run of separators to one', () => {
        assert.equal(foldToSlug('Chapter 6, Managing State'), 'chapter-6-managing-state');
        assert.equal(foldToSlug('Share - Remote CLM'), 'share-remote-clm');
    });
});

describe('the tier a path sits in', () => {
    it('reads the vault root and a platform README as platform', () => {
        assert.equal(kindFor('README.md'), 'platform');
        assert.equal(kindFor('Books/README.md'), 'platform');
    });

    it('reads a resource README as index and anything else as note', () => {
        assert.equal(kindFor('Books/ASP.Net Core 3 and React/README.md'), 'index');
        assert.equal(kindFor('Midu.dev/Figma para Devs.md'), 'note');
        assert.equal(kindFor('TryHackMe/Advent of Cyber 2024/Day 11.md'), 'note');
    });
});

describe('slugs', () => {
    it('drops README and the extension, so a resource and its index share one', () => {
        assert.equal(
            slugFor('Books/ASP.Net Core 3 and React/README.md'),
            'books/asp-net-core-3-and-react'
        );
        assert.equal(
            slugFor('Books/ASP.Net Core 3 and React/Chapter 6, Managing State with Redux.md'),
            'books/asp-net-core-3-and-react/chapter-6-managing-state-with-redux'
        );
    });

    it('gives a single-note workshop a two-segment slug', () => {
        assert.equal(slugFor('Midu.dev/Figma para Devs.md'), 'midudev/figma-para-devs');
    });

    it('recognizes the Platzi folder and folds the accents out of its paths', () => {
        assert.equal(
            slugFor('Platzi/Escuela de Blockchain y Web3/README.md'),
            'platzi/escuela-de-blockchain-y-web3'
        );
        assert.equal(
            slugFor(
                'Platzi/Escuela de Blockchain y Web3/Curso Básico de Computadores e Informática.md'
            ),
            'platzi/escuela-de-blockchain-y-web3/curso-basico-de-computadores-e-informatica'
        );
    });

    it('has no slug for a platform folder it does not recognize', () => {
        assert.equal(slugFor('Coursera/Something.md'), null);
    });
});

// --------------------------------------------------------------------------
// A vault shaped like the corpus, small enough to assert whole.
// --------------------------------------------------------------------------

const CORPUS_FILES: Record<string, string> = {
    'my-studies/AGENTS.md': note('Agent instructions'),
    'my-studies/README.md': note('My Studies'),
    'my-studies/Books/README.md': note('Books'),
    'my-studies/Books/ASP.Net Core 3 and React/README.md': note('ASP.NET Core 3 and React'),
    'my-studies/Books/ASP.Net Core 3 and React/Chapter 6, Managing State with Redux.md': note(
        'Chapter 6: Managing State with Redux'
    ),
    'my-studies/Midu.dev/README.md': note('Midu.dev'),
    'my-studies/Midu.dev/Experiencias 3D con Vue.md': note(
        'Experiencias 3D con Vue',
        '> [!NOTE]\n> [Crea experiencias 3D](https://midu.dev/curso/experiencias-3d-con-vue)'
    ),
    'my-studies/Midu.dev/Figma para Devs.md': note(
        'Figma para Devs',
        '> [!NOTE]\n> [Figma para Devs](https://midu.dev/curso/figma-para-devs)'
    ),
};

const CORPUS_DIRS = [
    'my-studies-code/Books/ASP.NET Core 3 and React',
    'my-studies-code/Midu.dev/Experiencias 3D con Vue',
];

const CORPUS_COMMITS: readonly Commit[] = [
    commit(
        'aaaaaaa',
        '2025-02-27',
        'Books/ASP.Net Core 3 and React/Chapter 6, Managing State with Redux.md'
    ),
    commit('bbbbbbb', '2025-04-30', 'Midu.dev/Experiencias 3D con Vue.md'),
    commit('ccccccc', '2025-05-01', 'Midu.dev/Figma para Devs.md'),
    commit('ddddddd', '2026-03-19', 'README.md', 'Books/README.md', 'Midu.dev/README.md'),
];

function corpus(): RepoConfig {
    return vault(CORPUS_FILES, CORPUS_DIRS);
}

describe('a dry run over a vault shaped like the corpus', () => {
    it('plans one change per note and writes nothing', () => {
        const config = corpus();
        const result = plan(config, CORPUS_COMMITS);

        assert.equal(result.gaps.length, 0, formatGaps(result));
        // 8 markdown files sit in the fixture; AGENTS.md is not one of the notes.
        assert.equal(result.noteCount, 7);
        assert.equal(result.changes.length, 7);
        assert.equal(result.alreadyMigrated, 0);
        assert.deepEqual(result.byKind, { platform: 3, index: 1, note: 3 });
        assert.equal(result.withCode, 2);
        assert.ok(!read(config, 'my-studies/README.md').startsWith('---'), 'nothing written');
    });

    it('reports the counts and says how to apply', () => {
        const text = formatMigration(plan(corpus(), CORPUS_COMMITS), false);

        assert.match(text, /7 notes: 3 platform, 1 index, 3 note/);
        assert.match(text, /2 notes carry code, 0 notes already migrated/);
        assert.match(text, /7 files would change; pass --write to apply/);
    });

    it('shows the block it would add under each file it names', () => {
        // The preview is the entire point of the dry run: story 6 reads it
        // before approving a write across the whole vault. Without this, a
        // renderer that emitted no `+` lines at all would keep the suite green.
        const text = formatMigration(plan(corpus(), CORPUS_COMMITS), false);

        assert.match(
            text,
            /my-studies\/Books\/README\.md \(platform\)\n {2}\+ ---\n {2}\+ source: books\n {2}\+ status: done\n {2}\+ tags: \[\]\n {2}\+ kind: platform\n {2}\+ ---\n/
        );
        assert.match(
            text,
            / {2}\+ {3}- \.\.\/\.\.\/\.\.\/my-studies-code\/Books\/ASP\.NET Core 3 and React\n/
        );
    });

    it('says the files were written once they have been', () => {
        assert.match(formatMigration(plan(corpus(), CORPUS_COMMITS), true), /7 files written/);
    });

    it('leaves AGENTS.md out of the corpus entirely', () => {
        // It is agent instructions for the repo, not a unit of study, so it
        // carries no frontmatter and never will.
        const result = plan(corpus(), CORPUS_COMMITS);

        assert.ok(!result.changes.some((change) => change.file.endsWith('AGENTS.md')));
    });
});

describe('what each tier receives', () => {
    it('gives the vault root the reduced set with no source', () => {
        const block = blockFor(plan(corpus(), CORPUS_COMMITS), 'my-studies/README.md');

        assert.equal(
            block,
            ['---', 'status: done', 'tags: []', 'kind: platform', '---', ''].join('\n')
        );
    });

    it('gives a platform README the reduced set with a source', () => {
        const block = blockFor(plan(corpus(), CORPUS_COMMITS), 'Books/README.md');

        assert.equal(
            block,
            ['---', 'source: books', 'status: done', 'tags: []', 'kind: platform', '---', ''].join(
                '\n'
            )
        );
    });

    it('gives a leaf note its own dates, an empty code list, and its source link', () => {
        const block = blockFor(plan(corpus(), CORPUS_COMMITS), 'Figma para Devs.md');

        assert.equal(field(block, 'source'), 'midudev');
        assert.equal(field(block, 'url'), 'https://midu.dev/curso/figma-para-devs');
        assert.equal(field(block, 'slug'), 'midudev/figma-para-devs');
        assert.equal(field(block, 'started'), '2025-05-01');
        assert.equal(field(block, 'finished'), '2025-05-01');
        assert.equal(field(block, 'tags'), '[]');
        assert.equal(field(block, 'code'), '[]');
        assert.equal(field(block, 'kind'), 'note');
    });

    it('writes the fields in the order the schema field table lists them', () => {
        const block = blockFor(plan(corpus(), CORPUS_COMMITS), 'Experiencias 3D con Vue.md');
        const keys = block
            .split('\n')
            .filter((line) => /^[a-z_]+:/.test(line))
            .map((line) => line.slice(0, line.indexOf(':')));

        assert.deepEqual(keys, [
            'source',
            'url',
            'slug',
            'status',
            'started',
            'finished',
            'tags',
            'code',
            'code_url',
            'kind',
        ]);
    });

    it('never writes an outline_total or a tag', () => {
        // Both are deliberate omissions: no surviving resource carries an
        // outline, and auto-tagging from filenames would re-encode the folder
        // structure that tags exist to replace.
        const text = formatMigration(plan(corpus(), CORPUS_COMMITS), false);

        assert.ok(!text.includes('outline_total'));
        assert.ok(!/tags: \[.+\]/.test(text), 'every tags list is empty');
    });

    it('gives every note the same status, whatever its dates say', () => {
        for (const change of plan(corpus(), CORPUS_COMMITS).changes) {
            assert.match(change.after, /^(.*\n)*status: done\n/, change.file);
        }
    });
});

describe('the cross-repo join', () => {
    it('matches ASP.Net to ASP.NET on the folded slug, not the path', () => {
        // The two repos really do spell this resource differently, so a path
        // comparison finds nothing and the note comes out with code: [].
        const block = blockFor(
            plan(corpus(), CORPUS_COMMITS),
            'ASP.Net Core 3 and React/README.md'
        );

        assert.equal(
            block.split('\n').find((line) => line.startsWith('  - ')),
            '  - ../../../my-studies-code/Books/ASP.NET Core 3 and React'
        );
        assert.equal(
            field(block, 'code_url'),
            'https://github.com/LuigiEspinosa/my-studies-code/tree/main/Books/ASP.NET%20Core%203%20and%20React'
        );
    });

    it('resolves a code path from the note directory, so depth varies', () => {
        const result = plan(corpus(), CORPUS_COMMITS);
        const nested = blockFor(result, 'ASP.Net Core 3 and React/README.md');
        const shallow = blockFor(result, 'Experiencias 3D con Vue.md');

        assert.ok(nested.includes('  - ../../../my-studies-code/'), 'a note in a course folder');
        assert.ok(shallow.includes('  - ../../my-studies-code/'), 'a note under a platform folder');
    });

    it('gives a resource with no code counterpart an empty list and no code_url', () => {
        const block = blockFor(plan(corpus(), CORPUS_COMMITS), 'Figma para Devs.md');

        assert.equal(field(block, 'code'), '[]');
        assert.equal(field(block, 'code_url'), null);
    });

    it('gives a unit inside a resource no code, even when the resource has some', () => {
        // Only the resource-level note carries the link; a three-segment slug
        // never matches a code directory.
        const block = blockFor(
            plan(corpus(), CORPUS_COMMITS),
            'Chapter 6, Managing State with Redux.md'
        );

        assert.equal(field(block, 'code'), '[]');
    });
});

// --------------------------------------------------------------------------
// The date cascade: own commits, subtree, links, table.
// --------------------------------------------------------------------------

/** An index with chapters, plus one that links notes it does not own. */
function veevaVault(): RepoConfig {
    return vault({
        'my-studies/README.md': note('My Studies'),
        'my-studies/Veeva Learning/README.md': note('Veeva Learning'),
        'my-studies/Veeva Learning/Owning Certification/README.md': note(
            'Owning Certification',
            '- [Lesson One](./Lesson%20One.md)'
        ),
        'my-studies/Veeva Learning/Owning Certification/Lesson One.md': note('Lesson One'),
        'my-studies/Veeva Learning/Owning Certification/Lesson Two.md': note('Lesson Two'),
        'my-studies/Veeva Learning/Curriculum Certification/README.md': note(
            'Curriculum Certification',
            [
                '- [Contents](#contents)',
                '',
                '## Contents',
                '',
                '- [Lesson One](../Owning%20Certification/Lesson%20One.md)',
                '- [Lesson Two](../Owning%20Certification/Lesson%20Two.md)',
            ].join('\n')
        ),
        'my-studies/Veeva Learning/Start Here - Multichannel Certification/README.md': note(
            'Start Here - Multichannel Certification',
            'URL: <https://www.veeva.com/privacy/>'
        ),
    });
}

const VEEVA_COMMITS: readonly Commit[] = [
    commit('1111111', '2024-10-15', 'Veeva Learning/Owning Certification/Lesson One.md'),
    commit('2222222', '2025-04-21', 'Veeva Learning/Owning Certification/Lesson Two.md'),
    // The reformatting pass that created every README, and is excluded.
    commit(
        '3159172',
        '2026-03-27',
        'Veeva Learning/Owning Certification/README.md',
        'Veeva Learning/Curriculum Certification/README.md',
        'Veeva Learning/Start Here - Multichannel Certification/README.md',
        'Veeva Learning/README.md',
        'README.md'
    ),
];

describe('dating an index', () => {
    it('rolls up the subtree when the index has no surviving commit of its own', () => {
        // Its only commit is the Lint pass, so its own history is empty by the
        // time the filter has run; the chapters beneath it are what it covers.
        const block = blockFor(plan(veevaVault(), VEEVA_COMMITS), 'Owning Certification/README.md');

        assert.equal(field(block, 'started'), '2024-10-15');
        assert.equal(field(block, 'finished'), '2025-04-21');
    });

    it('falls back to the notes it links when it owns none', () => {
        const block = blockFor(
            plan(veevaVault(), VEEVA_COMMITS),
            'Curriculum Certification/README.md'
        );

        assert.equal(field(block, 'started'), '2024-10-15');
        assert.equal(field(block, 'finished'), '2025-04-21');
    });

    it('never lets the link fallback widen an index its own subtree already dated', () => {
        // `Owning Certification` links only Lesson One, so a cascade that ran
        // the link step regardless would still say 2024-10-15 -- but one that
        // preferred links over the subtree would lose Lesson Two's date.
        const block = blockFor(plan(veevaVault(), VEEVA_COMMITS), 'Owning Certification/README.md');

        assert.equal(
            field(block, 'finished'),
            '2025-04-21',
            'the unlinked Lesson Two still counts'
        );
    });

    it('takes a declared date only once both derivations come up empty', () => {
        const block = blockFor(
            plan(veevaVault(), VEEVA_COMMITS),
            'Start Here - Multichannel Certification/README.md'
        );

        assert.equal(field(block, 'started'), '2024-10-15');
        assert.equal(field(block, 'finished'), '2024-10-15');
    });

    it('does not mistake an anchor table of contents for a linked note', () => {
        // `- [Contents](#contents)` resolves to nothing on disk, so it must not
        // reach the date roll-up or the file lookup.
        const result = plan(veevaVault(), VEEVA_COMMITS);

        assert.equal(result.gaps.length, 0, formatGaps(result));
    });

    it('leaves the one index whose head link is a privacy policy without a url', () => {
        // The index tier is eligible for a lift, so this is not the tier being
        // asserted: it is that `NON_CANONICAL_URLS` names this link. A privacy
        // policy answers a different question than "the canonical URL of the
        // course, room, or book", however prominently the note carries it.
        const block = blockFor(
            plan(veevaVault(), VEEVA_COMMITS),
            'Start Here - Multichannel Certification/README.md'
        );

        assert.equal(field(block, 'url'), null);
    });
});

describe('lifting a source link', () => {
    function head(body: string): string {
        return blockFor(
            plan(
                vault({
                    'my-studies/README.md': note('My Studies'),
                    'my-studies/Midu.dev/README.md': note('Midu.dev'),
                    'my-studies/Midu.dev/Course.md': note('Course', body),
                }),
                [commit('1111111', '2025-05-01', 'Midu.dev/Course.md')]
            ),
            'Midu.dev/Course.md'
        );
    }

    it('takes the one link a note opens with', () => {
        assert.equal(
            field(head('[Course](https://midu.dev/curso/x)'), 'url'),
            'https://midu.dev/curso/x'
        );
    });

    it('takes nothing when the head carries two different links', () => {
        // Two candidates and no way to tell which is the source, so recording
        // either would be a guess.
        assert.equal(
            field(head('[a](https://one.example) and [b](https://two.example)'), 'url'),
            null
        );
    });

    it('takes nothing when the head carries none', () => {
        assert.equal(field(head('Plain prose with no link at all.'), 'url'), null);
    });

    it('ignores a link written past the head', () => {
        assert.equal(
            field(head(['', '', '', '', '', '[late](https://late.example)'].join('\n')), 'url'),
            null
        );
    });

    it('leaves the body line exactly where the author wrote it', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Midu.dev/README.md': note('Midu.dev'),
            'my-studies/Midu.dev/Course.md': note('Course', '[Course](https://midu.dev/curso/x)'),
        });
        const result = plan(config, [commit('1111111', '2025-05-01', 'Midu.dev/Course.md')]);
        const change = result.changes.find((entry) => entry.file.endsWith('Midu.dev/Course.md'));

        assert.ok(
            change?.after.endsWith(change.before ?? ''),
            'the original file is intact beneath the block'
        );
    });

    it('skips a url the contract has named as not a resource URL', () => {
        assert.equal(field(head('URL: <https://www.veeva.com/privacy/>'), 'url'), null);
    });

    it('still finds the resource URL in a head that also carries a named one', () => {
        // Filtering runs before the one-candidate count, so a legal link sitting
        // beside the course link does not read as ambiguity and cost the note a
        // value it plainly carries.
        assert.equal(
            field(
                head('[Course](https://midu.dev/curso/x) - <https://www.veeva.com/privacy/>'),
                'url'
            ),
            'https://midu.dev/curso/x'
        );
    });
});

// --------------------------------------------------------------------------
// Which tier may carry a url at all.
// --------------------------------------------------------------------------

describe('resource level', () => {
    it('counts an index, whose whole subject is one resource', () => {
        assert.equal(isResourceLevel('index', 'veeva/engage-technical-certification-v5'), true);
    });

    it('counts a leaf note that is itself the resource', () => {
        // The 5 Midu.dev workshops are single-page courses filed straight under
        // the platform folder, which is what the two-segment slug records.
        assert.equal(isResourceLevel('note', 'midudev/figma-para-devs'), true);
    });

    it('excludes a unit inside a resource', () => {
        assert.equal(isResourceLevel('note', 'tryhackme/advent-of-cyber-2024/day-11'), false);
    });

    it('excludes a platform file, which is navigation above the resource tier', () => {
        assert.equal(isResourceLevel('platform', null), false);
    });

    it('excludes a note whose slug could not be derived', () => {
        assert.equal(isResourceLevel('note', null), false);
    });
});

describe('lifting a url by tier', () => {
    /** One resource with a unit under it, each opening with its own link. */
    function tiered(): RepoConfig {
        return vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/TryHackMe/README.md': note('TryHackMe'),
            'my-studies/TryHackMe/Advent of Cyber 2024/README.md': note(
                'Advent of Cyber 2024',
                '[The room](https://tryhackme.com/room/adventofcyber2024)'
            ),
            'my-studies/TryHackMe/Advent of Cyber 2024/Day 11.md': note(
                'Day 11',
                '[Walkthrough](https://www.youtube.com/watch?v=svxqeFWqXQc)'
            ),
            'my-studies/Midu.dev/README.md': note('Midu.dev'),
            'my-studies/Midu.dev/Figma para Devs.md': note(
                'Figma para Devs',
                '[Figma para Devs](https://midu.dev/curso/figma-para-devs)'
            ),
        });
    }

    const COMMITS: readonly Commit[] = [
        commit('1111111', '2024-12-11', 'TryHackMe/Advent of Cyber 2024/Day 11.md'),
        commit('2222222', '2025-05-01', 'Midu.dev/Figma para Devs.md'),
    ];

    it('takes the link an index opens with, because that is the resource URL', () => {
        const block = blockFor(plan(tiered(), COMMITS), 'Advent of Cyber 2024/README.md');

        assert.equal(field(block, 'url'), 'https://tryhackme.com/room/adventofcyber2024');
    });

    it('takes the link a single-note workshop opens with', () => {
        const block = blockFor(plan(tiered(), COMMITS), 'Midu.dev/Figma para Devs.md');

        assert.equal(field(block, 'url'), 'https://midu.dev/curso/figma-para-devs');
    });

    it('takes nothing from a unit inside a resource, however obvious its link', () => {
        // The correction this rule exists for. A per-day walkthrough video is
        // the single unambiguous link in 22 Advent of Cyber day notes, and it is
        // not the room's URL, because a day of a room does not have one.
        const block = blockFor(plan(tiered(), COMMITS), 'Advent of Cyber 2024/Day 11.md');

        assert.equal(field(block, 'url'), null);
    });

    it('leaves the walkthrough line untouched in the body it was dropped from', () => {
        // Refusing to lift a link is not a licence to remove it. The note still
        // reads the way the author wrote it; only the frontmatter declines it.
        const config = tiered();
        const result = plan(config, COMMITS);
        const change = result.changes.find((entry) => entry.file.endsWith('Day 11.md'));

        assert.ok(change?.after.includes('https://www.youtube.com/watch?v=svxqeFWqXQc'));
        assert.ok(change?.after.endsWith(change.before ?? ''));
    });
});

// --------------------------------------------------------------------------
// Gaps: everything migration refuses to invent.
// --------------------------------------------------------------------------

describe('gaps', () => {
    it('refuses a leaf note whose only history is an excluded commit', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Books/README.md': note('Books'),
            'my-studies/Books/Orphan.md': note('Orphan'),
        });
        const excluded = BULK_COMMITS[0]?.sha ?? '';
        const result = plan(config, [
            commit(`${excluded}0000000`, '2026-08-21', 'Books/Orphan.md'),
        ]);

        assert.deepEqual(
            result.gaps.map((gap) => [gap.file, gap.field]),
            [
                ['Books/Orphan.md', 'started'],
                ['Books/Orphan.md', 'finished'],
            ]
        );
        assert.match(formatGaps(result), /Books\/Orphan\.md started: no commit date survives/);
    });

    it('refuses an index with no subtree, no links and no declared date', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Veeva Learning/README.md': note('Veeva Learning'),
            'my-studies/Veeva Learning/Undated Certification/README.md':
                note('Undated Certification'),
        });
        const result = plan(config, [commit('1111111', '2025-01-01', 'README.md')]);

        assert.deepEqual(
            result.gaps.map((gap) => gap.field),
            ['started', 'finished']
        );
        assert.ok(
            result.gaps.every((gap) => gap.file.includes('Undated Certification')),
            'only the undated index'
        );

        // And it fails the run rather than being reported and written anyway.
        const io = captureIo(config.notesRoot);
        assert.equal(runMigrate(parseArgs(['migrate', '--write']), config, io.io), EXIT_FAILURE);
        assert.ok(!read(config, 'my-studies/README.md').startsWith('---'), 'nothing written');
    });

    it('refuses a platform folder it has no source for', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Coursera/README.md': note('Coursera'),
            'my-studies/Coursera/Some Course.md': note('Some Course'),
        });
        const result = plan(config, [
            commit(
                '1111111',
                '2025-01-01',
                'README.md',
                'Coursera/README.md',
                'Coursera/Some Course.md'
            ),
        ]);
        const fields = result.gaps.map((gap) => gap.field);

        assert.ok(fields.includes('source'), formatGaps(result));
        assert.ok(fields.includes('slug'), 'no source means no slug either');
    });

    it('never calls the vault root a missing source', () => {
        // It is the one file with no path segment to derive one from, which is
        // exactly why the reduced platform set exists.
        const result = plan(corpus(), CORPUS_COMMITS);

        assert.ok(!result.gaps.some((gap) => gap.file === 'README.md'));
    });

    it('makes every note a gap when there is no repository behind the vault', () => {
        // No injected commits, so the real reader runs against a directory that
        // was never `git init`ed.
        const result = planMigration({ config: corpus() });

        assert.ok(result.gitProblem !== null, 'the reason is carried, not swallowed');
        assert.ok(result.gaps.length > 0);
        assert.ok(
            result.gaps.every((gap) => gap.field === 'started' || gap.field === 'finished'),
            'only the dates are missing'
        );
    });

    it('refuses two notes whose paths fold to the same slug', () => {
        // Rule 5 has two halves and the folding is deliberately lossy, so two
        // folder names differing only in punctuation collapse to one identity.
        // validate fails on the collision, so writing it would leave story 6
        // hand-patching a note.
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Books/README.md': note('Books'),
            'my-studies/Books/Chapter 6, Managing State.md': note('Chapter 6, Managing State'),
            'my-studies/Books/Chapter 6 - Managing State.md': note('Chapter 6 - Managing State'),
        });
        const result = plan(config, [
            commit('1111111', '2025-01-01', 'README.md', 'Books/README.md'),
            commit('2222222', '2025-01-02', 'Books/Chapter 6, Managing State.md'),
            commit('3333333', '2025-01-03', 'Books/Chapter 6 - Managing State.md'),
        ]);

        assert.deepEqual(
            result.gaps.map((gap) => gap.field),
            ['slug']
        );
        assert.match(
            result.gaps[0]?.reason ?? '',
            /is not unique: books\/chapter-6-managing-state/
        );
        // The first note to claim the slug keeps it; the second is refused and
        // never reaches the change list, so `applyChanges` cannot write it.
        assert.equal(
            result.changes.filter((change) => change.file.includes('Managing State')).length,
            1
        );
        assert.equal(result.gaps[0]?.file, 'Books/Chapter 6, Managing State.md');
    });

    it('refuses a note whose existing block is never closed', () => {
        // `present` alone would call this migrated, so the run would report a
        // finished vault that validate then rejects.
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Books/README.md': '---\nkind: platform\n\n# Books\n',
        });
        const result = plan(config, [commit('1111111', '2025-01-01', 'README.md')]);

        assert.deepEqual(
            result.gaps.map((gap) => [gap.file, gap.field]),
            [['Books/README.md', 'frontmatter']]
        );
        assert.equal(result.alreadyMigrated, 0, 'a broken block is not a migrated note');
    });

    it('keeps no change for a note it refused', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Books/README.md': note('Books'),
            'my-studies/Books/Orphan.md': note('Orphan'),
        });
        const result = plan(config, [
            commit('1111111', '2025-01-01', 'README.md', 'Books/README.md'),
        ]);

        assert.ok(result.gaps.length > 0);
        assert.ok(
            !result.changes.some((change) => change.file.endsWith('Orphan.md')),
            'applyChanges must not be able to write a block the tool declared unwritable'
        );
    });

    it('says nothing about gaps when there are none', () => {
        assert.equal(formatGaps(plan(corpus(), CORPUS_COMMITS)), '');
    });
});

describe('a stale exclusion table', () => {
    it('names every listed SHA that matched no commit', () => {
        const result = plan(corpus(), CORPUS_COMMITS);

        // The fixture history shares no SHA with the real vault, so every entry
        // reports. On the real corpus every one of them matches, which is the
        // check that would have caught a seventh Lint commit going unlisted.
        assert.equal(result.unmatchedCommits.length, BULK_COMMITS.length);
    });

    it('reports nothing unmatched once the listed commits are present', () => {
        const config = corpus();
        const commits = [
            ...CORPUS_COMMITS,
            ...BULK_COMMITS.map((bulk) =>
                commit(`${bulk.sha}0000000`, '2026-03-27', 'Books/README.md')
            ),
        ];

        assert.deepEqual(plan(config, commits).unmatchedCommits, []);
    });
});

// --------------------------------------------------------------------------
// Writing, and the second run that must find nothing to do.
// --------------------------------------------------------------------------

describe('--write', () => {
    it('produces a vault that validate accepts', () => {
        const config = corpus();
        applyChanges(plan(config, CORPUS_COMMITS).changes);
        const result = validateVault({ config });

        assert.equal(result.violations.length, 0, JSON.stringify(result.violations, null, 2));
        assert.equal(result.fileCount, 7);
    });

    it('adds the block at the head and changes nothing else', () => {
        const config = corpus();
        const before = read(config, 'my-studies/Midu.dev/Figma para Devs.md');
        applyChanges(plan(config, CORPUS_COMMITS).changes);
        const after = read(config, 'my-studies/Midu.dev/Figma para Devs.md');

        assert.ok(after.startsWith('---\n'));
        assert.ok(after.endsWith(before), 'the original file survives byte for byte beneath it');
        assert.match(after, /\nkind: note\n---\n\n# Figma para Devs/, 'a blank line before the H1');
    });

    it('finds nothing to do on a second pass', () => {
        const config = corpus();
        applyChanges(plan(config, CORPUS_COMMITS).changes);
        const second = plan(config, CORPUS_COMMITS);

        assert.equal(second.changes.length, 0);
        assert.equal(second.alreadyMigrated, 7);
        assert.equal(second.gaps.length, 0);
        // Counted from what is on disk, not only from what this pass derived, or
        // a second run reports a vault where no note carries code while two do.
        assert.equal(second.withCode, 2);
        assert.match(
            formatMigration(second, false),
            /2 notes carry code, 7 notes already migrated/
        );
        assert.match(formatMigration(second, false), /no changes/);
    });

    it('never doubles a block on a note that already carries one', () => {
        const config = corpus();
        applyChanges(plan(config, CORPUS_COMMITS).changes);
        applyChanges(plan(config, CORPUS_COMMITS).changes);

        assert.equal(read(config, 'my-studies/Books/README.md').split('---').length - 1, 2);
    });
});

// --------------------------------------------------------------------------
// Through the command shell.
// --------------------------------------------------------------------------

describe('the command shell', () => {
    function runIn(
        config: RepoConfig,
        argv: readonly string[]
    ): ReturnType<typeof captureIo> & {
        exit: number;
    } {
        const io = captureIo(config.notesRoot);
        const exit = runMigrate(parseArgs([...argv]), config, io.io);
        return { ...io, exit };
    }

    it('treats a pending dry run as a finding', { skip: !HAS_GIT }, () => {
        const config = corpus();
        writeGitRepo(config);
        const run = runIn(config, ['migrate']);

        assert.equal(run.exit, EXIT_FINDINGS);
        assert.match(run.stdout(), /files would change/);
    });

    it('succeeds once the changes are applied', { skip: !HAS_GIT }, () => {
        const config = corpus();
        writeGitRepo(config);

        assert.equal(runIn(config, ['migrate', '--write']).exit, EXIT_OK);
        assert.equal(runIn(config, ['migrate']).exit, EXIT_OK, 'and the second run is clean');
    });

    it('fails without writing when a field cannot be derived', () => {
        const config = vault({
            'my-studies/README.md': note('My Studies'),
            'my-studies/Books/README.md': note('Books'),
            'my-studies/Books/Orphan.md': note('Orphan'),
        });
        const before = read(config, 'my-studies/Books/Orphan.md');
        const run = runIn(config, ['migrate', '--write']);

        // Exit 2 in both modes: a block the tool knows validate will reject is
        // worse than no block, because story 6 would then hand-patch YAML.
        assert.equal(run.exit, EXIT_FAILURE);
        assert.match(run.stderr(), /could not be derived, so nothing was written/);
        assert.equal(run.stdout(), '', 'no report for a run that produced nothing');
        assert.equal(read(config, 'my-studies/Books/Orphan.md'), before);
    });

    it('warns on stderr about a listed SHA that matched nothing', { skip: !HAS_GIT }, () => {
        const config = corpus();
        writeGitRepo(config);

        assert.match(runIn(config, ['migrate']).stderr(), /matched no commit in the notes repo/);
    });

    it('says so when there is no repository to read dates from', () => {
        const run = runIn(corpus(), ['migrate']);

        assert.equal(run.exit, EXIT_FAILURE);
        assert.match(run.stderr(), /no commit dates for my-studies/);
    });

    it('accepts --write and refuses the flags it does not take', () => {
        assert.equal(parseArgs(['migrate', '--write']).flags.has('--write'), true);
        for (const flag of ['--json', '--quiet', '--triage']) {
            assert.throws(() => parseArgs(['migrate', flag]), UsageError, `migrate took ${flag}`);
        }
    });
});

/**
 * Commit the fixture notes so the shell cases have real dates.
 *
 * Every note lands in one commit, which is all the shell cases need: what they
 * are about is the exit code, not which date a rule picked.
 */
function writeGitRepo(config: RepoConfig): void {
    if (!HAS_GIT) {
        return;
    }
    const root = path.normalize(config.notesRoot);
    const run = (args: readonly string[], env: Record<string, string> = {}): void => {
        const result = spawnSync('git', [...args], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, ...env },
        });
        if (result.status !== 0) {
            throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
        }
    };

    run(['init', '-q', '-b', 'main']);
    run(['add', '-A']);
    run(
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
            'fixture',
        ],
        {
            GIT_AUTHOR_DATE: '2025-02-27T12:00:00+0000',
            GIT_COMMITTER_DATE: '2025-02-27T12:00:00+0000',
        }
    );
}
