# Brownfield Notes

Findings from surveying both repositories on 2026-08-21, updated after the same-day prune. Load-bearing context for whoever implements this: several constraints in SPEC.md exist because of what is recorded here, and one previously attempted approach is ruled out by evidence rather than preference.

## The prune of 2026-08-21

Before this spec was finalized, the author pruned the corpus. Recorded here because every count in the contract derives from the post-prune state, and because the deleted material is recoverable only from git history.

- `my-studies` commit `5e13fde`, "Drop stalled and outdated course notes": 60 files changed, 4,733 deletions. Removed all Platzi, all Udemy, TypeHero, roadmap.sh, Coding Interview University, Books/The C Programming Language 2nd Edition, and every TryHackMe path except Advent of Cyber 2024.
- `my-studies-code` commit `0797c5d`, "Drop code for dropped courses": 402 files, 70,832 deletions. Removed Udemy, TypeHero, and the C book exercises.

- `my-studies-code` commit `837a7da`, "Drop Exercism and LeetCode": 29 tracked files. Removed the last two code directories that had no note counterpart.

All three commits are pushed to `origin/main`.

Branch housekeeping landed at the same time. `my-studies-code` carried three stale remote branches, none merged into main: `exercism-js` and `leetcode` held superseded versions of files main already had, while `codewars` held 6 files (two katas plus their tests) that existed **nowhere else**. The author was told this and chose deletion. SHAs recorded before the delete, recoverable through GitHub for a limited window only: `codewars` `7c6e8483`, `exercism-js` `fbaa93c8`, `leetcode` `ef7109b9`. Both repos are now single-branch, local and remote.

Corpus went from 172 notes across 10 platforms to **21 resources on 5 platforms**, and every surviving resource is `status: done`. The note count immediately after the prune was 121; it is 120 now, one duplicate having been deleted since. Current measured counts live in [verification.md](verification.md), and the contract itself asserts completeness rather than a number.

Three index READMEs were repaired by hand during the prune, because the generator does not exist yet: the root `README.md` (10 platform links down to 5), `Books/README.md`, and `TryHackMe/README.md`. CAP-3 acceptance requires the generator to reproduce these exactly; a diff there means the generator is wrong, not the hand repair.

## The submodule attempt, and why it is ruled out

Both repos previously mounted each other as git submodules:

- `my-studies` mounted the code repo at `Code Examples` (commit `38ac0af`), later repaired by `e93bf63 core: Fix submodule url`.
- `my-studies-code` mounted the notes repo at `Notes` (commit `fe254a1`).

Both were removed during the March and April 2026 migration commits. Reciprocal submodules mean each change costs two commits plus a pointer bump, recursive clones loop, and detached HEADs are the normal state. This is not a hypothetical objection; it was tried here and abandoned. Any proposal that reintroduces a git-level link between the repos contradicts this spec.

## Why the repos stay separate

Measured after the prune: the `my-studies-code` working tree is **398 files and 466 MB**, excluding `.git` and `node_modules`. **462 MB of that, over 99 percent, is 83 binary asset files, all under Midu.dev.**

The largest are triplicated 3D models from the Vue course, one copy per lesson variant:

| File                                                                | Size        | Copies                           |
| ------------------------------------------------------------------- | ----------- | -------------------------------- |
| `Experiencias 3D con Vue/lessons/*/public/models/standing-desk.glb` | ~60 MB each | 3 (starter, lighting, animation) |
| `Experiencias 3D con Vue/lessons/*/public/models/laptop.glb`        | 12 MB each  | 2                                |

After any `npm install` the tree also carries `node_modules` on disk, even though git ignores it.

Obsidian indexes everything inside the vault folder and has no true ignore mechanism (its "excluded files" setting affects search ranking and graph weight, not indexing). A merged repo would therefore hand Obsidian a 466 MB tree to index. The split is doing real work and must not be undone.

Worth flagging separately, though out of scope for this spec: roughly 184 MB of that is duplicate `standing-desk.glb` content, which bloats every clone of the repo.

## Existing link syntax

The author already writes Obsidian-flavored links. Before the prune, two files used them: `Books/The C Programming Language, 2nd Edition/README.md` carried 5 unresolved `[[wikilinks]]` for unwritten chapters, and `TryHackMe/README.md` carried 3 for unattempted rooms. In both cases the pattern was consistent: `[[wikilinks]]` marked notes **planned but not written**, while notes that exist were linked with URL-encoded relative markdown links.

Both files were in the drop set, so **zero unresolved wikilinks remain**. The constraint that unresolved wikilinks are backlog markers rather than errors stays in the contract because the author will write outlines again, but it currently has no instances and cannot be tested against live data.

