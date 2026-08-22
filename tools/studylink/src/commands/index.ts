/**
 * `studylink index`: seed a managed block around each authored note list, then
 * maintain what is inside those markers and nothing else.
 *
 * The rule the whole command turns on is that blocks are **seeded, not
 * derived**. The first write wraps a list the author already wrote, copying
 * membership, link text and order through exactly as they stand. Nothing is
 * reconstructed from a folder listing: 11 of the 22 indexes link notes owned by
 * other resources, and one label carries a trailing `!` its own `# H1` lacks.
 *
 * Inside a seeded block, and nowhere else: duplicates drop keeping the first,
 * entries whose target is gone drop in place, notes on disk that appear in no
 * block append at the end, and `[[wikilinks]]` pass through untouched because
 * they are the backlog. Order is frozen at seed time. Nothing is ever sorted.
 *
 * The reverse direction is generated rather than seeded: each code directory a
 * note's `code` list claims gets a block naming that note.
 */

import path from 'node:path';

import {
    findListRuns,
    findMarkedRegions,
    parseListItem,
    renderBlock,
    renderEntry,
    spliceLines,
    type ListItem,
} from '../blocks.ts';
import { NOTES_FILE_URL_BASE, toAbsolutePosix, type RepoConfig } from '../config.ts';
import { entryFor, parseFrontmatter, splitLines } from '../frontmatter.ts';
import {
    exists,
    isDirectory,
    isIndexFile,
    listCodeStudyDirs,
    listNotes,
    listOwnedNotes,
    readNote,
    writeNote,
    type NoteFile,
} from '../vault.ts';
import { claimsCodeDir } from './validate.ts';

/** One file the command would rewrite, or has rewritten. */
export type FileChange = {
    /** Repo-prefixed display path, e.g. `my-studies/Books/README.md`. */
    readonly file: string;
    readonly absolutePath: string;
    /** Current contents, or null when the file does not exist yet. */
    readonly before: string | null;
    readonly after: string;
    /** What the pass did, for the report. */
    readonly actions: readonly string[];
};

export type IndexCounts = {
    seededBlocks: number;
    emptyBlocks: number;
    duplicates: number;
    deadEntries: number;
    appended: number;
    reverseBlocks: number;
};

export type IndexResult = {
    readonly indexCount: number;
    readonly codeDirCount: number;
    readonly changes: readonly FileChange[];
    readonly counts: IndexCounts;
};

/**
 * Work out every change `index` would make, without touching a file.
 *
 * @throws {VaultError} when a checkout or a file cannot be read.
 */
export function planIndex(config: RepoConfig): IndexResult {
    const counts: IndexCounts = {
        seededBlocks: 0,
        emptyBlocks: 0,
        duplicates: 0,
        deadEntries: 0,
        appended: 0,
        reverseBlocks: 0,
    };

    const notes = listNotes(config.notesRoot);
    const indexes = notes.filter((note) => isIndexFile(baseName(note.relativePath)));
    const codeDirs = listCodeStudyDirs(config.codeRoot);

    const changes: FileChange[] = [];
    for (const index of indexes) {
        const change = planOneIndex(index, config, counts);
        if (change !== null) {
            changes.push(change);
        }
    }
    for (const change of planReverseLinks(notes, config, codeDirs, counts)) {
        changes.push(change);
    }

    return { indexCount: indexes.length, codeDirCount: codeDirs.length, changes, counts };
}

/** Write every planned change. @throws {VaultError} when a write fails. */
export function applyChanges(changes: readonly FileChange[]): void {
    for (const change of changes) {
        writeNote(change.absolutePath, change.after);
    }
}

// --------------------------------------------------------------------------
// The notes side: seed, then maintain.
// --------------------------------------------------------------------------

/** An entry inside a managed block: a list item, or a line carried verbatim. */
type BlockEntry = {
    readonly lines: readonly string[];
    /** Null for a line that is not a list item; such a line is only carried. */
    readonly item: ListItem | null;
};

