# Migration Plan

Satisfies CAP-5 and CAP-7. One automated pass over the pruned corpus, landing as a single reviewable diff.

## Scope

121 markdown files in `my-studies`: 99 leaf notes and 22 index READMEs, across 21 resources on 5 platforms. Every one gains frontmatter. No file changes path. No prose body is altered.

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
| `slug`          | Remaining path segments, lowercased, accents folded to ASCII, non-alphanumerics collapsed to single hyphens, `.md` and `README` dropped.                                                          |
| `kind`          | `index` if the filename is `README.md`, else `note`.                                                                                                                                              |
| `status`        | `done`, uniformly. See above.                                                                                                                                                                     |
| `started`       | Date of the **first** commit touching the file.                                                                                                                                                   |
| `finished`      | Date of the **last** commit touching the file.                                                                                                                                                    |
| `tags`          | Empty list. Deliberately not guessed.                                                                                                                                                             |
| `url`           | Lifted only when the note body carries a single obvious source link in its first 5 lines; the original line stays.                                                                                |
| `code`          | Populated only where a directory of the same `<source>/<course>` shape exists in the sibling repo.                                                                                                |
| `outline_total` | Omitted. No surviving resource carries an outline.                                                                                                                                                |

Two commit classes are **excluded** from date derivation, because both touched many files at once and would otherwise flatten `finished` across whole platforms:

- the March 2026 `chore(migration): ... Lint` reformatting commits
- the 2026-08-21 prune commits (`5e13fde` in notes, `0797c5d` in code)

## Deliberately not automated

**`tags`.** The whole point of tags is a retrieval axis folders do not provide. Auto-tagging from filenames would just re-encode the folder structure. This is the one genuinely manual step and it can happen incrementally after the branch merges.

## Expected `code` mapping

Only 3 of 21 resources have a code counterpart after the prune:

- `books/asp-net-core-3-and-react` maps to `Books/ASP.NET Core 3 and React`
- 4 of the 5 Midu.dev workshops map to their `Midu.dev/` directories (Figma para Devs has no code)
- Everything else resolves to `code: []`

After the Exercism and LeetCode drop, `my-studies-code` contains only `Books/` and `Midu.dev/`, both of which have note counterparts. Every code directory is now reachable from a note.

## Sequence

1. **Land the tool first.** Build and test `studylink` against a scratch copy of the vault before it touches the real one. Migration is the tool's first real workload, not a separate script.
2. **Wire up lint (CAP-7).** Add a real `package.json` to both repos with `lint` and `format:check` scripts driving `markdownlint` and `prettier` against the existing `.markdownlint.json` and `.prettierrc.js`. Delete the no-op `eslint.config.mjs` and the orphan `package-lock.json`. Confirm both repos pass on a clean tree before migration adds frontmatter, so any later failure is attributable.
3. **Dry run.** `studylink migrate` with no `--write`, review the proposed frontmatter across every platform, especially accent-folding (`Introducción al Web Scraping`, `Lo último de JavaScript`, `Curso de Inglés` remnants in Veeva titles).
4. **Write on a branch.** `studylink migrate --write`, one commit, subject line only per repo commit policy.
5. **Validate.** `studylink validate` must exit 0. Fix violations by correcting the tool and re-running from a clean tree, never by hand-patching notes, so the tool stays the source of truth.
6. **Generate indexes.** `studylink index --write`, then run again to prove idempotence (CAP-3 acceptance). The three indexes repaired by hand during the prune (`README.md`, `Books/README.md`, `TryHackMe/README.md`) must regenerate to the same content they now hold; a diff there means the generator disagrees with the hand repair and the generator is wrong.
7. **Human pass on tags.** Walk the 99 leaf notes and add tags. Incremental, post-merge.
8. **Open the vault.** Point Obsidian at `my-studies`, confirm CAP-6, add a Bases or Dataview view over `status` and `tags`.

## Rollback

Everything lands on one branch as one commit against a clean tree. Rollback is `git reset --hard`. No history rewriting, no file moves.

## Verification checklist

- [ ] `studylink validate` exits 0 across 121 files
- [ ] `studylink index --write` run twice produces an empty second diff
- [ ] The three hand-repaired indexes regenerate byte-identical
- [ ] Prose in all prose-bearing READMEs byte-identical to pre-migration
- [ ] No file changed path; `git diff --name-status` shows only `M`
- [ ] No note body changed outside the frontmatter block and managed blocks
- [ ] Every `code` entry resolves to a real directory
- [ ] `studylink status` reports 0 active, 21 done
- [ ] `npm run lint` and `npm run format:check` pass in both repos
