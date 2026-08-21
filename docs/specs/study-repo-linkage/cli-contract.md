# CLI Contract: studylink

Node plus TypeScript, living at `my-studies-code/tools/studylink`. Invoked from `c:\MyStudies` (the common parent of both checkouts) so it can see both repos.

## Layout

```
my-studies-code/
  package.json               # the repo currently has none; this supplies it
  tools/studylink/
    src/index.ts             # arg parsing, exit codes
    src/config.ts            # repo discovery, staleness threshold
    src/schema.ts            # frontmatter contract from frontmatter-schema.md
    src/git.ts               # first/last commit date per file
    src/commands/
      validate.ts
      index.ts
      status.ts
      migrate.ts
```

## Repo discovery

Resolve `notesRoot` and `codeRoot` by walking up from the working directory to a parent containing both `my-studies/` and `my-studies-code/`. Overridable by `--notes <path>` and `--code <path>`. If discovery fails, exit 2 with a message naming what it looked for. This is what keeps the tool working identically on Windows and under WSL2, where the absolute paths differ.

All internal path handling normalizes to POSIX separators and only converts at filesystem boundaries.

## Commands

### `studylink validate`

Checks every note in `notesRoot` against the 10 rules in [frontmatter-schema.md](frontmatter-schema.md).

- Exit 0: all notes conform.
- Exit 1: one or more violations. Every violation prints as `<relative-path>:<line> <rule-id> <message>`, grouped by file.
- Exit 2: operational failure (repo not found, unreadable file).

Flags:
- `--json` emits machine-readable findings instead of text.
- `--quiet` suppresses per-file output, prints only the summary count.

Planned notes (unresolved `[[wikilinks]]`) are counted and reported in the summary but **do not** affect the exit code.

### `studylink index [--write]`

Regenerates the link list inside each index README's managed block, in both repos.

Default is dry run: prints the diff, changes nothing, exits 0 if there would be no change and 1 if there would be. `--write` applies the changes.

**Managed block format.** The generator only ever replaces text between these markers, and appends the block at end of file when a README has none:

`Midu.dev/README.md`, which currently lists one entry twice, regenerates as:

```markdown
<!-- studylink:begin -->
- [Experiencias 3D con Vue](./Experiencias%203D%20con%20Vue.md)
- [Figma para Devs](./Figma%20para%20Devs.md)
- [Introducción al Web Scraping con Python](./Introducción%20al%20Web%20Scraping%20con%20Python.md)
- [Lo último de JavaScript (ES2023 & ES2024)](./Lo%20último%20de%20JavaScript%20(ES2023%20&%20ES2024).md)
- [PWA de Detección de Objetos con Angular 19 y TensorFlow.js](./PWA%20de%20Detección%20de%20Objetos%20con%20Angular%2019%20y%20TensorFlow.js.md)
<!-- studylink:end -->
```

Six entries become five, ordered by slug, with the duplicate gone.

Everything outside the markers is untouched. This is what preserves the hand-written prose in the 11 prose-bearing READMEs, and it is the reason whole-file generation is ruled out in SPEC.md Constraints.

Entries are ordered by `slug`. Notes that exist on disk are emitted as relative markdown links; `[[wikilinks]]` already present in the block that have no target on disk are carried through unchanged, because they are the backlog.

In the code repo, the same command writes a short generated block into each mapped directory's README naming the note slug and its GitHub URL, giving the reverse link.

Must be idempotent: running `--write` twice produces no diff on the second run. That is the acceptance test for CAP-3.

### `studylink status [--stale <days>] [--triage]`

Reports study state, reading `status` from frontmatter and last-touch dates from git. `--stale` defaults to 30 days. Exit is always 0; this is a report, not a gate.

On the current corpus every resource is `done`, so the report is deliberately quiet:

```
active (0)
done (21)   backlog (0)   dropped (0)
coverage: unknown for 21 of 21 (no outlines recorded)
planned notes (unresolved wikilinks): 0
```

The interesting path only appears once study resumes:

```
active (2)
  tryhackme/soc-level-1        last touch 2026-09-02    4d
  books/some-book              last touch 2026-07-11   57d   STALE
```

Because no live data exercises the stalled path today, it is proven against a fixture instead. That is the CAP-4 acceptance route.

`--triage` walks each stalled resource, asks whether it is `done`, `dropped`, or still `active`, and writes the answer back to frontmatter. This exists so upkeep does not depend on remembering to hand-edit YAML, which is the failure mode that produced the drift in the first place. It is the only command that writes `status`.

### `studylink migrate [--write]`

One-shot, run once, described in [migration-plan.md](migration-plan.md). Dry run by default.

## Lint wiring (CAP-7)

Not a `studylink` command, but it ships with the tool because the tool supplies the missing `package.json`.

Both repos get a root `package.json` with:

```json
{
  "scripts": {
    "lint": "markdownlint \"**/*.md\" --ignore node_modules",
    "format": "prettier --write \"**/*.{md,json,js,ts}\"",
    "format:check": "prettier --check \"**/*.{md,json,js,ts}\""
  }
}
```

These drive the `.markdownlint.json` and `.prettierrc.js` already present, which currently cannot run at all. Removed as part of the same change: `my-studies/eslint.config.mjs`, which sets `ignores: ['**/*']` and is a complete no-op, and `my-studies-code/package-lock.json`, which is 100 bytes with no corresponding manifest.

`markdownlint` must be configured to ignore generated managed blocks, or the generator and the linter will fight over list formatting.

## Non-requirements

- No watch mode, no daemon, no git hook. Explicit invocation only (SPEC.md Constraints).
- No network calls. `url` and `code_url` are recorded, never fetched or validated for liveness.
- No note content rewriting beyond the frontmatter block and the managed index block.
