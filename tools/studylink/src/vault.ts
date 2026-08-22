/**
 * Reading the two checkouts: which files are notes, which directories are study
 * code, and where a note's `[[wikilinks]]` point.
 *
 * `validate` is the first caller; `index` and `status` need the same walk, so it
 * lives here rather than inside a command.
 */

import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import path from 'node:path';

import { toFsPath } from './config.ts';

/**
 * Markdown files under the notes root that are not notes.
 *
 * `AGENTS.md` is agent instructions for the repo, not a unit of study, so it
 * carries no frontmatter and never will. Without this the vault measures 122
 * files instead of the 121 the contract counts.
 */
export const NOTE_EXCLUSIONS: readonly string[] = ['AGENTS.md'];

/** Never descended into, in either repo. */
export const SKIPPED_DIRS: readonly string[] = ['node_modules'];

/**
 * Top-level directories of the code repo that hold no study code.
 *
 * Everything else at the top level is a platform, and its children are the
 * resource directories a note's `code` entry points into.
 */
export const CODE_NON_STUDY_DIRS: readonly string[] = ['docs', 'tools', 'node_modules'];

/** An operational failure reading a checkout. Callers map this to exit code 2. */
export class VaultError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VaultError';
    }
}

export type NoteFile = {
    /** POSIX path relative to the notes root, e.g. `Books/README.md`. */
    readonly relativePath: string;
    /** Absolute POSIX path. */
    readonly absolutePath: string;
};

export type Wikilink = {
    /** The link target with any `|alias` and `#heading` stripped. */
    readonly target: string;
    /** Exactly what stood between the brackets. */
    readonly raw: string;
    /** 1-based line in the file. */
    readonly line: number;
};

function isSkippedDir(name: string): boolean {
    return name.startsWith('.') || SKIPPED_DIRS.includes(name);
}

function readDir(posixDir: string): Dirent<string>[] {
    try {
        return readdirSync(toFsPath(posixDir), { withFileTypes: true });
    } catch (error) {
        throw new VaultError(`Could not read ${posixDir}: ${describe(error)}`);
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Every note under `notesRoot`, sorted by relative path.
 *
 * @throws {VaultError} when a directory cannot be read.
 */
export function listNotes(notesRoot: string): NoteFile[] {
    const notes: NoteFile[] = [];

    const walk = (posixDir: string, prefix: string): void => {
        for (const entry of readDir(posixDir)) {
            if (entry.isDirectory()) {
                if (isSkippedDir(entry.name)) {
                    continue;
                }
                walk(path.posix.join(posixDir, entry.name), `${prefix}${entry.name}/`);
                continue;
            }
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
                continue;
            }
            if (NOTE_EXCLUSIONS.includes(entry.name)) {
                continue;
            }
            notes.push({
                relativePath: `${prefix}${entry.name}`,
                absolutePath: path.posix.join(posixDir, entry.name),
            });
        }
    };

    walk(notesRoot, '');
    notes.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
    return notes;
}

/**
 * The study resource directories of the code repo, as `<platform>/<resource>`
 * POSIX paths relative to `codeRoot`.
 *
 * Depth two is the resource level: `code` entries point at these or deeper.
 *
 * @throws {VaultError} when a directory cannot be read.
 */
export function listCodeStudyDirs(codeRoot: string): string[] {
    const dirs: string[] = [];

    for (const platform of readDir(codeRoot)) {
        if (!platform.isDirectory() || isSkippedDir(platform.name)) {
            continue;
        }
        if (CODE_NON_STUDY_DIRS.includes(platform.name)) {
            continue;
        }
        const platformDir = path.posix.join(codeRoot, platform.name);
        for (const resource of readDir(platformDir)) {
            if (!resource.isDirectory() || isSkippedDir(resource.name)) {
                continue;
            }
            dirs.push(`${platform.name}/${resource.name}`);
        }
    }

    dirs.sort((a, b) => (a < b ? -1 : 1));
    return dirs;
}

/** Read a file as UTF-8. @throws {VaultError} when it cannot be read. */
export function readNote(posixPath: string): string {
    try {
        return readFileSync(toFsPath(posixPath), 'utf8');
    } catch (error) {
        throw new VaultError(`Could not read ${posixPath}: ${describe(error)}`);
    }
}

/** True when `posixPath` exists and is a directory. */
export function isDirectory(posixPath: string): boolean {
    try {
        return statSync(toFsPath(posixPath)).isDirectory();
    } catch {
        return false;
    }
}

/** True when `posixPath` exists at all, whatever kind of entry it is. */
export function exists(posixPath: string): boolean {
    try {
        statSync(toFsPath(posixPath));
        return true;
    } catch {
        return false;
    }
}

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;
const INLINE_CODE = /`[^`]*`/g;
const FENCE = /^\s*(```|~~~)/;

/**
 * Every `[[wikilink]]` in `text`, skipping fenced blocks and inline code.
 *
 * A link inside a code sample is a code sample, not a backlog marker, and the
 * corpus transcribes plenty of code.
 */
export function findWikilinks(text: string, startLine: number): Wikilink[] {
    const links: Wikilink[] = [];
    const lines = text.split(/\r?\n/);
    let fenced = false;

    lines.forEach((line, offset) => {
        if (FENCE.test(line)) {
            fenced = !fenced;
            return;
        }
        if (fenced) {
            return;
        }
        const scannable = line.replace(INLINE_CODE, ' ');
        for (const match of scannable.matchAll(WIKILINK)) {
            const raw = match[1] ?? '';
            const target = normalizeWikilinkTarget(raw);
            if (target === '') {
                continue;
            }
            links.push({ target, raw, line: startLine + offset });
        }
    });

    return links;
}

/** Strip an `|alias` and a `#heading` fragment, leaving the note reference. */
export function normalizeWikilinkTarget(raw: string): string {
    const withoutAlias = raw.split('|')[0] ?? '';
    const withoutHeading = withoutAlias.split('#')[0] ?? '';
    return withoutHeading.trim();
}

/**
 * True when `target` names a note that exists in the vault.
 *
 * Obsidian resolves a link either as a vault-relative path or by shortest
 * unique basename, with or without the `.md` extension, and case-insensitively
 * on the platforms this tool runs on. Anything that resolves under none of
 * those is a planned note.
 */
export function resolvesInVault(target: string, notes: readonly NoteFile[]): boolean {
    const wanted = target.replace(/\\/g, '/').toLowerCase();
    const withExtension = wanted.endsWith('.md') ? wanted : `${wanted}.md`;

    return notes.some((note) => {
        const relative = note.relativePath.toLowerCase();
        if (relative === wanted || relative === withExtension) {
            return true;
        }
        const base = relative.slice(relative.lastIndexOf('/') + 1);
        return base === wanted || base === withExtension;
    });
}
