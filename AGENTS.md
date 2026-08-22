<!-- bmad:context -->
<!-- Verified 2026-08-21 against 116c504. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

# my-studies-code

Code written while taking the notes in the sibling `my-studies/` vault, plus `studylink`, the CLI that links the two. ESM TypeScript on Node >= 24, run directly by type stripping. The contract it implements is specced at `docs/specs/study-repo-linkage/`.

## Policy

- Never reformat or edit anything under `Books/` or `Midu.dev/`. It is vendored course code that stays byte-identical to what the lessons taught, including deliberately semicolon-free Vue sources. `.prettierignore` and `.markdownlintignore` exclude both trees, so lint and format cover `docs/` and `tools/` only. They are 366 of 390 tracked files, so exclude them from searches too.
- Never hand-edit `docs/specs/study-repo-linkage/`. It is a snapshot; the working copy is `../_bmad-output/specs/spec-study-repo-linkage/` and `bmad-spec` is its only writer. Edits here are discarded on the next re-derive.
- Never introduce git submodules between this repo and `my-studies`. Reciprocal submodules were tried here and torn out; linkage is convention plus generation only.
- Keep both repos checked out as siblings under one parent. Relative cross-repo paths depend on it.
- Commit with a subject line only: single `-m`, no body, no trailers, for any author including agents.
- `main` is the only branch, local and remote. Do not create long-lived branches.

## Where things are

- The `studylink` CLI: `tools/studylink/`. Stories 2 to 6 of the spec build out `validate`, `index`, `status`, and `migrate`.
- The contract it implements: `docs/specs/study-repo-linkage/`. Read `README.md` first; `SPEC.md` names its companions.

## Running and verifying

- No CI in either repo. Run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm test` yourself before committing.

## Conventions that differ from defaults

- Keep `tools/studylink/` runnable by Node type stripping: no enums, no namespaces, no parameter properties, and no build step or bundler. `tsconfig.json` sets `erasableSyntaxOnly` and `noEmit`.
- Normalize all internal path handling to POSIX separators, converting only at filesystem boundaries. The tool must run identically on Windows and under WSL2.
- `.gitattributes` pins `text=auto eol=lf` and the index is 100 percent LF. Do not reintroduce CRLF, whatever `core.autocrlf` reports locally.

## Known pitfalls

- Never deduplicate the three ~59 MB copies of `standing-desk.glb` under `Midu.dev/Experiencias 3D con Vue/lessons/`. Each lesson variant must run standalone.
- Never infer from file or commit dates whether a course was finished. Timestamps show only that nothing is happening, never why. `status` is human-authored; `stalled` is derived and never stored.

<!-- /bmad:context -->
