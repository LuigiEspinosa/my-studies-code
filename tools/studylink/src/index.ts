#!/usr/bin/env node
/**
 * `studylink` entry point: argument parsing, config resolution, exit codes.
 *
 * All four commands are wired up; everything here is the part they share.
 */

import { readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { applyChanges, formatPlan, planIndex } from './commands/index.ts';
import { formatGaps, formatMigration, planMigration } from './commands/migrate.ts';
import {
    collectStatus,
    formatStatus,
    formatTriage,
    triageStalled,
    type Ask,
    type TriageOutcome,
} from './commands/status.ts';
import { formatJson, formatText, validateVault } from './commands/validate.ts';
import { ConfigError, DEFAULT_STALE_DAYS, resolveConfig, type RepoConfig } from './config.ts';
import { lastTouchByFile, lastTouchUnderDir, readCommitLog } from './git.ts';
import { isIndexFile, VaultError } from './vault.ts';

/** Everything conformed, or the report ran. */
export const EXIT_OK = 0;

/** The command found something: violations, or a diff it would write. */
export const EXIT_FINDINGS = 1;

/** Operational failure: bad usage, missing repo, unreadable file. */
export const EXIT_FAILURE = 2;

export const COMMANDS = ['validate', 'index', 'status', 'migrate'] as const;
export type Command = (typeof COMMANDS)[number];

/** Boolean flags each command accepts, beyond the global ones. */
const COMMAND_FLAGS: Record<Command, readonly string[]> = {
    validate: ['--json', '--quiet'],
    index: ['--write'],
    status: ['--triage'],
    migrate: ['--write'],
};

/** Flags taking a value that each command accepts, beyond the global ones. */
const COMMAND_VALUE_FLAGS: Record<Command, readonly string[]> = {
    // validate takes --stale because one of its advisory warnings is the
    // stalled signal, which is measured against the same threshold.
    validate: ['--stale'],
    index: [],
    status: ['--stale'],
    migrate: [],
};

/** Value-taking flags every command accepts. */
const GLOBAL_VALUE_FLAGS = ['--notes', '--code'] as const;

const HELP_FLAGS = ['--help', '-h'] as const;

export const USAGE = `studylink - link the my-studies notes to the my-studies-code sources

Usage:
  studylink <command> [options]

Commands:
  validate [--json]      Check every note against the frontmatter contract
  index [--write]        Regenerate the link list inside each managed block
  status [--triage]      Report study state and flag stalled resources
  migrate [--write]      One-shot migration of the existing corpus

Options:
  --notes <path>         Use this notes checkout instead of discovering one
  --code <path>          Use this code checkout instead of discovering one
  --stale <days>         Staleness threshold for status and validate (default ${String(DEFAULT_STALE_DAYS)})
  --json                 Emit machine-readable findings (validate)
  --quiet                Print only the summary count (validate)
  --write                Apply changes instead of printing a dry run
  --triage               Ask about each stalled resource and write the answer back
  -h, --help             Show this text

Both checkouts are found by walking up from the working directory to the first
parent holding my-studies/ and my-studies-code/ side by side.

Exit codes:
  ${String(EXIT_OK)}  success
  ${String(EXIT_FINDINGS)}  findings: violations, or a diff that would be written
  ${String(EXIT_FAILURE)}  operational failure: bad usage, or a checkout that could not be found`;

/** Sinks the CLI writes through, so tests can capture output. */
export type Io = {
    readonly cwd: string;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
};

export type ParsedArgs = {
    readonly command: Command;
    readonly flags: ReadonlySet<string>;
    readonly notes?: string | undefined;
    readonly code?: string | undefined;
    readonly staleDays?: number | undefined;
};

/** A usage problem. Callers print `USAGE` alongside it and exit 2. */
export class UsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}

function isCommand(value: string): value is Command {
    return (COMMANDS as readonly string[]).includes(value);
}

/** True when `argv` asks for help, wherever the flag sits. */
export function wantsHelp(argv: readonly string[]): boolean {
    return argv.some((arg) => (HELP_FLAGS as readonly string[]).includes(arg));
}

