/**
 * `studylink index`, one case per row of the story's I/O matrix.
 *
 * The two acceptance cases are here in full: the three indexes repaired by hand
 * during the prune must come back byte-for-byte once the markers are lifted
 * out, and `Midu.dev/README.md` must lose its second copy of one entry while
 * keeping the other five in the order the author wrote them.
 *
 * Every fixture is a copy in a temp directory. The real vault is story 6's, and
 * nothing here writes outside `mkdtempSync`.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { BEGIN_MARKER, END_MARKER } from '../src/blocks.ts';
import { applyChanges, diffLines, formatPlan, planIndex } from '../src/commands/index.ts';
import { DEFAULT_STALE_DAYS, toPosix, type RepoConfig } from '../src/config.ts';
import { EXIT_FAILURE, EXIT_FINDINGS, EXIT_OK, runIndex, type Io } from '../src/index.ts';

let fixtureRoot: string;
let caseCount = 0;

before(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'studylink-index-'));
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

/** Plan and apply in one step, the way `index --write` does. */
function write(config: RepoConfig): ReturnType<typeof planIndex> {
    const result = planIndex(config);
    applyChanges(result.changes);
    return result;
}

/** Lift the markers back out, along with the one blank line each side adds. */
function unseed(text: string): string {
    const kept: string[] = [];
    const lines = text.split('\n');

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed === BEGIN_MARKER || trimmed === END_MARKER) {
            return;
        }
        const previous = (lines[index - 1] ?? '').trim();
        const next = (lines[index + 1] ?? '').trim();
        if (trimmed === '' && (previous === BEGIN_MARKER || next === END_MARKER)) {
            return;
        }
        kept.push(line);
    });

    return kept.join('\n');
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
// The two acceptance cases, against copies of the real files.
// --------------------------------------------------------------------------

/** `my-studies/README.md`, exactly as the prune left it. */
const ROOT_INDEX = `# My Studies

Studies Code Examples: <https://github.com/LuigiEspinosa/my-studies-code>

List of all the stuff I read, watch, follow, and so on.

- [Books](./Books/README.md)
- [Midu.dev](./Midu.dev/README.md)
- [Santander Open Academy](./Santander%20Open%20Academy/README.md)
- [TryHackMe](./TryHackMe/README.md)
- [Veeva Learning](./Veeva%20Learning/README.md)
`;

/** `my-studies/Books/README.md`, whose label is the full book title. */
const BOOKS_INDEX = `# Books

- [ASP.NET Core 3 and React - Hands-On full stack web development using ASP.NET Core, React, and TypeScript 3 by Carl Rippon](./ASP.Net%20Core%203%20and%20React/README.md)
`;

/** `my-studies/TryHackMe/README.md`, rewritten by hand during the prune. */
const TRYHACKME_INDEX = `# TryHackMe

## Learning Paths

- [Advent of Cyber 2024](./Advent%20of%20Cyber%202024/README.md)
`;

/** `my-studies/Midu.dev/README.md`, listing one entry at both line 5 and line 7. */
const MIDUDEV_INDEX = `# Midu.dev

- [Experiencias 3D con Vue](./Experiencias%203D%20con%20Vue.md)
- [Figma para Devs](./Figma%20para%20Devs.md)
- [Lo último de JavaScript (ES2023 & ES2024)](<./Lo%20último%20de%20JavaScript%20(ES2023%20&%20ES2024).md>)
- [Introducción al Web Scraping con Python](./Introducción%20al%20Web%20Scraping%20con%20Python.md)
- [Lo último de JavaScript (ES2023 & ES2024)](<./Lo%20último%20de%20JavaScript%20(ES2023%20&%20ES2024).md>)
- [PWA de Detección de Objetos con Angular 19 y TensorFlow.js](./PWA%20de%20Detección%20de%20Objetos%20con%20Angular%2019%20y%20TensorFlow.js.md)
`;

