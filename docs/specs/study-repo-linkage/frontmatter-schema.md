# Frontmatter Schema

The contract every note in `my-studies` carries. Enforced by `studylink validate` (CAP-1), consumed by the index generator (CAP-3) and the status report (CAP-4).

## Fields

| Field           | Type              | Required                                                         | Notes                                                                                                                                                                                                                                                                         |
| --------------- | ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`        | string enum       | yes, except the vault-root index                                 | Platform key. In use after the prune: `books`, `midudev`, `santander`, `tryhackme`, `veeva`. Reserved for the author's stated return to those platforms: `platzi`. Also valid: `external` for one-off resources. Adding a key is a one-line change; unused keys are harmless. |
| `url`           | string            | yes on index notes, optional on leaf notes                       | Canonical URL of the course, room, or book. `external` requires it on every note.                                                                                                                                                                                             |
| `slug`          | string            | yes, except `kind: platform`                                     | Stable cross-repo identifier. See **Slug convention**. Unique across the vault.                                                                                                                                                                                               |
| `status`        | string enum       | yes                                                              | One of: `backlog`, `active`, `done`, `dropped`. Human-authored intent. `stalled` is deliberately **not** a value here; see **Status semantics**.                                                                                                                              |
| `outline_total` | integer           | optional, `kind: index` only                                     | How many units the source actually has (chapters, rooms, lessons). Enables the coverage check. Omit when unknown rather than guessing.                                                                                                                                        |
| `started`       | date `YYYY-MM-DD` | required when `status` is not `backlog`, except `kind: platform` | First day of study. Migration derives it from the first commit touching the file.                                                                                                                                                                                             |
| `finished`      | date `YYYY-MM-DD` | required when `status` is `done`, except `kind: platform`        | Migration derives it from the last commit touching the file. Must not precede `started`.                                                                                                                                                                                      |
| `tags`          | list of strings   | yes, may be empty                                                | Topic axis, lowercase kebab-case. This is the retrieval layer that replaces folder reorganization.                                                                                                                                                                            |
| `code`          | list of strings   | yes, may be empty                                                | Relative paths from the note to sibling-repo directories. See **Cross-repo references**.                                                                                                                                                                                      |
| `code_url`      | string            | required when `code` is non-empty                                | Canonical `github.com/LuigiEspinosa/my-studies-code/tree/main/...` URL, because relative cross-repo links do not resolve on github.com.                                                                                                                                       |
| `kind`          | string enum       | yes                                                              | `platform`, `index`, or `note`. See **Kinds**.                                                                                                                                                                                                                                |

Unknown keys are permitted and ignored, so Obsidian plugins can add their own without failing validation.

## Kinds

The vault has three tiers, and the middle one is the only tier that maps to a study resource.

| `kind`     | Files                                                    | What it is                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform` | 6: the vault root `README.md` and the 5 platform READMEs | Structural navigation above the resource level. Not a study resource, so it carries no `slug`, `started`, or `finished`. The root additionally carries no `source`, because there is no path segment to derive one from. |
| `index`    | 16 resource READMEs                                      | A course, room, book, or certification. Owns `outline_total` where an outline exists.                                                                                                                                    |
| `note`     | 99 leaf notes                                            | A unit of study. The 5 Midu.dev workshops are resources represented by a leaf note rather than a folder, so `kind: note` does not imply "belongs to an index".                                                           |

A `platform` file requires only `kind`, `status`, `tags`, and `source` where derivable. It exists in the contract so that `studylink validate` covers all 121 files rather than carving 6 of them out; without it the slug regex in rule 5 rejects `books` for having no `/`.

**Index labels are not frontmatter.** The link text an index shows for a note lives in the index's managed block, seeded from what the author already wrote. It is deliberately not a frontmatter field: adding one would make 99 notes the storage layer for text that belongs to the index, and migration would have to invent it. See [cli-contract.md](cli-contract.md).

## Status semantics

The four `status` values are **intent**, authored by the human. Everything else is derived, so the tool can never overwrite a judgement call.

| State        | Kind                      | How it is established                                                      |
| ------------ | ------------------------- | -------------------------------------------------------------------------- |
| `backlog`    | stored                    | Author intends to start it.                                                |
| `active`     | stored                    | Author is working on it.                                                   |
| `done`       | stored                    | Author says it is finished.                                                |
| `dropped`    | stored                    | Author is not going back to it.                                            |
| **stalled**  | **derived, never stored** | `status: active` and no commit touching it in `--stale` days (default 30). |
| **coverage** | **derived, never stored** | Units written divided by `outline_total`, where an outline exists.         |

The rule behind this split: **dates cannot distinguish finished from abandoned.** A file untouched for 500 days looks identical either way. Timestamps prove only that nothing is happening, never why. So staleness is computable and completion is not.

Coverage is the only mechanical signal that speaks to completion, and it is **advisory**. `validate` warns when `status: done` coexists with coverage below 100 percent, but the human call wins. The precedent is Advent of Cyber 2024, which the author marked `done` with Day 24 absent. That is correct and must not be an error.

