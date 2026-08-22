/**
 * The declarative frontmatter contract.
 *
 * These cases pin the shapes the validator will be built against, so a later
 * story cannot quietly widen a pattern to make a failing note pass. The
 * patterns are asserted by source, not just by example, because rule 5 in
 * frontmatter-schema.md names the slug regex exactly.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DATE_PATTERN,
    FIELDS,
    FIELD_NAMES,
    KINDS,
    PLATFORM_ABSENT_FIELDS,
    PLATFORM_DERIVABLE_FIELDS,
    PLATFORM_REQUIRED_FIELDS,
    SLUG_PATTERN,
    SOURCES,
    STATUSES,
    TAG_PATTERN,
    fieldSpec,
    isKind,
    isRealDate,
    isSource,
    isStatus,
} from '../src/schema.ts';

describe('enums', () => {
    it('holds kind to platform, index and note', () => {
        assert.deepEqual([...KINDS], ['platform', 'index', 'note']);
        assert.ok(isKind('platform') && isKind('index') && isKind('note'));
        assert.ok(!isKind('resource') && !isKind('') && !isKind(undefined));
    });

    it('holds status to the four authored values, with stalled absent', () => {
        assert.deepEqual([...STATUSES], ['backlog', 'active', 'done', 'dropped']);
        // stalled is derived from active plus the threshold and is never stored.
        assert.ok(!isStatus('stalled'));
        assert.ok(isStatus('done'));
    });

    it('carries every platform key in use after the prune', () => {
        for (const key of ['books', 'midudev', 'santander', 'tryhackme', 'veeva']) {
            assert.ok(isSource(key), `${key} should be a valid source`);
        }
        // Reserved, and valid, but not currently in the corpus.
        assert.ok(isSource('platzi') && isSource('external'));
        assert.ok(!isSource('udemy'));
        assert.equal(SOURCES.length, 7);
    });
});

describe('SLUG_PATTERN', () => {
    it('is exactly the regex rule 5 names', () => {
        assert.equal(SLUG_PATTERN.source, '^[a-z0-9]+(\\/[a-z0-9-]+){1,2}$');
    });

    it('accepts the documented two and three segment slugs', () => {
        for (const slug of [
            'books/asp-net-core-3-and-react',
            'books/asp-net-core-3-and-react/chapter-6-managing-state-with-redux',
            'midudev/experiencias-3d-con-vue',
            'tryhackme/advent-of-cyber-2024/day-11',
            'veeva/engage-technical-certification-v5/engage-sign',
        ]) {
            assert.ok(SLUG_PATTERN.test(slug), `${slug} should match`);
        }
    });

    it('rejects a bare platform key, which is why kind: platform carries no slug', () => {
        assert.ok(!SLUG_PATTERN.test('books'));
    });

    it('rejects uppercase, accents, spaces, and a fourth segment', () => {
        for (const slug of [
            'Books/asp-net',
            'books/introducción',
            'books/asp net',
            'books/a/b/c',
            '/books/asp-net',
            'books/asp-net/',
            '',
        ]) {
            assert.ok(!SLUG_PATTERN.test(slug), `${slug} should not match`);
        }
    });

    it('does not let a leading segment carry a dash', () => {
        // The first segment is a source key, which never contains one.
        assert.ok(!SLUG_PATTERN.test('my-books/asp-net'));
    });
});

describe('TAG_PATTERN', () => {
    it('accepts lowercase kebab-case', () => {
        for (const tag of ['wifi', 'wpa2', 'packet-capture', 'full-stack', 'aspnet']) {
            assert.ok(TAG_PATTERN.test(tag), `${tag} should match`);
        }
    });

    it('rejects uppercase, spaces, underscores and stray dashes', () => {
        for (const tag of ['WiFi', 'packet capture', 'packet_capture', '-wifi', 'wifi-', '']) {
            assert.ok(!TAG_PATTERN.test(tag), `${tag} should not match`);
        }
    });
});

describe('DATE_PATTERN and isRealDate', () => {
    it('accepts the YYYY-MM-DD shape', () => {
        assert.ok(DATE_PATTERN.test('2024-12-11'));
        assert.ok(!DATE_PATTERN.test('2024-12-1'));
        assert.ok(!DATE_PATTERN.test('11/12/2024'));
    });

    it('accepts real calendar dates', () => {
        for (const date of ['2024-12-11', '2025-02-27', '2024-02-29', '2000-02-29']) {
            assert.ok(isRealDate(date), `${date} should be a real date`);
        }
    });

    it('rejects shapes the pattern alone would let through', () => {
        // DATE_PATTERN checks digits only, so these are the cases that need the
        // calendar check behind it.
        for (const date of ['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31', '1900-02-29']) {
            assert.ok(DATE_PATTERN.test(date), `${date} should match the shape`);
            assert.ok(!isRealDate(date), `${date} should not be a real date`);
        }
    });

    it('rejects non-strings and malformed input', () => {
        for (const value of [undefined, null, 20241211, '2024-12', '']) {
            assert.ok(!isRealDate(value), `${String(value)} should not be a real date`);
        }
    });
});

describe('field table', () => {
    it('covers every documented field exactly once', () => {
        assert.equal(FIELDS.length, FIELD_NAMES.length);
        assert.deepEqual(
            FIELDS.map((field) => field.name),
            [...FIELD_NAMES]
        );
        assert.equal(new Set(FIELDS.map((field) => field.name)).size, FIELDS.length);
    });

    it('gives every conditional field the condition that forces it', () => {
        for (const field of FIELDS) {
            if (field.requirement === 'conditional') {
                assert.ok(field.condition, `${field.name} should record its condition`);
            }
        }
    });

    it('looks a field up by name and returns undefined for anything else', () => {
        const slug = fieldSpec('slug');
        assert.equal(slug?.name, 'slug');
        assert.equal(slug?.requirement, 'conditional');

        assert.equal(fieldSpec('status')?.requirement, 'always');
        assert.equal(fieldSpec('outline_total')?.requirement, 'optional');
        assert.equal(fieldSpec('nope'), undefined);
        assert.equal(fieldSpec(''), undefined);
    });

    it('scopes outline_total to index notes', () => {
        assert.deepEqual([...(fieldSpec('outline_total')?.kinds ?? [])], ['index']);
    });
});

describe('the reduced platform field set', () => {
    it('requires only kind, status and tags', () => {
        assert.deepEqual([...PLATFORM_REQUIRED_FIELDS], ['kind', 'status', 'tags']);
    });

    it('requires source only where the path yields one', () => {
        // The vault-root README has no path segment to derive a source from.
        assert.deepEqual([...PLATFORM_DERIVABLE_FIELDS], ['source']);
        assert.ok(!PLATFORM_REQUIRED_FIELDS.includes('source'));
    });

    it('carries no slug, started or finished', () => {
        assert.deepEqual([...PLATFORM_ABSENT_FIELDS], ['slug', 'started', 'finished']);
        for (const name of PLATFORM_ABSENT_FIELDS) {
            assert.ok(
                !PLATFORM_REQUIRED_FIELDS.includes(name),
                `${name} must not be required on a platform file`
            );
            assert.ok(
                !fieldSpec(name)?.kinds.includes('platform'),
                `${name} must not apply to kind: platform`
            );
        }
    });
});
