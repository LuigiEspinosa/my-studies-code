# Study Repo Linkage Spec

Contract for connecting `my-studies` (notes) and `my-studies-code` (code) by convention plus generation, and for the `studylink` CLI that enforces it.

Start with [SPEC.md](./SPEC.md). Its `companions:` frontmatter lists the files that complete the contract:

- [frontmatter-schema.md](./frontmatter-schema.md), the per-note field contract, the three note kinds, slug convention, and status semantics
- [cli-contract.md](./cli-contract.md), the `studylink` commands, the seeded managed-block design, and lint wiring
- [migration-plan.md](./migration-plan.md), how every existing note acquired frontmatter, the url rule, and the 11-SHA date-exclusion list
- [brownfield.md](./brownfield.md), what the survey found and why several constraints exist
- [verification.md](./verification.md), the dated corpus measurements and the evidence closing each capability

`.memlog.md` is the append-only decision record that `SPEC.md` is derived from. It is the authority on what was decided and on capability IDs.

[stories.yaml](./stories.yaml) breaks the seven capabilities into 6 stories in execution order. It is deliberately **not** listed in `companions:`, because that list is what contract consumers read and this file is input for whatever dispatches the work. It is archived here anyway, since it is the execution plan and the snapshot is the durable record.

All 6 stories are implemented and all 7 capabilities are satisfied; see **Delivery status** in [SPEC.md](./SPEC.md). `stories.yaml` is kept as the record of how the work was dispatched, so a few of its notes describe decisions later superseded, notably the date-exclusion list and the deferred tag pass.

## This is a snapshot

The working copy lives at `_bmad-output/specs/spec-study-repo-linkage/` in the parent directory, and `bmad-spec` is its only writer. Editing the files here by hand does nothing; the next re-derive overwrites them. Refresh this copy after any spec change.

To make this directory the single home instead, point `spec_output_path` at it with `bmad-customize`.