Where `outline_total` is absent, coverage is `unknown` and the tool reports it as such. It never guesses a denominator.

## Slug convention

Shape: `<source>/<course>[/<note>]`, all lowercase kebab-case, accents folded to ASCII.

```
books/asp-net-core-3-and-react
books/asp-net-core-3-and-react/chapter-6-managing-state-with-redux
midudev/experiencias-3d-con-vue
tryhackme/advent-of-cyber-2024/day-11
veeva/engage-technical-certification-v5/engage-sign
```

Rules:

1. The slug is derived from the folder path at migration time, then frozen. Renaming a folder later does not change the slug; the slug is the identity, the path is not.
2. A course whose notes and code both exist uses the **same** `<source>/<course>` prefix in both repos. That prefix is the join key.
3. Slugs are unique across the vault. `studylink validate` fails on a collision.
4. Accent folding is one-way and lossy by design (`Introducción` becomes `introduccion`), which is why the human-readable title stays in the note's `# H1` and the folder name.

## Cross-repo references

`code` holds paths relative to the note file, resolving across the sibling checkout:

Paths are relative to the **containing directory** of the note file, so depth varies: a note sitting directly under a platform folder needs `../../`, one nested inside a course folder needs `../../../`.

```yaml
# my-studies/Midu.dev/Experiencias 3D con Vue.md  ->  two levels up to the common parent
slug: midudev/experiencias-3d-con-vue
code:
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/starter
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/lighting
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue/lessons/animation
code_url: https://github.com/LuigiEspinosa/my-studies-code/tree/main/Midu.dev/Experiencias%203D%20con%20Vue
```

This is the case that forces `code` to be a list: one note, three lesson variants. Validation resolves each entry against the filesystem and requires it to be a directory.

After the prune only 3 of 21 resources have any code counterpart, so `code: []` is the common case rather than the exception.

The reverse direction is a `README.md` in each code directory carrying the note's slug and URL. It is generated by `studylink index --write`, not hand-written.

## Worked example, leaf note

`my-studies/TryHackMe/Advent of Cyber 2024/Day 11.md`

```yaml
---
source: tryhackme
slug: tryhackme/advent-of-cyber-2024/day-11
status: done
started: 2024-12-11
finished: 2024-12-11
tags: [wifi, wpa2, packet-capture]
code: []
kind: note
---

# Day 11
```

## Worked example, index note

`my-studies/Books/ASP.Net Core 3 and React/README.md`

```yaml
---
source: books
url: https://www.packtpub.com/product/asp-net-core-3-and-react/9781789950229
slug: books/asp-net-core-3-and-react
status: done
started: 2025-02-27
finished: 2025-02-27
tags: [aspnet, react, typescript, full-stack]
code:
  - ../../../my-studies-code/Books/ASP.NET Core 3 and React
code_url: https://github.com/LuigiEspinosa/my-studies-code/tree/main/Books/ASP.NET%20Core%203%20and%20React
kind: index
---

# ASP.NET Core 3 and React - Hands-On full stack web development using ASP.NET Core, React, and TypeScript 3 by Carl Rippon
```

Note the folder-name mismatch between repos: the notes side spells it `ASP.Net Core 3 and React` and the code side `ASP.NET Core 3 and React`. The shared `slug` is what joins them, which is precisely why identity lives in the slug and not the path.

The `# H1` is the full book title, and it is also the exact link text `Books/README.md` carries for this file. That is the one case in the corpus where the folder name and the index label diverge far enough to prove the label is stored rather than derived.

## Worked example, platform note

`my-studies/Books/README.md`

```yaml
---
source: books
status: done
tags: []
kind: platform
---

# Books
```

The vault-root `my-studies/README.md` is identical minus `source`.

## Validation rules

All 11 apply to `kind: index` and `kind: note`. Rules 3 to 6 are skipped for `kind: platform`, which carries none of the fields they govern.

1. All required fields present, correctly typed, per the Required column and the reduced `platform` set.
2. `status` and `source` are members of their enums; `kind` is one of `platform`, `index`, `note`.
3. `finished` present when and only when `status` is `done`; `finished` is not earlier than `started`.
4. `started` present whenever `status` is not `backlog`.
5. `slug` matches `^[a-z0-9]+(/[a-z0-9-]+){1,2}$` and is unique across the vault.
6. `slug` prefix agrees with `source`.
7. Every `code` entry resolves to an existing directory.
8. `code_url` present when `code` is non-empty.
9. `tags` are lowercase kebab-case.
10. `[[wikilinks]]` with no target are **reported as planned notes, never failures** (see Constraints in SPEC.md).
11. `outline_total`, when present, is a positive integer on a `kind: index` note.

### Warnings, which do not affect exit code

- `status: done` with coverage below 100 percent. Advisory only; the human call wins.
- `status: active` with no touch in `--stale` days. This is the stalled signal, surfaced by `studylink status`.
- A code-repo directory with no note counterpart. Advisory, never an error. No such directory exists today, so no suppression list is needed.
