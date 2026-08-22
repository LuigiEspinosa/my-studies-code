/**
 * What counts as a note, and what counts as a study directory.
 *
 * Both answers are load-bearing rather than incidental detail: every count the
 * contract quotes comes out of this walk, and the code repo holds 5 resource
 * directories. A walk that admits one extra file makes every one of those
 * numbers wrong, which is why the counts here are measured and never assumed.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { toPosix } from '../src/config.ts';
import {
    findWikilinks,
    isIndexFile,
    listCodeStudyDirs,
    listNotes,
    listOwnedNotes,
    NOTE_EXCLUSIONS,
    normalizeWikilinkTarget,
    readNote,
    resolvesInVault,
    VaultError,
    writeNote,
} from '../src/vault.ts';

let fixtureRoot: string;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-vault-'));
});

after(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
});

let treeCount = 0;

/** Create a tree from a map of relative path to contents. */
function tree(files: Record<string, string>, dirs: readonly string[] = []): string {
    treeCount += 1;
    const root = path.join(fixtureRoot, `tree-${String(treeCount)}`);
    mkdirSync(root, { recursive: true });

    for (const [relative, contents] of Object.entries(files)) {
        const target = path.join(root, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, contents, 'utf8');
    }
    for (const relative of dirs) {
        mkdirSync(path.join(root, relative), { recursive: true });
    }
    return toPosix(root);
}

describe('listNotes', () => {
    it('excludes AGENTS.md, which is instructions rather than a unit of study', () => {
        assert.deepEqual(NOTE_EXCLUSIONS, ['AGENTS.md']);

        const root = tree({
            'AGENTS.md': '# agents\n',
            'README.md': '# root\n',
            'Books/AGENTS.md': '# nested agents\n',
            'Books/README.md': '# books\n',
        });

        assert.deepEqual(
            listNotes(root).map((note) => note.relativePath),
            ['Books/README.md', 'README.md']
        );
    });

    it('descends into neither a dot-directory nor node_modules', () => {
        // An Obsidian vault carries `.obsidian/`, and either repo may carry an
        // installed `node_modules/`. Both are full of markdown.
        const root = tree({
            'README.md': '# root\n',
            '.obsidian/plugins/thing/README.md': '# plugin\n',
            'node_modules/pkg/README.md': '# package\n',
            'Books/README.md': '# books\n',
        });

        assert.deepEqual(
            listNotes(root).map((note) => note.relativePath),
            ['Books/README.md', 'README.md']
        );
    });

    it('takes markdown only, and returns POSIX paths in sorted order', () => {
        const root = tree({
            'Zebra.md': '# z\n',
            'Alpha.md': '# a\n',
            'Images/diagram.png': 'not markdown',
            'notes.txt': 'not markdown',
        });

        const notes = listNotes(root);

        assert.deepEqual(
            notes.map((note) => note.relativePath),
            ['Alpha.md', 'Zebra.md']
        );
        assert.equal(notes[0]?.absolutePath, `${root}/Alpha.md`);
    });

    it('fails operationally on a root that cannot be read', () => {
        assert.throws(() => listNotes(`${fixtureRoot}/missing`), VaultError);
        assert.throws(() => readNote(`${fixtureRoot}/missing.md`), VaultError);
    });

    it('fails operationally on a file that cannot be written', () => {
        // Without the wrapper, `index --write` would report files written and
        // exit 0 after writing nothing.
        const root = tree({ 'Books/README.md': '# books\n' });

        assert.throws(() => writeNote(`${root}/Books`, 'not a file'), VaultError);
    });
});

describe('listOwnedNotes', () => {
    it('takes sibling notes and subdirectory indexes, and nothing else', () => {
        const root = tree({
            'README.md': '# root\n',
            'Readme.md': '# same file on Windows, an index either way\n',
            'AGENTS.md': '# agents\n',
            'Note.md': '# note\n',
            'diagram.png': 'not markdown',
            'Books/README.md': '# books\n',
            'Books/Deep/README.md': '# too deep to own\n',
            'node_modules/pkg/README.md': '# package\n',
            '.obsidian/plugins/thing/README.md': '# plugin\n',
        });

        assert.deepEqual(
            listOwnedNotes(root).map((owned) => owned.slice(root.length + 1)),
            ['Books/README.md', 'Note.md']
        );
        assert.equal(isIndexFile('Readme.md'), true);
        assert.equal(isIndexFile('Note.md'), false);
    });
});

describe('listCodeStudyDirs', () => {
    it('takes the resource tier only, skipping tooling directories', () => {
        const root = tree({}, [
            'Books/ASP.NET Core 3 and React',
            'Midu.dev/Figma para Devs',
            'Midu.dev/Experiencias 3D con Vue/lessons/starter',
            'docs/specs/study-repo-linkage',
            'tools/studylink/src',
            'node_modules/pkg',
            '.git/refs',
        ]);

        assert.deepEqual(listCodeStudyDirs(root), [
            'Books/ASP.NET Core 3 and React',
            'Midu.dev/Experiencias 3D con Vue',
            'Midu.dev/Figma para Devs',
        ]);
    });
});

describe('findWikilinks', () => {
    it('ignores links inside fenced blocks and inline code', () => {
        const body = [
            'Real: [[Day 24]]',
            '',
            '```md',
            'Fenced: [[Not A Link]]',
            '```',
            '',
            'Inline: `[[Also Not]]` and [[Day 25]]',
        ].join('\n');

        const links = findWikilinks(body, 10);

        assert.deepEqual(
            links.map((link) => link.target),
            ['Day 24', 'Day 25']
        );
        assert.deepEqual(
            links.map((link) => link.line),
            [10, 16]
        );
    });

    it('strips an alias and a heading fragment', () => {
        assert.equal(normalizeWikilinkTarget('Day 24|the last one'), 'Day 24');
        assert.equal(normalizeWikilinkTarget('Day 24#Task 3'), 'Day 24');
        assert.equal(normalizeWikilinkTarget('  Day 24  '), 'Day 24');
    });
});

describe('resolvesInVault', () => {
    const notes = [
        { relativePath: 'TryHackMe/Advent of Cyber 2024/Day 11.md', absolutePath: '/x' },
        { relativePath: 'README.md', absolutePath: '/y' },
    ];

    it('resolves by basename, by vault path, and with or without the extension', () => {
        for (const target of [
            'Day 11',
            'Day 11.md',
            'TryHackMe/Advent of Cyber 2024/Day 11',
            'day 11',
        ]) {
            assert.equal(resolvesInVault(target, notes), true, `${target} should resolve`);
        }
    });

    it('leaves an unwritten note unresolved, which is what makes it planned', () => {
        assert.equal(resolvesInVault('Day 24', notes), false);
    });
});
