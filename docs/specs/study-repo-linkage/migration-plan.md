# Migration Plan

Satisfies CAP-5 and CAP-7. One automated pass over the pruned corpus, landing as a single reviewable diff.

**Executed.** The migration ran on 2026-08-22 as commit `d1ad5c9`. This plan is kept as the record of what was done and the rules the tool still applies; [verification.md](verification.md) carries the measured outcome.

## Scope

Every markdown file in `my-studies` other than the vault-root `AGENTS.md`, which the tool excludes from the corpus: leaf notes and index READMEs alike, across all 21 resources on 5 platforms. Every one gains frontmatter. No file changes path. No prose body is altered.

Scope is stated as "every note" rather than a count deliberately. The count was 121 when this plan was written and 120 when it ran, moved by a single duplicate deletion; the promise is completeness, not a number.

## The status question is already settled

An earlier version of this plan inferred `status` from file age and proposed a human triage pass. Both are gone. The author settled every resource directly, and all 21 resolve to `done`:

| Platform               | Resources                   | Status |
| ---------------------- | --------------------------- | ------ |
| Books                  | ASP.Net Core 3 and React    | done   |
| Midu.dev               | 5 workshops                 | done   |
| Santander Open Academy | High-Performance Leadership | done   |
| TryHackMe              | Advent of Cyber 2024        | done   |
| Veeva Learning         | 13 certifications           | done   |

So migration writes `status: done` uniformly. There is nothing to triage and nothing to guess. This is the whole benefit of doing the prune first.

## Inference rules

Run by `studylink migrate`, deriving each field mechanically:

| Field           | Derived from                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`        | First path segment, mapped through a fixed table (`Midu.dev` to `midudev`, `Santander Open Academy` to `santander`, `Veeva Learning` to `veeva`, `TryHackMe` to `tryhackme`, `Books` to `books`). |
| `slug`          | Remaining path segments, lowercased, accents folded to ASCII, non-alphanumerics collapsed to single hyphens, `.md` and `README` dropped. **Historical:** see below.                               |
| `kind`          | `index` if the filename is `README.md`, else `note`.                                                                                                                                              |
| `status`        | `done`, uniformly. See above.                                                                                                                                                                     |
| `started`       | Date of the **first** commit touching the file.                                                                                                                                                   |
| `finished`      | Date of the **last** commit touching the file.                                                                                                                                                    |
| `tags`          | Empty list at migration time, deliberately not guessed. Filled in afterwards by hand; see **Tags** below.                                                                                         |
| `url`           | Lifted for **resource-level notes only**. See **The url rule** below.                                                                                                                             |
| `code`          | Populated only where a directory of the same `<source>/<course>` shape exists in the sibling repo.                                                                                                |
| `outline_total` | Omitted. No surviving resource carries an outline.                                                                                                                                                |

### The slug rule is historical

The `slug` row above records what `migrate` did, and `slugFor` still behaves that way. It is no longer how a slug is decided.

Migration could derive every slug from a path because it only ever saw two-level platforms. The first course filed afterwards, on Platzi, sits four segments deep under a school and a route, and `SLUG_PATTERN` caps a slug at three, so the derived string is unusable. A slug is now **authored**, taking the resource's published URL slug where one exists and the folded path otherwise, and `validate` raises `SLW4` when the two diverge. See the slug convention in [frontmatter-schema.md](frontmatter-schema.md).

Nothing about the migrated corpus changes: every slug it wrote came from a path that could produce one, and all of them remain frozen.

## The url rule

`url` is lifted only for notes that **are** a resource: every `kind: index` file, plus the 5 Midu.dev workshops, which are resources represented by a leaf note rather than a folder. It is never lifted for a unit inside a resource.

This replaces the original rule, "any single obvious link in the first 5 lines". That rule was correct 5 times out of 28. It took the per-day YouTube walkthrough video as the `url` for 22 TryHackMe Advent of Cyber day notes, and an unrelated external reference for one Veeva lesson, none of which is the canonical course, room, or book URL the schema defines. A day note has no canonical URL of its own; its resource does.

One named exception sits alongside it in `tools/studylink/src/config.ts`: `NON_CANONICAL_URLS` excludes `https://www.veeva.com/privacy/`. The `Start Here - Multichannel Certification` README is five lines of terms and conditions whose only link is the site-wide privacy policy. Lifting it would put a value in the field that answers a different question. It is named rather than pattern-matched for the same reason the exclusion list is: a rule shaped to reject one URL would also reject legitimate ones the corpus has not acquired yet.

**What the rule actually produced:** `url` is carried by exactly the 5 Midu.dev workshop notes and by no index README. Scoping lifting to resource-level notes is the rule; in the event, no index README's body carried a canonical URL to lift, and the one that carried any link at all was the excluded privacy policy. This is also why the schema no longer requires `url` on index notes; see [frontmatter-schema.md](frontmatter-schema.md).

## Dates excluded from derivation

