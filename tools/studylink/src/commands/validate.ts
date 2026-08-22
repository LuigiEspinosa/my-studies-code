/**
 * `studylink validate`: the 11 frontmatter rules, plus the advisory signals that
 * deliberately stay outside the exit code.
 *
 * Rule numbering follows frontmatter-schema.md, which is authoritative. Where
 * two rules would report the same defect, the more specific one owns it: rule 3
 * owns a missing `finished`, rule 4 a missing `started`, rule 8 a missing
 * `code_url`, and rule 1 everything else. Otherwise one omission would print
 * twice under two ids.
 *
 * Rule 10 never produces a violation. Unresolved `[[wikilinks]]` are the
 * backlog, so they are counted and listed and the exit code ignores them.
 */

import path from 'node:path';

import { toAbsolutePosix, type RepoConfig } from '../config.ts';
import {
    entryFor,
    parseFrontmatter,
    splitLines,
    type Frontmatter,
    type FrontmatterValue,
} from '../frontmatter.ts';
import {
    FIELDS,
    isKind,
    isRealDate,
    isSource,
    isStatus,
    KINDS,
    PLATFORM_ABSENT_FIELDS,
    PLATFORM_DERIVABLE_FIELDS,
    PLATFORM_REQUIRED_FIELDS,
    SLUG_PATTERN,
    SOURCES,
    STATUSES,
    TAG_PATTERN,
    type FieldSpec,
    type Kind,
} from '../schema.ts';
import {
    exists,
    findWikilinks,
    isDirectory,
    listCodeStudyDirs,
    listNotes,
    readNote,
    resolvesInVault,
    type NoteFile,
} from '../vault.ts';

/** Violation ids, one per numbered rule in frontmatter-schema.md. */
export const RULE_IDS = {
    requiredFields: 'SL01',
    enumMembership: 'SL02',
    finished: 'SL03',
    started: 'SL04',
    slug: 'SL05',
    slugPrefix: 'SL06',
    codeResolves: 'SL07',
    codeUrl: 'SL08',
    tagCase: 'SL09',
    plannedNotes: 'SL10',
    outlineTotal: 'SL11',
} as const;

/** Advisory ids. None of these changes the exit code. */
export const WARNING_IDS = {
    coverage: 'SLW1',
    stale: 'SLW2',
    orphanCode: 'SLW3',
} as const;

export type Finding = {
    /** Path relative to the notes root, or to the common parent for SLW3. */
    readonly file: string;
    /** 1-based line, or null where the subject is a directory. */
    readonly line: number | null;
    readonly rule: string;
    readonly message: string;
};

export type PlannedNote = {
    readonly file: string;
    readonly line: number;
    readonly target: string;
};

export type ValidateResult = {
    readonly fileCount: number;
    readonly violations: readonly Finding[];
    readonly warnings: readonly Finding[];
    readonly plannedNotes: readonly PlannedNote[];
};

/**
 * Last commit date touching a note, as `YYYY-MM-DD`, or null when unknown.
 *
 * Story 4 supplies this from git. Until then the CLI passes a provider that
 * always returns null, so SLW2 has nothing to fire on outside a fixture.
 */
export type LastTouch = (relativePath: string) => string | null;

export type ValidateOptions = {
    readonly config: RepoConfig;
    readonly lastTouch?: LastTouch | undefined;
    /** Reference date for staleness. Injected so the tests are not clock-bound. */
    readonly now?: Date | undefined;
};

type LoadedNote = {
    readonly note: NoteFile;
    readonly frontmatter: Frontmatter;
    readonly body: string;
    /** The declared kind, or null when it is absent or not a member of KINDS. */
    readonly kind: Kind | null;
    readonly status: string | null;
    readonly source: string | null;
    readonly slug: string | null;
    /** Absolute POSIX paths of `code` entries that resolved to a directory. */
    readonly resolvedCode: string[];
};

/**
 * Check every note under `config.notesRoot`.
 *
 * @throws {VaultError} when a checkout or a note cannot be read.
 */
export function validateVault(options: ValidateOptions): ValidateResult {
    const { config } = options;
    const notes = listNotes(config.notesRoot);
    const loaded = notes.map(load);

    const violations: Finding[] = [];
    const warnings: Finding[] = [];
    const plannedNotes: PlannedNote[] = [];

    for (const entry of loaded) {
        checkNote(entry, violations);
        collectPlannedNotes(entry, notes, plannedNotes);
        warnCoverage(entry, notes, warnings);
        warnStale(entry, config, options, warnings);
    }

    checkSlugUniqueness(loaded, violations);
    warnOrphanCodeDirs(loaded, config, warnings);

    return {
        fileCount: notes.length,
        violations: sortFindings(violations),
        warnings: sortFindings(warnings),
        plannedNotes,
    };
}

