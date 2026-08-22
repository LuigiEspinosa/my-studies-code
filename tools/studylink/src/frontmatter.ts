/**
 * Frontmatter extraction and parsing, with line provenance.
 *
 * The contract uses a flat YAML mapping and nothing more: scalars, dates,
 * integers, and lists of strings in either the inline or the block form. Parsing
 * that subset by hand keeps the tool dependency-free, and more importantly lets
 * every key and every list item carry the line it was written on, which is what
 * a violation message needs to point at.
 *
 * Nothing here judges a value. `code: 7` parses to the number 7 and the
 * validator decides that a list was required.
 */

/** A value the contract's YAML subset can hold. */
export type FrontmatterValue = string | number | boolean | null | readonly FrontmatterScalar[];

/** A value that can appear inside a list. */
export type FrontmatterScalar = string | number | boolean | null;

export type FrontmatterEntry = {
    readonly key: string;
    readonly value: FrontmatterValue;
    /** 1-based line the key sits on. */
    readonly line: number;
    /** 1-based line per list item, parallel to `value` when it is a list. */
    readonly itemLines: readonly number[];
};

/** A block this parser could not make sense of. Rule 1 reports these. */
export type FrontmatterError = {
    readonly line: number;
    readonly message: string;
};

export type Frontmatter = {
    /** True when the file opens with a `---` delimiter. */
    readonly present: boolean;
    /** True when a closing delimiter was found. Meaningless when absent. */
    readonly terminated: boolean;
    /** 1-based line of the opening delimiter, or 1 when there is none. */
    readonly openLine: number;
    readonly entries: readonly FrontmatterEntry[];
    /** 1-based line the note body starts on, so wikilink lines come out right. */
    readonly bodyStartLine: number;
    readonly errors: readonly FrontmatterError[];
};

const DELIMITER = '---';

/** YAML also accepts `...` as a document terminator. */
const ALT_TERMINATOR = '...';

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/;
const BLOCK_ITEM = /^\s*-\s*(.*)$/;
const INTEGER = /^-?\d+$/;
const FLOAT = /^-?\d+\.\d+$/;

/** Split into lines the same way on either line-ending convention. */
export function splitLines(text: string): string[] {
    return text.replace(/^﻿/, '').split(/\r?\n/);
}

/**
 * Parse the frontmatter block at the head of `text`.
 *
 * A file with no opening delimiter is not an error here: it comes back with
 * `present: false` and an empty entry list, and rule 1 decides what that means.
 * That is the state all 121 notes are in until the migration runs.
 */
export function parseFrontmatter(text: string): Frontmatter {
    const lines = splitLines(text);
    const first = lines[0];

    if (first === undefined || first.trim() !== DELIMITER) {
        return {
            present: false,
            terminated: false,
            openLine: 1,
            entries: [],
            bodyStartLine: 1,
            errors: [],
        };
    }

    let closeIndex = -1;
    for (let i = 1; i < lines.length; i += 1) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === DELIMITER || trimmed === ALT_TERMINATOR) {
            closeIndex = i;
            break;
        }
    }

    const errors: FrontmatterError[] = [];
    if (closeIndex === -1) {
        errors.push({ line: 1, message: 'frontmatter block is never closed' });
    }

    const end = closeIndex === -1 ? lines.length : closeIndex;
    const { entries, errors: bodyErrors } = parseBlock(lines, 1, end);

    return {
        present: true,
        terminated: closeIndex !== -1,
        openLine: 1,
        entries,
        bodyStartLine: closeIndex === -1 ? lines.length + 1 : closeIndex + 2,
        errors: [...errors, ...bodyErrors],
    };
}

/** The value of `key`, or undefined when the block does not carry it. */
export function entryFor(frontmatter: Frontmatter, key: string): FrontmatterEntry | undefined {
    return frontmatter.entries.find((entry) => entry.key === key);
}

type MutableEntry = {
    key: string;
    value: FrontmatterValue;
    line: number;
    itemLines: number[];
    /** True while the key was written bare, awaiting `- item` lines. */
    awaitingItems: boolean;
};

