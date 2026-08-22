/**
 * Managed-block primitives: what an authored note list looks like, where a
 * marker pair sits, and how a block is rendered back out.
 *
 * Pure text in, text out. Nothing here reads the filesystem, because the
 * seeding rules are the risky part of index generation and they have to be
 * provable without a vault. Which runs qualify as note lists, and which entries
 * still resolve, are questions for the caller, which has the disk.
 *
 * Everything an authored entry carries -- its label, its destination, its
 * position -- is copied through verbatim. No label is ever rebuilt from a
 * filename or an `# H1`: `Day 11: If you'd like to WPA, press the star key!`
 * carries a character its own H1 lacks, so a derivation cannot reproduce it.
 */

export const BEGIN_MARKER = '<!-- studylink:begin -->';
export const END_MARKER = '<!-- studylink:end -->';

/** A `[text](destination)` link that made up a whole list item. */
export type MarkdownLink = {
    readonly text: string;
    /** Exactly as written, still percent-encoded. */
    readonly destination: string;
    /** True when it was written in the `<...>` form, which allows parentheses. */
    readonly angled: boolean;
};

/** One list item, with every line it occupies. */
export type ListItem = {
    /** 0-based index of the item's first line. */
    readonly index: number;
    /** The item line plus any indented continuation lines, verbatim. */
    readonly lines: readonly string[];
    /** `-`, `*`, `+`, or the ordered form as written, e.g. `3.`. */
    readonly marker: string;
    readonly ordered: boolean;
    /** The link, when the whole item is one. */
    readonly link: MarkdownLink | null;
    /** The first `[[wikilink]]` target in the item, if any. */
    readonly wikilink: string | null;
};

/** A run of consecutive list items, or the contents of a marker pair. */
export type ListRun = {
    /** 0-based index of the first line of the run. */
    readonly start: number;
    /** 0-based index of the last line of the run, inclusive. */
    readonly end: number;
    readonly items: readonly ListItem[];
};

/** A marker pair and everything between it. */
export type MarkedRegion = {
    /** 0-based line index of the begin marker. */
    readonly start: number;
    /** 0-based line index of the end marker, inclusive. */
    readonly end: number;
    /** The lines between the markers, blank padding included. */
    readonly body: readonly string[];
};

const BULLET_ITEM = /^([-*+])\s+(.*)$/;
const ORDERED_ITEM = /^(\d+[.)])\s+(.*)$/;
const WIKILINK = /\[\[([^\]\n]+)\]\]/;

/** True when `line` is a top-level list item, bulleted or ordered. */
export function isListItemLine(line: string): boolean {
    return BULLET_ITEM.test(line) || ORDERED_ITEM.test(line);
}

/**
 * Every marker pair in `lines`, outermost first.
 *
 * A begin marker with no end is not a region. Leaving it alone is the safe
 * reading: the alternative is treating the rest of the file as managed content
 * and rewriting past whatever the author was in the middle of.
 */
export function findMarkedRegions(lines: readonly string[]): MarkedRegion[] {
    const regions: MarkedRegion[] = [];
    let open: number | null = null;

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed === BEGIN_MARKER) {
            open = index;
            return;
        }
        if (trimmed === END_MARKER && open !== null) {
            regions.push({ start: open, end: index, body: lines.slice(open + 1, index) });
            open = null;
        }
    });

    return regions;
}

/**
 * Every run of consecutive list items in `lines`.
 *
 * A run ends at a blank line or any line that is neither a list item nor an
 * indented continuation of one. Indented lines, including nested list items,
 * belong to the item above them and are carried through untouched.
 */
export function findListRuns(lines: readonly string[]): ListRun[] {
    const runs: ListRun[] = [];
    let items: ListItem[] = [];
    let start = 0;

    const flush = (end: number): void => {
        if (items.length > 0) {
            runs.push({ start, end, items });
            items = [];
        }
    };

    lines.forEach((line, index) => {
        const item = parseListItem(line, index);
        if (item !== null) {
            if (items.length === 0) {
                start = index;
            }
            items.push(item);
            return;
        }

        const last = items[items.length - 1];
        if (last !== undefined && line.trim() !== '' && /^\s/.test(line)) {
            // A continuation line, or a nested list under the item above.
            items[items.length - 1] = { ...last, lines: [...last.lines, line] };
            return;
        }

        flush(index - 1);
    });

    flush(lines.length - 1);
    return runs;
}

