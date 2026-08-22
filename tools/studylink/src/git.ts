/**
 * Commit dates out of a checkout.
 *
 * The module is split in two on purpose. `readCommitLog` does the I/O and hands
 * back a plain commit stream; every date derivation is a pure fold over that
 * stream. `withoutCommits` sits between the two halves, so dropping the bulk
 * reformatting and prune commits is a filter rather than a change to either.
 *
 * Nothing here throws. A missing `git`, a directory that is not a repository,
 * and a repository with no commits all come back as an empty log carrying the
 * reason, because `studylink status` is a report and always exits 0.
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

import { toFsPath } from './config.ts';

/**
 * Starts every commit header, so a header is never mistaken for a path.
 *
 * A path could in principle begin with any printable character, so the sentinel
 * is a control character no filename in either repo carries.
 */
export const COMMIT_MARKER = String.fromCharCode(1);

/** Separates the fields inside a commit header. */
export const FIELD_SEPARATOR = String.fromCharCode(31);

/**
 * Arguments shared by every `git log` this tool runs.
 *
 * `core.quotepath=false` is load-bearing: with the default git escapes every
 * non-ASCII byte, so `Formula 1®` comes back as `Formula 1\302\256` and matches
 * no file on disk. Several of the corpus's paths carry accents or a registered
 * mark. `--no-renames` keeps the output deterministic and skips the rename
 * detection pass, which no date derivation needs.
 */
export const LOG_ARGS: readonly string[] = [
    '-c',
    'core.quotepath=false',
    'log',
    '--no-renames',
    `--pretty=format:${COMMIT_MARKER}%H${FIELD_SEPARATOR}%as`,
    '--name-only',
];

export type Commit = {
    readonly sha: string;
    /** Author date as `YYYY-MM-DD`. */
    readonly date: string;
    /** Repo-relative POSIX paths the commit touched. */
    readonly files: readonly string[];
};

export type CommitLog = {
    /** Every commit reachable from HEAD, in `git log` order. */
    readonly commits: readonly Commit[];
    /** Why the log is empty, or null when it was read successfully. */
    readonly unavailable: string | null;
};

/** A commit-date lookup, keyed by repo-relative POSIX path. */
export type DateIndex = ReadonlyMap<string, string>;

/**
 * Read the whole history of `repoRoot`.
 *
 * Author dates rather than committer dates: the March and April 2026 migration
 * rewrote five commits in `my-studies`, and the author date is the one that
 * still says when the study actually happened.
 *
 * Every path comes back relative to `repoRoot`. Git reports paths relative to
 * the repository root, which is the same thing only while each checkout is its
 * own repository. `--notes` and `--code` can point anywhere, so a checkout
 * nested inside a larger repository is resolved here rather than silently
 * producing keys that match no file and a report of nothing but unknown dates.
 */
export function readCommitLog(repoRoot: string): CommitLog {
    let prefix: string;
    let output: string;
    try {
        prefix = runGit(repoRoot, ['rev-parse', '--show-prefix']).trim();
        output = runGit(repoRoot, LOG_ARGS);
    } catch (error) {
        return { commits: [], unavailable: describeGitFailure(repoRoot, error) };
    }

    return { commits: relativizeTo(parseCommitLog(output), prefix), unavailable: null };
}