function load(note: NoteFile): LoadedNote {
    const text = readNote(note.absolutePath);
    const frontmatter = parseFrontmatter(text);
    // The same splitter the parser used, so the body's first line really is
    // the line the parser said it was.
    const body = splitLines(text)
        .slice(frontmatter.bodyStartLine - 1)
        .join('\n');

    return {
        note,
        frontmatter,
        body,
        kind: readEnum(frontmatter, 'kind', isKind),
        status: readString(frontmatter, 'status'),
        source: readString(frontmatter, 'source'),
        slug: readString(frontmatter, 'slug'),
        resolvedCode: [],
    };
}

function readString(frontmatter: Frontmatter, key: string): string | null {
    const value = entryFor(frontmatter, key)?.value;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readEnum<T extends string>(
    frontmatter: Frontmatter,
    key: string,
    guard: (value: unknown) => value is T
): T | null {
    const value = entryFor(frontmatter, key)?.value;
    return guard(value) ? value : null;
}

function checkNote(entry: LoadedNote, out: Finding[]): void {
    if (!entry.frontmatter.present) {
        out.push(finding(entry, 1, RULE_IDS.requiredFields, 'no frontmatter block'));
        return;
    }

    checkRequiredFields(entry, out);
    checkEnums(entry, out);

    // Rules 3 to 6 govern fields a platform file does not carry.
    if (entry.kind !== 'platform') {
        checkFinished(entry, out);
        checkStarted(entry, out);
        checkSlugShape(entry, out);
        checkSlugPrefix(entry, out);
    }

    checkCodeResolves(entry, out);
    checkCodeUrl(entry, out);
    checkTagCase(entry, out);
    checkOutlineTotal(entry, out);
}

/** Rule 1: required fields present and correctly typed, per the kind's set. */
function checkRequiredFields(entry: LoadedNote, out: Finding[]): void {
    const { frontmatter } = entry;

    for (const error of frontmatter.errors) {
        out.push(finding(entry, error.line, RULE_IDS.requiredFields, error.message));
    }

    for (const spec of FIELDS) {
        const field = entryFor(frontmatter, spec.name);
        if (field === undefined) {
            continue;
        }
        const problem = typeProblem(spec, field.value);
        if (problem !== null) {
            out.push(
                finding(entry, field.line, RULE_IDS.requiredFields, `${spec.name} ${problem}`)
            );
        }
    }

    const requireField = (name: string): void => {
        if (!hasValue(frontmatter, name)) {
            out.push(
                finding(
                    entry,
                    frontmatter.openLine,
                    RULE_IDS.requiredFields,
                    `required field missing: ${name}`
                )
            );
        }
    };

    if (entry.kind === 'platform') {
        for (const name of PLATFORM_REQUIRED_FIELDS) {
            requireField(name);
        }
        // The vault-root README has no path segment to derive a source from.
        if (!isVaultRoot(entry)) {
            for (const name of PLATFORM_DERIVABLE_FIELDS) {
                requireField(name);
            }
        }
        for (const name of PLATFORM_ABSENT_FIELDS) {
            const field = entryFor(frontmatter, name);
            if (field !== undefined) {
                out.push(
                    finding(
                        entry,
                        field.line,
                        RULE_IDS.requiredFields,
                        `field not permitted on kind: platform: ${name}`
                    )
                );
            }
        }
        return;
    }

    for (const name of ['kind', 'status', 'tags', 'source', 'slug', 'code']) {
        requireField(name);
    }
    if (entry.kind === 'index' || entry.source === 'external') {
        requireField('url');
    }
}

/** Rule 2: status, source and kind are members of their enums. */
function checkEnums(entry: LoadedNote, out: Finding[]): void {
    const cases = [
        { key: 'kind', guard: isKind, members: KINDS },
        { key: 'status', guard: isStatus, members: STATUSES },
        { key: 'source', guard: isSource, members: SOURCES },
    ] as const;

    for (const { key, guard, members } of cases) {
        const field = entryFor(entry.frontmatter, key);
        if (field === undefined || typeof field.value !== 'string' || field.value.trim() === '') {
            continue;
        }
        if (!guard(field.value)) {
            out.push(
                finding(
                    entry,
                    field.line,
                    RULE_IDS.enumMembership,
                    `${key} is not one of ${members.join(', ')}: ${field.value}`
                )
            );
        }
    }
}

/** Rule 3: finished present when and only when done, and never before started. */
function checkFinished(entry: LoadedNote, out: Finding[]): void {
    const { frontmatter, status } = entry;
    const finished = entryFor(frontmatter, 'finished');
    const started = entryFor(frontmatter, 'started');

    if (status === 'done' && !hasValue(frontmatter, 'finished')) {
        out.push(
            finding(
                entry,
                frontmatter.openLine,
                RULE_IDS.finished,
                'status: done requires finished'
            )
        );
    }

    if (finished !== undefined && finished.value !== null && status !== null && status !== 'done') {
        out.push(
            finding(
                entry,
                finished.line,
                RULE_IDS.finished,
                `finished is only valid when status is done, but status is ${status}`
            )
        );
    }

    if (
        finished !== undefined &&
        started !== undefined &&
        isRealDate(finished.value) &&
        isRealDate(started.value) &&
        finished.value < started.value
    ) {
        out.push(
            finding(
                entry,
                finished.line,
                RULE_IDS.finished,
                `finished ${finished.value} precedes started ${started.value}`
            )
        );
    }
}

/** Rule 4: started present whenever status is not backlog. */
function checkStarted(entry: LoadedNote, out: Finding[]): void {
    const { frontmatter, status } = entry;
    if (status === null || !isStatus(status) || status === 'backlog') {
        return;
    }
    if (!hasValue(frontmatter, 'started')) {
        out.push(
            finding(
                entry,
                frontmatter.openLine,
                RULE_IDS.started,
                `status: ${status} requires started`
            )
        );
    }
}

/** Rule 5, first half: the slug matches the documented shape. */
function checkSlugShape(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'slug');
    if (field === undefined || typeof field.value !== 'string' || field.value.trim() === '') {
        return;
    }
    if (!SLUG_PATTERN.test(field.value)) {
        out.push(
            finding(
                entry,
                field.line,
                RULE_IDS.slug,
                `slug does not match <source>/<course>[/<note>]: ${field.value}`
            )
        );
    }
}

