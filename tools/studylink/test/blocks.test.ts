/**
 * The seeding vocabulary: what a list run is, what a marker pair is, and what a
 * rendered block looks like.
 *
 * These cases are pure text, so they pin the rules that decide which lines get
 * wrapped before any vault is involved. Anything needing disk lives in
 * `index-command.test.ts`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BEGIN_MARKER,
    encodeDestination,
    END_MARKER,
    findListRuns,
    findMarkedRegions,
    isListItemLine,
    parseListItem,
    parseMarkdownLink,
    renderBlock,
    renderEntry,
    spliceLines,
} from '../src/blocks.ts';

describe('parseMarkdownLink', () => {
    it('reads the plain destination form', () => {
        assert.deepEqual(parseMarkdownLink('[Chapter 6: Managing State](./Chapter%206.md)'), {
            text: 'Chapter 6: Managing State',
            destination: './Chapter%206.md',
            angled: false,
        });
    });

    it('reads the angle-bracket form, which is how a destination carries parentheses', () => {
        // Both duplicate entries in Midu.dev/README.md are written this way, so
        // a parser that misses this form misses the dedup acceptance case.
        const line = '[Lo último de JavaScript (ES2023 & ES2024)](<./Lo%20último%20(ES2023).md>)';

        assert.deepEqual(parseMarkdownLink(line), {
            text: 'Lo último de JavaScript (ES2023 & ES2024)',
            destination: './Lo%20último%20(ES2023).md',
            angled: true,
        });
    });

    it('reads a label carrying brackets of its own', () => {
        assert.equal(
            parseMarkdownLink('[Day 3 [draft]](./Day%203.md)')?.destination,
            './Day%203.md'
        );
    });

    it('is not fooled by prose, a trailing sentence, or a bare parenthesis', () => {
        for (const content of [
            'Security Operations Center (SOC) is a team of professionals.',
            'Day 24: You can’t hurt SOC-mas, Mayor Malware!',
            '[Text](./One.md) and then some prose',
            '[Text](./One (1).md)',
        ]) {
            assert.equal(parseMarkdownLink(content), null, content);
        }
    });
});

describe('parseListItem', () => {
    it('takes both list forms and reports which one it saw', () => {
        assert.equal(parseListItem('- [One](./One.md)')?.marker, '-');
        assert.equal(parseListItem('- [One](./One.md)')?.ordered, false);
        assert.equal(parseListItem('2. [Two](./Two.md)')?.marker, '2.');
        assert.equal(parseListItem('2. [Two](./Two.md)')?.ordered, true);
        assert.equal(parseListItem('1) [One](./One.md)')?.marker, '1)');
        assert.equal(parseListItem('  - indented'), null);
        assert.equal(isListItemLine('# Heading'), false);
        assert.equal(isListItemLine('- [One](./One.md)'), true);
    });

    it('carries a wikilink target, stripped of alias and heading', () => {
        assert.equal(parseListItem('- [[Day 24|the last one]]')?.wikilink, 'Day 24');
        assert.equal(parseListItem('- [[Day 24#Task 3]]')?.wikilink, 'Day 24');
        assert.equal(parseListItem('- [One](./One.md)')?.wikilink, null);
    });
});

describe('findListRuns', () => {
    it('breaks a run at a blank line or any other line, and keeps continuations', () => {
        const lines = [
            '# Index',
            '',
            '- [One](./One.md)',
            '- [Two](./Two.md)',
            '  continued prose for Two',
            '',
            '## Section',
            '',
            '- [Three](./Three.md)',
        ];

        const runs = findListRuns(lines);

        assert.deepEqual(
            runs.map((run) => [run.start, run.end, run.items.length]),
            [
                [2, 4, 2],
                [8, 8, 1],
            ]
        );
        assert.deepEqual(runs[0]?.items[1]?.lines, [
            '- [Two](./Two.md)',
            '  continued prose for Two',
        ]);
    });
});

describe('findMarkedRegions', () => {
    it('pairs the markers and hands back what sits between them', () => {
        const lines = ['# Index', '', BEGIN_MARKER, '', '- [One](./One.md)', '', END_MARKER, ''];

        assert.deepEqual(findMarkedRegions(lines), [
            { start: 2, end: 6, body: ['', '- [One](./One.md)', ''] },
        ]);
    });

    it('ignores a begin marker with no end, rather than claiming the rest of the file', () => {
        assert.deepEqual(findMarkedRegions(['# Index', BEGIN_MARKER, '- [One](./One.md)']), []);
    });
});

describe('renderBlock', () => {
    it('separates the list from its markers, which is what prettier requires', () => {
        // The tight form in the contract's example is reformatted by prettier,
        // and `npm run format:check` has to keep passing (CAP-7).
        assert.deepEqual(renderBlock(['- [One](./One.md)']), [
            BEGIN_MARKER,
            '',
            '- [One](./One.md)',
            '',
            END_MARKER,
        ]);
    });

    it('puts the markers on consecutive lines when there is nothing to separate', () => {
        assert.deepEqual(renderBlock([]), [BEGIN_MARKER, END_MARKER]);
    });
});

describe('renderEntry', () => {
    it('encodes spaces, leaves accents alone, and reaches for the angle form only for parentheses', () => {
        assert.equal(
            renderEntry('-', 'Integrated Scheduling', './Integrated Scheduling.md'),
            '- [Integrated Scheduling](./Integrated%20Scheduling.md)'
        );
        assert.equal(
            renderEntry('3.', 'Lo último (ES2024)', './Lo último (ES2024).md'),
            '3. [Lo último (ES2024)](<./Lo%20último%20(ES2024).md>)'
        );
        assert.deepEqual(encodeDestination('./Plain.md'), {
            destination: './Plain.md',
            angled: false,
        });
    });

    it('encodes the characters that would not survive being read back', () => {
        assert.equal(
            renderEntry('-', '100% Done', './100% Done #1.md'),
            '- [100% Done](./100%25%20Done%20%231.md)'
        );
        // An unbalanced bracket in a derived label would produce a line the next
        // run could not read as a link, so the note would be appended again.
        assert.equal(
            renderEntry('-', 'Day 3 [draft', './Day 3.md'),
            '- [Day 3 \\[draft](./Day%203.md)'
        );
    });
});

describe('spliceLines', () => {
    it('replaces exactly the span it is given', () => {
        assert.deepEqual(spliceLines(['a', 'b', 'c', 'd'], 1, 2, ['X']), ['a', 'X', 'd']);
    });
});
