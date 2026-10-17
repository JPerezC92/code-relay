# Working analysis — consistency checklist

> Canonical contract for artifacts written by the `ticket-runbook` skill. Applied at write-time by the skill's post-write self-verification loop (analysis) and mechanically by `scripts/validate_runbook.py` (repetitive subset). The script is a helper, not the authority — semantic correctness is the loop's analysis job.

## Validation modes

Run every command from the project root. The validator enforces only the mechanical/repetitive subset; this checklist's evidence analysis remains the agent's responsibility.

- **Fresh scaffold:** run `<python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis-dir> --scaffold`. It requires the copied `analysis/` structure but intentionally permits template-body fill tokens. The analysis pass verifies `01-identify.md` `Pre` contains this ticket's context; later step bodies are intentionally still template content.
- **Scaffold-only invocation (`… <id> scaffold`):** check mandatory ticket context before creation and populate ticket identity, metadata, symptom summary and identify `Pre` before validation. Perform only creation/header initialization, not the normal identification-result step: matching and discriminator/exclusion evaluation are explicitly not performed, with `identification_verdict` still `pending`, counters unchanged and step gates unchecked. Run both structural and semantic self-verification; exit 0 alone does not establish truthful context. Validation passing here never authorizes identification, hypotheses, queries, or dispatch; the invocation stops after reporting the created set.
- **Completed step:** before advancing completed step `NAME` (`identify`, `investigate`, `synthesize`), run `<python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis-dir> --step NAME`. That completed step must have no unfilled tokens.
- **Completed working state:** after the `Phase:` header advances, reserve `<python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis-dir>` for full validation of all completed steps through that header.
- **Pre-close readiness (before collapse):** run `<python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <ticket-folder> --pre-close`. It is read-only and proves the durable record and complete working set are ready before any deletion.
- **Close-out postcondition (after collapse):** run `<python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <ticket-folder> --close-out`. It verifies the durable set and confirms the working set is gone.

## analysis/state.md

- Header has exactly the existing 7 YAML fields: `Phase`, `SLA-due`, `Updated`, `Hypotheses-outstanding`, `Query-budget`, `identification_verdict`, `Same-query-reruns`; coordination lives only in existing Markdown/dispatch, not extra YAML. *(required-field presence delegated to `validate_runbook.py`; exact schema is analysis)*
- `Phase` is one of `identify` / `investigate` / `synthesize` and advances only after the previous step's gate passes and the validator exits clean. *(enum delegated)*
- `identification_verdict` is one of `pending` / `exact` / `structural` / `no_match`. *(enum delegated; verdict-vs-register is delegated for cited `P-NNN`/lifecycle consistency and is analysis for discriminator evidence)*
- `Query-budget` is `used/limit` with used less than or equal to the current limit (default 6). A fresh scaffold is `0/6`; exhausted means used equals limit. The used value reflects actually consumed queries. *(delegated)*
- Other kill-switch counters reflect what was actually consumed: hypotheses ≤ 3 and same-query reruns ≤ 2. *(delegated)*
- `SLA-due` matches the ticket's real SLA deadline (not a placeholder). *(analysis — value must match evidence)*

## Coordination, ownership and conserved accounting

- Each assignment declares workflow/ticket, task/instance, role/responsibility, accepted predecessors/input identities, exact writes/other access, allocated output destinations, gates, continuation/join owner and capacity/accounting owner. Cipher 🔓 (Lead Orchestrator) owns dispatch/acceptance and authoritative incident accounting. *(analysis)*
- One current authorized step instance owns `state.md`, its artifact and recorded counters; supporting instances return bounded attributed evidence without state/counter writes, verdict authority, competing hypothesis framing or incident-query execution. Independent ready evidence reads require stable inputs, compatible resources and declared capacity. *(analysis)*
- Check whole-file/directory/alias overlaps, generated/autofix outputs, canonical reports, screenshots, session-validation destinations, durable records, response drafts, registers, browser/auth refresh, adapters and external capacity. Fixed paths remain exclusively owned/serialized; unknown isolation/capacity blocks access. Supporting outputs add no analysis files. *(analysis)*
- Preserve hypotheses `3/3` outstanding with decrement per resolved hypothesis (cap 3), Query-budget `0/6` initially used/limit, Same-query-reruns `0/2` with stop at 2 and the 75%-SLA warning. Record actual consumption once; each actual verifier adapter execution costs one existing slot. Exhaustion is used = authorized limit; only user authorization raises the denominator before execution; never used > limit or `14/6`. Handoffs clone/reset no allowance. *(analysis)*
- Handoffs carry task/instance, consumed input/output identities, actual counter snapshot, relevant finished producer/consumer results, current gates and resource-use status. The coordinator accepts the join and observes prior-user cessation before explicit successor assignment. Old timestamps, stop requests, timeouts and completed returns alone prove no cessation. The ten-minute warning remains an alert, not a lock/lease. *(analysis)*
- Keep reviewed inputs/outputs stable; relevant changes invalidate affected assignments/verdicts. Incomplete, failed, stale or still-mutating results never unblock transitions. Required checkpoints return `AWAITING_REVIEW`; the parent accepts the existing owner gate and redispatches continuation. Missing boundaries return `BLOCKED` without expanded scope or a worker question call. *(analysis)*
- Completed-step validation plus current semantic gates and coordinator acceptance precede header advance. Preserve sequential H1→H2→H3 and stored pack→diagnostic precedence; non-production examples are guidance, not execution evidence. *(analysis)*

