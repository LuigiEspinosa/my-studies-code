/**
 * The hand-rolled parser for the contract's YAML subset.
 *
 * Line provenance is the reason this module exists, so most cases assert a line
 * number rather than only a value: a violation that cannot say where it is
 * costs the reader a search through the whole corpus.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entryFor, parseFrontmatter, parseScalar } from '../src/frontmatter.ts';

const CONFORMING = [
    '---',
    'source: tryhackme',
    'slug: tryhackme/advent-of-cyber-2024/day-11',
    'status: done',
    'started: 2024-12-11',
    'tags: [wifi, wpa2]',
    'code:',
    '  - ../../../my-studies-code/TryHackMe/Advent',
    '  - ../../../my-studies-code/TryHackMe/Cyber',
    'kind: note',
    '---',
    '',
    '# Day 11',
    '',
].join('\n');

describe('parseFrontmatter', () => {
    it('reports a file with no opening delimiter as absent', () => {
        const parsed = parseFrontmatter('# Day 11\n\nSome prose.\n');

        assert.equal(parsed.present, false);
        assert.equal(parsed.entries.length, 0);
        assert.equal(parsed.bodyStartLine, 1);
        assert.deepEqual(parsed.errors, []);
    });

    it('records the line each key sits on', () => {
        const parsed = parseFrontmatter(CONFORMING);

        assert.equal(parsed.present, true);
        assert.equal(parsed.terminated, true);
        assert.equal(entryFor(parsed, 'source')?.line, 2);
        assert.equal(entryFor(parsed, 'status')?.line, 4);
        assert.equal(entryFor(parsed, 'kind')?.line, 10);
    });

    it('records the line of every block list item', () => {
        const code = entryFor(parseFrontmatter(CONFORMING), 'code');

        assert.deepEqual(code?.value, [
            '../../../my-studies-code/TryHackMe/Advent',
            '../../../my-studies-code/TryHackMe/Cyber',
        ]);
        assert.deepEqual(code?.itemLines, [8, 9]);
    });

    it('anchors every inline list item to the key line', () => {
        const tags = entryFor(parseFrontmatter(CONFORMING), 'tags');

        assert.deepEqual(tags?.value, ['wifi', 'wpa2']);
        assert.deepEqual(tags?.itemLines, [6, 6]);
    });

    it('starts the body after the closing delimiter', () => {
        assert.equal(parseFrontmatter(CONFORMING).bodyStartLine, 12);
    });

    it('keeps an empty inline list distinct from a bare key', () => {
        const parsed = parseFrontmatter('---\ntags: []\ncode:\n---\n\n# H\n');

        assert.deepEqual(entryFor(parsed, 'tags')?.value, []);
        assert.equal(
            entryFor(parsed, 'code')?.value,
            null,
            'a key with nothing under it says nothing, which is not an empty list'
        );
    });

    it('reports an unterminated block without losing what it parsed', () => {
        const parsed = parseFrontmatter('---\nkind: note\nstatus: done\n\n# Day 11\n');

        assert.equal(parsed.present, true);
        assert.equal(parsed.terminated, false);
        assert.equal(entryFor(parsed, 'kind')?.value, 'note');
        assert.equal(parsed.errors.length, 1);
        assert.equal(parsed.errors[0]?.line, 1);
        assert.match(parsed.errors[0]?.message ?? '', /never closed/);
    });

    it('reports a duplicate key and keeps the first value', () => {
        const parsed = parseFrontmatter('---\nstatus: done\nstatus: active\n---\n');

        assert.equal(entryFor(parsed, 'status')?.value, 'done');
        assert.equal(parsed.errors.length, 1);
        assert.equal(parsed.errors[0]?.line, 3);
        assert.match(parsed.errors[0]?.message ?? '', /duplicate frontmatter key: status/);
    });

    it('reports a line it cannot parse, at that line', () => {
        const parsed = parseFrontmatter('---\nkind: note\nthis is not yaml\n---\n');

        assert.equal(parsed.errors.length, 1);
        assert.equal(parsed.errors[0]?.line, 3);
    });

    it('skips blank lines and comments', () => {
        const parsed = parseFrontmatter('---\n\n# a comment\nkind: note\n---\n');

        assert.deepEqual(parsed.errors, []);
        assert.equal(entryFor(parsed, 'kind')?.line, 4);
    });

    it('keeps a colon inside a value', () => {
        const parsed = parseFrontmatter('---\nurl: https://example.com/a#b\n---\n');

        assert.equal(entryFor(parsed, 'url')?.value, 'https://example.com/a#b');
    });

    it('parses the same way whichever line ending the file carries', () => {
        const crlf = parseFrontmatter(CONFORMING.replace(/\n/g, '\r\n'));

        assert.equal(entryFor(crlf, 'kind')?.line, 10);
        assert.deepEqual(entryFor(crlf, 'code')?.itemLines, [8, 9]);
    });

    it('accepts the alternative document terminator', () => {
        const parsed = parseFrontmatter('---\nkind: note\n...\n\n# H\n');

        assert.equal(parsed.terminated, true);
        assert.equal(parsed.bodyStartLine, 4);
    });
});

describe('parseScalar', () => {
    it('leaves a date as the string the contract compares', () => {
        assert.equal(parseScalar('2024-12-11'), '2024-12-11');
    });

    it('reads whole numbers as numbers', () => {
        assert.equal(parseScalar('24'), 24);
        assert.equal(parseScalar('-3'), -3);
    });

    it('reads the empty forms as null', () => {
        for (const empty of ['', '   ', 'null', '~']) {
            assert.equal(parseScalar(empty), null, `${empty} should be null`);
        }
    });

    it('reads booleans', () => {
        assert.equal(parseScalar('true'), true);
        assert.equal(parseScalar('false'), false);
    });

    it('unquotes both quote styles', () => {
        assert.equal(parseScalar('"done"'), 'done');
        assert.equal(parseScalar("'done'"), 'done');
        assert.equal(parseScalar('"a \\"b\\" c"'), 'a "b" c');
    });

    it('leaves a bare string alone', () => {
        assert.equal(parseScalar('  Chapter 6: Managing State  '), 'Chapter 6: Managing State');
    });
});
