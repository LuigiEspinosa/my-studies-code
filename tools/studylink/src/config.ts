/**
 * Repo discovery and runtime configuration for `studylink`.
 *
 * The tool runs on Windows and under WSL2, where the absolute paths of the two
 * checkouts differ, so nothing may assume a path separator. Every path this
 * module hands out is POSIX-separated; conversion back to the platform form
 * happens only at the filesystem boundary, inside `toFsPath`.
 */

import { statSync } from 'node:fs';
import path from 'node:path';

/** Directory name of the notes checkout, relative to the common parent. */
export const NOTES_DIR_NAME = 'my-studies';

/** Directory name of the code checkout, relative to the common parent. */
export const CODE_DIR_NAME = 'my-studies-code';

/** Days without a commit after which an `active` resource counts as stalled. */
export const DEFAULT_STALE_DAYS = 30;

/**
 * Canonical GitHub location of a note.
 *
 * Relative cross-repo links do not resolve on github.com, which is why the
 * contract records a URL alongside every relative path. A note is a file, so it
 * takes `blob`, and a `code` directory takes `tree`.
 */
export const NOTES_FILE_URL_BASE = 'https://github.com/LuigiEspinosa/my-studies/blob/main/';

/** Canonical GitHub location of a code directory. The `tree` half of the pair. */
export const CODE_TREE_URL_BASE = 'https://github.com/LuigiEspinosa/my-studies-code/tree/main/';

/**
 * Percent-encode a repo-relative path for use in a GitHub URL.
 *
 * `encodeURI` leaves `(`, `)`, `#` and `?` alone, and the corpus carries
 * `Lo último de JavaScript (ES2023 & ES2024)`, whose parentheses would close a
 * markdown link early. Accented letters stay literal, the way the corpus
 * already writes its own destinations.
 */
