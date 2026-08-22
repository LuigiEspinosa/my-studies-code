/**
 * `studylink migrate`: give every note in the vault a conforming frontmatter
 * block, derived from its path and from the commit dates that survive the
 * bulk-commit filter. Dry run by default; `--write` is the only thing that
 * touches a file.
 *
 * Two rules shape everything here.
 *
 * **Nothing is guessed.** `status` is `done` because the author settled all 21
 * resources by hand, not because a date suggested it. `tags` is empty because
 * auto-tagging from filenames would re-encode the folder structure tags exist
 * to replace. `outline_total` is omitted because no surviving resource carries
 * an outline. A field that cannot be derived is a **gap**: the run names the
 * file and the field, writes nothing, and fails. Writing a note the tool knows
 * `validate` will reject would only push the repair onto a human patching YAML
 * by hand, which is exactly what the migration plan rules out.
 *
 * **Identity lives in the slug, never in the path.** The notes repo spells one
 * resource `ASP.Net Core 3 and React` and the code repo spells it `ASP.NET Core
 * 3 and React`, so the two sides are joined by folding both to the same slug.
 * No path comparison could match them.
 */

import path from 'node:path';

import { findListRuns } from '../blocks.ts';
import {
    BULK_COMMITS,
    CODE_TREE_URL_BASE,
    encodeRepoPath,
    INDEX_DATES,
    NON_CANONICAL_URLS,
    type RepoConfig,
} from '../config.ts';
import { entryFor, parseFrontmatter, splitLines, type Frontmatter } from '../frontmatter.ts';
import {
    firstTouchByFile,
    lastTouchByFile,
    readCommitLog,
    withoutCommits,
    type Commit,
    type DateIndex,
} from '../git.ts';
import { isRealDate, SLUG_PATTERN, type Kind, type Source } from '../schema.ts';
import { isIndexFile, listCodeStudyDirs, listNotes, readNote, type NoteFile } from '../vault.ts';
import { linkTarget, type FileChange } from './index.ts';

/**
 * Platform folder to `source` key, as migration-plan.md fixes it.
 *
 * A folder absent from this table is a gap rather than a guess: `SOURCES` is a
 * closed enum, so inventing a key would only produce a note `validate` rejects.
 */
export const SOURCE_BY_FOLDER: Readonly<Record<string, Source>> = {
    Books: 'books',
    'Midu.dev': 'midudev',
    'Santander Open Academy': 'santander',
    TryHackMe: 'tryhackme',
    'Veeva Learning': 'veeva',
};

/**
 * The status every note receives.
 *
 * Uniform, and not derived from anything. The author settled each of the 21
 * resources directly and all of them are finished, which is the whole benefit
 * of having pruned the corpus first. Completion is never inferred from a date:
 * a timestamp shows only that nothing is happening, never why.
 */
export const MIGRATION_STATUS = 'done';

/** How far into a note body a source link is still considered its own. */
export const URL_HEAD_LINES = 5;

/**
 * True when a note stands for a whole study resource rather than a unit inside
 * one.
 *
 * `url` is the canonical URL of the course, room, or book, so only the note
 * that *is* the resource has one to carry. A resource README qualifies. So does
 * a leaf note that is itself the resource: the 5 Midu.dev workshops are
 * single-page courses filed straight under the platform folder instead of being
 * given a folder of their own, and their two-segment slug is exactly that fact
 * written down. A unit inside a resource never qualifies, whatever it links.
 *
 * That distinction is what the earlier rule missed. Lifting any single link
 * from a note's first 5 lines was right 5 times in 28 across the live corpus:
 * it read the per-day YouTube walkthrough as the course URL for 22 Advent of
 * Cyber day notes, and an unrelated external reference for 1 Veeva lesson.
 * None of those is the room or the certification, because a unit does not have
 * one to give.
 */
