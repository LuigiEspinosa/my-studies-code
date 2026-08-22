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

Checks every note in `notesRoot` against the 11 rules in [frontmatter-schema.md](frontmatter-schema.md).

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

**Blocks are seeded, not derived.** The indexes are not flat link lists. Measured across all 22:

| Shape | Count |
| --- | --- |
| Flat list, no `##` sections | 5 |
| Carries `##` sections | 17 |
| Opens with an anchor-link table of contents into its own sections | 10 |
| Links notes owned by **other** resources | 11 |

Two consequences fix the design. First, membership is authored: `Veeva Learning/Engage Technical Certification v5/README.md` pulls notes from `../CLM Technical Certification v5/` and `../Engage for Portals Business Certification v3/`, so listing a folder's contents would drop them. Second, link text is not reconstructible. Three files, three different rules:

| Index label | Target `# H1` | Derivation that produces it |
| --- | --- | --- |
| `Chapter 6: Managing State with Redux` | `# Chapter 6: Managing State with Redux` | the H1 |
| `Day 1: Maybe SOC-mas music, he thought, doesn't come from a store?` | `# Maybe SOC-mas music, he thought, doesn't come from a store?` | filename stem, then the H1 |
| `Day 11: If you'd like to WPA, press the star key!` | `# If you'd like to WPA, press the star key` | none; the label ends in a character the H1 lacks |

So the first `--write` **seeds**: it wraps each authored section's list in a marker pair, capturing membership, link text, and order exactly as they stand. Every run after that maintains what was seeded.

```markdown
## Section 1: Getting Started

<!-- studylink:begin -->
- [Chapter 1: Understanding the ASP.NET Core React Template](./Chapter%201,%20Understanding%20the%20ASP.NET%20Core%20React%20Template.md)
- [Chapter 2: Creating Decoupled React and ASP.NET Core Apps](./Chapter%202,%20Creating%20Decoupled%20React%20and%20ASP.NET%20Core%20Apps.md)
<!-- studylink:end -->
```

A file gets one marker pair per authored list. Anchor-link tables of contents are **not** note lists and are never wrapped. A README with no list at all gets an empty block appended at end of file.

**Maintenance inside a seeded block**, and nothing else:

- drop a duplicate entry, keeping the first occurrence
- drop an entry whose target no longer exists on disk
- append an entry for a note that exists on disk but appears in no block in that index
- carry `[[wikilinks]]` through unchanged, because they are the backlog

**Order is frozen at seed time.** No sort. Sorting is ruled out by the corpus: 11 Veeva blocks run in teaching order rather than alphabetical, and an alphabetical pass sorts Advent of Cyber to Day 1, Day 10, Day 11, Day 2. New entries append at the end of their block.

The concrete acceptance case is `Midu.dev/README.md`, which lists "Lo último de JavaScript (ES2023 & ES2024)" at both line 5 and line 7. It regenerates in its current order with the second occurrence removed, six entries down to five. It is not alphabetized.

Everything outside the markers is untouched. This is what preserves hand-written prose and authored section headings, and it is the reason whole-file generation is ruled out in SPEC.md Constraints.

In the code repo, the same command writes a short generated block into each mapped directory's README naming the note slug and its GitHub URL, giving the reverse link. After the prune that is 5 directories: `Books/ASP.NET Core 3 and React` and 4 under `Midu.dev/`.

Must be idempotent. The seeding run necessarily produces a diff, since it inserts the markers; every run after it produces none. That is the acceptance test for CAP-3, alongside the three indexes repaired by hand during the prune (`README.md`, `Books/README.md`, `TryHackMe/README.md`) regenerating byte-identical.

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

In `my-studies` these drive the `.markdownlint.json` and `.prettierrc.js` already present, which currently cannot run at all. **`my-studies-code` has neither file**, so CAP-7 authors both there as well. Use `.prettierrc.json` in the code repo rather than copying the notes repo's `.prettierrc.js`, which is CommonJS and breaks under a `"type": "module"` manifest.

Removed as part of the same change: `my-studies/eslint.config.mjs`, which sets `ignores: ['**/*']` and is a complete no-op, and `my-studies-code/package-lock.json`, which is 100 bytes with no corresponding manifest.

`markdownlint` must be configured to ignore generated managed blocks, or the generator and the linter will fight over list formatting.

**Line endings.** `endOfLine` is `lf` in both repos, and each gets a `.gitattributes`:

```gitattributes
* text=auto eol=lf
```

The existing `endOfLine: "crlf"` passes on Windows only because `core.autocrlf` is `true`, and fails on every file under WSL2. Since the tool is constrained to run in both, CAP-7 requires settling this rather than inheriting it. A one-time `git add --renormalize` lands the rewrite: 22 stored files in `my-studies`, 264 in `my-studies-code`, line endings only. It must complete before `migrate --write`, so the migration diff stays reviewable.

## Non-requirements

- No watch mode, no daemon, no git hook. Explicit invocation only (SPEC.md Constraints).
- No network calls. `url` and `code_url` are recorded, never fetched or validated for liveness.
- No note content rewriting beyond the frontmatter block and the managed index block.
