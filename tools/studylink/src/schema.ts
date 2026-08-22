/**
 * The frontmatter contract every note in the notes repo carries.
 *
 * This module is the declarative half only: the enums, the field table, and the
 * reduced field set a `kind: platform` file obeys. The rules that read a note
 * and decide whether it conforms live with `studylink validate`.
 */

/**
 * Platform keys. `books`, `midudev`, `santander`, `tryhackme` and `veeva` are in
 * use; `platzi` is reserved for the author's stated return to that platform and
 * `external` covers one-off resources. Adding a key is a one-line change.
 */
export const SOURCES = [
    'books',
    'midudev',
    'santander',
    'tryhackme',
    'veeva',
    'platzi',
    'external',
] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Human-authored study intent. `stalled` is deliberately absent: it is derived
 * from `active` plus the staleness threshold and is never a stored value,
 * because a date cannot tell a finished resource from an abandoned one.
 */
export const STATUSES = ['backlog', 'active', 'done', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];

/**
 * The vault's three tiers. Only `index` maps to a study resource: `platform` is
 * structural navigation above it and `note` is a single unit of study.
 */
export const KINDS = ['platform', 'index', 'note'] as const;
export type Kind = (typeof KINDS)[number];

export const FIELD_NAMES = [
    'source',
    'url',
    'slug',
    'status',
    'outline_total',
    'started',
    'finished',
    'tags',
    'code',
    'code_url',
    'kind',
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

/** Shape of a field's value, as the field table records it. */
export type FieldType = 'string' | 'enum' | 'integer' | 'date' | 'string-list';

/**
 * How strongly a field is required.
 *
 * - `always`: present on every file the rule set covers.
 * - `conditional`: required only when `condition` holds.
 * - `optional`: never required.
 */
export type Requirement = 'always' | 'conditional' | 'optional';

export type FieldSpec = {
    readonly name: FieldName;
    readonly type: FieldType;
    readonly requirement: Requirement;
    /** When `requirement` is `conditional`, the circumstance that forces it. */
    readonly condition?: string;
    /** Kinds this field applies to at all. */
    readonly kinds: readonly Kind[];
    readonly notes: string;
};

const ALL_KINDS: readonly Kind[] = KINDS;
const RESOURCE_KINDS: readonly Kind[] = ['index', 'note'];

/** The field table from the frontmatter schema, in its documented order. */
export const FIELDS: readonly FieldSpec[] = [
    {
        name: 'source',
        type: 'enum',
        requirement: 'conditional',
        condition:
            'always, except the vault-root index, which has no path segment to derive one from',
        kinds: ALL_KINDS,
        notes: 'Platform key drawn from SOURCES.',
    },
    {
        name: 'url',
        type: 'string',
        requirement: 'conditional',
        // Narrowed from "always on kind: index". No index README in the corpus
        // carries a URL, and 13 of the 16 are Veeva certifications behind a
        // corporate login with no public page, so the rule could not be
        // satisfied by the material it governs. An `external` resource is
        // defined by having a URL, so there it stays required.
        condition: 'always when source is external; optional otherwise',
        kinds: RESOURCE_KINDS,
        notes: 'Canonical URL of the course, room, or book. Recorded, never fetched.',
    },
    {
        name: 'slug',
        type: 'string',
        requirement: 'conditional',
        condition: 'always, except kind: platform',
        kinds: RESOURCE_KINDS,
        notes: 'Stable cross-repo identifier, unique across the vault. Matches SLUG_PATTERN.',
    },
    {
        name: 'status',
        type: 'enum',
        requirement: 'always',
        kinds: ALL_KINDS,
        notes: 'Human-authored intent drawn from STATUSES.',
    },
    {
        name: 'outline_total',
        type: 'integer',
        requirement: 'optional',
        kinds: ['index'],
        notes: 'Units the source actually has. Omit when unknown rather than guessing.',
    },
    {
        name: 'started',
        type: 'date',
        requirement: 'conditional',
        condition: 'when status is not backlog, except kind: platform',
        kinds: RESOURCE_KINDS,
        notes: 'First day of study, derived at migration from the first commit touching the file.',
    },
    {
        name: 'finished',
        type: 'date',
        requirement: 'conditional',
        condition: 'when and only when status is done, except kind: platform',
        kinds: RESOURCE_KINDS,
        notes: 'Last day of study. Must not precede started.',
    },
    {
        name: 'tags',
        type: 'string-list',
        requirement: 'always',
        kinds: ALL_KINDS,
        notes: 'Lowercase kebab-case topic axis. May be empty. Matches TAG_PATTERN.',
    },
    {
        name: 'code',
        type: 'string-list',
        requirement: 'conditional',
        condition: 'always, except kind: platform',
        kinds: RESOURCE_KINDS,
        notes: 'Paths relative to the note, resolving into the sibling checkout. May be empty.',
    },
    {
        name: 'code_url',
        type: 'string',
        requirement: 'conditional',
        condition: 'when code is non-empty',
        kinds: RESOURCE_KINDS,
        notes: 'Canonical GitHub URL, because relative cross-repo links do not resolve on github.com.',
    },
    {
        name: 'kind',
        type: 'enum',
        requirement: 'always',
        kinds: ALL_KINDS,
        notes: 'One of KINDS. Selects which of the rules above apply.',
    },
];

/**
 * What a `kind: platform` file must carry.
 *
 * A platform file is structural navigation, not a study resource, so it is held
 * to a reduced set rather than carved out of validation entirely. `source` is
 * required wherever it is derivable from the path, which excludes the vault-root
 * README.
 */
export const PLATFORM_REQUIRED_FIELDS: readonly FieldName[] = ['kind', 'status', 'tags'];

/** Required on a platform file too, but only where the path yields one. */
export const PLATFORM_DERIVABLE_FIELDS: readonly FieldName[] = ['source'];

/** Fields a platform file never carries, because it is not a study resource. */
export const PLATFORM_ABSENT_FIELDS: readonly FieldName[] = ['slug', 'started', 'finished'];

/** `<source>/<course>[/<note>]`, lowercase kebab-case, accents folded to ASCII. */
export const SLUG_PATTERN = /^[a-z0-9]+(\/[a-z0-9-]+){1,2}$/;

/** Lowercase kebab-case. */
export const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `YYYY-MM-DD`. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Unknown keys are permitted and ignored, so Obsidian plugins can add their own. */
export const ALLOW_UNKNOWN_KEYS = true;

/**
 * True when `value` is a `YYYY-MM-DD` string naming a real calendar date.
 *
 * `DATE_PATTERN` checks shape only, so it accepts 2025-02-30 and 2025-13-01.
 * Calendar validity is the second half of the same shape question. Comparing
 * two dates to each other is a rule, and stays with the validator.
 */
export function isRealDate(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        return false;
    }
    const parts = value.split('-').map(Number);
    const [year, month, day] = parts;
    if (year === undefined || month === undefined || day === undefined) {
        return false;
    }
    // setUTCFullYear avoids the two-digit-year remapping the Date constructor
    // applies to years below 100.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export function isSource(value: unknown): value is Source {
    return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export function isStatus(value: unknown): value is Status {
    return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function isKind(value: unknown): value is Kind {
    return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

/** The field table entry for `name`, or undefined if there is none. */
export function fieldSpec(name: string): FieldSpec | undefined {
    return FIELDS.find((field) => field.name === name);
}