function planOneIndex(index: NoteFile, config: RepoConfig, counts: IndexCounts): FileChange | null {
    const before = readNote(index.absolutePath);
    const dir = containingDir(index.absolutePath);
    const actions: string[] = [];

    let lines: readonly string[] = splitLines(before);

    // Seeding. Later runs are wrapped first so that the line numbers of the
    // earlier ones are still the ones found.
    const alreadyManaged = findMarkedRegions(lines);
    const runs = findListRuns(lines).filter(
        (run) =>
            !alreadyManaged.some((region) => run.start > region.start && run.end < region.end) &&
            run.items.some((item) => isNoteEntry(item, dir))
    );
    for (const run of [...runs].reverse()) {
        lines = spliceLines(
            lines,
            run.start,
            run.end,
            renderBlock(lines.slice(run.start, run.end + 1))
        );
    }
    if (runs.length > 0) {
        counts.seededBlocks += runs.length;
        actions.push(`seeded ${plural(runs.length, 'block')}`);
    }

    // A README with no note list at all still gets a block, so a note written
    // into that folder later has somewhere to land.
    if (findMarkedRegions(lines).length === 0) {
        lines = appendBlock(lines, renderBlock([]));
        counts.emptyBlocks += 1;
        actions.push('added an empty block');
    }

    // Maintenance, inside the markers and nowhere else.
    let duplicates = 0;
    let dead = 0;
    for (const region of [...findMarkedRegions(lines)].reverse()) {
        const entries = readBlockEntries(region.body);
        const kept = maintain(entries, dir);
        duplicates += kept.duplicates;
        dead += kept.dead;
        lines = spliceLines(
            lines,
            region.start,
            region.end,
            renderBlock(kept.entries.flatMap((entry) => entry.lines))
        );
    }
    if (duplicates > 0) {
        counts.duplicates += duplicates;
        actions.push(`dropped ${plural(duplicates, 'duplicate')}`);
    }
    if (dead > 0) {
        counts.deadEntries += dead;
        actions.push(`dropped ${plural(dead, 'dead entry', 'dead entries')}`);
    }

    // Appending, once every block has settled.
    const appended = appendMissingNotes(lines, dir, index.absolutePath);
    if (appended.count > 0) {
        lines = appended.lines;
        counts.appended += appended.count;
        actions.push(`appended ${plural(appended.count, 'note')}`);
    }

    const after = lines.join('\n');
    if (after === before) {
        return null;
    }

    return {
        file: displayPath(config.notesRoot, index.absolutePath),
        absolutePath: index.absolutePath,
        before,
        after,
        actions,
    };
}

/**
 * Split a block body into entries, dropping only the blank padding that sits
 * against the markers.
 *
 * A blank line an author put between two groups inside the block is content, so
 * it is carried like any other line the command does not understand.
 */
function readBlockEntries(body: readonly string[]): BlockEntry[] {
    const entries: BlockEntry[] = [];

    for (const line of trimBlankEnds(body)) {
        if (line.trim() === '') {
            entries.push({ lines: [line], item: null });
            continue;
        }
        const item = parseListItem(line);
        if (item !== null) {
            entries.push({ lines: [line], item });
            continue;
        }

        const last = entries[entries.length - 1];
        if (last !== undefined && /^\s/.test(line)) {
            // A continuation line or a nested list belongs to the item above it.
            entries[entries.length - 1] = { ...last, lines: [...last.lines, line] };
            continue;
        }
        entries.push({ lines: [line], item: null });
    }

    return entries;
}

/** Dedup and drop dead entries, keeping everything else exactly where it is. */
function maintain(
    entries: readonly BlockEntry[],
    dir: string
): { entries: BlockEntry[]; duplicates: number; dead: number } {
    const kept: BlockEntry[] = [];
    const seen = new Set<string>();
    let duplicates = 0;
    let dead = 0;

    for (const entry of entries) {
        const target = entry.item === null ? null : linkTarget(entry.item, dir);
        if (target === null) {
            // No filesystem target: a wikilink, a plain line, an anchor, a URL.
            // None of those can be resolved, so none of them can be dropped.
            kept.push(entry);
            continue;
        }
        // Compared case-insensitively, because the two repos already spell one
        // shared resource `ASP.Net` and `ASP.NET`, and because a vault authored
        // on Windows cannot hold two notes differing only in case.
        const key = target.toLowerCase();
        if (seen.has(key)) {
            duplicates += 1;
            continue;
        }
        if (!exists(target)) {
            dead += 1;
            continue;
        }
        seen.add(key);
        kept.push(entry);
    }

    return { entries: kept, duplicates, dead };
}

/**
 * Append the notes a directory owns that appear in no block of its index.
 *
 * This is the one place a label is derived, and it applies only to a note that
 * was never authored into an index: it takes the note's `# H1`, falling back to
 * the filename. An authored entry keeps whatever the author wrote.
 */
