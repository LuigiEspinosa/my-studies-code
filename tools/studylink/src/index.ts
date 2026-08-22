#!/usr/bin/env node
/**
 * `studylink` entry point: argument parsing, config resolution, exit codes.
 *
 * `validate` is wired up; `index`, `status` and `migrate` are still the shell
 * their own stories fill in. Everything here is the part they share.
 */

import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { formatJson, formatText, validateVault } from './commands/validate.ts';
import { ConfigError, DEFAULT_STALE_DAYS, resolveConfig, type RepoConfig } from './config.ts';
import { VaultError } from './vault.ts';

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
  status [--stale <n>]   Report study state and flag stalled resources
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

    // The remaining command bodies land in their own stories. Until then a known
    // command resolves its config, reports that it has no implementation, and
    // fails operationally rather than pretending to have succeeded.
    io.stderr(
        [
            `studylink ${parsed.command} is not implemented yet.`,
            `notes: ${config.notesRoot}`,
            `code:  ${config.codeRoot}`,
            `stale: ${String(config.staleDays)} days`,
            '',
        ].join('\n')
    );
    return EXIT_FAILURE;
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
        result = validateVault({
            config,
            // Story 4 replaces this with git.ts. Until commit dates exist the
            // stalled warning has nothing to measure, so it never fires.
            lastTouch: () => null,
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
