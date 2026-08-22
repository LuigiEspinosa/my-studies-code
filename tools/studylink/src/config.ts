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
 * more files than most mechanical ones: `9be50a6` (CLM Business Certification
 * v5) touches 51 note files and `b4add3c` (Advent of Cyber '24) touches 38,
 * against 6 to 84 here. Any threshold rule would silently discard real dates.
 *
 * The last two postdate the spec: story 1 introduced them, so migration-plan.md
 * still names only the 7 below them.
 */
export const BULK_COMMITS: readonly BulkCommit[] = [
    { sha: '2409228', subject: 'Apply the Prettier and markdownlint pass', noteFiles: 34 },
    { sha: 'a6e6893', subject: 'Renormalize line endings to LF', noteFiles: 19 },
    { sha: '5e13fde', subject: 'Drop stalled and outdated course notes', noteFiles: 43 },
    { sha: '3159172', subject: 'chore(migration): Veeva Learning Lint', noteFiles: 84 },
    { sha: '6b92425', subject: 'chore(migration): Udemy Lint', noteFiles: 15 },
    { sha: 'e6cbbeb', subject: 'chore(migration): TryHackMe Lint', noteFiles: 47 },
    { sha: '3bc06ff', subject: 'chore(migration): Platzi Lint', noteFiles: 6 },
    { sha: '1b3c2de', subject: 'chore(migration): Books Lint', noteFiles: 21 },
    { sha: 'acfe6cc', subject: 'chore(migration): Midu.dev Lint', noteFiles: 7 },
];

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