## Register-first identification (`knowledge/problems.md` → verdict)

- A class matches only when every `Required signals` entry in `knowledge/symptoms.md` is present and no `Exclusions` entry is present. *(analysis)*
- Only `S-xx` → `Team: incident` `P-NNN` can produce `exact` or `structural`. Resolved-ticket archives, patterns registers, KBA/RCA catalogs, and knowledge search MUST NOT issue a verdict. *(analysis)*
- **An empty register is valid and yields `no_match`; never halt on an empty register.** *(delegated when `identification_verdict`/cited IDs are parsed)*
- `exact`: exactly one cited `P-NNN`, `Lifecycle: active`, `Allow_exact: yes`, and every discriminator already evidenced in the current ticket. *(cited-ID/lifecycle delegated; discriminator evidence is analysis)*
- `structural`: exactly one cited `P-NNN` with `Lifecycle: candidate` or `active`. *(delegated)*
- `no_match`: no cited `P-NNN`. `pending` is scaffold-only and must be replaced when the identify step closes. *(delegated)*
- Lifecycle `resolved` / `retired` rows are never matched; `mitigated` is `structural` only. *(analysis)*

## analysis/01-identify.md, 02-investigate.md, 03-synthesize.md

- Required `##` sections present: `Steps`, `Output`, `Gate`, `Abort conditions`. *(delegated)*
- Blockquote labels present: `Owner`, `Pre`, `Reads`, `Writes`. *(delegated)*
- No unfilled `<...>` placeholder tokens (except the boilerplate tokens in `validate_runbook.py`). *(delegated)*
- `01-identify.md` `Pre` is populated with THIS ticket's context; `Step`/`Gate`/`Abort` remain template-intact. *(analysis)*
- Every result value is verbatim (no paraphrase, no rounding). *(analysis)*

## Folder structure while open

- Ticket folder contains `screenshots/`, `validations/`, the ticket record, and `response-draft.md`. *(analysis)*
- Screenshots follow the `NN_<source>_<entity>[_<distinguisher>].png` convention; all referenced image paths exist on disk before the response phase. *(analysis)*

## Pre-close readiness (before collapse)

- Exactly one `ticket_<id>.md` record exists — zero or multiple is a halt. *(delegated)*
- Working set complete and exact: `analysis/state.md`, `01-identify.md`, `02-investigate.md`, `03-synthesize.md` — nothing missing, nothing unexpected; `Phase: synthesize`. *(delegated)*
- `response-draft.md` and the `screenshots/` and `validations/` directories are present. *(delegated)*
- Every machine-addressable `path:` recorded in the ticket record is spelled ticket-folder-relative (`screenshots/<filename>`) and resolves inside the ticket folder to an existing file; repo-relative spellings fail. *(delegated)*
- Identification/register consistency holds for the cited `P-NNN`. *(delegated)*
- The mode is read-only: no ticket file is created, edited, renamed, or deleted. *(delegated — non-mutation)*

## Semantic close-out confirmation (before authorization)