/**
 * Parse `argv` (already stripped of the node and script paths).
 *
 * Help flags are accepted for every command so that `studylink validate --help`
 * parses; the caller decides what to do about them.
 *
 * @throws {UsageError} on an unknown command, an unknown flag, a value-taking
 *   flag with no value after it, or a value-taking flag given twice.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
    const first = argv[0];
    if (first === undefined) {
        throw new UsageError('No command given.');
    }
    if (!isCommand(first)) {
        throw new UsageError(`Unknown command: ${first}`);
    }

    const command = first;
    const booleanFlags = [...COMMAND_FLAGS[command], ...HELP_FLAGS];
    const valueFlags = [...GLOBAL_VALUE_FLAGS, ...COMMAND_VALUE_FLAGS[command]];

    const flags = new Set<string>();
    const values = new Map<string, string>();

    for (let i = 1; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === undefined) {
            continue;
        }
        if (valueFlags.includes(arg)) {
            if (values.has(arg)) {
                throw new UsageError(`${arg} was given more than once.`);
            }
            const value = argv[i + 1];
            // An empty value is as unusable as a missing one: it would resolve
            // to the working directory instead of failing.
            if (value === undefined || value === '' || value.startsWith('-')) {
                throw new UsageError(`${arg} expects a value.`);
            }
            values.set(arg, value);
            i += 1;
            continue;
        }
        if (booleanFlags.includes(arg)) {
            flags.add(arg);
            continue;
        }
        throw new UsageError(`Unknown flag for ${command}: ${arg}`);
    }

    const stale = values.get('--stale');
    const staleDays = stale === undefined ? undefined : Number(stale);
    if (staleDays !== undefined && !Number.isFinite(staleDays)) {
        throw new UsageError(`--stale expects a number of days, got ${stale ?? ''}.`);
    }

    return {
        command,
        flags,
        notes: values.get('--notes'),
        code: values.get('--code'),
        staleDays,
    };
}

/**
 * Run the CLI and return the exit code.
 *
 * Config is resolved before dispatch, so a command naming a checkout that does
 * not exist fails with exit 2 whether or not that command is implemented.
 */