function runGit(repoRoot: string, args: readonly string[]): string {
    return execFileSync('git', [...args], {
        cwd: toFsPath(repoRoot),
        encoding: 'utf8',
        // 388 tracked files across 29 commits today, but story 6 writes to
        // every one of them, so leave room rather than truncating a log.
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

/**
 * Re-key repository-relative paths onto the checkout `prefix` names them from.
 *
 * With an empty prefix, which is the case for both real checkouts, this is the
 * identity. Otherwise a file outside the checkout is dropped rather than
 * reported under a path that does not exist there.
 */
function relativizeTo(commits: readonly Commit[], prefix: string): Commit[] {
    if (prefix === '') {
        return [...commits];
    }
    return commits.map((commit) => ({
        ...commit,
        files: commit.files
            .filter((file) => file.startsWith(prefix))
            .map((file) => file.slice(prefix.length)),
    }));
}

/**
 * Parse the output of a `LOG_ARGS` run.
 *
 * Exported so the parser can be exercised on captured output without a
 * repository, including a shape a fixture would not naturally reach: a merge
 * commit, which `--name-only` lists with no files at all.
 */
export function parseCommitLog(text: string): Commit[] {
    const commits: Commit[] = [];
    let sha = '';
    let date = '';
    let files: string[] = [];
    let open = false;

    const close = (): void => {
        if (open) {
            commits.push({ sha, date, files });
        }
    };

    for (const line of text.split(/\r?\n/)) {
        // Both halves of the sentinel, so a path that somehow opened with the
        // marker byte is still read as a path rather than swallowing a commit.
        if (line.startsWith(COMMIT_MARKER) && line.includes(FIELD_SEPARATOR)) {
            close();
            const [nextSha = '', nextDate = ''] = line
                .slice(COMMIT_MARKER.length)
                .split(FIELD_SEPARATOR);
            sha = nextSha;
            date = nextDate;
            files = [];
            open = true;
            continue;
        }
        if (line.trim() === '' || !open) {
            continue;
        }
        files.push(line);
    }
    close();

    return commits;
}

/**
 * One date per file, folded by comparison rather than by position.
 *
 * The log is ordered by committer date while the dates recorded are author
 * dates, and the March and April 2026 rebase put the two out of step, so the
 * first commit mentioning a file is not reliably the earliest one.
 */
function foldByFile(
    commits: readonly Commit[],
    beats: (candidate: string, known: string) => boolean
): Map<string, string> {
    const dates = new Map<string, string>();

    for (const commit of commits) {
        if (commit.date === '') {
            continue;
        }
        for (const file of commit.files) {
            const known = dates.get(file);
            if (known === undefined || beats(commit.date, known)) {
                dates.set(file, commit.date);
            }
        }
    }

    return dates;
}

/** The newest commit date per file. Feeds `finished` and every staleness check. */
export function lastTouchByFile(commits: readonly Commit[]): Map<string, string> {
    return foldByFile(commits, (candidate, known) => candidate > known);
}

/** The oldest commit date per file. Feeds `started`. */
export function firstTouchByFile(commits: readonly Commit[]): Map<string, string> {
    return foldByFile(commits, (candidate, known) => candidate < known);
}

/** What `withoutCommits` removed, and what it was asked to remove but never saw. */
export type FilteredLog = {
    readonly commits: readonly Commit[];
    /** Prefixes that matched no commit, so a stale exclusion list cannot go quiet. */
    readonly unmatched: readonly string[];
};

/**
 * Drop the commits whose SHA starts with one of `prefixes`.
 *
 * A pure filter between the reader and the date folds, which is the whole
 * reason `readCommitLog` hands back a stream rather than a map. Prefixes are
 * matched rather than full SHAs because the exclusion table is written the way
 * `git log --oneline` prints them, and a 7-character prefix is unambiguous
 * across a history this size.
 *
 * An unmatched prefix is reported rather than ignored: it means the list has
 * drifted from the repository, and silently excluding nothing looks identical
 * to excluding the right thing.
 */
export function withoutCommits(
    commits: readonly Commit[],
    prefixes: readonly string[]
): FilteredLog {
    const seen = new Set<string>();
    const kept = commits.filter((commit) => {
        // Every matching prefix is recorded, not just the first: two prefixes
        // that name the same commit would otherwise leave the second reported
        // as stale when it is simply redundant.
        const hits = prefixes.filter((prefix) => prefix !== '' && commit.sha.startsWith(prefix));
        for (const hit of hits) {
            seen.add(hit);
        }
        return hits.length === 0;
    });

    return { commits: kept, unmatched: prefixes.filter((prefix) => !seen.has(prefix)) };
}

/**
 * The newest date recorded for any file at or under `posixDir`.
 *
 * An empty `posixDir` is the repository root, so everything is under it.
 */
export function lastTouchUnderDir(dates: DateIndex, posixDir: string): string | null {
    if (posixDir === '') {
        return newestDate([...dates.values()]);
    }
    const prefix = `${posixDir}/`;
    let newest: string | null = null;

    for (const [file, date] of dates) {
        if (file !== posixDir && !file.startsWith(prefix)) {
            continue;
        }
        if (newest === null || date > newest) {
            newest = date;
        }
    }

    return newest;
}

/** The newest of a set of dates, ignoring the unknown ones. */
export function newestDate(dates: readonly (string | null)[]): string | null {
    let newest: string | null = null;
    for (const date of dates) {
        if (date !== null && (newest === null || date > newest)) {
            newest = date;
        }
    }
    return newest;
}

/**
 * Whole days from `date` to `now`, never negative.
 *
 * Both sides are reduced to a UTC calendar day first, so the answer does not
 * change with the hour the tool is run at.
 */
export function daysSince(date: string, now: Date): number {
    const [year, month, day] = date.split('-').map(Number);
    const then = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.max(0, Math.round((today - then) / 86_400_000));
}

/**
 * Turn a failed `git` call into one line naming why no dates are available.
 *
 * The cases that matter are git not being installed, the checkout not existing,
 * the directory not being a repository, and a repository with no commits yet.
 * All of them read the same way to a caller: there are no dates, so nothing can
 * be called stale. They differ only in what the reader has to go fix, which is
 * why a missing directory does not get reported as a missing git.
 */
function describeGitFailure(repoRoot: string, error: unknown): string {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Node raises ENOENT both for a missing executable and for a cwd that
        // does not exist, and the two send the reader somewhere different.
        return isDirectory(repoRoot) ? 'git is not installed or not on PATH' : 'no such directory';
    }
    const stderr = readStderr(error);
    if (stderr !== '') {
        return stderr.split('\n')[0] ?? stderr;
    }
    return error instanceof Error ? error.message : String(error);
}

function isDirectory(posixPath: string): boolean {
    try {
        return statSync(toFsPath(posixPath)).isDirectory();
    } catch {
        return false;
    }
}

function readStderr(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('stderr' in error)) {
        return '';
    }
    const stderr = (error as { stderr: unknown }).stderr;
    if (typeof stderr === 'string') {
        return stderr.trim();
    }
    if (Buffer.isBuffer(stderr)) {
        return stderr.toString('utf8').trim();
    }
    return '';
}
