# Verification

What closes each capability, and the evidence that closed it. Every figure here was measured on **2026-08-22** against the live repositories, both working trees clean. Numbers in this file are dated evidence, not contract scope; the assertions in SPEC.md are deliberately relative (see **Why**).

## Corpus at time of measurement

| Measure                                               | Value |
| ----------------------------------------------------- | ----- |
| Markdown files in the vault, excluding `AGENTS.md`    | 120   |
| Leaf notes                                            | 98    |
| Index READMEs                                         | 22    |
| `kind: platform` (vault root plus 5 platform READMEs) | 6     |
| `kind: index` (resource READMEs)                      | 16    |
| `kind: note`                                          | 98    |
| Resources across 5 platforms                          | 21    |
| Code directories with a reverse-link block            | 5     |

`AGENTS.md` at the vault root is excluded from the note corpus by the tool and is not one of the 120.

The count reached 120 from the 121 recorded at the prune when the duplicate `Veeva Learning/Engage Technical Certification v5/Integrating Scheduling.md` was deleted (commit `276dd5b`), byte-identical to `Integrated Scheduling.md` apart from its `# H1` and linked from no index. The resource count did not move.

## Capability evidence

| Capability                              | Closed by                   | Evidence                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAP-1 frontmatter is machine-readable   | `studylink validate`        | Exit 0: `120 files checked, 0 violations, 0 warnings, 0 planned notes`.                                                                                                                                                                                     |
| CAP-2 one stable cross-repo identifier  | `studylink validate` rule 7 | Inside the same clean run: every `code` entry resolves to an existing directory.                                                                                                                                                                            |
| CAP-3 indexes cannot silently drift     | `studylink index`           | Dry run over 22 indexes reports 0 blocks seeded, 0 empty blocks added, 0 duplicates dropped, 0 dead entries dropped, 0 notes appended, `no changes`. Idempotence proven on the live vault, not a fixture. 5 reverse-link blocks written into the code repo. |
| CAP-4 study state is visible            | `studylink status`          | `active (0)`, `done (21)`, `coverage: unknown for 21 of 21`, `planned notes: 0`. The stalled path has no live data and is fixture-proven.                                                                                                                   |
| CAP-5 whole corpus migrated in one diff | commit `d1ad5c9`            | 120 files, all `M`, no adds, deletes or renames, so no note changed path. Prose survives in the prose-bearing indexes.                                                                                                                                      |
| CAP-6 vault opens in Obsidian           | commit `eac6491`            | `.obsidian/app.json`, `appearance.json` and `core-plugins.json` tracked; per-machine workspace state gitignored via 4 entries.                                                                                                                              |
| CAP-7 lint tooling actually runs        | both repos                  | `lint`, `format:check` and `typecheck` each exit 0 in `my-studies` and `my-studies-code`; test suite 307 pass, 0 fail.                                                                                                                                      |

The suite was 231 tests when story 6 closed and is 307 now, having grown with the three commits that followed. That drift inside a single day is the same failure mode as the note count, and is why the contract asserts "passes" rather than a number.

## Work completed after the story slate

Four changes postdate story 6 and are part of the delivered state:

- `1235c34`, `6b70653` and `99789a4`: a misspelled Salesforce link, a malformed nested link, and a prettier ignore for the Obsidian config.
- `b69d6ce`: topic tags added to every non-platform note, closing the one step [migration-plan.md](migration-plan.md) had left as a post-merge pass.
- `714f7de` in `my-studies-code`: the date-exclusion list corrected to its full 11 SHAs.
- `6cf5fc4` and `c5336ba`: the url rule narrowed to resource-level notes, and reverse links written into the mapped code directories.

## Verification checklist, as executed

Every box of the checklist in [migration-plan.md](migration-plan.md) is satisfied. The two that needed more than a command run:

- **The three hand-repaired indexes regenerate byte-identical.** `README.md`, `Books/README.md` and `TryHackMe/README.md` were repaired by hand during the prune, before the generator existed. A diff there would have meant the generator disagreed with the hand repair and the generator was wrong. There is no diff.
- **Empty `tags` lists are exactly the `kind: platform` files.** 6 files carry `tags: []`, and they are the 6 platform files, which correctly carry no topic because they are navigation rather than study.

## What is not proven by live data

Four paths in the contract have no instances in the corpus and are proven against fixtures only. They stay in the contract because each will recur:

- **Stalled resources.** Nothing is `active`, so the staleness flag and `--triage` write-back never fire live.
- **Planned notes.** Zero unresolved `[[wikilinks]]` remain; both files that carried them were in the drop set. Rule 10 is fixture-tested.
- **A code directory with no note counterpart.** None exists after the Exercism and LeetCode drop, so the advisory warning has no live instance and needs no suppression list.
- **A multi-entry `code` list.** All 5 lists carry exactly one entry, because migration mapped each note to its resource directory rather than the lesson variants beneath it. The Udemy Astro note mapped to 6 folders before the prune, so the shape is real, but nothing exercises it today.

Coverage is a fifth, in a weaker sense: no resource records an `outline_total`, so the advisory `done`-with-incomplete-coverage warning has nothing to fire on either.
