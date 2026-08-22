---
name: finish-course
description: 'File a finished course into the my-studies and my-studies-code repos: place the notes and code, author schema-conforming frontmatter, regenerate the indexes, run the full gate, then commit. Use when the user says they finished a course, completed a room, want to add a course to their studies, or file notes for something they just studied.'
---

# Finish a Course

## Purpose

Take a finished course and land it in both repos so that `studylink validate` passes, the indexes regenerate cleanly, and the commit matches every convention already in place. The user should be able to say "I finished this course `<url>`, notes are in `<folder>`, code is in `<folder>`" and get a reviewed, committed result.

## Inputs

Whatever the user gives, in any phrasing. Expect:

- **Course URL.** May be absent for a book. Ask if the resource plausibly has a public page.
- **Notes location.** A folder, a single file, or a description of where the notes are. May already be inside the vault, or may be somewhere else entirely.
- **Code location.** Optional. Many resources produce none.

Anything missing that you cannot derive, ask for. Do not guess.

## Repository facts

Both repos sit under a common parent, `c:\MyStudies`. Run `studylink` from there:

```
node my-studies-code/tools/studylink/src/index.ts <command>
```

Commands: `validate [--json] [--quiet]`, `index [--write]`, `status [--stale N] [--triage]`, `migrate [--write]`. Global: `--notes <path>`, `--code <path>`.

**Never run `migrate`.** It is a one-shot pass that already ran, on 2026-08-22 as commit `d1ad5c9`. It derives dates from git history, which a brand-new note does not have. Frontmatter for new notes is authored directly.

The contract lives at `my-studies-code/docs/specs/study-repo-linkage/`. `SPEC.md` and its companions are the authority. Read `frontmatter-schema.md` before authoring any frontmatter.

## Sequence

### 1. Preflight

Both repos must be clean and in sync with `origin/main` before anything else. If either is dirty, stop and show the user what is uncommitted. Do not stash, do not commit unrelated work.

Run `studylink validate` and confirm it exits 0. If the vault is already failing, fix that first or stop; adding to a broken vault buries the cause.

### 2. Resolve source and slug

Parse the URL into a platform key and a course slug:

| URL                                                    | source      | course slug                         |
| ------------------------------------------------------ | ----------- | ----------------------------------- |
| `platzi.com/cursos/fundamentos-arquitectura-software/` | `platzi`    | `fundamentos-arquitectura-software` |
| `tryhackme.com/room/searchskills`                      | `tryhackme` | `searchskills`                      |

`SOURCES` is a closed enum in `tools/studylink/src/schema.ts`: `books`, `midudev`, `santander`, `tryhackme`, `veeva`, `platzi`, `external`. A resource that fits none of these is `external`, which is the one case where `url` is **required**.

Slug shape is `<source>/<course>[/<note>]`, lowercase kebab-case, accents folded to ASCII. Confirm the derived slug with the user before writing it: the slug is frozen identity, and the folder name is not.

### 3. Handle a new platform

If this is the first resource for a platform that has no folder in the vault yet, three things are needed and all three are easy to miss:

1. Create `my-studies/<Platform Folder>/README.md` with `kind: platform`. A platform file carries only `kind`, `status`, `tags`, and `source`. It carries **no** `slug`, `started`, or `finished`.
2. Add the folder to `SOURCE_BY_FOLDER` in `tools/studylink/src/commands/migrate.ts`. It currently maps only the 5 platforms in use, and its own comment says an absent folder is a gap rather than a guess.
3. If the platform key is genuinely new, add it to `SOURCES` in `schema.ts` too, and update the enum comment.

Any change under `tools/` means `npm test` and `npm run typecheck` must pass, and it needs its own test and its own commit.

Do **not** add the new platform to the root `README.md` by hand. `studylink index --write` appends it.

### 4. Place the files

If the notes are already in the right place in the vault, leave them. If they are outside it, move them to `my-studies/<Platform Folder>/<Course Folder>/` (or a single file directly under the platform folder, which is how the Midu.dev workshops are filed).