/** Everything the four indexes link, so nothing is dropped as dead. */
function acceptanceVault(): RepoConfig {
    return vault({
        'my-studies/README.md': ROOT_INDEX,
        'my-studies/Books/README.md': BOOKS_INDEX,
        'my-studies/Books/ASP.Net Core 3 and React/README.md': '# ASP.NET Core 3 and React\n',
        'my-studies/Midu.dev/README.md': MIDUDEV_INDEX,
        'my-studies/Midu.dev/Experiencias 3D con Vue.md': '# Experiencias 3D con Vue\n',
        'my-studies/Midu.dev/Figma para Devs.md': '# Figma para Devs\n',
        'my-studies/Midu.dev/Lo último de JavaScript (ES2023 & ES2024).md': '# Lo último\n',
        'my-studies/Midu.dev/Introducción al Web Scraping con Python.md': '# Introducción\n',
        'my-studies/Midu.dev/PWA de Detección de Objetos con Angular 19 y TensorFlow.js.md':
            '# PWA\n',
        'my-studies/Santander Open Academy/README.md': '# Santander Open Academy\n',
        'my-studies/TryHackMe/README.md': TRYHACKME_INDEX,
        'my-studies/TryHackMe/Advent of Cyber 2024/README.md': '# Advent of Cyber 2024\n',
        'my-studies/Veeva Learning/README.md': '# Veeva Learning\n',
    });
}

describe('the three indexes repaired by hand during the prune', () => {
    it('regenerate byte-identical once the markers are lifted out', () => {
        const config = acceptanceVault();

        write(config);

        for (const [relative, original] of [
            ['my-studies/README.md', ROOT_INDEX],
            ['my-studies/Books/README.md', BOOKS_INDEX],
            ['my-studies/TryHackMe/README.md', TRYHACKME_INDEX],
        ] as const) {
            assert.equal(unseed(read(config, relative)), original, relative);
        }
    });

    it('carry their labels through, including the one no derivation could invent', () => {
        const config = acceptanceVault();

        write(config);

        // The Books label is the full book title, which is neither the folder
        // name nor anything a filename yields.
        assert.match(
            read(config, 'my-studies/Books/README.md'),
            /- \[ASP\.NET Core 3 and React - Hands-On full stack web development using ASP\.NET Core, React, and TypeScript 3 by Carl Rippon\]/
        );
    });

    it('come out exactly like this, markers and all', () => {
        // Spelled out rather than round-tripped through `unseed`, so that a
        // change to the padding cannot pass both halves of the same test.
        const config = acceptanceVault();

        write(config);

        assert.equal(
            read(config, 'my-studies/TryHackMe/README.md'),
            `# TryHackMe

## Learning Paths

<!-- studylink:begin -->

- [Advent of Cyber 2024](./Advent%20of%20Cyber%202024/README.md)

<!-- studylink:end -->
`
        );
    });

    it('produce no diff on a second run', () => {
        const config = acceptanceVault();

        write(config);
        const first = read(config, 'my-studies/README.md');
        const second = planIndex(config);

        assert.deepEqual(second.changes, []);
        assert.equal(read(config, 'my-studies/README.md'), first);
    });
});

describe('Midu.dev/README.md', () => {
    it('drops the second occurrence and keeps the authored order, unsorted', () => {
        const config = acceptanceVault();

        write(config);
        const entries = read(config, 'my-studies/Midu.dev/README.md')
            .split('\n')
            .filter((line) => line.startsWith('- '));

        assert.deepEqual(entries, [
            '- [Experiencias 3D con Vue](./Experiencias%203D%20con%20Vue.md)',
            '- [Figma para Devs](./Figma%20para%20Devs.md)',
            '- [Lo último de JavaScript (ES2023 & ES2024)](<./Lo%20último%20de%20JavaScript%20(ES2023%20&%20ES2024).md>)',
            '- [Introducción al Web Scraping con Python](./Introducción%20al%20Web%20Scraping%20con%20Python.md)',
            '- [PWA de Detección de Objetos con Angular 19 y TensorFlow.js](./PWA%20de%20Detección%20de%20Objetos%20con%20Angular%2019%20y%20TensorFlow.js.md)',
        ]);
    });
});

// --------------------------------------------------------------------------
// Seeding: which runs are note lists, and which are left alone.
// --------------------------------------------------------------------------