/** Parse `lines[from..to)` as a flat mapping. */
function parseBlock(
    lines: readonly string[],
    from: number,
    to: number
): { entries: FrontmatterEntry[]; errors: FrontmatterError[] } {
    const entries: MutableEntry[] = [];
    const errors: FrontmatterError[] = [];
    const seen = new Set<string>();
    /** The key a bare `- item` line belongs to, when one is open. */
    let openList: MutableEntry | null = null;

    for (let i = from; i < to; i += 1) {
        const raw = lines[i] ?? '';
        const lineNumber = i + 1;
        const trimmed = raw.trim();

        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }

        const item = BLOCK_ITEM.exec(raw);
        if (item !== null && openList !== null) {
            const items = openList.value as FrontmatterScalar[];
            items.push(parseScalar(item[1] ?? ''));
            openList.itemLines.push(lineNumber);
            continue;
        }

        const keyed = KEY_LINE.exec(raw);
        if (keyed === null) {
            errors.push({
                line: lineNumber,
                message: `could not parse frontmatter line: ${trimmed}`,
            });
            openList = null;
            continue;
        }

        const key = keyed[1] ?? '';
        const rest = (keyed[2] ?? '').trim();

        if (seen.has(key)) {
            errors.push({ line: lineNumber, message: `duplicate frontmatter key: ${key}` });
            // The first occurrence stands, so the outcome does not depend on
            // which of two conflicting values happens to come last.
            openList = null;
            continue;
        }
        seen.add(key);

        if (rest === '') {
            // Either an empty value or the header of a block list; which one it
            // is only becomes clear when the next line is read.
            const entry: MutableEntry = {
                key,
                value: [],
                line: lineNumber,
                itemLines: [],
                awaitingItems: true,
            };
            entries.push(entry);
            openList = entry;
            continue;
        }

        openList = null;
        if (rest.startsWith('[')) {
            const { items, closed } = parseInlineList(rest);
            if (!closed) {
                errors.push({ line: lineNumber, message: `unclosed inline list for ${key}` });
            }
            entries.push({
                key,
                value: items,
                line: lineNumber,
                itemLines: items.map(() => lineNumber),
                awaitingItems: false,
            });
            continue;
        }

        entries.push({
            key,
            value: parseScalar(rest),
            line: lineNumber,
            itemLines: [],
            awaitingItems: false,
        });
    }

    return {
        entries: entries.map(({ awaitingItems, ...entry }) => ({
            ...entry,
            // A bare key that never received a `- item` line is an empty value,
            // not an empty list. `tags:` alone says nothing; `tags: []` says the
            // list is deliberately empty, which the contract allows.
            value: awaitingItems && entry.itemLines.length === 0 ? null : entry.value,
        })),
        errors,
    };
}

/** Parse `[a, b, c]`, tolerating a missing closing bracket. */
function parseInlineList(text: string): { items: FrontmatterScalar[]; closed: boolean } {
    const closed = text.endsWith(']');
    const inner = text.slice(1, closed ? -1 : undefined).trim();
    if (inner === '') {
        return { items: [], closed };
    }
    return { items: splitTopLevel(inner).map(parseScalar), closed };
}

/** Split on commas that are not inside quotes. */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: string | null = null;

    for (const char of text) {
        if (quote !== null) {
            current += char;
            if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (char === ',') {
            parts.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts;
}

/**
 * Parse one scalar.
 *
 * A `YYYY-MM-DD` date stays a string rather than becoming a Date, because the
 * contract compares dates as written and never does arithmetic on them.
 */
export function parseScalar(text: string): FrontmatterScalar {
    const value = text.trim();

    if (value === '' || value === 'null' || value === '~') {
        return null;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if (first === '"' && last === '"') {
            return value.slice(1, -1).replace(/\\"/g, '"');
        }
        if (first === "'" && last === "'") {
            return value.slice(1, -1).replace(/''/g, "'");
        }
    }
    if (INTEGER.test(value) || FLOAT.test(value)) {
        return Number(value);
    }
    return value;
}