- All relevant finished producer/consumer results are coordinator-accepted, including investigation, synthesis, screenshots, drafting, posted-response synchronization, retention and register admission as applicable; no active user accesses working files. Collapse's exclusive writer is explicitly assigned; directory deletion conflicts with descendant access. Relevant changes require renewed readiness validation/acceptance. Validator success alone proves neither semantic ownership nor cessation. *(analysis)*
- Register admission from the confirmed root cause is complete: `case:` pointer recorded, plus an optional `pack:` pointer for a reusable identification pack, and an optional `diagnostic:` sidecar pointer when the confirming query is reusable under protocol-v1. *(analysis)*
- Every executed query in `02-investigate.md` — manual `Query:` blocks, pack-replay blocks and verifier-routed evidence — is preserved verbatim in `ticket_<id>.md` or a cited `validations/` artifact BEFORE collapse deletes the working file. Verifier retention remains redacted: ID, three-state verdict, source/definition/evidence digests and redacted path only; never credentials, raw adapter output, rendered SQL/parameters or unredacted configured identifiers. Retention writers require exact assignment, not implied scope. *(analysis)*
- Every non-`path:` evidence citation (prose/backtick references) in the ticket record resolves to real evidence. *(analysis)*
- Each used image records `url:` when the ticket system returned one, and never records a fabricated `url:`. *(analysis)*
- Posted-response fidelity: the responses block mirrors the latest response posted by us — identified from the ticket tool's author evidence and note id — never the draft and never a third-party/requester note; an edit to a selected note updates its matching block; missing authorship is reported, not inferred. Ordering follows the tool-returned note chronology: an edited note keeps its original creation position and is updated in place by note id, and a tool that reports an edit as a new note/new id is treated as a new note. Content/completeness gates pass. *(analysis)*
- Non-image evidence artifacts live under the ticket's session `validations/` directory, not the ticket root; before collapse every artifact under `validations/` is accounted for as either durably cited in `ticket_<id>.md` or intentionally uncited with an evidenced reason, and that accounting is recorded in the ticket record's existing durable content as `intentionally uncited — <reason>` — no new field, registry, manifest file or schema, and it never authorizes deleting a cited artifact. *(analysis)*
- The project's close-out authorization phrase (see Project extensions) is obtained before any deletion. *(analysis)*

## Authorization and collapse

- Only `analysis/state.md`, every `analysis/*.md`, and `response-draft.md` are deleted — only after pre-close passes plus exact authorization. *(analysis)*
- `ticket_<id>.md`, `screenshots/`, `validations/`, and every other cited evidence file are never deleted at close. *(delegated)*

## Close-out postcondition (after collapse)

- Durable set: `ticket_<id>.md` plus `screenshots/`, `validations/`, and every other cited evidence file; the working set (including `response-draft.md`) is gone. *(delegated)*
- `--close-out` exits 0; exit 2 (no record) and exit 1 are both halts. *(delegated)*
- Failure after collapse halts without deleting durable evidence to satisfy a validator. *(analysis)*

## Query retention and register admission (close-out)

- Every executed query in `02-investigate.md` — manual `Query:` blocks and verifier-routed evidence — is preserved verbatim in `ticket_<id>.md` or a cited `validations/` artifact BEFORE collapse deletes the working file. *(analysis)*
- When the confirming query is reusable, it is persisted as parameterized SQL plus an adjacent `.verifier.yaml` sidecar at the destination project's declared query-storage path; the row's Evidence records `diagnostic:<destination-relative-sidecar-path>`. A reusable identification pack (a multi-statement or multi-result correlation) is instead persisted at the destination-chosen path and recorded as `pack:<destination-relative-pack-path>`; it is not a verifier and is never evaluated by `query_verification.py`. The core never defines the destination directory. *(analysis)*
- A later `structural` ticket follows a recorded `pack:` pointer first — resolving the destination-relative path and replaying the correlation with current-ticket keys under destination-owned execution (the core never executes or parses the pack) — then follows the `diagnostic:` pointer through protocol-v1 when present (one existing Query-budget slot), before framing a new query. *(analysis)*
- Register admission on a confirmed root cause happens before collapse and never waits for the project's close-out authorization phrase (see Project extensions); collapse itself requires explicit user authorization. *(analysis)*

## Loop rule

The validator enforces only the mechanical/repetitive subset (field presence, fraction/enum parse, section/label presence, unfilled tokens, kill-switch caps, cited-`P-NNN`/lifecycle consistency, pre-close readiness, and close-out file presence). Every value that must match evidence — SLA, discriminator evidence, verdict rationale, counters, naming, folder contents, and step context — is verified by the analysis pass against this checklist; a value is never invented to satisfy a check.
