# Frontmatter Schema

The contract every note in `my-studies` carries. Enforced by `studylink validate` (CAP-1), consumed by the index generator (CAP-3) and the status report (CAP-4).

## Fields

| Field           | Type              | Required                                                         | Notes                                                                                                                                                                                                                                                                         |
| --------------- | ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`        | string enum       | yes, except the vault-root index                                 | Platform key. In use after the prune: `books`, `midudev`, `santander`, `tryhackme`, `veeva`. Reserved for the author's stated return to those platforms: `platzi`. Also valid: `external` for one-off resources. Adding a key is a one-line change; unused keys are harmless. |
| `url`           | string            | yes when `source` is `external`, optional otherwise              | Canonical URL of the course, room, or book. Carried by notes that **are** a resource, never by a unit inside one: a day note has no canonical URL of its own. See **The url requirement** below and the url rule in [migration-plan.md](migration-plan.md).                   |
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

| `kind`     | Files                                                                     | What it is                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform` | The vault root `README.md` and the platform READMEs (6 at migration time) | Structural navigation above the resource level. Not a study resource, so it carries no `slug`, `started`, or `finished`. The root additionally carries no `source`, because there is no path segment to derive one from. |
| `index`    | The resource READMEs (16)                                                 | A course, room, book, or certification. Owns `outline_total` where an outline exists.                                                                                                                                    |
| `note`     | The leaf notes (98)                                                       | A unit of study. The 5 Midu.dev workshops are resources represented by a leaf note rather than a folder, so `kind: note` does not imply "belongs to an index".                                                           |

A `platform` file requires only `kind`, `status`, `tags`, and `source` where derivable. It exists in the contract so that `studylink validate` covers **every** file in the vault rather than carving the structural tier out; without it the slug regex in rule 5 rejects `books` for having no `/`.

**Index labels are not frontmatter.** The link text an index shows for a note lives in the index's managed block, seeded from what the author already wrote. It is deliberately not a frontmatter field: adding one would make 99 notes the storage layer for text that belongs to the index, and migration would have to invent it. See [cli-contract.md](cli-contract.md).

## The url requirement

`url` was originally required on every `kind: index` note. It is now required only when `source` is `external`.

The narrowing is forced by the material. No index README in the corpus carries a URL, and 13 of the 16 are Veeva certifications behind a corporate login with no public page to point at, so the original rule could not be satisfied by the very files it governed. An `external` resource, by contrast, is _defined_ by having a URL, so the requirement stays there and only there.

In the vault the field is carried by exactly the 5 Midu.dev workshop notes, which are resources represented by a leaf note. That is the shape the rule describes: `url` belongs to a resource, and most resources here have no public address.

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
  - ../../my-studies-code/Midu.dev/Experiencias 3D con Vue
code_url: https://github.com/LuigiEspinosa/my-studies-code/tree/main/Midu.dev/Experiencias%203D%20con%20Vue
```

Validation resolves each entry against the filesystem and requires it to be a directory.

`code` is a **list** even though every entry in the vault today is a list of one. Migration mapped each note to its resource directory rather than to the lesson variants beneath it, so the multi-entry case has no live instance. The constraint is not speculative: before the prune, the Udemy Astro course note mapped to 6 separate project folders, and this workshop's own code directory still holds three lesson variants that a future note could address separately. A scalar field would have to be widened later, breaking every consumer; a list of one costs nothing now.

After the prune 5 of the 21 resources have a code counterpart, so `code: []` is the common case rather than the exception, at 16 of 21.

The reverse direction is a `README.md` in each code directory carrying the note's slug and URL. It is generated by `studylink index --write`, not hand-written.

## Worked example, leaf note

`my-studies/TryHackMe/Advent of Cyber 2024/Day 11.md`

```yaml
---
source: tryhackme
slug: tryhackme/advent-of-cyber-2024/day-11
status: done
started: 2025-01-01
finished: 2025-01-01
tags: [network-security, wifi, wpa2]
code: []
kind: note
---

# If you'd like to WPA, press the star key

[Beginner WiFi Hacking Tutorial (TryHackMe Advent of Cyber Day 11)](https://www.youtube.com/watch?v=svxqeFWqXQc)
```

Transcribed from disk, and it demonstrates three rules at once. There is **no `url`**, even though the body's first line is a prominent link: that walkthrough video is not the canonical URL of the room, and the superseded lifting rule would have promoted it here on this note and 21 others like it. The dates are `2025-01-01` rather than the December day the content describes, because they are derived from git and survive the 11-SHA exclusion list intact. And the `# H1` differs from the label `TryHackMe/Advent of Cyber 2024/README.md` shows for this file, which ends in a `!` the H1 does not carry, which is why labels are seeded rather than derived.

## Worked example, index note

`my-studies/Books/ASP.Net Core 3 and React/README.md`

```yaml
---
source: books
slug: books/asp-net-core-3-and-react
status: done
started: 2025-02-27
finished: 2025-02-27
tags: [full-stack, react, typescript, aspnet-core]
code:
  - ../../../my-studies-code/Books/ASP.NET Core 3 and React
code_url: https://github.com/LuigiEspinosa/my-studies-code/tree/main/Books/ASP.NET%20Core%203%20and%20React
kind: index
---

# ASP.NET Core 3 and React - Hands-On full stack web development using ASP.NET Core, React, and TypeScript 3 by Carl Rippon
```

Transcribed from disk. It carries no `url`: the book has a public page, but the field is optional outside `external` and none was lifted, which is the common shape across all 16 index READMEs.

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
