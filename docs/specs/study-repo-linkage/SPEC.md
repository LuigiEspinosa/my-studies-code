---
id: SPEC-study-repo-linkage
companions:
  - frontmatter-schema.md
  - cli-contract.md
  - migration-plan.md
  - brownfield.md
  - verification.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Study Repo Linkage

## Why

A pain to solve. Two sibling repositories hold one activity: [my-studies](../../../my-studies/) carries the markdown notes, [my-studies-code](../../../my-studies-code/) carries the code written while taking them. They were already synchronized by hand and in lockstep, but nothing recorded the relationship, so the link lived only in the author's head.

The cost compounded. No note carried frontmatter, so the corpus could not answer "what am I part-way through". The index READMEs were hand-maintained and had measurably drifted. A previous attempt to fix this with reciprocal git submodules was tried and abandoned, so the obvious approach was already ruled out by experience.

The starting condition is written in the past tense because it has been addressed; see **Delivery status**. The contract below is not, because it governs every note added from here.

The timing is deliberate. The corpus was pruned from 172 notes across 10 platforms down to **21 resources on 5 platforms**, and every surviving resource is finished. That leaves a clean, fully-settled archive: the cheapest possible moment to impose a contract, because there is no in-flight work to disturb and no ambiguous status to adjudicate. The machinery this spec defines mostly serves the study that comes next.

**Assertions here are relative, not counted.** The contract says "every note in the vault", never a number. A single duplicate deletion after the prune moved the note count from 121 to 120 and stale-dated four documents at once; every note added from here would do it again. Numbers survive only as dated evidence for a specific finding, never as the scope of a promise. Measured counts and their measurement dates live in [verification.md](verification.md) and the companions.

## Capabilities

- **CAP-1**
  - **intent:** Every note carries machine-readable frontmatter, so the corpus can be queried by source, status, topic, and date instead of only browsed.
  - **success:** `studylink validate` exits 0 across every note in the vault, and an Obsidian Bases or Dataview query filtered by `status` returns the correct set with no manual list-keeping.

- **CAP-2**
  - **intent:** A study resource has one stable identifier that means the same thing in both repositories, so a note and its code can find each other without a git-level link.
  - **success:** For every note with a non-empty `code:` list, each entry resolves to an existing directory in the sibling repo; `studylink validate` exits non-zero and names the note when an entry dangles.

- **CAP-3**
  - **intent:** Index link lists live in managed blocks the tool keeps consistent with what is on disk, so an index cannot silently drift.
  - **success:** Running the generator twice produces no diff on the second run; all hand-written prose and authored section structure survives byte-for-byte; and the three indexes repaired by hand during the prune regenerate to the same content.

- **CAP-4**
  - **intent:** The author can see which resources are in progress and which have stalled, so returning after a gap does not require a tree walk.
  - **success:** `studylink status` lists every `status: active` resource with its last-touch date and flags those past the staleness threshold. On the settled corpus it correctly reports no active resources and every resource done; the flagging path is proven against a fixture rather than live data, because nothing is active to exercise it.

- **CAP-5**
  - **intent:** Every existing note acquires conforming frontmatter in a single reviewable operation, so the contract covers the whole corpus rather than only new notes.
  - **success:** One diff, reviewed before commit, after which `studylink validate` passes; no note's prose body is altered and no note changes its path.

- **CAP-6**
  - **intent:** The notes repo opens directly as an Obsidian vault with existing link syntax intact, so adopting the editor costs no migration.
  - **success:** Opening [my-studies](../../../my-studies/) as a vault resolves every existing relative markdown link; any future `[[wikilink]]` without a target is listed as a planned note rather than reported as an error.

- **CAP-7**
  - **intent:** The lint tooling already sitting in both repos actually runs, so formatting and markdown rules are enforced instead of decorative.
  - **success:** `npm run lint` and `npm run format:check` execute in both repos and pass on a clean tree; the no-op `eslint.config.mjs` and the orphan `package-lock.json` are gone or replaced by working equivalents.

## Constraints