/** Rule 5, second half: slugs are unique across the vault. */
function checkSlugUniqueness(loaded: readonly LoadedNote[], out: Finding[]): void {
    const bySlug = new Map<string, LoadedNote[]>();

    for (const entry of loaded) {
        if (entry.kind === 'platform' || entry.slug === null) {
            continue;
        }
        const group = bySlug.get(entry.slug);
        if (group === undefined) {
            bySlug.set(entry.slug, [entry]);
        } else {
            group.push(entry);
        }
    }

    for (const [slug, group] of bySlug) {
        if (group.length < 2) {
            continue;
        }
        for (const entry of group) {
            const others = group
                .filter((other) => other !== entry)
                .map((other) => other.note.relativePath);
            out.push(
                finding(
                    entry,
                    entryFor(entry.frontmatter, 'slug')?.line ?? entry.frontmatter.openLine,
                    RULE_IDS.slug,
                    `slug is not unique: ${slug} also appears in ${others.join(', ')}`
                )
            );
        }
    }
}

/** Rule 6: the slug's first segment agrees with source. */
function checkSlugPrefix(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'slug');
    if (field === undefined || entry.slug === null || entry.source === null) {
        return;
    }
    if (!isSource(entry.source)) {
        return;
    }
    const prefix = entry.slug.split('/')[0] ?? '';
    if (prefix !== entry.source) {
        out.push(
            finding(
                entry,
                field.line,
                RULE_IDS.slugPrefix,
                `slug prefix ${prefix} does not agree with source ${entry.source}`
            )
        );
    }
}

/** Rule 7: every code entry resolves to an existing directory. */
function checkCodeResolves(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'code');
    if (field === undefined || !Array.isArray(field.value)) {
        return;
    }

    // Relative to the note's containing directory, so depth varies between a
    // leaf note under a platform folder and one nested in a course folder.
    const noteDir = containingDir(entry.note.absolutePath);

    field.value.forEach((item, position) => {
        if (typeof item !== 'string') {
            return;
        }
        const line = field.itemLines[position] ?? field.line;
        const resolved = toAbsolutePosix(item, noteDir);

        if (!exists(resolved)) {
            out.push(
                finding(
                    entry,
                    line,
                    RULE_IDS.codeResolves,
                    `code entry does not resolve: ${item} (looked at ${resolved})`
                )
            );
            return;
        }
        if (!isDirectory(resolved)) {
            out.push(
                finding(
                    entry,
                    line,
                    RULE_IDS.codeResolves,
                    `code entry is not a directory: ${item} (looked at ${resolved})`
                )
            );
            return;
        }
        entry.resolvedCode.push(resolved);
    });
}