export function isResourceLevel(kind: Kind, slug: string | null): boolean {
    if (kind === 'index') {
        return true;
    }
    // A resource-level leaf note is `<source>/<course>`; a unit adds a third
    // segment. Reading the slug rather than the path keeps this a statement
    // about the tier a note occupies rather than about Midu.dev.
    return kind === 'note' && slug !== null && slug.split('/').length === 2;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"']+/g;

/** A field migration could not derive, and therefore refused to invent. */
export type MigrateGap = {
    /** Path relative to the notes root. */
    readonly file: string;
    readonly field: string;
    readonly reason: string;
};

export type MigrateResult = {
    readonly noteCount: number;
    /** Notes that already carry a block, so this pass leaves them alone. */
    readonly alreadyMigrated: number;
    readonly byKind: Readonly<Record<Kind, number>>;
    readonly withCode: number;
    readonly changes: readonly FileChange[];
    readonly gaps: readonly MigrateGap[];
    /** Excluded SHAs that matched no commit, so a stale table cannot go quiet. */
    readonly unmatchedCommits: readonly string[];
    /** Why there are no dates at all, or null when the log was read. */
    readonly gitProblem: string | null;
};

export type MigrateOptions = {
    readonly config: RepoConfig;
    /**
     * Commit stream to derive from instead of reading one.
     *
     * A test seam: most cases are about the derivations rather than about git,
     * and building a repository per case would make them slow and no more
     * exact. The filter still runs over whatever is passed in.
     */
    readonly commits?: readonly Commit[] | undefined;
};

/** What one note resolved to, before it is rendered. */
type Derived = {
    readonly kind: Kind;
    readonly source: Source | null;
    readonly slug: string | null;
    readonly url: string | null;
    readonly started: string | null;
    readonly finished: string | null;
    readonly code: readonly string[];
    readonly codeUrl: string | null;
};

type Dates = {
    readonly first: DateIndex;
    readonly last: DateIndex;
};

/**
 * Fold text to the slug form: lowercase ASCII kebab-case.
 *
 * NFD splits an accented letter into its base and a combining mark, and the
 * mark is then dropped, so `Introducción` becomes `introduccion`. Anything left
 * that is not a letter or a digit becomes a separator, which is what takes the
 * `®` off `Formula 1®` and the `&` out of `ES2023 & ES2024`.
 *
 * The folding is one-way and lossy by design. The readable title survives in
 * the note's `# H1` and in the folder name, which is why nothing ever tries to
 * reverse this.
 */
export function foldToSlug(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Which tier of the vault a note sits in.
 *
 * The vault root and the 5 platform READMEs are structural navigation above the
 * resource level, so they are `platform` and carry the reduced field set. Every
 * other `README.md` is a resource index; everything else is a unit of study.
 */
export function kindFor(relativePath: string): Kind {
    const segments = relativePath.split('/');
    const name = segments[segments.length - 1] ?? '';
    if (!isIndexFile(name)) {
        return 'note';
    }
    return segments.length <= 2 ? 'platform' : 'index';
}

/**
 * The slug for a note, or null when its platform folder is not in the table.
 *
 * Built from the path segments below the platform folder, with `README` and the
 * extension dropped, which is what makes a resource README and its folder share
 * one slug.
 */
export function slugFor(relativePath: string): string | null {
    const segments = relativePath.split('/');
    const platform = segments[0] ?? '';
    const source = SOURCE_BY_FOLDER[platform];
    if (source === undefined) {
        return null;
    }

    const rest = segments.slice(1);
    const name = rest[rest.length - 1];
    if (name !== undefined && isIndexFile(name)) {
        rest.pop();
    } else if (name !== undefined) {
        rest[rest.length - 1] = name.replace(/\.md$/i, '');
    }

    return [source, ...rest.map(foldToSlug)].join('/');
}

/**
 * Plan the whole migration without touching a file.
 *
 * @throws {VaultError} when a checkout or a note cannot be read.
 */
export function planMigration(options: MigrateOptions): MigrateResult {
    const { config } = options;
    const notes = listNotes(config.notesRoot);

    let gitProblem: string | null = null;
    let stream: readonly Commit[];
    if (options.commits === undefined) {
        const log = readCommitLog(config.notesRoot);
        gitProblem = log.unavailable;
        stream = log.commits;
    } else {
        stream = options.commits;
    }

    const filtered = withoutCommits(
        stream,
        BULK_COMMITS.map((commit) => commit.sha)
    );
    const dates: Dates = {
        first: firstTouchByFile(filtered.commits),
        last: lastTouchByFile(filtered.commits),
    };

    const codeBySlug = codeDirsBySlug(config);
    // Keyed lowercase, because a link is authored by hand and the vault lives
    // on a case-insensitive filesystem, so its spelling need not match the file.
    const byAbsolutePath = new Map(
        notes.map((note) => [note.absolutePath.toLowerCase(), note] as const)
    );

    const byKind: Record<Kind, number> = { platform: 0, index: 0, note: 0 };
    const changes: FileChange[] = [];
    const gaps: MigrateGap[] = [];
    const bySlug = new Map<string, string>();
    let alreadyMigrated = 0;
    let withCode = 0;

    for (const note of notes) {
        const before = readNote(note.absolutePath);
        const kind = kindFor(note.relativePath);
        byKind[kind] += 1;

        const existing = parseFrontmatter(before);
        if (existing.present) {
            // A block that never closes is not a migrated note, it is a broken
            // one. Skipping it would report a fully migrated vault that
            // `validate` then rejects, and prepending a second block would only
            // bury the damage, so the run stops and says which file it is.
            if (!existing.terminated) {
                gaps.push({
                    file: note.relativePath,
                    field: 'frontmatter',
                    reason: 'the note already opens a frontmatter block that is never closed',
                });
                continue;
            }
            alreadyMigrated += 1;
            if (readSlugCode(existing)) {
                withCode += 1;
            }
            continue;
        }

        const derived = derive({
            note,
            kind,
            before,
            notes,
            dates,
            config,
            codeBySlug,
            byAbsolutePath,
        });
        const before2 = gaps.length;
        collectGaps(note, derived, gaps);
        checkSlugCollision(note, derived, bySlug, gaps);
        if (derived.code.length > 0) {
            withCode += 1;
        }

        // A note the tool has already declared unwritable must not reach the
        // change list at all: `runMigrate` refuses to apply it, but nothing
        // stops another caller of the exported plan from writing it anyway.
        if (gaps.length > before2) {
            continue;
        }

        changes.push({
            file: `${baseName(config.notesRoot)}/${note.relativePath}`,
            absolutePath: note.absolutePath,
            before,
            // Concatenated rather than split and rejoined, so a body keeps its
            // own line endings and any byte-order mark it opens with. The
            // contract is that no prose body is altered, and that is a promise
            // about bytes rather than about lines.
            after: `${renderFrontmatter(derived).join('\n')}\n\n${before}`,
            actions: [kind],
        });
    }

    return {
        noteCount: notes.length,
        alreadyMigrated,
        byKind,
        withCode,
        changes,
        gaps,
        unmatchedCommits: filtered.unmatched,
        gitProblem,
    };
}

type DeriveInput = {
    readonly note: NoteFile;
    readonly kind: Kind;
    readonly before: string;
    readonly notes: readonly NoteFile[];
    readonly dates: Dates;
    readonly config: RepoConfig;
    readonly codeBySlug: ReadonlyMap<string, string>;
    readonly byAbsolutePath: ReadonlyMap<string, NoteFile>;
};

function derive(input: DeriveInput): Derived {
    const { note, kind, config } = input;
    const source = SOURCE_BY_FOLDER[note.relativePath.split('/')[0] ?? ''] ?? null;

    if (kind === 'platform') {
        // Structural navigation, not a study resource: no slug, no dates, and
        // no url. The vault root has no path segment to take a source from.
        return {
            kind,
            source,
            slug: null,
            url: null,
            started: null,
            finished: null,
            code: [],
            codeUrl: null,
        };
    }

    const slug = slugFor(note.relativePath);
    const { started, finished } = datesFor(input, slug);
    const codeRelative = slug === null ? undefined : input.codeBySlug.get(slug);

    const code =
        codeRelative === undefined
            ? []
            : [
                  path.posix.relative(
                      containingDir(note.absolutePath),
                      path.posix.join(config.codeRoot, codeRelative)
                  ),
              ];

    return {
        kind,
        source,
        // Only the note standing for the resource carries the resource's URL.
        url: isResourceLevel(kind, slug) ? liftUrl(input.before) : null,
        slug,
        started,
        finished,
        code,
        codeUrl:
            codeRelative === undefined
                ? null
                : `${CODE_TREE_URL_BASE}${encodeRepoPath(codeRelative)}`,
    };
}

/**
 * The date cascade, first hit wins: a note's own commits, then the resource
 * subtree beneath an index, then the notes that index links, then the table.
 *
 * A leaf note stops at the first step. An index needs the rest because 15 of
 * the 16 resource READMEs were created by the very Lint commits the exclusion
 * table removes, so their own history is empty by the time it is consulted.
 *
 * The subtree step is not a new idea: `status` already measures a resource
 * across everything beneath it, precisely because an index does not change when
 * a chapter beside it is written. The link step handles the four Veeva
 * certifications that own no notes at all but are not empty -- they are
 * curricula pointing at notes other certifications own, which is the authored
 * membership the index generator is built around. It runs only when the subtree
 * came back empty, so an index with notes of its own keeps its own dates rather
 * than being widened onto the range its references span.
 */
function datesFor(
    input: DeriveInput,
    slug: string | null
): { started: string | null; finished: string | null } {
    const { note, kind, dates } = input;

    if (kind !== 'index') {
        return rollUp([note.relativePath], dates);
    }

    // The subtree includes the index's own file, so this subsumes the first
    // step rather than skipping it.
    const subtree = rollUp(subtreeOf(note, input.notes), dates);
    if (subtree.started !== null) {
        return subtree;
    }

    const linked = rollUp(linkedNotes(input), dates);
    if (linked.started !== null) {
        return linked;
    }

    const declared = slug === null ? undefined : INDEX_DATES[slug];
    return declared === undefined
        ? { started: null, finished: null }
        : { started: declared.started, finished: declared.finished };
}

/** Earliest `started` and latest `finished` across `paths`. */
function rollUp(
    paths: readonly string[],
    dates: Dates
): { started: string | null; finished: string | null } {
    let started: string | null = null;
    let finished: string | null = null;

    for (const relative of paths) {
        const first = dates.first.get(relative);
        if (first !== undefined && (started === null || first < started)) {
            started = first;
        }
        const last = dates.last.get(relative);
        if (last !== undefined && (finished === null || last > finished)) {
            finished = last;
        }
    }

    return { started, finished };
}

/** Every note at or below the index's own directory, itself included. */
function subtreeOf(index: NoteFile, notes: readonly NoteFile[]): string[] {
    const dir = containingDir(index.relativePath);
    const prefix = dir === '' ? '' : `${dir}/`;
    return notes
        .filter((note) => note.relativePath.startsWith(prefix))
        .map((note) => note.relativePath);
}

/**
 * The notes an index links, wherever in the vault they live.
 *
 * Read through the same list parsing and the same destination rule the index
 * generator maintains blocks with, so the two commands cannot disagree about
 * what an authored entry points at. Anchors, external URLs and links to files
 * outside the note corpus resolve to nothing and are skipped.
 */
function linkedNotes(input: DeriveInput): string[] {
    const dir = containingDir(input.note.absolutePath);
    const found: string[] = [];

    for (const run of findListRuns(splitLines(input.before))) {
        for (const item of run.items) {
            const target = linkTarget(item, dir);
            if (target === null) {
                continue;
            }
            const note = input.byAbsolutePath.get(target.toLowerCase());
            if (note !== undefined) {
                found.push(note.relativePath);
            }
        }
    }

    return found;
}

/**
 * The single source link a resource-level note opens with, or null.
 *
 * Exactly one, because two links in a head are two candidates and the tool has
 * no way to tell which is the source. The line itself stays where the author
 * wrote it; this only copies it up into the block.
 */
function liftUrl(text: string): string | null {
    const head = splitLines(text).slice(0, URL_HEAD_LINES).join('\n');
    // Trailing sentence punctuation is stripped before the set is built, or a
    // head naming one URL twice, once mid-sentence, counts as two candidates
    // and the note loses a link it plainly carries.
    const found = new Set(
        (head.match(URL_IN_TEXT) ?? []).map((url) => url.replace(/[.,;:]+$/, ''))
    );
    // Filtered before the count, not after, because a link already known not to
    // be a resource URL was never a candidate. A head pairing one with a real
    // course link should yield that link rather than nothing.
    for (const url of NON_CANONICAL_URLS) {
        found.delete(url);
    }
    return found.size === 1 ? ([...found][0] ?? null) : null;
}

/** Every code study directory, keyed by the slug its path folds to. */
function codeDirsBySlug(config: RepoConfig): Map<string, string> {
    const bySlug = new Map<string, string>();

    for (const relative of listCodeStudyDirs(config.codeRoot)) {
        const cut = relative.indexOf('/');
        const source = cut === -1 ? undefined : SOURCE_BY_FOLDER[relative.slice(0, cut)];
        if (source === undefined) {
            continue;
        }
        const slug = `${source}/${foldToSlug(relative.slice(cut + 1))}`;
        // First wins, so two directories folding to one slug pick a stable
        // winner rather than depending on directory order.
        if (!bySlug.has(slug)) {
            bySlug.set(slug, relative);
        }
    }

    return bySlug;
}

/** Everything the contract requires that this note did not get. */
function collectGaps(note: NoteFile, derived: Derived, out: MigrateGap[]): void {
    const gap = (field: string, reason: string): void => {
        out.push({ file: note.relativePath, field, reason });
    };

    // The vault root is the one file with no path segment to take a source
    // from, which is exactly why the reduced platform set exists.
    if (derived.source === null && note.relativePath !== 'README.md') {
        gap(
            'source',
            `no source is mapped for platform folder ${note.relativePath.split('/')[0] ?? ''}`
        );
    }

    if (derived.kind === 'platform') {
        return;
    }

    if (derived.slug === null) {
        gap('slug', 'no slug could be derived without a source');
    } else if (!SLUG_PATTERN.test(derived.slug)) {
        gap('slug', `derived slug does not match the contract shape: ${derived.slug}`);
    }

    if (derived.started === null) {
        gap(
            'started',
            'no commit date survives the bulk-commit exclusion, and no date is declared'
        );
    }
    if (derived.finished === null) {
        gap(
            'finished',
            'no commit date survives the bulk-commit exclusion, and no date is declared'
        );
    }
    for (const [name, value] of [
        ['started', derived.started],
        ['finished', derived.finished],
    ] as const) {
        // A declared date is hand-written, so it is the one date in the cascade
        // that can be malformed rather than merely absent.
        if (value !== null && !isRealDate(value)) {
            gap(name, `derived ${name} is not a YYYY-MM-DD calendar date: ${value}`);
        }
    }

    if (
        derived.started !== null &&
        derived.finished !== null &&
        derived.finished < derived.started
    ) {
        gap('finished', `derived finished ${derived.finished} precedes started ${derived.started}`);
    }
}

/**
 * Rule 5's other half: slugs are unique across the vault.
 *
 * The shape check above cannot catch this, and the folding is deliberately
 * lossy, so two folder names differing only in punctuation collapse to one
 * identity. `validate` fails on the collision, which means writing it would
 * leave story 6 hand-patching a note, so it is a gap like any other.
 */
function checkSlugCollision(
    note: NoteFile,
    derived: Derived,
    seen: Map<string, string>,
    out: MigrateGap[]
): void {
    if (derived.slug === null) {
        return;
    }
    const owner = seen.get(derived.slug);
    if (owner === undefined) {
        seen.set(derived.slug, note.relativePath);
        return;
    }
    out.push({
        file: note.relativePath,
        field: 'slug',
        reason: `derived slug is not unique: ${derived.slug} is also derived for ${owner}`,
    });
}

/** True when an already-migrated note carries a non-empty `code` list. */
function readSlugCode(frontmatter: Frontmatter): boolean {
    const value = entryFor(frontmatter, 'code')?.value;
    return Array.isArray(value) && value.length > 0;
}

/**
 * The block, in the order the schema field table lists.
 *
 * A field with nothing to say is left out rather than written empty, because
 * `tags:` alone means an unset value while `tags: []` means a deliberately
 * empty list, and only the second is what the contract asks for.
 */
function renderFrontmatter(derived: Derived): string[] {
    const lines = ['---'];

    if (derived.source !== null) {
        lines.push(`source: ${derived.source}`);
    }
    if (derived.url !== null) {
        lines.push(`url: ${scalar(derived.url)}`);
    }
    if (derived.slug !== null) {
        lines.push(`slug: ${derived.slug}`);
    }
    lines.push(`status: ${MIGRATION_STATUS}`);
    if (derived.started !== null) {
        lines.push(`started: ${derived.started}`);
    }
    if (derived.finished !== null) {
        lines.push(`finished: ${derived.finished}`);
    }
    lines.push('tags: []');

    if (derived.kind !== 'platform') {
        if (derived.code.length === 0) {
            lines.push('code: []');
        } else {
            lines.push('code:');
            for (const entry of derived.code) {
                lines.push(`  - ${scalar(entry)}`);
            }
        }
    }
    if (derived.codeUrl !== null) {
        lines.push(`code_url: ${scalar(derived.codeUrl)}`);
    }

    lines.push(`kind: ${derived.kind}`, '---');
    return lines;
}

/**
 * Quote a scalar that would not survive as plain YAML.
 *
 * No path or URL in the corpus needs it today, but this writes 120 files in one
 * pass and a single mis-parsed value would take the whole block down with it.
 * The characters that matter are the ones that start a different YAML node or
 * open a comment.
 */
function scalar(value: string): string {
    const needsQuoting = /^[[\]{}>|*&!%@`'"#-]|:\s|\s#|^\s|\s$/.test(value) || value === '';
    return needsQuoting ? JSON.stringify(value) : value;
}

function containingDir(posixPath: string): string {
    const cut = posixPath.lastIndexOf('/');
    return cut === -1 ? '' : posixPath.slice(0, cut);
}

function baseName(posixPath: string): string {
    return posixPath.slice(posixPath.lastIndexOf('/') + 1);
}

// --------------------------------------------------------------------------
// Reporting.
// --------------------------------------------------------------------------

/** The gap report: one line per field the migration refused to invent. */
export function formatGaps(result: MigrateResult): string {
    if (result.gaps.length === 0) {
        return '';
    }

    const lines = [
        `${plural(result.gaps.length, 'field')} could not be derived, so nothing was written:`,
    ];
    for (const gap of result.gaps) {
        lines.push(`  ${gap.file} ${gap.field}: ${gap.reason}`);
    }
    return `${lines.join('\n')}\n`;
}

/** The dry-run report: the block each note would gain, then the counts. */
export function formatMigration(result: MigrateResult, applied: boolean): string {
    const lines: string[] = [];

    for (const change of result.changes) {
        lines.push(`${change.file} (${change.actions.join(', ')})`);
        for (const line of diffOf(change)) {
            lines.push(`  ${line}`);
        }
        lines.push('');
    }

    const { byKind } = result;
    lines.push(
        `${plural(result.noteCount, 'note')}: ` +
            [
                `${String(byKind.platform)} platform`,
                `${String(byKind.index)} index`,
                `${String(byKind.note)} note`,
            ].join(', ')
    );
    lines.push(
        `${plural(result.withCode, 'note')} ${result.withCode === 1 ? 'carries' : 'carry'} code, ` +
            `${plural(result.alreadyMigrated, 'note')} already migrated`
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

/**
 * The lines a change adds.
 *
 * Migration only ever inserts a block at the head of a file and never removes
 * or moves a line, so the diff is the leading slice rather than a general one.
 * That is also what makes it worth asserting: a change of any other shape shows
 * up here as a wrong-looking report.
 */
function diffOf(change: FileChange): string[] {
    const after = splitLines(change.after);
    const before = change.before === null ? 0 : splitLines(change.before).length;
    return after.slice(0, after.length - before).map((line) => `+ ${line}`);
}

function plural(count: number, noun: string): string {
    return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