This is also why adopting Obsidian costs no syntax migration.

## Prose-bearing index READMEs

11 of the 22 surviving index READMEs carry hand-written prose alongside their link lists, so whole-file index generation would destroy content. This is why [cli-contract.md](cli-contract.md) specifies a delimited managed block.

They are `Books/ASP.Net Core 3 and React`, `TryHackMe/Advent of Cyber 2024`, and nine Veeva Learning certification indexes. The most prose-heavy example, `Books/The C Programming Language`, was in the drop set, but the pattern survives in the rest.

## Observed drift

`my-studies/Midu.dev/README.md` lists "Lo último de JavaScript (ES2023 & ES2024)" twice, at lines 5 and 7. This survived the prune and is the concrete acceptance case for CAP-3: the generator must emit it once.

## Lockstep commits

The two repos were synchronized manually, with same-day paired commits carrying identical subjects (`Books - The C Programming Language, Chapter 3` on 2026-04-03, `typehero: Default Generic Arguments` on 2026-02-23, and others). One unit of study produced one commit in each repo.

Those particular resources are now dropped, but the pattern is the point: the relationship this spec formalizes already existed in practice and was simply unrecorded.

## Taxonomy asymmetry

After the prune and the subsequent Exercism and LeetCode drop (commit `837a7da`, 29 tracked files), notes span 5 platforms and code spans 2 top-level folders:

- Both sides: Books (ASP.NET only), Midu.dev
- Notes only: Santander Open Academy, TryHackMe, Veeva Learning
- Code only: none

5 of the 21 resources have a code counterpart, so `code: []` is the common case rather than the exception, at 16 of 21. In the other direction every code directory is now reachable from a note, so the "code without notes" warning has no current instances. The rule stays in the contract because the situation will recur; it simply needs no suppression list today.

Per the author's decision, empty `Platzi/` and `TryHackMe/` folders are **not** pre-created in the code repo; they appear when a course or room first produces code.

## Dead tooling

Present in the repos and non-functional. In scope for this spec as CAP-7:

- `my-studies/eslint.config.mjs` sets `ignores: ['**/*']`, making it a complete no-op.
- `my-studies/.prettierrc.js` and `my-studies/.markdownlint.json` exist, but neither repo has a `package.json`, so neither can run.
- `my-studies-code/package-lock.json` is 100 bytes with no corresponding `package.json`.
- **`my-studies-code` has no lint configuration at all.** It carries neither `.prettierrc*` nor `.markdownlint.json`. CAP-7 therefore requires authoring both there, not just wiring scripts to existing files as in the notes repo.
- `my-studies/.prettierrc.js` uses `module.exports`, so it cannot be copied verbatim into a `my-studies-code` whose `package.json` declares `"type": "module"` for the TypeScript tool. A `.prettierrc.json` in the code repo avoids the question.

Building the CLI in Node supplies `my-studies-code` with the manifest it lacks, which is a side benefit of that runtime choice.

## Line endings

`core.autocrlf` is `true` and **neither repo has a `.gitattributes`**, so the working tree is uniformly CRLF on Windows while the object database is mixed:

| Repo              | Stored CRLF | Of which markdown            | Tracked files |
| ----------------- | ----------- | ---------------------------- | ------------- |
| `my-studies`      | 22          | 19, all under Veeva Learning | 158           |
| `my-studies-code` | 264         | 8                            | 376           |

`.prettierrc.js` sets `endOfLine: "crlf"`, which passes on Windows only because of the `autocrlf` setting, and fails on every file under WSL2 where the same content checks out as LF. Since SPEC.md constrains the tool to run in both, CAP-7 could not hold in both places as originally written.

Resolved by standardizing on LF: `endOfLine: "lf"`, a `.gitattributes` in each repo pinning `text=auto eol=lf`, and a one-time `git add --renormalize`. The rewrite touches 22 stored files in the notes repo and 264 in the code repo, line endings only. It belongs to CAP-7 and must land before migration, so it stays clear of the single reviewable diff CAP-5 requires.

## Activity gap

Last study commit in either repo before the prune was 2026-04-03, roughly four and a half months earlier. Over the same window, the Lumen note-app project ran from 2026-03-26 to 2026-04-07 and was archived on 2026-08-16 with a single commit on `main` and `language: null`.

The two facts are related and worth stating plainly: building a note-taking tool competed with studying for the same hours. This is the reasoning behind the SPEC.md non-goal that keeps Lumen archived, and behind scoping this work to a small CLI rather than an application.