Some commits say nothing about when a note was studied, and leaving them in flattens `finished` across a whole platform onto the day a reformatting pass ran. The exclusion set is **an explicit list of 14 SHAs**, carried in `tools/studylink/src/config.ts` as `BULK_COMMITS`. Counts re-measured 2026-09-06:

| SHA       | Subject                                                | Note files |
| --------- | ------------------------------------------------------ | ---------- |
| `2409228` | Apply the Prettier and markdownlint pass               | 37         |
| `a6e6893` | Renormalize line endings to LF                         | 19         |
| `5e13fde` | Drop stalled and outdated course notes                 | 54         |
| `3159172` | chore(migration): Veeva Learning Lint                  | 84         |
| `6b92425` | chore(migration): Udemy Lint                           | 17         |
| `e6cbbeb` | chore(migration): TryHackMe Lint                       | 48         |
| `3bc06ff` | chore(migration): Platzi Lint                          | 16         |
| `1b3c2de` | chore(migration): Books Lint                           | 22         |
| `acfe6cc` | chore(migration): Midu.dev Lint                        | 10         |
| `13661b9` | chore(migration): Santander Open Academy Lint          | 10         |
| `1235c34` | Fix misspelled Salesforce link                         | 1          |
| `05455e8` | fix: Hotfixes                                          | 7          |
| `d1ad5c9` | Add frontmatter and managed index blocks to every note | 120        |
| `b69d6ce` | Add topic tags to every note                           | 114        |

The list grew five times, and how each addition was found matters more than the additions. It began as **two classes** ("the March 2026 Lint commits" and "the prune commits"), which is not enumerable and misses anything outside the pattern. Enumerating produced **9**. Story 6 caught `13661b9` and `1235c34`, taking it to 11. On 2026-09-06 the migration's own two commits were added, then `05455e8` was reclassified from study to mechanical, taking it to 14.

`d1ad5c9` and `b69d6ce` are the largest mechanical pair in the history and were absent the whole time. Harmless while `migrate` stays un-rerun, since the dates it derived are frozen in frontmatter, but re-running it without them would have derived `finished: 2026-08-22` for the entire vault. The command that exists to prevent flattening would have flattened everything.

`noteFiles` is a record of what was read, **not a criterion**. Entries run from 1 file to 120 and all belong equally. What disqualifies a commit is that its date says nothing about when the note was studied.

### The counts were wrong for a fortnight

8 of the first 11 counts were undercounts, corrected above. They had been collected without `core.quotepath=false`, so git escaped every path containing a non-ASCII character and a `\.md$` filter silently dropped it. `Introducción`, `Lo último`, `Detección`, `Básico` and `Formula 1®` all disappeared from the tallies.

No derived date was ever affected: `git.ts` sets that flag on its own log calls and its comment marks it load-bearing. Only this record was wrong.

One consequence is worth correcting explicitly, because it was used as reasoning. This plan previously explained `13661b9` as "missed because a threshold of more than 5 note files was quietly in play and it touches 2". It touches 10, so no such threshold would have missed it. The real cause was the quoting bug, and the same bug produced the wrong explanation.