/** Rule 8: code_url present when code is non-empty. */
function checkCodeUrl(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'code');
    if (field === undefined || !Array.isArray(field.value) || field.value.length === 0) {
        return;
    }
    if (!hasValue(entry.frontmatter, 'code_url')) {
        out.push(
            finding(
                entry,
                field.line,
                RULE_IDS.codeUrl,
                'code is non-empty, so code_url is required'
            )
        );
    }
}

/** Rule 9: tags are lowercase kebab-case. */
function checkTagCase(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'tags');
    if (field === undefined || !Array.isArray(field.value)) {
        return;
    }
    field.value.forEach((tag, position) => {
        if (typeof tag !== 'string' || TAG_PATTERN.test(tag)) {
            return;
        }
        out.push(
            finding(
                entry,
                field.itemLines[position] ?? field.line,
                RULE_IDS.tagCase,
                `tag is not lowercase kebab-case: ${tag}`
            )
        );
    });
}

/** Rule 11: outline_total is a positive integer, and only on a kind: index. */
function checkOutlineTotal(entry: LoadedNote, out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'outline_total');
    if (field === undefined || field.value === null) {
        return;
    }
    if (entry.kind !== 'index') {
        out.push(
            finding(
                entry,
                field.line,
                RULE_IDS.outlineTotal,
                `outline_total is only valid on kind: index, not ${entry.kind ?? 'an unset kind'}`
            )
        );
        return;
    }
    if (typeof field.value !== 'number' || !Number.isInteger(field.value)) {
        // Rule 1 owns types, so a non-integer has already been reported once.
        return;
    }
    if (field.value <= 0) {
        out.push(
            finding(
                entry,
                field.line,
                RULE_IDS.outlineTotal,
                `outline_total must be a positive integer: ${String(field.value)}`
            )
        );
    }
}

/** Rule 10: unresolved wikilinks, counted and listed, never a violation. */
function collectPlannedNotes(
    entry: LoadedNote,
    notes: readonly NoteFile[],
    out: PlannedNote[]
): void {
    for (const link of findWikilinks(entry.body, entry.frontmatter.bodyStartLine)) {
        if (resolvesInVault(link.target, notes)) {
            continue;
        }
        out.push({ file: entry.note.relativePath, line: link.line, target: link.target });
    }
}

/** SLW1: status done while coverage is below 100 percent. Advisory only. */
function warnCoverage(entry: LoadedNote, notes: readonly NoteFile[], out: Finding[]): void {
    const field = entryFor(entry.frontmatter, 'outline_total');
    const total = field?.value;
    if (
        entry.kind !== 'index' ||
        entry.status !== 'done' ||
        typeof total !== 'number' ||
        !Number.isInteger(total) ||
        total <= 0
    ) {
        return;
    }

    const written = unitsWritten(entry.note, notes);
    if (written < total) {
        out.push(
            finding(
                entry,
                field?.line ?? entry.frontmatter.openLine,
                WARNING_IDS.coverage,
                `status: done with coverage ${String(written)} of ${String(total)}`
            )
        );
    }
}

/** Leaf notes sitting beside an index README, which is its coverage numerator. */
function unitsWritten(index: NoteFile, notes: readonly NoteFile[]): number {
    const dir = containingDir(index.relativePath);
    return notes.filter(
        (note) =>
            note.relativePath !== index.relativePath && containingDir(note.relativePath) === dir
    ).length;
}

/** SLW2: an active resource with no commit inside the staleness threshold. */
function warnStale(
    entry: LoadedNote,
    config: RepoConfig,
    options: ValidateOptions,
    out: Finding[]
): void {
    if (entry.status !== 'active' || options.lastTouch === undefined) {
        return;
    }
    const touched = options.lastTouch(entry.note.relativePath);
    if (touched === null || !isRealDate(touched)) {
        return;
    }

    const days = daysBetween(touched, options.now ?? new Date());
    if (days <= config.staleDays) {
        return;
    }
    out.push(
        finding(
            entry,
            entryFor(entry.frontmatter, 'status')?.line ?? entry.frontmatter.openLine,
            WARNING_IDS.stale,
            `status: active with no commit in ${String(days)} days (threshold ${String(config.staleDays)})`
        )
    );
}

/** SLW3: a code-repo study directory no note points into. Advisory, never an error. */
function warnOrphanCodeDirs(
    loaded: readonly LoadedNote[],
    config: RepoConfig,
    out: Finding[]
): void {
    const claimed = loaded
        .flatMap((entry) => entry.resolvedCode)
        .map((resolved) => resolved.toLowerCase());
    const codeName = path.posix.basename(config.codeRoot);

    for (const relative of listCodeStudyDirs(config.codeRoot)) {
        const absolute = path.posix.join(config.codeRoot, relative).toLowerCase();
        const isClaimed = claimed.some(
            (entry) => entry === absolute || entry.startsWith(`${absolute}/`)
        );
        if (isClaimed) {
            continue;
        }
        out.push({
            file: `${codeName}/${relative}`,
            line: null,
            rule: WARNING_IDS.orphanCode,
            message: 'code directory has no note counterpart',
        });
    }
}

