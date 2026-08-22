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