function appendMissingNotes(
    lines: readonly string[],
    dir: string,
    indexPath: string
): { lines: readonly string[]; count: number } {
    const regions = findMarkedRegions(lines);
    const last = regions[regions.length - 1];
    if (last === undefined) {
        return { lines, count: 0 };
    }

    const linked = new Set<string>();
    const wikilinked = new Set<string>();
    for (const region of regions) {
        for (const entry of readBlockEntries(region.body)) {
            if (entry.item === null) {
                continue;
            }
            const target = linkTarget(entry.item, dir);
            if (target !== null) {
                linked.add(target.toLowerCase());
            }
            if (entry.item.wikilink !== null) {
                wikilinked.add(entry.item.wikilink.toLowerCase().replace(/\.md$/, ''));
            }
        }
    }

    const missing = listOwnedNotes(dir).filter((owned) => {
        if (owned === indexPath || linked.has(owned.toLowerCase())) {
            return false;
        }
        return !wikilinked.has(stem(owned).toLowerCase());
    });
    if (missing.length === 0) {
        return { lines, count: 0 };
    }

    const body = readBlockEntries(last.body);
    const added = missing.map((target, position) =>
        renderEntry(
            nextMarker(body, position),
            labelFor(target),
            `./${path.posix.relative(dir, target)}`
        )
    );

    return {
        lines: spliceLines(
            lines,
            last.start,
            last.end,
            renderBlock([...body.flatMap((entry) => entry.lines), ...added])
        ),
        count: missing.length,
    };
}

/** The list marker a new entry takes: the block's own, ordered or bulleted. */
function nextMarker(entries: readonly BlockEntry[], position: number): string {
    const items = entries.map((entry) => entry.item).filter((item) => item !== null);
    const last = items[items.length - 1];
    if (last === undefined) {
        return '-';
    }
    if (!last.ordered) {
        return last.marker;
    }
    // An ordered block continues its own numbering, so the Santander teaching
    // order stays readable rather than restarting at 1.
    const number = Number.parseInt(last.marker, 10);
    return `${String(number + position + 1)}${last.marker.slice(-1)}`;
}

