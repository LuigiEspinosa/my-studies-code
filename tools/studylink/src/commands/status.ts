/**
 * `studylink status`: what is in progress, what has stalled, and how much of
 * each resource is written.
 *
 * The command reports; it never judges. `status` is human-authored intent and
 * the only thing here that reads it is the tally. Staleness is derived on every
 * run from `status: active` plus a commit date, is printed as a marker on a
 * line, and is never written anywhere: a date can say that nothing is
 * happening, never whether that is because the work finished or was abandoned.
 * `--triage` is the one exception, and even there the human supplies the answer.
 *
 * The report never fails: a checkout with no git history, no frontmatter, or
 * every resource stale all still exit 0, because this is a report and not a
 * gate. `--triage` is the exception, since it writes, and a note it cannot
 * write is an operational failure rather than something to report.
 */

import path from 'node:path';

import { toAbsolutePosix, type RepoConfig } from '../config.ts';
import { entryFor, parseFrontmatter, splitLines } from '../frontmatter.ts';
import {
    daysSince,
    lastTouchByFile,
    lastTouchUnderDir,
    newestDate,
    readCommitLog,
    type DateIndex,
} from '../git.ts';
import { isKind, isRealDate, isStatus, type Kind, type Status } from '../schema.ts';
import {
    findWikilinks,
    isIndexFile,
    listCodeStudyDirs,
    listNotes,
    readNote,
    resolvesInVault,
    VaultError,
    writeNote,
    type NoteFile,
} from '../vault.ts';
import { claimsCodeDir, unitsWritten } from './validate.ts';

/** The three answers `--triage` accepts, in the order it offers them. */
export const TRIAGE_ANSWERS = ['done', 'dropped', 'active'] as const;
export type TriageAnswer = (typeof TRIAGE_ANSWERS)[number];

export type ResourceReport = {
    readonly slug: string;
    readonly status: Status;
    /** Absolute POSIX path of the note carrying the slug. */
    readonly absolutePath: string;
    /** `YYYY-MM-DD` of the newest commit touching the resource, or null. */
    readonly lastTouch: string | null;
    /** Days since `lastTouch`, or null when it is unknown. */
    readonly days: number | null;
    /** Derived: `active` and past the threshold. Never stored anywhere. */
    readonly stale: boolean;
    readonly outlineTotal: number | null;
    readonly unitsWritten: number;
};

export type StatusResult = {
    readonly resources: readonly ResourceReport[];
    readonly counts: Record<Status, number>;
    readonly plannedNotes: number;
    /** Notes carrying no frontmatter block at all. Zero after story 6. */
    readonly notesWithoutFrontmatter: number;
    readonly staleDays: number;
    /** One line per checkout whose git log could not be read. */
    readonly gitProblems: readonly string[];
};

export type StatusOptions = {
    readonly config: RepoConfig;
    /** Reference date for staleness. Injected so the report is not clock-bound. */
    readonly now?: Date | undefined;
    /**
     * Commit dates to use instead of reading them.
     *
     * Supplied by tests that want a vault without a repository behind it. Left
     * out, both logs are read and a failure degrades to unknown dates.
     */
    readonly dates?: { readonly notes: DateIndex; readonly code: DateIndex } | undefined;
};

/**
 * Build the report for `config.notesRoot`.
 *
 * @throws {VaultError} when a checkout or a note cannot be read.
 */
export function collectStatus(options: StatusOptions): StatusResult {
    const { config } = options;
    const now = options.now ?? new Date();
    const notes = listNotes(config.notesRoot);

    const gitProblems: string[] = [];
    const dates = options.dates ?? readBothLogs(config, gitProblems);
    const codeDirs = listCodeStudyDirs(config.codeRoot);

    const resources: ResourceReport[] = [];
    let plannedNotes = 0;
    let notesWithoutFrontmatter = 0;

    for (const note of notes) {
        const text = readNote(note.absolutePath);
        const frontmatter = parseFrontmatter(text);

        if (!frontmatter.present) {
            notesWithoutFrontmatter += 1;
        }

        const body = splitLines(text)
            .slice(frontmatter.bodyStartLine - 1)
            .join('\n');
        for (const link of findWikilinks(body, frontmatter.bodyStartLine)) {
            if (!resolvesInVault(link.target, notes)) {
                plannedNotes += 1;
            }
        }

        const kind = readKind(frontmatter);
        const slug = readText(frontmatter, 'slug');
        const status = readText(frontmatter, 'status');
        if (!isResource(kind, slug) || slug === null || !isStatus(status)) {
            continue;
        }

        const lastTouch = newestDate([
            newestDate(memberPaths(note, kind, notes).map((file) => dates.notes.get(file) ?? null)),
            newestDate(
                claimedCodeDirs(note, frontmatter, config, codeDirs).map((dir) =>
                    lastTouchUnderDir(dates.code, dir)
                )
            ),
        ]);
        // Guarded rather than trusted: `daysSince` on anything that is not a
        // real date yields NaN, which prints as `NaNd` and compares false
        // against every threshold, so a bad date would silently mean "fresh".
        const days = lastTouch !== null && isRealDate(lastTouch) ? daysSince(lastTouch, now) : null;

        resources.push({
            slug,
            status,
            absolutePath: note.absolutePath,
            lastTouch,
            days,
            // A missing date proves nothing, so it can never make a resource
            // stale. Only a date past the threshold can.
            stale: status === 'active' && days !== null && days > config.staleDays,
            outlineTotal: readOutlineTotal(frontmatter, kind),
            unitsWritten: kind === 'index' ? unitsWritten(note, notes) : 0,
        });
    }

    resources.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

    const counts = emptyCounts();
    for (const resource of resources) {
        counts[resource.status] += 1;
    }

    return {
        resources,
        counts,
        plannedNotes,
        notesWithoutFrontmatter,
        staleDays: config.staleDays,
        gitProblems,
    };
}