/** Parse one top-level list item, or null when `line` is not one. */
export function parseListItem(line: string, index = 0): ListItem | null {
    const bullet = BULLET_ITEM.exec(line);
    const ordered = bullet === null ? ORDERED_ITEM.exec(line) : null;
    const match = bullet ?? ordered;
    if (match === null) {
        return null;
    }

    const marker = match[1] ?? '';
    const content = match[2] ?? '';
    const wikilink = WIKILINK.exec(content);

    return {
        index,
        lines: [line],
        marker,
        ordered: bullet === null,
        link: parseMarkdownLink(content),
        wikilink: wikilink === null ? null : normalizeWikilink(wikilink[1]),
    };
}

function normalizeWikilink(raw: string | undefined): string | null {
    if (raw === undefined) {
        return null;
    }
    const target = (raw.split('|')[0] ?? '').split('#')[0] ?? '';
    return target.trim() === '' ? null : target.trim();
}

/**
 * Parse `[text](destination)` when it makes up the whole of `content`.
 *
 * The `<...>` destination form has to be understood rather than tolerated: the
 * two duplicate entries in `Midu.dev/README.md` are written that way, because
 * the filename carries parentheses, and they are the dedup acceptance case.
 */
export function parseMarkdownLink(content: string): MarkdownLink | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('[')) {
        return null;
    }

    const close = findLabelEnd(trimmed);
    if (close === -1 || trimmed[close + 1] !== '(') {
        return null;
    }

    const text = trimmed.slice(1, close);
    const rest = trimmed.slice(close + 2);

    if (rest.startsWith('<')) {
        const end = rest.indexOf('>');
        if (end === -1 || rest.slice(end + 1) !== ')') {
            return null;
        }
        return { text, destination: rest.slice(1, end), angled: true };
    }

    if (!rest.endsWith(')')) {
        return null;
    }
    const destination = rest.slice(0, -1);
    // Without the angle form a bare destination cannot carry a parenthesis, so
    // anything that does is not a link this tool understands.
    if (destination.includes('(') || destination.includes(')') || /\s/.test(destination)) {
        return null;
    }
    return { text, destination, angled: false };
}

/** Index of the `]` closing the label, honouring nested brackets. */
function findLabelEnd(text: string): number {
    let depth = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '[') {
            depth += 1;
        } else if (char === ']') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * A managed block holding `itemLines`.
 *
 * The blank line on each side of the list is not decoration. Prettier reformats
 * a list that touches an HTML comment, so the tight form fails `format:check`,
 * which CAP-7 requires to pass. An empty block has no list to separate, so its
 * markers sit on consecutive lines.
 */
export function renderBlock(itemLines: readonly string[]): string[] {
    if (itemLines.length === 0) {
        return [BEGIN_MARKER, END_MARKER];
    }
    return [BEGIN_MARKER, '', ...itemLines, '', END_MARKER];
}

/**
 * Replace `lines[start..end]` with `replacement`.
 *
 * Every edit in this story goes through here, so nothing outside the span an
 * edit names can move.
 */
export function spliceLines(
    lines: readonly string[],
    start: number,
    end: number,
    replacement: readonly string[]
): string[] {
    return [...lines.slice(0, start), ...replacement, ...lines.slice(end + 1)];
}

/**
 * Percent-encode a relative path for a markdown destination the way the corpus
 * already writes them: spaces encoded, accented letters left alone.
 *
 * `Lo último de JavaScript (ES2023 & ES2024).md` is written
 * `<./Lo%20último%20de%20JavaScript%20(ES2023%20&%20ES2024).md>`, so the accent
 * stays literal and the parentheses force the angle form.
 *
 * `%`, `#` and `?` are encoded even though the corpus has no filename carrying
 * one, because they are the characters that would not survive the round trip:
 * a destination that cannot be decoded resolves to nothing, so its note would
 * look absent from the block and be appended again on every run.
 */
export function encodeDestination(relativePath: string): { destination: string; angled: boolean } {
    const destination = relativePath
        .replace(/%/g, '%25')
        .replace(/#/g, '%23')
        .replace(/\?/g, '%3F')
        .replace(/ /g, '%20');
    return { destination, angled: /[()]/.test(destination) };
}

/**
 * Render one list entry line in the style of the block it joins.
 *
 * The label is escaped, because a label carrying an unbalanced bracket would
 * produce a line the next run cannot read back as a link.
 */
export function renderEntry(marker: string, text: string, relativePath: string): string {
    const { destination, angled } = encodeDestination(relativePath);
    const label = text.replace(/([[\]])/g, '\\$1');
    return `${marker} [${label}](${angled ? `<${destination}>` : destination})`;
}