**Never replace this list with a file-count threshold.** The populations overlap in both directions: `3159172` is mechanical and touches 84 note files, more than the largest genuine study commits, `9be50a6` (CLM Business Certification v5) at 51 and `b4add3c` (Advent of Cyber '24) at 38. Mechanical entries run 1 to 120 and the study range sits inside that. Any threshold discards real dates.

The code-side prune commit `0797c5d` never enters note date derivation and so is not in the list.

### Both open items are closed

Both were resolved on 2026-09-06.

**The migration's own commits** were absent from `BULK_COMMITS` throughout. `d1ad5c9` and `b69d6ce` are now in the table.

**`05455e8` "fix: Hotfixes" was reclassified from study to mechanical.** Its shape settles it: 1,089 deletions against 6 insertions across a single certification is trimming duplicated content, not studying. It had supplied `finished: 2025-04-21` to all 7 notes it touches, which is why the question could not be answered by editing a list.

Those 7 dates were re-derived and rewritten, the only case in this contract where frozen frontmatter was deliberately changed after the fact:

| Note                                                                                     | `finished` was | now        |
| ---------------------------------------------------------------------------------------- | -------------- | ---------- |
| `Approved Email Technical Certification v4/Launch Approved Email from CLM`               | 2025-04-21     | 2025-04-06 |
| `CLM Business Certification v5/Packaging and Administration of Presentations and Slides` | 2025-04-21     | 2025-03-03 |
| `CLM Business Certification v5/Presentation and Slides Content Management`               | 2025-04-21     | 2025-03-03 |
| `CLM Business Certification v5/Survey Basics`                                            | 2025-04-21     | 2025-03-03 |
| `CLM Business Certification v5/Surveys in CLM`                                           | 2025-04-21     | 2025-03-03 |
| `CLM Business Certification v5/Veeva CLM Presentation Advanced Features`                 | 2025-04-21     | 2025-03-03 |
| `Engage Technical Certification v5/Share - Remote CLM`                                   | 2025-04-21     | 2025-03-14 |

No `started` date moved: `05455e8` was the newest commit on all 7 and never the oldest. The diff was 7 lines, one per file.

One trap is worth recording, because the obvious implementation hits it. `git log` does not return commits in date order. For `Share - Remote CLM` it lists `ad1b4cc` (2025-03-14) before `007c285` (2025-03-03), so taking the first and last log entries yields `finished` **earlier** than `started`, which rule 3 rejects. Dates are the minimum and maximum of the surviving commit dates, never the ends of the log.

### When derivation reaches nothing

Excluding commits can leave a file with no derivable date at all. `INDEX_DATES` in the same config file declares `started` and `finished` for `veeva/start-here-multichannel-certification` as `2024-10-15`, the only entry in the table. That README owns no notes, links none, and every commit touching it is excluded, so both derivations come up empty; the author placed it on the day the first certification referencing it begins. The table is consulted **only** after both derivations return nothing, so a declared date can never override one the corpus actually carries.

## Tags

**Done, not deferred.** Tags are the retrieval axis folders do not provide, and auto-tagging from filenames would only re-encode the folder structure they exist to replace, so migration wrote an empty list and left them to a human pass.

That pass has happened: commit `b69d6ce` added topic tags to every non-platform note. The files still carrying `tags: []` are exactly the `kind: platform` files, which correctly carry no topic because they are navigation rather than study.

## Expected `code` mapping

5 of the 21 resources have a code counterpart after the prune:

- `books/asp-net-core-3-and-react` maps to `Books/ASP.NET Core 3 and React`
- 4 of the 5 Midu.dev workshops map to their `Midu.dev/` directories (Figma para Devs produced no code)
- The remaining 16 resolve to `code: []`

Those 5 are the same 5 directories the generator writes a reverse-link block into, and the count is one figure, not two. Earlier drafts said "only 3 of 21" while listing five, which is the arithmetic the live vault corrects.

After the Exercism and LeetCode drop, `my-studies-code` contains only `Books/` and `Midu.dev/`, both of which have note counterparts. Every code directory is now reachable from a note.

## Sequence

1. **Land the tool first.** Build and test `studylink` against a scratch copy of the vault before it touches the real one. Migration is the tool's first real workload, not a separate script.
2. **Wire up lint (CAP-7).** Add a real `package.json` to both repos with `lint` and `format:check` scripts. In `my-studies` these drive the `.markdownlint.json` and `.prettierrc.js` already present; `my-studies-code` has no lint configuration at all, so both files are authored there, using `.prettierrc.json` rather than the notes repo's CommonJS `.prettierrc.js`. Settle line endings on LF in the same step, with a `.gitattributes` per repo and a one-time `git add --renormalize`. Delete the no-op `eslint.config.mjs` and the orphan `package-lock.json`. Confirm both repos pass on a clean tree before migration adds frontmatter, so any later failure is attributable and the renormalization stays out of the migration diff.
3. **Dry run.** `studylink migrate` with no `--write`, review the proposed frontmatter across every platform, especially accent-folding (`Introducción al Web Scraping`, `Lo último de JavaScript`, `Curso de Inglés` remnants in Veeva titles).
4. **Write on a branch.** `studylink migrate --write`, one commit, subject line only per repo commit policy.
5. **Validate.** `studylink validate` must exit 0. Fix violations by correcting the tool and re-running from a clean tree, never by hand-patching notes, so the tool stays the source of truth.
6. **Generate indexes.** `studylink index --write`, then run again to prove idempotence (CAP-3 acceptance). The three indexes repaired by hand during the prune (`README.md`, `Books/README.md`, `TryHackMe/README.md`) must regenerate to the same content they now hold; a diff there means the generator disagrees with the hand repair and the generator is wrong.
7. **Human pass on tags.** Walk the leaf notes and add tags. Done in commit `b69d6ce`; see **Tags** above.
8. **Open the vault.** Point Obsidian at `my-studies`, confirm CAP-6, add a Bases or Dataview view over `status` and `tags`.

## Rollback

Everything lands on one branch as one commit against a clean tree. Rollback is `git reset --hard`. No history rewriting, no file moves.

## Verification checklist

All nine satisfied on 2026-08-22. Measured results in [verification.md](verification.md).

- [x] `studylink validate` exits 0 across every note in the vault
- [x] `studylink index --write` run twice produces an empty second diff
- [x] The three hand-repaired indexes regenerate byte-identical
- [x] Prose in all prose-bearing READMEs byte-identical to pre-migration
- [x] No file changed path; `git diff --name-status` shows only `M`
- [x] No note body changed outside the frontmatter block and managed blocks
- [x] Every `code` entry resolves to a real directory
- [x] `studylink status` reports no active resources and every resource done
- [x] `npm run lint` and `npm run format:check` pass in both repos