/**
 * A study resource: a resource README, or a leaf note that is one on its own.
 *
 * The 5 Midu.dev workshops are single-note resources, so `kind: note` does not
 * settle it. A two-segment slug does: `<source>/<course>` is a resource and
 * `<source>/<course>/<note>` is a unit inside one. Identity comes from the
 * frontmatter, never from the folder path.
 */
export function isResource(kind: Kind | null, slug: string | null): boolean {
    if (slug === null || kind === null || kind === 'platform') {
        return false;
    }
    if (kind === 'index') {
        return true;
    }
    // Every segment has to carry something, or `books/` counts as a resource on
    // the strength of a trailing slash.
    const segments = slug.split('/');
    return segments.length === 2 && segments.every((segment) => segment !== '');
}

/**
 * The notes whose commit dates count as touching this resource.
 *
 * An index owns its whole subtree, so a new chapter written under it counts as
 * activity even though the README itself never changed. A single-note resource
 * owns only itself.
 */
function memberPaths(note: NoteFile, kind: Kind | null, notes: readonly NoteFile[]): string[] {
    if (kind !== 'index' || !isIndexFile(baseName(note.relativePath))) {
        return [note.relativePath];
    }
    // An index at the vault root owns everything, and its containing directory
    // is the empty string, which as a prefix would match nothing at all.
    const dir = containingDir(note.relativePath);
    const prefix = dir === '' ? '' : `${dir}/`;
    return notes
        .filter((other) => other.relativePath.startsWith(prefix))
        .map((other) => other.relativePath);
}

/**
 * The code-repo study directories this note's `code` entries claim, relative to
 * the code root.
 *
 * Writing code is studying. A resource whose notes have not moved in 60 days
 * but whose code moved yesterday is not stalled, and reporting it as stalled
 * would be exactly the false alarm CAP-4 exists to avoid.
 */
function claimedCodeDirs(
    note: NoteFile,
    frontmatter: ReturnType<typeof parseFrontmatter>,
    config: RepoConfig,
    codeDirs: readonly string[]
): string[] {
    const field = entryFor(frontmatter, 'code');
    if (field === undefined || !Array.isArray(field.value)) {
        return [];
    }

    const noteDir = containingDir(note.absolutePath);
    const resolved = field.value
        .filter((item) => typeof item === 'string')
        .map((item) => toAbsolutePosix(item, noteDir));

    return codeDirs.filter((relative) => {
        const absolute = path.posix.join(config.codeRoot, relative);
        return resolved.some((entry) => claimsCodeDir(entry, absolute));
    });
}

function readBothLogs(
    config: RepoConfig,
    problems: string[]
): { notes: DateIndex; code: DateIndex } {
    const read = (root: string): DateIndex => {
        const log = readCommitLog(root);
        if (log.unavailable !== null) {
            problems.push(`${baseName(root)}: ${log.unavailable}`);
        }
        return lastTouchByFile(log.commits);
    };

    return { notes: read(config.notesRoot), code: read(config.codeRoot) };
}

function emptyCounts(): Record<Status, number> {
    return { backlog: 0, active: 0, done: 0, dropped: 0 };
}