function typeProblem(spec: FieldSpec, value: FrontmatterValue): string | null {
    if (value === null) {
        // Absence is the required-field check's business, not the type check's.
        return null;
    }
    switch (spec.type) {
        case 'string':
        case 'enum':
            return typeof value === 'string' && value.trim() !== '' ? null : 'must be a string';
        case 'integer':
            return typeof value === 'number' && Number.isInteger(value)
                ? null
                : 'must be a whole number';
        case 'date':
            return isRealDate(value) ? null : 'must be a YYYY-MM-DD calendar date';
        case 'string-list':
            return Array.isArray(value) && value.every((item) => typeof item === 'string')
                ? null
                : 'must be a list of strings';
    }
}

function hasValue(frontmatter: Frontmatter, key: string): boolean {
    const field = entryFor(frontmatter, key);
    if (field === undefined || field.value === null) {
        return false;
    }
    return typeof field.value === 'string' ? field.value.trim() !== '' : true;
}

function isVaultRoot(entry: LoadedNote): boolean {
    return entry.note.relativePath === 'README.md';
}

/** The directory part of a POSIX path, or '' when there is none. */
function containingDir(posixPath: string): string {
    const cut = posixPath.lastIndexOf('/');
    return cut === -1 ? '' : posixPath.slice(0, cut);
}

/** Whole days from `date` (a `YYYY-MM-DD` string) to `now`, never negative. */
function daysBetween(date: string, now: Date): number {
    const [year, month, day] = date.split('-').map(Number);
    const then = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.max(0, Math.round((today - then) / 86_400_000));
}

function finding(entry: LoadedNote, line: number, rule: string, message: string): Finding {
    return { file: entry.note.relativePath, line, rule, message };
}

/** Sorted by path, then line, then id, which is what groups findings by file. */
function sortFindings(findings: readonly Finding[]): Finding[] {
    return [...findings].sort((a, b) => {
        if (a.file !== b.file) {
            return a.file < b.file ? -1 : 1;
        }
        if (a.line !== b.line) {
            return (a.line ?? 0) - (b.line ?? 0);
        }
        return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
    });
}

function plural(count: number, noun: string): string {
    return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function summaryLine(result: ValidateResult): string {
    return [
        `${plural(result.fileCount, 'file')} checked`,
        plural(result.violations.length, 'violation'),
        plural(result.warnings.length, 'warning'),
        `${plural(result.plannedNotes.length, 'planned note')}`,
    ].join(', ');
}

function locate(finding: Finding): string {
    return finding.line === null ? finding.file : `${finding.file}:${String(finding.line)}`;
}

/** The text report. `--quiet` reduces it to the summary line. */
export function formatText(result: ValidateResult, quiet: boolean): string {
    if (quiet) {
        return `${summaryLine(result)}\n`;
    }

    const lines: string[] = [];

    for (const violation of result.violations) {
        lines.push(`${locate(violation)} ${violation.rule} ${violation.message}`);
    }
    if (result.violations.length > 0) {
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push('warnings (do not affect the exit code):');
        for (const warning of result.warnings) {
            lines.push(`  ${locate(warning)} ${warning.rule} ${warning.message}`);
        }
        lines.push('');
    }

    if (result.plannedNotes.length > 0) {
        lines.push('planned notes (unresolved wikilinks):');
        for (const planned of result.plannedNotes) {
            lines.push(`  ${planned.file}:${String(planned.line)} [[${planned.target}]]`);
        }
        lines.push('');
    }

    lines.push(summaryLine(result));
    return `${lines.join('\n')}\n`;
}

/** The `--json` report. `--quiet` reduces it to the summary object. */
export function formatJson(result: ValidateResult, quiet: boolean): string {
    const summary = {
        files: result.fileCount,
        violations: result.violations.length,
        warnings: result.warnings.length,
        plannedNotes: result.plannedNotes.length,
    };
    const ok = result.violations.length === 0;
    const payload = quiet
        ? { ok, summary }
        : {
              ok,
              summary,
              violations: result.violations,
              warnings: result.warnings,
              plannedNotes: result.plannedNotes,
          };
    return `${JSON.stringify(payload, null, 2)}\n`;
}