Use `git mv` when the source is already tracked, so history follows. Never rename a file just to make it prettier: the filename is what the index label was seeded from.

Same for code, into `my-studies-code/<Platform Folder>/<Course Folder>/`.

### 5. Author the frontmatter

Read `frontmatter-schema.md` and follow it exactly. For a finished course:

```yaml
---
source: platzi
slug: platzi/fundamentos-arquitectura-software
status: done
started: 2026-08-01
finished: 2026-08-22
tags: [architecture, software-design]
code: []
kind: index
---
```

Field rules that are routinely got wrong:

- **`status`** is `done` here, because the user said they finished it. It is human intent, never inferred. `stalled` is not a value; it is derived.
- **`started` and `finished` must be asked for.** New files have no git history to derive them from, and today's date is almost certainly wrong for `started`. Ask, and accept "I don't remember" by using the best available anchor rather than inventing precision.
- **`tags` must never be guessed silently.** Propose a set from the actual note content, show it, and let the user correct it. Tags are the retrieval axis that exists precisely because folders are not; auto-tagging from the filename just re-encodes the folder.
- **`url`** goes only on notes that **are** a resource: the `kind: index` README, or a leaf note that stands for a whole resource. Never on a unit inside a resource. A per-lesson video link is not a canonical course URL.
- **`code` and `code_url`** travel together. `code` holds paths relative to the note's containing directory, so depth varies: a note directly under a platform folder needs `../../`, one nested inside a course folder needs `../../../`. `code_url` is `https://github.com/LuigiEspinosa/my-studies-code/tree/main/` plus the URL-encoded path.
- **`outline_total`** is optional and only on `kind: index`. Set it if the user knows how many chapters, rooms, or lessons the source has; it enables the coverage check. Omit it rather than guessing.

### 6. Regenerate the indexes

```
node my-studies-code/tools/studylink/src/index.ts index --write
node my-studies-code/tools/studylink/src/index.ts index --write
```

The second run must report `no changes`. That is the idempotence check and it is not optional.

Never hand-edit anything between `<!-- studylink:begin -->` and `<!-- studylink:end -->`. The tool owns that content. If an index entry is wrong, the input is wrong.

### 7. Run the gate

In this order, all must pass:

1. `studylink validate` exits 0
2. `npm run lint` and `npm run format:check` in `my-studies`
3. `npm run lint` and `npm run format:check` in `my-studies-code`
4. `npm test` and `npm run typecheck` in `my-studies-code`, **only if anything under `tools/` changed**

Run `npm run format` if `format:check` fails, then re-run the check.

When `validate` fails, fix the input, never the symptom. Do not hand-patch a note to make a rule pass. If it still fails after two attempts, stop and show the user the violations.

### 8. Review, then commit

Show the diff before committing. Name what changed and what the user should look at, especially the frontmatter values that were asked for rather than derived.

Commit messages are **subject line only**: one `git commit -m "subject"`, no body, no `Co-Authored-By` trailer, no emoji, no dashes used as punctuation. One commit per repo. If `tools/` changed, that is a separate commit from the content.

Do not push. Ask.

## Guardrails

- Never run `migrate`.
- Never infer completion from a date. A timestamp shows only that nothing is happening, never why.
- Never write inside a managed block.
- Never invent tags, dates, or a `url`.
- Never add `node_modules` or devDependencies to `my-studies`. Its scripts shell out through `npx -y <pkg>@<version>` on purpose, so the Obsidian vault never grows a dependency tree.
- Never reformat anything under `my-studies-code/Books/` or `Midu.dev/`. That is vendored course code, excluded from prettier and markdownlint, and it stays byte-identical to what the lessons taught.
- Leave `Templates/` alone. It is skipped by the vault walk and holds no study notes.
- If the user's course produces no code, `code: []` is correct and common: only 5 of 21 resources have a code counterpart.

## Done

Report: what was filed, the slug, the frontmatter values that were authored rather than derived, the gate results, the commits made, and that nothing is pushed yet.