/** A note's `# H1`, or its filename when it has none. */
function labelFor(notePath: string): string {
    const text = readNote(notePath);
    const frontmatter = parseFrontmatter(text);
    let fenced = false;

    for (const line of splitLines(text).slice(frontmatter.bodyStartLine - 1)) {
        if (/^\s*(```|~~~)/.test(line)) {
            // A `#` inside a fence is a comment in transcribed code, and the
            // corpus transcribes plenty of it.
            fenced = !fenced;
            continue;
        }
        const heading = fenced ? null : /^#\s+(.*\S)\s*$/.exec(line);
        if (heading !== null) {
            return heading[1] ?? stem(notePath);
        }
    }
    return stem(notePath);
}

/**
 * The absolute path a list item links to, or null when it links nowhere on
 * disk: an anchor, an external URL, a wikilink, or a line that is not a link.
 */
function linkTarget(item: ListItem, dir: string): string | null {
    const destination = item.link?.destination;
    if (destination === undefined || !isRelativeTarget(destination)) {
        return null;
    }
    // A `#heading` or `?query` names a place inside the target, not part of its
    // path. Resolving them as path would make an entry that points at a real
    // note look dead, and dropping an authored entry is the one thing this
    // command must never do.
    const withoutFragment = (destination.split('#')[0] ?? '').split('?')[0] ?? '';
    if (withoutFragment === '') {
        return null;
    }

    let decoded;
    try {
        decoded = decodeURIComponent(withoutFragment);
    } catch {
        // A destination that is not valid percent-encoding names nothing this
        // tool can resolve. Treating it as no target means it is carried through
        // rather than dropped, which is the safe half of the two mistakes.
        return null;
    }
    return toAbsolutePosix(decoded, dir);
}

function isRelativeTarget(destination: string): boolean {
    return (
        destination !== '' &&
        !destination.startsWith('#') &&
        !destination.startsWith('//') &&
        !/^[a-z][a-z0-9+.-]*:/i.test(destination)
    );
}

/**
 * True when an item is the kind of entry a note list is made of.
 *
 * One such item is enough to seed the run it sits in, which is what keeps the
 * `Day 24` line with no link inside the Advent of Cyber block while leaving the
 * anchor-link tables of contents and the prose glossary alone.
 */
function isNoteEntry(item: ListItem, dir: string): boolean {
    if (item.wikilink !== null) {
        return true;
    }
    const target = linkTarget(item, dir);
    if (target === null) {
        return false;
    }
    return target.toLowerCase().endsWith('.md') || exists(target);
}

// --------------------------------------------------------------------------
// The code side: reverse links, generated rather than seeded.
// --------------------------------------------------------------------------

type ReverseLink = {
    readonly slug: string;
    readonly relativePath: string;
};

function planReverseLinks(
    notes: readonly NoteFile[],
    config: RepoConfig,
    codeDirs: readonly string[],
    counts: IndexCounts
): FileChange[] {
    const byDir = new Map<string, ReverseLink[]>();

    for (const note of notes) {
        const frontmatter = parseFrontmatter(readNote(note.absolutePath));
        const slug = entryFor(frontmatter, 'slug')?.value;
        const code = entryFor(frontmatter, 'code')?.value;
        if (typeof slug !== 'string' || slug.trim() === '' || !Array.isArray(code)) {
            continue;
        }

        const noteDir = containingDir(note.absolutePath);
        for (const item of code) {
            if (typeof item !== 'string') {
                continue;
            }
            const resolved = toAbsolutePosix(item, noteDir);
            if (!isDirectory(resolved)) {
                // A dangling entry is rule 7's business, not this command's.
                continue;
            }
            for (const relative of codeDirs) {
                if (!claimsCodeDir(resolved, path.posix.join(config.codeRoot, relative))) {
                    continue;
                }
                const links = byDir.get(relative) ?? [];
                if (!links.some((link) => link.slug === slug)) {
                    links.push({ slug, relativePath: note.relativePath });
                }
                byDir.set(relative, links);
            }
        }
    }

    const changes: FileChange[] = [];
    for (const relative of codeDirs) {
        // A directory no note claims any more still has to be visited: its
        // block was generated rather than authored, so leaving it behind would
        // keep naming a note that no longer points here.
        const links = byDir.get(relative) ?? [];
        const change = planReverseBlock(relative, links, config);
        if (links.length > 0) {
            counts.reverseBlocks += 1;
        }
        if (change !== null) {
            changes.push(change);
        }
    }
    return changes;
}

function planReverseBlock(
    relative: string,
    links: readonly ReverseLink[],
    config: RepoConfig
): FileChange | null {
    const absolutePath = path.posix.join(config.codeRoot, relative, 'README.md');
    const sorted = [...links].sort((a, b) => (a.slug < b.slug ? -1 : 1));
    const block = renderBlock(
        sorted.length === 0
            ? []
            : [
                  'Study notes for this code:',
                  '',
                  ...sorted.map((link) => `- [${link.slug}](${noteUrl(link.relativePath)})`),
              ]
    );

    const before = exists(absolutePath) ? readNote(absolutePath) : null;
    if (before === null && sorted.length === 0) {
        // Nothing to say, and no file of ours to correct.
        return null;
    }

    const lines: readonly string[] =
        before === null ? [`# ${baseName(relative)}`, ''] : splitLines(before);
    const region = findMarkedRegions(lines)[0];

    if (region === undefined && sorted.length === 0) {
        return null;
    }

    const after = (
        region === undefined
            ? appendBlock(lines, block)
            : sorted.length === 0
              ? removeBlock(lines, region.start, region.end)
              : spliceLines(lines, region.start, region.end, block)
    ).join('\n');

    if (after === before) {
        return null;
    }

    return {
        file: displayPath(config.codeRoot, absolutePath),
        absolutePath,
        before,
        after,
        actions: [
            before === null
                ? 'created with a reverse-link block'
                : sorted.length === 0
                  ? 'removed a reverse-link block no note claims'
                  : 'reverse-link block',
        ],
    };
}

/**
 * The canonical `github.com` URL of a note.
 *
 * `encodeURI` leaves `(`, `)`, `#` and `?` alone, and one of the four Midu.dev
 * notes that carry code is `Lo último de JavaScript (ES2023 & ES2024).md`, whose
 * parentheses would close the markdown link early.
 */
function noteUrl(relativePath: string): string {
    const encoded = encodeURI(relativePath).replace(
        /[()#?]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return `${NOTES_FILE_URL_BASE}${encoded}`;
}

/** Take a block out along with the blank line that separated it. */
function removeBlock(lines: readonly string[], start: number, end: number): string[] {
    const openingBlank = start > 0 && (lines[start - 1] ?? '').trim() === '' ? start - 1 : start;
    return spliceLines(lines, openingBlank, end, []);
}

// --------------------------------------------------------------------------
// Reporting.
// --------------------------------------------------------------------------

/** The dry-run report: a diff per file, then the counts. */
export function formatPlan(result: IndexResult, applied: boolean): string {
    const lines: string[] = [];

    for (const change of result.changes) {
        lines.push(`${change.file} (${change.actions.join(', ')})`);
        for (const line of diffLines(
            change.before === null ? [] : splitLines(change.before),
            splitLines(change.after)
        )) {
            lines.push(`  ${line}`);
        }
        lines.push('');
    }

    const { counts } = result;
    lines.push(
        [
            `${plural(result.indexCount, 'index', 'indexes')}:`,
            `${plural(counts.seededBlocks, 'block')} seeded,`,
            `${plural(counts.emptyBlocks, 'empty block')} added,`,
            `${plural(counts.duplicates, 'duplicate')} dropped,`,
            `${plural(counts.deadEntries, 'dead entry', 'dead entries')} dropped,`,
            `${plural(counts.appended, 'note')} appended`,
        ].join(' ')
    );
    lines.push(
        `${plural(result.codeDirCount, 'code directory', 'code directories')}: ${plural(counts.reverseBlocks, 'reverse-link block')}`
    );
    lines.push(
        result.changes.length === 0
            ? 'no changes'
            : applied
              ? `${plural(result.changes.length, 'file')} written`
              : `${plural(result.changes.length, 'file')} would change; pass --write to apply`
    );

    return `${lines.join('\n')}\n`;
}

/** A minimal line diff: what left, what arrived, no context. */
export function diffLines(before: readonly string[], after: readonly string[]): string[] {
    const table: number[][] = Array.from({ length: before.length + 1 }, () =>
        new Array<number>(after.length + 1).fill(0)
    );
    for (let i = before.length - 1; i >= 0; i -= 1) {
        for (let j = after.length - 1; j >= 0; j -= 1) {
            const row = table[i] ?? [];
            const next = table[i + 1] ?? [];
            row[j] =
                before[i] === after[j]
                    ? (next[j + 1] ?? 0) + 1
                    : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
        }
    }

    const out: string[] = [];
    let i = 0;
    let j = 0;
    while (i < before.length && j < after.length) {
        if (before[i] === after[j]) {
            i += 1;
            j += 1;
            continue;
        }
        if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
            out.push(`- ${before[i] ?? ''}`);
            i += 1;
        } else {
            out.push(`+ ${after[j] ?? ''}`);
            j += 1;
        }
    }
    for (; i < before.length; i += 1) {
        out.push(`- ${before[i] ?? ''}`);
    }
    for (; j < after.length; j += 1) {
        out.push(`+ ${after[j] ?? ''}`);
    }
    return out;
}

// --------------------------------------------------------------------------
// Small shared helpers.
// --------------------------------------------------------------------------

/** Drop the blank lines at both ends of `lines`, keeping any in the middle. */
function trimBlankEnds(lines: readonly string[]): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && (trimmed[0] ?? '').trim() === '') {
        trimmed.shift();
    }
    while (trimmed.length > 0 && (trimmed[trimmed.length - 1] ?? '').trim() === '') {
        trimmed.pop();
    }
    return trimmed;
}

/** Put `block` at the end of a file, separated by exactly one blank line. */
function appendBlock(lines: readonly string[], block: readonly string[]): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && (trimmed[trimmed.length - 1] ?? '').trim() === '') {
        trimmed.pop();
    }
    // The last empty element is the file's trailing newline, which every file in
    // both repos carries.
    return [...trimmed, '', ...block, ''];
}

function displayPath(root: string, absolutePath: string): string {
    return `${baseName(root)}/${path.posix.relative(root, absolutePath)}`;
}

function containingDir(posixPath: string): string {
    const cut = posixPath.lastIndexOf('/');
    return cut === -1 ? '' : posixPath.slice(0, cut);
}

function baseName(posixPath: string): string {
    return posixPath.slice(posixPath.lastIndexOf('/') + 1);
}

function stem(posixPath: string): string {
    return baseName(posixPath).replace(/\.md$/i, '');
}

function plural(count: number, noun: string, plural_?: string): string {
    return `${String(count)} ${count === 1 ? noun : (plural_ ?? `${noun}s`)}`;
}
