# Verification

What closes each capability, and the evidence that closed it. Numbers in this file are dated evidence, not contract scope; the assertions in SPEC.md are deliberately relative (see **Why**).

Two measurement dates appear below. **2026-08-22** is when the story slate closed. **2026-09-06** is the first use of the contract on new material, filing a Platzi course, and it is the more interesting of the two because it is the first evidence the contract holds for work it did not migrate.

## Corpus, measured 2026-09-06

| Measure                                            | Value | Was, 2026-08-22 |
| -------------------------------------------------- | ----- | --------------- |
| Markdown files in the vault, excluding `AGENTS.md` | 124   | 120             |
| `kind: platform`                                   | 9     | 6               |
| `kind: index`                                      | 16    | 16              |
| `kind: note`                                       | 99    | 98              |
| Resources                                          | 22    | 21              |
| Platforms                                          | 6     | 5               |
| Code directories with a reverse-link block         | 5     | 5               |

`AGENTS.md` at the vault root is excluded from the note corpus by the tool and is counted in neither column. `Templates/`, added for the Obsidian note template, is skipped by the vault walk for the same reason.

The August figure reached 120 from the 121 recorded at the prune when the duplicate `Veeva Learning/Engage Technical Certification v5/Integrating Scheduling.md` was deleted (commit `276dd5b`), byte-identical to `Integrated Scheduling.md` apart from its `# H1` and linked from no index.

The four files added in September are one Platzi course note and three structural READMEs: the platform, its school, and its route. That is why `platform` moved by 3 while `note` moved by 1 and `index` did not move at all, and it is the concrete case behind `platform` being a role rather than a depth (see the Kinds table in [frontmatter-schema.md](frontmatter-schema.md)).

## Capability evidence

| Capability                              | Closed by                   | Evidence                                                                                                                                                      |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAP-1 frontmatter is machine-readable   | `studylink validate`        | Exit 0: `124 files checked, 0 violations, 1 warning, 0 planned notes`. The warning is the expected `SLW4`; see below.                                         |
| CAP-2 one stable cross-repo identifier  | `studylink validate` rule 7 | Inside the same clean run: every `code` entry resolves to an existing directory.                                                                              |
| CAP-3 indexes cannot silently drift     | `studylink index`           | Dry run reports `no changes` and 5 reverse-link blocks. Idempotence proven on the live vault, not a fixture, and re-proven after the Platzi course was filed. |
| CAP-4 study state is visible            | `studylink status`          | `active (0)`, `done (22)`, `coverage: unknown for 22 of 22`, `planned notes: 0`. The stalled path has no live data and is fixture-proven.                     |
| CAP-5 whole corpus migrated in one diff | commit `d1ad5c9`            | 120 files, all `M`, no adds, deletes or renames, so no note changed path. Prose survives in the prose-bearing indexes.                                        |
| CAP-6 vault opens in Obsidian           | commit `eac6491`            | `.obsidian/app.json`, `appearance.json` and `core-plugins.json` tracked; per-machine workspace state gitignored.                                              |
| CAP-7 lint tooling actually runs        | both repos                  | `lint`, `format:check` and `typecheck` each exit 0 in `my-studies` and `my-studies-code`; test suite 313 pass, 0 fail.                                        |

The suite was 231 tests when story 6 closed, 307 by the end of that day, and 313 now. That drift is the same failure mode as the note count, and is why the contract asserts "passes" rather than a number.

### The one live warning

`validate` exits 0 with one `SLW4` against the Platzi course note, whose slug is `platzi/computacion-basica` while its four-segment path would derive `platzi/escuela-de-blockchain-y-web3/fundamentos-de-blockchain-y-web3/curso-basico-de-computadores-e-informatica`. That is the warning working, not a defect: the derived string fails `SLUG_PATTERN`, so the slug had to come from the course URL.

It is also the first live instance of a path the contract previously proved only against fixtures.

## Work completed after the story slate

Four changes postdate story 6 and are part of the delivered state:

- `1235c34`, `6b70653` and `99789a4`: a misspelled Salesforce link, a malformed nested link, and a prettier ignore for the Obsidian config.
- `b69d6ce`: topic tags added to every non-platform note, closing the one step [migration-plan.md](migration-plan.md) had left as a post-merge pass.
- `714f7de` in `my-studies-code`: the date-exclusion list corrected to 11 SHAs, later taken to 13 on 2026-09-06.
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

`SLW4` has left this list. It was added on 2026-09-06 and fired against live data the same day.

## First use on new material, 2026-09-06

The Platzi course was the first resource filed through the contract rather than migrated into it, which makes it the only real test of whether the contract generalizes. It held, and it moved three things:

- **A slug is authored, not path-derived.** The four-segment path could not produce a valid slug at all. Rule 1 in [frontmatter-schema.md](frontmatter-schema.md) was rewritten and `SLW4` added so the divergence is visible rather than silent.
- **`platform` is a role, not a depth.** A school and a route sit between the platform and the course, and both are `platform`.
- **A new platform costs a line in `SOURCE_BY_FOLDER`.** The table maps folder names to source keys and an absent folder yields no slug, by design rather than by omission.

Two mechanical checks are worth recording because they were the ones at risk: the root `README.md` gained its Platzi entry through `index --write` rather than by hand, and the tool change landed in the code repo as its own commit with its own test.

One test written during that run was wrong in a way the suite could not catch: it asserted `slugFor` against a three-segment Platzi path that does not exist in the vault, so it passed while the four-segment path that does exist went untested. Closed by commit `4d8c381`, which asserts the real path and that its derived slug fails `SLUG_PATTERN`.