export function run(argv: readonly string[], io: Io): number {
    const first = argv[0];

    // Help wins outright only when no command was attempted at all, so that a
    // bogus command still reports itself rather than hiding behind --help.
    if (first === undefined || (first.startsWith('-') && wantsHelp(argv))) {
        io.stdout(`${USAGE}\n`);
        return EXIT_OK;
    }

    let parsed: ParsedArgs;
    try {
        parsed = parseArgs(argv);
    } catch (error) {
        if (error instanceof UsageError) {
            io.stderr(`${error.message}\n\n${USAGE}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    // The command is real, so honoring its help flag is safe.
    if (wantsHelp(argv)) {
        io.stdout(`${USAGE}\n`);
        return EXIT_OK;
    }

    let config: RepoConfig;
    try {
        config = resolveConfig({
            cwd: io.cwd,
            overrides: { notes: parsed.notes, code: parsed.code },
            staleDays: parsed.staleDays,
        });
    } catch (error) {
        if (error instanceof ConfigError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    return dispatch(parsed, config, io);
}

function dispatch(parsed: ParsedArgs, config: RepoConfig, io: Io): number {
    if (parsed.command === 'validate') {
        return runValidate(parsed, config, io);
    }
    if (parsed.command === 'index') {
        return runIndex(parsed, config, io);
    }
    if (parsed.command === 'status') {
        return runStatus(parsed, config, io);
    }
    // Exhaustive rather than a fallthrough: `migrate` is the one command that
    // writes frontmatter, so a fifth command added to COMMANDS and forgotten
    // here would silently run the migration instead of failing to compile.
    const migrate: 'migrate' = parsed.command;
    void migrate;
    return runMigrate(parsed, config, io);
}

/**
 * Run `validate` and map its findings to an exit code.
 *
 * Warnings and planned notes are reported and then ignored here: only rule
 * violations move the exit code off zero.
 *
 * Exported because a `VaultError` cannot be provoked through `run`: config
 * resolution has already proved both roots exist by the time dispatch happens,
 * so the only way to exercise this guard is to hand it a config directly.
 */
export function runValidate(parsed: ParsedArgs, config: RepoConfig, io: Io): number {
    let result;
    try {
        const log = readCommitLog(config.notesRoot);
        // SLW2 is advisory, so an unreadable log degrades to no dates and
        // therefore no stalled warnings rather than failing the run. It is still
        // said out loud, because silently never warning looks like conformance.
        if (log.unavailable !== null) {
            io.stderr(
                `no commit dates for ${path.posix.basename(config.notesRoot)}: ${log.unavailable}; the stalled warning cannot fire\n`
            );
        }
        result = validateVault({
            config,
            lastTouch: resourceLastTouch(lastTouchByFile(log.commits)),
        });
    } catch (error) {
        if (error instanceof VaultError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    const quiet = parsed.flags.has('--quiet');
    io.stdout(parsed.flags.has('--json') ? formatJson(result, quiet) : formatText(result, quiet));

    return result.violations.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}

/**
 * Run `index` and map its plan to an exit code.
 *
 * A dry run that would change something is a finding, the same way a violation
 * is: story 6 runs the command twice and requires the second run to be silent.
 * With `--write` the changes are applied and the run succeeds.
 *
 * Exported for the same reason `runValidate` is: a `VaultError` cannot be
 * reached through `run`, because config resolution has already proved both
 * checkouts exist by the time dispatch happens.
 */
export function runIndex(parsed: ParsedArgs, config: RepoConfig, io: Io): number {
    const write = parsed.flags.has('--write');

    let result;
    try {
        result = planIndex(config);
        if (write) {
            applyChanges(result.changes);
        }
    } catch (error) {
        if (error instanceof VaultError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    io.stdout(formatPlan(result, write));

    return !write && result.changes.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}

/**
 * Last-touch dates keyed the way SLW2 asks for them, one note at a time.
 *
 * An index README does not change when a chapter beside it is written, so
 * asking only about the README's own file would report a resource with fresh
 * units as stalled. That is the same false alarm `status` avoids by rolling the
 * date up over a resource's subtree, and the two must agree: they answer the
 * same question against the same `--stale` value.
 *
 * Exported so that agreement can be tested directly, rather than only through a
 * checkout with a real history behind it.
 */
export function resourceLastTouch(
    dates: ReadonlyMap<string, string>
): (relative: string) => string | null {
    return (relative) => {
        if (!isIndexFile(path.posix.basename(relative))) {
            return dates.get(relative) ?? null;
        }
        const dir = path.posix.dirname(relative);
        return lastTouchUnderDir(dates, dir === '.' ? '' : dir);
    };
}

/**
 * Run `status`, and under `--triage` walk what it found stalled.
 *
 * The report itself never fails on what it finds: no git, no frontmatter, and
 * every resource stale are all things it reports rather than things it fails
 * on. Two things still exit 2. A checkout it cannot read at all is operational
 * rather than reportable, and so is a `--triage` note it cannot write, because
 * exiting 0 there would throw away the human's answer without saying so.
 *
 * `ask` is a test seam: left out, questions go to the terminal. It is a
 * parameter rather than part of `Io` because it is the only command that reads.
 *
 * Exported for the same reason `runValidate` is: config resolution has already
 * proved both checkouts exist by the time dispatch happens, so a `VaultError`
 * cannot be provoked through `run`.
 */
export function runStatus(parsed: ParsedArgs, config: RepoConfig, io: Io, ask?: Ask): number {
    let result;
    try {
        result = collectStatus({ config });
    } catch (error) {
        if (error instanceof VaultError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    for (const problem of result.gitProblems) {
        io.stderr(`no commit dates for ${problem}; last touch reported as unknown\n`);
    }
    io.stdout(formatStatus(result));

    if (!parsed.flags.has('--triage')) {
        return EXIT_OK;
    }

    // Filled as the walk goes, so a note that fails halfway still leaves the
    // human a record of the answers already written to disk.
    const outcomes: TriageOutcome[] = [];
    try {
        triageStalled(result, ask ?? promptThrough(io), outcomes);
    } catch (error) {
        if (error instanceof VaultError) {
            io.stdout(formatTriage(outcomes, result.staleDays));
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    io.stdout(formatTriage(outcomes, result.staleDays));
    return EXIT_OK;
}

/**
 * Run `migrate` and map its plan to an exit code.
 *
 * A gap outranks everything else. A field the tool could not derive means the
 * block it would write is one `validate` will reject, and writing it anyway
 * would leave story 6 hand-patching YAML, which the migration plan rules out.
 * So a gap fails the run in both modes, with or without `--write`: exiting 0 on
 * a dry run whose output cannot legally be applied would be worse than useless.
 *
 * Short of that, a dry run with changes pending is a finding, the way `index`
 * treats one, and a completed write succeeds.
 *
 * Exported for the same reason `runValidate` is: config resolution has already
 * proved both checkouts exist by the time dispatch happens, so a `VaultError`
 * cannot be provoked through `run`.
 */
export function runMigrate(parsed: ParsedArgs, config: RepoConfig, io: Io): number {
    const write = parsed.flags.has('--write');

    let result;
    try {
        result = planMigration({ config });
    } catch (error) {
        if (error instanceof VaultError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    if (result.gitProblem !== null) {
        io.stderr(
            `no commit dates for ${path.posix.basename(config.notesRoot)}: ${result.gitProblem}\n`
        );
    }
    for (const sha of result.unmatchedCommits) {
        // A table that has drifted from the repository excludes nothing, which
        // reads exactly like excluding the right thing.
        io.stderr(`excluded commit ${sha} matched no commit in the notes repo\n`);
    }

    if (result.gaps.length > 0) {
        io.stderr(formatGaps(result));
        return EXIT_FAILURE;
    }

    try {
        if (write) {
            applyChanges(result.changes);
        }
    } catch (error) {
        if (error instanceof VaultError) {
            io.stderr(`${error.message}\n`);
            return EXIT_FAILURE;
        }
        throw error;
    }

    io.stdout(formatMigration(result, write));

    return !write && result.changes.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}

/**
 * Write the question, then read one line back.
 *
 * The question goes to stderr, not stdout, so that redirecting the report to a
 * file still puts the prompts in front of the human answering them.
 */
function promptThrough(io: Io): Ask {
    return (question) => {
        io.stderr(question);
        return readLineSync();
    };
}

/**
 * Read one line from stdin, synchronously, or null at end of input.
 *
 * Synchronous because `run` is, and making the whole CLI async so that one
 * interactive flag can await a prompt would change the shape of every command.
 * Bytes are collected rather than decoded one at a time, so a multi-byte
 * character in an answer survives.
 */
function readLineSync(): string | null {
    const byte = Buffer.alloc(1);
    const bytes: number[] = [];

    for (;;) {
        let read: number;
        try {
            read = readSync(0, byte, 0, 1, null);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            // A non-blocking stdin has nothing ready yet; anything else is the
            // terminal telling us there is no more input.
            if (code === 'EAGAIN') {
                pause();
                continue;
            }
            return bytes.length === 0 ? null : decodeLine(bytes);
        }
        if (read === 0) {
            return bytes.length === 0 ? null : decodeLine(bytes);
        }
        if (byte[0] === 0x0a) {
            return decodeLine(bytes);
        }
        bytes.push(byte[0] ?? 0);
    }
}

/**
 * Block for a few milliseconds.
 *
 * Retrying `EAGAIN` in a bare loop spins a core flat out for as long as the
 * human takes to answer, and there is no synchronous sleep in Node other than
 * waiting on an atomic nobody will ever notify.
 */
function pause(): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
}

function decodeLine(bytes: readonly number[]): string {
    return Buffer.from(bytes).toString('utf8').replace(/\r$/, '');
}

function isEntryPoint(): boolean {
    const entry = process.argv[1];
    if (entry === undefined) {
        return false;
    }
    const self = fileURLToPath(import.meta.url);
    if (path.resolve(entry) === self) {
        return true;
    }
    try {
        return realpathSync(entry) === realpathSync(self);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    process.exitCode = run(process.argv.slice(2), {
        cwd: process.cwd(),
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
    });
}