describe('seeding', () => {
    it('wraps one block per authored section and leaves prose and headings alone', () => {
        const index = `# Book

Prose the author wrote, which whole-file generation would destroy.

## Section 1: Getting Started

- [Chapter 1](./Chapter%201.md)
- [Chapter 2](./Chapter%202.md)

## Section 2: Building

- [Chapter 3](./Chapter%203.md)
`;
        const config = vault({
            'my-studies/Book/README.md': index,
            'my-studies/Book/Chapter 1.md': '# Chapter 1\n',
            'my-studies/Book/Chapter 2.md': '# Chapter 2\n',
            'my-studies/Book/Chapter 3.md': '# Chapter 3\n',
        });

        const result = write(config);
        const after = read(config, 'my-studies/Book/README.md');

        assert.equal(result.counts.seededBlocks, 2);
        assert.equal(unseed(after), index);
        assert.match(
            after,
            /## Section 1: Getting Started\n\n<!-- studylink:begin -->\n\n- \[Chapter 1\]/
        );
    });

    it('never wraps an anchor-link table of contents', () => {
        const config = vault({
            'my-studies/Cert/README.md': `# Cert

- [Reference Courses](#reference-courses)
- [Advanced Concepts](#advanced-concepts)

## Reference Courses

- [Terms and Conditions](./Terms%20and%20Conditions.md)
`,
            'my-studies/Cert/Terms and Conditions.md': '# Terms and Conditions\n',
        });

        const result = write(config);
        const after = read(config, 'my-studies/Cert/README.md');

        assert.equal(result.counts.seededBlocks, 1);
        assert.match(
            after,
            /- \[Reference Courses\]\(#reference-courses\)\n- \[Advanced Concepts\]\(#advanced-concepts\)\n\n## Reference/
        );
    });

    it('never wraps a prose bullet list', () => {
        // The Advent of Cyber glossary is a bullet list of definitions, and the
        // `Day 24` line in the block above it is a list entry with no link.
        const config = vault({
            'my-studies/AoC/README.md': `# Advent of Cyber 2024

- [Day 1: Maybe SOC-mas music, he thought, doesn't come from a store?](./Day%201.md)
- Day 24: You can’t hurt SOC-mas, Mayor Malware!

## Glossary

- Security Operations Center (SOC) is a team of IT security professionals.
`,
            'my-studies/AoC/Day 1.md':
                "# Maybe SOC-mas music, he thought, doesn't come from a store?\n",
        });

        const result = write(config);
        const after = read(config, 'my-studies/AoC/README.md');

        assert.equal(result.counts.seededBlocks, 1);
        assert.match(
            after,
            /- Day 24: You can’t hurt SOC-mas, Mayor Malware!\n\n<!-- studylink:end -->/
        );
        assert.match(after, /## Glossary\n\n- Security Operations Center/);
    });

    it('wraps an ordered list and keeps its numbering and its order', () => {
        const config = vault({
            'my-studies/Course/README.md': `# Course

## Module 1

1. [Beyond Emotion](./Beyond%20Emotion.md)
2. [Self-Awareness](./Self-Awareness.md)
`,
            'my-studies/Course/Beyond Emotion.md': '# Beyond Emotion\n',
            'my-studies/Course/Self-Awareness.md': '# Self-Awareness\n',
        });

        write(config);

        assert.match(
            read(config, 'my-studies/Course/README.md'),
            /<!-- studylink:begin -->\n\n1\. \[Beyond Emotion\]\(\.\/Beyond%20Emotion\.md\)\n2\. \[Self-Awareness\]\(\.\/Self-Awareness\.md\)\n\n<!-- studylink:end -->/
        );
    });

    it('gives a README with no note list an empty block at end of file', () => {
        const config = vault({
            'my-studies/Start Here/README.md': `# Start Here

## Terms and Conditions

URL: <https://www.veeva.com/privacy/>
`,
        });

        const result = write(config);

        assert.equal(result.counts.emptyBlocks, 1);
        assert.equal(
            read(config, 'my-studies/Start Here/README.md'),
            `# Start Here

## Terms and Conditions

URL: <https://www.veeva.com/privacy/>

<!-- studylink:begin -->
<!-- studylink:end -->
`
        );
    });
});

// --------------------------------------------------------------------------
// Maintenance: inside a seeded block and nowhere else.
// --------------------------------------------------------------------------

describe('maintenance', () => {
    it('drops an entry whose target is gone and leaves the rest in place', () => {
        const config = vault({
            'my-studies/Course/README.md': `# Course

<!-- studylink:begin -->

- [One](./One.md)
- [Gone](./Gone.md)
- [Two](./Two.md)

<!-- studylink:end -->
`,
            'my-studies/Course/One.md': '# One\n',
            'my-studies/Course/Two.md': '# Two\n',
        });

        const result = write(config);

        assert.equal(result.counts.deadEntries, 1);
        assert.match(
            read(config, 'my-studies/Course/README.md'),
            /- \[One\]\(\.\/One\.md\)\n- \[Two\]\(\.\/Two\.md\)/
        );
    });

    it('carries wikilinks, plain lines, anchors and URLs through untouched', () => {
        const body = `- [[Day 24]]
- Day 25: not written yet
- [Back to top](#course)
- [The course](https://example.com/course)
- [One](./One.md)`;
        const config = vault({
            'my-studies/Course/README.md': `# Course

<!-- studylink:begin -->

${body}

<!-- studylink:end -->
`,
            'my-studies/Course/One.md': '# One\n',
        });

        const result = write(config);

        assert.deepEqual(result.changes, []);
        assert.ok(read(config, 'my-studies/Course/README.md').includes(body));
    });

    it('leaves a duplicate outside any block alone', () => {
        // Maintenance happens inside the markers and nowhere else, so an
        // unwrapped anchor table of contents keeps whatever it repeats.
        const config = vault({
            'my-studies/Course/README.md': `# Course

- [Section](#section)
- [Section](#section)

## Section

<!-- studylink:begin -->

- [One](./One.md)

<!-- studylink:end -->
`,
            'my-studies/Course/One.md': '# One\n',
        });

        const result = write(config);

        assert.deepEqual(result.changes, []);
        assert.match(
            read(config, 'my-studies/Course/README.md'),
            /- \[Section\]\(#section\)\n- \[Section\]\(#section\)/
        );
    });

    it('appends a note that is on disk and in no block, labelled from its H1', () => {
        const config = vault({
            'my-studies/Cert/README.md': `# Cert

## Getting Started

<!-- studylink:begin -->

- [Integrated Scheduling](./Integrated%20Scheduling.md)

<!-- studylink:end -->

## Engage Sign

<!-- studylink:begin -->

- [Engage Sign](./Engage%20Sign.md)

<!-- studylink:end -->
`,
            'my-studies/Cert/Integrated Scheduling.md': '# Integrated Scheduling\n',
            'my-studies/Cert/Engage Sign.md': '# Engage Sign\n',
            'my-studies/Cert/Integrating Scheduling.md': '# Integrating Scheduling\n',
        });

        const result = write(config);

        assert.equal(result.counts.appended, 1);
        // At the end of the last block, because a note that was never authored
        // into an index has no authored section to belong to.
        assert.match(
            read(config, 'my-studies/Cert/README.md'),
            /- \[Engage Sign\]\(\.\/Engage%20Sign\.md\)\n- \[Integrating Scheduling\]\(\.\/Integrating%20Scheduling\.md\)\n\n<!-- studylink:end -->/
        );
    });

    it('labels an appended note from its H1, not its filename', () => {
        const config = vault({
            'my-studies/AoC/README.md': `# Advent of Cyber 2024

<!-- studylink:begin -->

- [Day 10: He had a brain full of macros](./Day%2010.md)

<!-- studylink:end -->
`,
            'my-studies/AoC/Day 10.md': '# He had a brain full of macros\n',
            // Frontmatter, so the H1 search has to start after it. A fenced
            // block first, because a `#` inside one is a code comment.
            'my-studies/AoC/Day 11.md': `---
kind: note
---

\`\`\`bash
# not a heading
\`\`\`

# If you'd like to WPA, press the star key
`,
            'my-studies/AoC/Day 12.md': 'No heading at all, so the filename stands in.\n',
        });

        const result = write(config);
        const appended = read(config, 'my-studies/AoC/README.md')
            .split('\n')
            .filter((line) => line.startsWith('- ['))
            .slice(1);

        assert.equal(result.counts.appended, 2);
        assert.deepEqual(appended, [
            "- [If you'd like to WPA, press the star key](./Day%2011.md)",
            '- [Day 12](./Day%2012.md)',
        ]);
    });

    it('appends into an ordered block with the next number in its own sequence', () => {
        const config = vault({
            'my-studies/Course/README.md': `# Course

## Module 1

<!-- studylink:begin -->

1. [Beyond Emotion](./Beyond%20Emotion.md)
2. [Self-Awareness](./Self-Awareness.md)

<!-- studylink:end -->
`,
            'my-studies/Course/Beyond Emotion.md': '# Beyond Emotion\n',
            'my-studies/Course/Self-Awareness.md': '# Self-Awareness\n',
            'my-studies/Course/Managing Stress.md': '# Managing Stress Through Control\n',
        });

        write(config);

        assert.match(
            read(config, 'my-studies/Course/README.md'),
            /3\. \[Managing Stress Through Control\]\(\.\/Managing%20Stress\.md\)/
        );
    });

    it('appends a new resource README to the platform index above it', () => {
        const config = vault({
            'my-studies/Books/README.md': BOOKS_INDEX,
            'my-studies/Books/ASP.Net Core 3 and React/README.md': '# ASP.NET\n',
            'my-studies/Books/The Pragmatic Programmer/README.md': '# The Pragmatic Programmer\n',
        });

        const result = write(config);

        assert.equal(result.counts.appended, 1);
        assert.match(
            read(config, 'my-studies/Books/README.md'),
            /- \[The Pragmatic Programmer\]\(\.\/The%20Pragmatic%20Programmer\/README\.md\)/
        );
    });

    it('never appends AGENTS.md or anything inside a skipped directory', () => {
        const config = vault({
            'my-studies/README.md': ROOT_INDEX,
            'my-studies/AGENTS.md': '# Agent instructions\n',
            'my-studies/Books/README.md': '# Books\n',
            'my-studies/Midu.dev/README.md': '# Midu.dev\n',
            'my-studies/Santander Open Academy/README.md': '# Santander Open Academy\n',
            'my-studies/TryHackMe/README.md': '# TryHackMe\n',
            'my-studies/Veeva Learning/README.md': '# Veeva Learning\n',
            'my-studies/node_modules/pkg/README.md': '# package\n',
            'my-studies/.obsidian/plugins/thing/README.md': '# plugin\n',
        });

        const result = write(config);

        assert.equal(result.counts.appended, 0);
        assert.equal(unseed(read(config, 'my-studies/README.md')), ROOT_INDEX);
    });

    it('appends once, not once per run', () => {
        // An appended entry has to read back as the entry that claims its note,
        // or the next run appends it again.
        const config = vault({
            'my-studies/Cert/README.md': `# Cert

<!-- studylink:begin -->

- [One](./One.md)

<!-- studylink:end -->
`,
            'my-studies/Cert/One.md': '# One\n',
            'my-studies/Cert/100% Done (final).md': '# 100% Done (final)\n',
        });

        write(config);
        const first = read(config, 'my-studies/Cert/README.md');
        const second = planIndex(config);

        assert.match(first, /- \[100% Done \(final\)\]\(<\.\/100%25%20Done%20\(final\)\.md>\)/);
        assert.deepEqual(second.changes, []);
    });

    it('keeps an entry that points into a note with a heading fragment', () => {
        const config = vault({
            'my-studies/Cert/README.md': `# Cert

<!-- studylink:begin -->

- [One, task 3](./One.md#task-3)

<!-- studylink:end -->
`,
            'my-studies/Cert/One.md': '# One\n',
        });

        const result = write(config);

        assert.equal(result.counts.deadEntries, 0);
        assert.equal(result.counts.appended, 0);
        assert.match(
            read(config, 'my-studies/Cert/README.md'),
            /- \[One, task 3\]\(\.\/One\.md#task-3\)/
        );
    });

    it('keeps a blank line an author wrote inside a block', () => {
        const index = `# Cert

<!-- studylink:begin -->

- [One](./One.md)

- [Two](./Two.md)

<!-- studylink:end -->
`;
        const config = vault({
            'my-studies/Cert/README.md': index,
            'my-studies/Cert/One.md': '# One\n',
            'my-studies/Cert/Two.md': '# Two\n',
        });

        assert.deepEqual(planIndex(config).changes, []);
        assert.equal(read(config, 'my-studies/Cert/README.md'), index);
    });

    it('does not append a note a wikilink already claims', () => {
        const config = vault({
            'my-studies/Cert/README.md': `# Cert

<!-- studylink:begin -->

- [[Planned]]

<!-- studylink:end -->
`,
            'my-studies/Cert/Planned.md': '# Planned\n',
        });

        assert.deepEqual(planIndex(config).changes, []);
    });
});

// --------------------------------------------------------------------------
// The reverse direction.
// --------------------------------------------------------------------------

const VUE_NOTE = `---
slug: midudev/experiencias-3d-con-vue
status: done
code:
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/lighting
kind: note
---

# Experiencias 3D con Vue
`;

const EXPECTED_REVERSE_BLOCK = `<!-- studylink:begin -->

Study notes for this code:

- [midudev/experiencias-3d-con-vue](https://github.com/LuigiEspinosa/my-studies/blob/main/Midu.dev/Experiencias%203D%20con%20Vue.md)

<!-- studylink:end -->
`;

function reverseVault(codeReadme?: string): RepoConfig {
    const files: Record<string, string> = {
        'my-studies/Midu.dev/README.md': '# Midu.dev\n',
        'my-studies/Midu.dev/Experiencias 3D con Vue.md': VUE_NOTE,
    };
    if (codeReadme !== undefined) {
        files['my-studies-code/Midu.dev/Experiencias 3D con Vue/README.md'] = codeReadme;
    }
    return vault(files, [
        'my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter',
        'my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/lighting',
    ]);
}

describe('reverse links', () => {
    it('names the note once in the resource directory both lesson paths sit under', () => {
        const config = reverseVault('# Configurador 3D\n\nVendored course code.\n');

        const result = write(config);

        assert.equal(result.counts.reverseBlocks, 1);
        assert.equal(
            read(config, 'my-studies-code/Midu.dev/Experiencias 3D con Vue/README.md'),
            `# Configurador 3D

Vendored course code.

${EXPECTED_REVERSE_BLOCK}`
        );
    });

    it('creates the README when the directory has none', () => {
        const config = reverseVault();

        write(config);

        assert.equal(
            read(config, 'my-studies-code/Midu.dev/Experiencias 3D con Vue/README.md'),
            `# Experiencias 3D con Vue

${EXPECTED_REVERSE_BLOCK}`
        );
    });

    it('replaces its own block instead of appending a second one', () => {
        const config = reverseVault('# Configurador 3D\n');

        write(config);
        const first = read(config, 'my-studies-code/Midu.dev/Experiencias 3D con Vue/README.md');
        const second = planIndex(config);

        assert.deepEqual(second.changes, []);
        assert.equal(first.match(/studylink:begin/g)?.length, 1);
    });

    it('claims a directory whose name differs only in case, as the two repos do', () => {
        // The notes side spells it `ASP.Net` and the code side `ASP.NET`.
        const config = vault(
            {
                'my-studies/Books/ASP.Net Core 3 and React/README.md': `---
slug: books/asp-net-core-3-and-react
code:
  - ../../../my-studies-code/Books/ASP.Net Core 3 and React
kind: index
---

# ASP.NET Core 3 and React
`,
            },
            ['my-studies-code/Books/ASP.NET Core 3 and React']
        );

        const result = write(config);

        assert.equal(result.counts.reverseBlocks, 1);
        assert.match(
            read(config, 'my-studies-code/Books/ASP.NET Core 3 and React/README.md'),
            /- \[books\/asp-net-core-3-and-react\]/
        );
    });

    it('encodes a note path whose parentheses would close the link early', () => {
        const config = vault(
            {
                'my-studies/Midu.dev/Lo último de JavaScript (ES2023 & ES2024).md': `---
slug: midudev/lo-ultimo-de-javascript
code:
  - ../../my-studies-code/Midu.dev/Lo último de JavaScript (ES2023 & ES2024)
kind: note
---

# Lo último de JavaScript
`,
            },
            ['my-studies-code/Midu.dev/Lo último de JavaScript (ES2023 & ES2024)']
        );

        write(config);

        assert.match(
            read(
                config,
                'my-studies-code/Midu.dev/Lo último de JavaScript (ES2023 & ES2024)/README.md'
            ),
            /\(https:\/\/github\.com\/LuigiEspinosa\/my-studies\/blob\/main\/Midu\.dev\/Lo%20%C3%BAltimo%20de%20JavaScript%20%28ES2023%20&%20ES2024%29\.md\)/
        );
    });

    it('removes a block once no note claims the directory', () => {
        const config = reverseVault('# Configurador 3D\n');

        write(config);
        writeFileSync(
            path.join(
                path.dirname(config.notesRoot),
                'my-studies/Midu.dev/Experiencias 3D con Vue.md'
            ),
            '# Experiencias 3D con Vue\n',
            'utf8'
        );
        write(config);

        assert.equal(
            read(config, 'my-studies-code/Midu.dev/Experiencias 3D con Vue/README.md'),
            '# Configurador 3D\n'
        );
    });

    it('writes nothing while no note carries frontmatter, which is the corpus today', () => {
        const config = reverseVault();
        writeFileSync(
            path.join(
                path.dirname(config.notesRoot),
                'my-studies/Midu.dev/Experiencias 3D con Vue.md'
            ),
            '# Experiencias 3D con Vue\n',
            'utf8'
        );

        const result = planIndex(config);

        assert.equal(result.counts.reverseBlocks, 0);
        assert.equal(result.codeDirCount, 1);
    });
});

// --------------------------------------------------------------------------
// The command surface.
// --------------------------------------------------------------------------

describe('the command surface', () => {
    it('changes nothing without --write, and reports what it would do', () => {
        const config = acceptanceVault();
        const before = read(config, 'my-studies/Midu.dev/README.md');
        const capture = captureIo(config.notesRoot);

        const code = runIndex({ command: 'index', flags: new Set() }, config, capture.io);

        assert.equal(code, EXIT_FINDINGS);
        assert.equal(read(config, 'my-studies/Midu.dev/README.md'), before);
        assert.match(capture.stdout(), /would change; pass --write to apply/);
        assert.match(capture.stdout(), /dropped 1 duplicate/);
    });

    it('applies with --write and then reports a clean run', () => {
        const config = acceptanceVault();
        const first = captureIo(config.notesRoot);

        const written = runIndex(
            { command: 'index', flags: new Set(['--write']) },
            config,
            first.io
        );
        const second = captureIo(config.notesRoot);
        const again = runIndex({ command: 'index', flags: new Set() }, config, second.io);

        assert.equal(written, EXIT_OK);
        assert.equal(again, EXIT_OK);
        assert.match(second.stdout(), /no changes/);
    });

    it('fails operationally when a checkout cannot be read', () => {
        const config = acceptanceVault();
        const capture = captureIo(config.notesRoot);

        const code = runIndex(
            { command: 'index', flags: new Set() },
            { ...config, notesRoot: `${config.notesRoot}/missing` },
            capture.io
        );

        assert.equal(code, EXIT_FAILURE);
        assert.match(capture.stderr(), /Could not read/);
    });

    it('shows the lines it would add and remove', () => {
        const config = acceptanceVault();

        const report = formatPlan(planIndex(config), false);

        assert.match(
            report,
            /my-studies\/Books\/README\.md \(seeded 1 block\)\n {2}\+ <!-- studylink:begin -->/
        );
        assert.match(
            report,
            /my-studies\/Midu\.dev\/README\.md[^\n]*\n(?: {2}[-+][^\n]*\n)* {2}- - \[Lo último de JavaScript/
        );
        assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']), ['- b', '+ x']);
    });

    it('counts what it did, per index and per code directory', () => {
        const config = acceptanceVault();

        const report = formatPlan(planIndex(config), false);

        assert.match(
            report,
            /8 indexes: 4 blocks seeded, 4 empty blocks added, 1 duplicate dropped/
        );
        assert.match(report, /0 code directories: 0 reverse-link blocks/);
    });
});