export function encodeRepoPath(relativePath: string): string {
    return encodeURI(relativePath).replace(
        /[()#?]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

/**
 * A commit whose dates say nothing about when a note was studied.
 *
 * Each of these rewrote or removed many notes at once, so leaving them in would
 * flatten `finished` across a whole platform onto the day the reformatting ran.
 */
export type BulkCommit = {
    /** Abbreviated SHA, matched as a prefix. */
    readonly sha: string;
    readonly subject: string;
    /** Note files the commit touched, recorded so the table can be re-checked. */
    readonly noteFiles: number;
};

/**
 * The complete exclusion set for `my-studies`, as an explicit list.
 *
 * **Never replace this with a file-count threshold.** Real study commits touch
 * more files than many mechanical ones: `9be50a6` (CLM Business Certification
 * v5) touches 51 note files and `b4add3c` (Advent of Cyber '24) touches 38,
 * while entries here run from 1 to 120. The two ranges overlap in both
 * directions, so any threshold rule would silently discard real dates.
 *
 * `noteFiles` is not a criterion, only a record of what was read. Entries here
 * touch between 1 and 120 files and all belong equally: what disqualifies a
 * commit is that its date says nothing about when the note was studied.
 *
 * Every count was re-measured on 2026-09-06 and 8 of the first 11 were wrong,
 * all undercounts. They had been collected without `core.quotepath=false`, so
 * git escaped every path holding a non-ASCII character and a `\.md$` filter
 * dropped it. `Introducción`, `Lo último`, `Detección`, `Básico` and
 * `Formula 1®` all vanished from the tallies. `git.ts` sets that flag on its own
 * log calls, so no derived date was ever affected; only this record was.
 */
export const BULK_COMMITS: readonly BulkCommit[] = [
    { sha: '2409228', subject: 'Apply the Prettier and markdownlint pass', noteFiles: 37 },
    { sha: 'a6e6893', subject: 'Renormalize line endings to LF', noteFiles: 19 },
    { sha: '5e13fde', subject: 'Drop stalled and outdated course notes', noteFiles: 54 },
    { sha: '3159172', subject: 'chore(migration): Veeva Learning Lint', noteFiles: 84 },
    { sha: '6b92425', subject: 'chore(migration): Udemy Lint', noteFiles: 17 },
    { sha: 'e6cbbeb', subject: 'chore(migration): TryHackMe Lint', noteFiles: 48 },
    { sha: '3bc06ff', subject: 'chore(migration): Platzi Lint', noteFiles: 16 },
    { sha: '1b3c2de', subject: 'chore(migration): Books Lint', noteFiles: 22 },
    { sha: 'acfe6cc', subject: 'chore(migration): Midu.dev Lint', noteFiles: 10 },
    // The seventh reformatting pass, missed when the other six were collected.
    // It is the only commit on either Santander README and the last on all of
    // its notes, so leaving it in dated the whole resource 2026-03-26 against a
    // real study commit of 2025-06-17.
    { sha: '13661b9', subject: 'chore(migration): Santander Open Academy Lint', noteFiles: 10 },
    // Repair work on this contract rather than study: it corrected `salesfoce`
    // to `salesforce` in a link the superseded url-lifting rule would have
    // promoted into frontmatter. Left in, it stamped one Veeva note, and the
    // certification index above it, with the day the migration itself ran.
    { sha: '1235c34', subject: 'Fix misspelled Salesforce link', noteFiles: 1 },
    // The migration's own two commits, the largest mechanical pair in the
    // history. Harmless while `migrate` stays un-rerun, since the dates it
    // derived are frozen in frontmatter, but re-running it with these absent
    // would derive `finished: 2026-08-22` for the entire vault, which is
    // precisely the flattening this list exists to prevent.
    {
        sha: 'd1ad5c9',
        subject: 'Add frontmatter and managed index blocks to every note',
        noteFiles: 120,
    },
    { sha: 'b69d6ce', subject: 'Add topic tags to every note', noteFiles: 114 },
];

/**
 * Links a resource-level note opens with that are not the resource's own URL.
 *
 * `url` is defined as the canonical URL of the course, room, or book, so a
 * site-wide legal page does not qualify however prominently a note carries it.
 * `Veeva Learning/Start Here - Multichannel Certification/README.md` is five
 * lines of terms and conditions and the privacy policy is the only link in it;
 * lifting it would put a value in the field that answers a different question.
 *
 * Named explicitly rather than pattern-matched, for the same reason
 * `BULK_COMMITS` is: a rule shaped to reject this one URL would also reject
 * legitimate ones the corpus has not acquired yet. An entry earns its place by
 * being read, not by matching a shape.
 */
export const NON_CANONICAL_URLS: readonly string[] = ['https://www.veeva.com/privacy/'];

export type DeclaredDates = {
    readonly started: string;
    readonly finished: string;
};

/**
 * Dates no derivation can reach, declared by the author rather than inferred.
 *
 * Consulted only after both derivations have come up empty, so an entry here
 * can never override a date the corpus actually carries.
 *
 * `veeva/start-here-multichannel-certification` is the whole table: its README
 * is five lines of terms and conditions, it owns no notes and links none, and
 * its only commits are excluded above. The other four certifications that carry
 * no notes of their own are dated from the notes they link. The author placed
 * this one on the day the first certification referencing it begins.
 */
export const INDEX_DATES: Readonly<Record<string, DeclaredDates>> = {
    'veeva/start-here-multichannel-certification': {
        started: '2024-10-15',
        finished: '2024-10-15',
    },
};

export type RepoConfig = {
    /** Absolute POSIX path to the notes checkout. */
    readonly notesRoot: string;
    /** Absolute POSIX path to the code checkout. */
    readonly codeRoot: string;
    /** Staleness threshold in days. */
    readonly staleDays: number;
};

export type RootOverrides = {
    /** Value of `--notes`, if the caller passed one. */
    readonly notes?: string | undefined;
    /** Value of `--code`, if the caller passed one. */
    readonly code?: string | undefined;
};

export type ResolveConfigOptions = {
    /** Directory the walk starts from. Usually `process.cwd()`. */
    readonly cwd: string;
    readonly overrides?: RootOverrides | undefined;
    /** Value of `--stale`, if the caller passed one. */
    readonly staleDays?: number | undefined;
};

/**
 * An operational failure: a root could not be found, or an override does not
 * point at a directory. Callers map this to exit code 2.
 */
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

/**
 * Convert a path to the POSIX separator form used everywhere inside the tool.
 *
 * The conversion is unconditional rather than Windows-only so that a given
 * input produces the same internal path on Windows and under WSL2. The cost is
 * that a Linux filename containing a literal backslash is not representable,
 * which no path in either repo relies on.
 */
export function toPosix(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
}

/** Convert an internal POSIX path back to the platform form, for `node:fs`. */
export function toFsPath(posixPath: string): string {
    return path.normalize(posixPath);
}

/**
 * Resolve `inputPath` to an absolute POSIX path.
 *
 * With `baseDir`, a relative `inputPath` resolves against it. Without one it
 * resolves against the process working directory, the way `path.resolve` does.
 * Passing the same path as both arguments would double the relative segment, so
 * a lone path must be resolved through the single-argument form.
 */
export function toAbsolutePosix(inputPath: string, baseDir?: string): string {
    const target = toFsPath(toPosix(inputPath));
    if (baseDir === undefined) {
        return toPosix(path.resolve(target));
    }
    return toPosix(path.resolve(toFsPath(toPosix(baseDir)), target));
}

function isDirectory(posixPath: string): boolean {
    try {
        return statSync(toFsPath(posixPath)).isDirectory();
    } catch {
        return false;
    }
}

/** The parent of `posixPath`, or `posixPath` itself once at the filesystem root. */
function parentOf(posixPath: string): string {
    return toPosix(path.dirname(toFsPath(posixPath)));
}

type WalkResult = {
    /** The first parent holding every requested directory, or null. */
    readonly parent: string | null;
    /** Every directory the walk inspected, in order, for the failure message. */
    readonly walked: readonly string[];
};

/**
 * Walk up from `startDir` looking for the first directory that holds all of
 * `dirNames` as immediate children.
 */
export function findCommonParent(startDir: string, dirNames: readonly string[]): WalkResult {
    const walked: string[] = [];
    let current = toAbsolutePosix(startDir);

    for (;;) {
        walked.push(current);
        const holdsAll = dirNames.every((name) => isDirectory(path.posix.join(current, name)));
        if (holdsAll) {
            return { parent: current, walked };
        }

        const parent = parentOf(current);
        if (parent === current) {
            return { parent: null, walked };
        }
        current = parent;
    }
}

function requireDirectory(flag: string, value: string, cwd: string): string {
    const resolved = toAbsolutePosix(value, cwd);
    if (!isDirectory(resolved)) {
        throw new ConfigError(
            `${flag} ${value} does not point at an existing directory (looked at ${resolved}).`
        );
    }
    return resolved;
}

function requireStaleDays(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new ConfigError(
            `--stale expects a positive whole number of days, got ${String(value)}.`
        );
    }
    return value;
}

/**
 * Resolve both repository roots and the staleness threshold.
 *
 * Roots given as overrides are used verbatim; only the roots left unspecified
 * are discovered by walking up from `cwd`. With no overrides that walk is the
 * contract's "first parent holding both checkouts".
 *
 * @throws {ConfigError} when an override is not a directory, or the walk fails.
 */
export function resolveConfig(options: ResolveConfigOptions): RepoConfig {
    const cwd = toAbsolutePosix(options.cwd);
    const overrides = options.overrides ?? {};
    const staleDays =
        options.staleDays === undefined ? DEFAULT_STALE_DAYS : requireStaleDays(options.staleDays);

    const notesOverride =
        overrides.notes === undefined
            ? undefined
            : requireDirectory('--notes', overrides.notes, cwd);
    const codeOverride =
        overrides.code === undefined ? undefined : requireDirectory('--code', overrides.code, cwd);

    const sought: string[] = [];
    if (notesOverride === undefined) {
        sought.push(NOTES_DIR_NAME);
    }
    if (codeOverride === undefined) {
        sought.push(CODE_DIR_NAME);
    }

    const parent = sought.length === 0 ? undefined : discoverParent(cwd, sought);

    return {
        notesRoot: rootFor(notesOverride, parent, NOTES_DIR_NAME),
        codeRoot: rootFor(codeOverride, parent, CODE_DIR_NAME),
        staleDays,
    };
}

/** The first parent of `cwd` holding every name in `sought`. */
function discoverParent(cwd: string, sought: readonly string[]): string {
    const { parent, walked } = findCommonParent(cwd, sought);
    if (parent !== null) {
        return parent;
    }
    throw new ConfigError(
        [
            `Could not find ${sought.join(' and ')} in any parent of ${cwd}.`,
            `Sought: ${sought.join(', ')}`,
            `Walked: ${walked.join(', ')}`,
            'Pass --notes <path> and --code <path> to point at the checkouts explicitly.',
        ].join('\n')
    );
}

function rootFor(
    override: string | undefined,
    parent: string | undefined,
    dirName: string
): string {
    if (override !== undefined) {
        return override;
    }
    if (parent === undefined) {
        throw new ConfigError(`Internal error: ${dirName} was neither overridden nor discovered.`);
    }
    return path.posix.join(parent, dirName);
}