function readText(frontmatter: ReturnType<typeof parseFrontmatter>, key: string): string | null {
    const value = entryFor(frontmatter, key)?.value;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readKind(frontmatter: ReturnType<typeof parseFrontmatter>): Kind | null {
    const value = entryFor(frontmatter, 'kind')?.value;
    return isKind(value) ? value : null;
}

function readOutlineTotal(
    frontmatter: ReturnType<typeof parseFrontmatter>,
    kind: Kind | null
): number | null {
    const value = entryFor(frontmatter, 'outline_total')?.value;
    if (kind !== 'index' || typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return null;
    }
    return value;
}

/** The directory part of a POSIX path, or '' when there is none. */
function containingDir(posixPath: string): string {
    const cut = posixPath.lastIndexOf('/');
    return cut === -1 ? '' : posixPath.slice(0, cut);
}

function baseName(posixPath: string): string {
    return posixPath.slice(posixPath.lastIndexOf('/') + 1);
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------

/** Gap between the widest slug and the column after it. */
const SLUG_GAP = 4;

/** Right-aligned width of the day count, so `4d` and `231d` line up. */
const DAYS_WIDTH = 6;

/** The report. Every line of it goes to stdout; git problems do not. */
export function formatStatus(result: StatusResult): string {
    const active = result.resources.filter((resource) => resource.status === 'active');
    const width = slugWidth(result.resources);
    const lines: string[] = [`active (${String(active.length)})`];

    for (const resource of active) {
        lines.push(activeLine(resource, width));
    }

    lines.push(
        [
            `done (${String(result.counts.done)})`,
            `backlog (${String(result.counts.backlog)})`,
            `dropped (${String(result.counts.dropped)})`,
        ].join('   ')
    );

    lines.push(...coverageLines(result, width));

    lines.push(`planned notes (unresolved wikilinks): ${String(result.plannedNotes)}`);

    // Only ever non-zero before story 6 writes frontmatter to the corpus, so
    // the steady-state report is exactly the four lines above.
    if (result.notesWithoutFrontmatter > 0) {
        lines.push(`notes with no frontmatter: ${String(result.notesWithoutFrontmatter)}`);
    }

    return `${lines.join('\n')}\n`;
}

function activeLine(resource: ResourceReport, width: number): string {
    const head = `  ${resource.slug.padEnd(width)}`;
    if (resource.lastTouch === null || resource.days === null) {
        return `${head}last touch unknown`;
    }
    const days = `${String(resource.days)}d`.padStart(DAYS_WIDTH);
    return `${head}last touch ${resource.lastTouch}${days}${resource.stale ? '   STALE' : ''}`;
}

function coverageLines(result: StatusResult, width: number): string[] {
    const total = result.resources.length;
    if (total === 0) {
        return ['coverage: no resources'];
    }

    const known = result.resources.filter((resource) => resource.outlineTotal !== null);
    const unknown = total - known.length;

    if (known.length === 0) {
        return [
            `coverage: unknown for ${String(total)} of ${String(total)} (no outlines recorded)`,
        ];
    }

    return [
        `coverage: unknown for ${String(unknown)} of ${String(total)}`,
        ...known.map(
            (resource) =>
                `  ${resource.slug.padEnd(width)}${String(resource.unitsWritten)} of ${String(resource.outlineTotal)}`
        ),
    ];
}

function slugWidth(resources: readonly ResourceReport[]): number {
    return (
        resources.reduce((widest, resource) => Math.max(widest, resource.slug.length), 0) + SLUG_GAP
    );
}

// --------------------------------------------------------------------------
// --triage
// --------------------------------------------------------------------------

/**
 * Asks one question and returns the answer, or null once input is exhausted.
 *
 * Injected rather than reading stdin directly, so the walk is testable without
 * a terminal and the one piece of platform-specific I/O stays at the CLI edge.
 */
export type Ask = (question: string) => string | null;

export type TriageOutcome = {
    readonly slug: string;
    /** What the human answered, or null when the resource was left alone. */
    readonly answer: TriageAnswer | null;
    readonly written: boolean;
};

/**
 * What one question produced: an answer, a resource to leave alone, or the end
 * of input, which stops the walk rather than only this resource.
 */
type AskResult = TriageAnswer | 'skip' | 'exhausted';

/**
 * Walk the stalled resources and write back what the human decides.
 *
 * The only writer of `status` in the tool. `stalled` itself is never written:
 * the answer is always one of the four authored values.
 *
 * Outcomes are pushed into `sink` as they happen, so a caller can still report
 * what was already written when a later note fails to write.
 *
 * @throws {VaultError} when a note cannot be read or written.
 */
export function triageStalled(
    result: StatusResult,
    ask: Ask,
    sink: TriageOutcome[] = []
): TriageOutcome[] {
    const stalled = result.resources.filter((resource) => resource.stale);
    let exhausted = false;

    for (const resource of stalled) {
        const answer = exhausted ? 'exhausted' : askUntilUnderstood(resource, ask);

        // Input running out stops the walk, because nothing more will ever
        // arrive. An answer that was simply not understood does not: one typo
        // must not silently abandon every resource after it.
        if (answer === 'exhausted') {
            exhausted = true;
        }
        if (answer === 'exhausted' || answer === 'skip') {
            sink.push({ slug: resource.slug, answer: null, written: false });
            continue;
        }
        if (answer === 'active') {
            sink.push({ slug: resource.slug, answer, written: false });
            continue;
        }

        // The human made the completion call; the date only records when work
        // last happened, which is what migration derives it for too. A resource
        // can only be stale if it has a date, so `done` always has one to write.
        writeStatus(resource.absolutePath, answer, answer === 'done' ? resource.lastTouch : null);
        sink.push({ slug: resource.slug, answer, written: true });
    }

    return sink;
}

/** Ask, and on an answer that is not one of the three, ask once more. */
function askUntilUnderstood(resource: ResourceReport, ask: Ask): AskResult {
    const age = resource.days === null ? 'unknown' : `${String(resource.days)}d`;
    const question = `${resource.slug}  last touch ${resource.lastTouch ?? 'unknown'} (${age})  -- ${TRIAGE_ANSWERS.join(', ')}? `;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const reply = ask(attempt === 0 ? question : `answer ${TRIAGE_ANSWERS.join(', ')}: `);
        if (reply === null) {
            return 'exhausted';
        }
        const answer = reply.trim().toLowerCase();
        if ((TRIAGE_ANSWERS as readonly string[]).includes(answer)) {
            return answer as TriageAnswer;
        }
    }

    return 'skip';
}

/**
 * Rewrite the `status` line in place, and reconcile `finished` with it.
 *
 * Line-for-line rather than by re-serializing the block, so every other line of
 * the note is exactly what it was, including the prose body and any key this
 * parser does not model. Line endings are the one thing not preserved: the file
 * is rejoined on `\n`, which both repos pin anyway.
 *
 * Rule 3 in the frontmatter schema says `finished` is present when and only
 * when `status` is `done`, so `dropped` takes any existing `finished` back out.
 * The only writer of `status` must not be able to produce a note `validate`
 * then rejects.
 *
 * @throws {VaultError} when the note cannot be read or written, or carries no
 *   `status` line to replace.
 */
function writeStatus(absolutePath: string, next: Status, finished: string | null): void {
    const text = readNote(absolutePath);
    const frontmatter = parseFrontmatter(text);
    const statusEntry = entryFor(frontmatter, 'status');
    if (statusEntry === undefined) {
        throw new VaultError(`Could not write ${absolutePath}: it carries no status field.`);
    }

    const lines = splitLines(text);
    const statusIndex = statusEntry.line - 1;
    lines[statusIndex] = replaceValue(absolutePath, lines[statusIndex] ?? '', 'status', next);

    const existing = entryFor(frontmatter, 'finished');
    if (finished === null) {
        if (existing !== undefined) {
            lines.splice(existing.line - 1, 1);
        }
    } else if (existing === undefined) {
        // After `started` where there is one, so the block keeps the field order
        // the schema table lists and migration writes.
        const started = entryFor(frontmatter, 'started');
        const after = Math.max(statusIndex, started === undefined ? -1 : started.line - 1);
        lines.splice(after + 1, 0, `finished: ${finished}`);
    } else {
        const index = existing.line - 1;
        lines[index] = replaceValue(absolutePath, lines[index] ?? '', 'finished', finished);
    }

    writeNote(absolutePath, lines.join('\n'));
}

/**
 * Swap the value of `key` on one line, keeping how the key itself was written.
 *
 * The caller has already found `key` on this line, so a miss means the line is
 * shaped in a way the parser modelled differently. That is exactly when
 * overwriting it would do the most damage, so it fails instead.
 *
 * @throws {VaultError} when the line does not carry `key` after all.
 */
function replaceValue(absolutePath: string, line: string, key: string, value: string): string {
    const match = new RegExp(`^(\\s*${key}\\s*:\\s*)`).exec(line);
    if (match === null) {
        throw new VaultError(
            `Could not write ${absolutePath}: expected a ${key} line, found ${line}`
        );
    }
    return `${match[1] ?? ''}${value}`;
}

/** The line-per-resource summary of what `--triage` did. */
export function formatTriage(outcomes: readonly TriageOutcome[], staleDays: number): string {
    if (outcomes.length === 0) {
        return 'triage: nothing stalled\n';
    }

    const width = outcomes.reduce((widest, o) => Math.max(widest, o.slug.length), 0) + SLUG_GAP;
    const lines = [
        `triage: ${plural(outcomes.length, 'stalled resource')} (no commit in ${String(staleDays)} days)`,
    ];

    for (const outcome of outcomes) {
        const head = `  ${outcome.slug.padEnd(width)}`;
        if (outcome.written) {
            lines.push(`${head}${outcome.answer ?? ''}`);
            continue;
        }
        lines.push(`${head}${outcome.answer === null ? 'skipped' : 'unchanged'}`);
    }

    return `${lines.join('\n')}\n`;
}

function plural(count: number, noun: string): string {
    return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