- No git submodules, in either direction. Reciprocal submodules were already tried and torn out (see [brownfield.md](brownfield.md)); linkage is convention plus generation only.
- The repositories stay separate. The code repo carries heavy binaries and `node_modules` on disk, and Obsidian has no true ignore mechanism, so merging would degrade the vault.
- **Completion is never inferred from dates.** Timestamps show only that nothing is happening, never whether that is because the work finished or was abandoned. `done` and `dropped` are human-authored; `stalled` is derived and is never a stored value.
- **Coverage is advisory, never a gate.** Where an outline exists, `validate` warns when `status: done` coexists with incomplete coverage, but the human call wins. Advent of Cyber 2024 is `done` with Day 24 absent, and that is correct.
- Index generation writes into a delimited managed block and never rewrites a whole file, because several index READMEs carry hand-written prose that whole-file generation would destroy.
- Managed-block membership and link text are **seeded** from the authored indexes and never derived from folder contents or note titles. Indexes link notes owned by other resources (11 of 22 at migration time), and index labels are not reconstructible: Advent of Cyber Day 11 is labelled with a trailing `!` its `# H1` does not carry.
- Ordering inside a seeded block is frozen at seed time. Sorting is ruled out because the Veeva blocks are in teaching order and an alphabetical pass would sort Advent of Cyber to Day 1, Day 10, Day 11, Day 2.
- **Dates excluded from derivation are an explicit SHA list, never a file-count heuristic.** The two populations overlap in both directions: the largest mechanical commit touches 84 note files, more than either of the largest genuine study commits at 51 and 38. Any threshold rule discards real study dates. See [migration-plan.md](migration-plan.md).
- Structural indexes above the resource level (the vault root and the platform READMEs) carry no `slug`. They are `kind: platform` with a reduced field set; see [frontmatter-schema.md](frontmatter-schema.md).
- `code:` is a list, never a scalar. One note can map to several sibling directories.
- Unresolved `[[wikilinks]]` are intentional backlog markers for planned notes. Validation reports them as planned and never fails on them.
- Cross-repo references are relative paths assuming sibling checkout under a common parent. Frontmatter additionally carries the canonical GitHub URL, because relative cross-repo links do not resolve on github.com.
- The tool runs on both Windows and WSL2 and cannot assume a path separator.
- The existing platform-first folder layout is preserved. No note changes path as part of this work.
- The tool is invoked explicitly. No daemon, no file watcher, no commit hook that runs it automatically.

## Non-goals

- Building a note-taking application. Lumen stays archived; see [brownfield.md](brownfield.md).
- Reorganizing the folder taxonomy. Topic retrieval comes from tags and maps-of-content, not folder moves.
- Recovering anything from the prune. The 51 dropped notes and 402 dropped code files stay dropped; git history is the only archive and no restore path is built.
- Publishing the vault as a website (Obsidian Publish, Quartz, or similar).
- Pre-creating empty `Platzi/` or `TryHackMe/` folders in the code repo. They appear when a course or room first produces code.
- Forcing symmetry between the repos. A code directory may legitimately have no notes counterpart, and validation must not treat that as an error, even though no such directory currently exists.
- Replacing git history or rewriting past commits.

## Success signal

From `c:\MyStudies`, `npx studylink validate` exits clean across both repositories, and opening [my-studies](../../../my-studies/) in Obsidian shows a queryable archive whose links reach working directories in the code repo. When the next course starts, adding it costs one frontmatter block and the indexes update themselves, so the drift that made this prune necessary cannot silently recur.

## Delivery status

**All seven capabilities are satisfied as of 2026-08-22**, re-verified by running the tool against the live repositories rather than by transcribing the implementation log. The success signal above is met: `validate` exits 0 across the vault, `index` reports no changes on a second run, `status` reports the settled corpus, and both repos pass lint, format and typecheck. Per-capability closing evidence is in [verification.md](verification.md).

This section records that the contract was met. It does not close the contract: every capability remains the standing rule for notes added from here, which is why the assertions above are relative rather than counted.

## Assumptions

- Slug shape is `platform/course[/note]`, derived from existing folder names, since those already mirror the source course titles.
- Both repos remain checked out as siblings under a single parent directory, which is what makes relative `code:` paths resolve.
- The next study a course produces will be filed under the existing platform-first convention rather than a new scheme.
