---
name: ticket-runbook
description: Scaffold a per-ticket working analysis (analysis/state.md + identify/investigate/synthesize) for an incident ticket, identify it register-first via S-xx → incident P-NNN, and collapse to one ticket_ID.md record at close. Use when starting analysis on a new incident ticket.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 2.6.0
  dependencies: PyYAML==6.0.3
---
<!-- core:begin -->

## Mandatory core

### What I do

Scaffold a per-ticket analysis working set (see **Working-set and record schema**) from the analysis template (see **Working-set and record templates**) and run **register-first identification**: normalize the ticket, match an `S-xx` symptom class, then match at most one `Team: incident` `P-NNN` from the project's problem register (see **Register paths**) and issue a verdict of `exact`, `structural`, or `no_match`. The working analysis is always scaffolded, whatever the verdict. When the root cause is confirmed, the runbook grows the symptom/problem registers immediately — before destructive collapse and never gated on it — preserving every executed query durably and, when the confirming query is reusable, a destination-relative verifier pair a later ticket can replay. At close, the working analysis and the project's response-draft file collapse to the durable ticket record plus the project's screenshots and validations directories (see **Working-set and record schema**), and the cited evidence.

The identify-step artifact (see **Working-set and record templates**) also documents an optional, incident-only verifier route (the `query-verification` skill) on the investigate step that consumes one existing Query-budget slot; it never adds automatic query execution and never changes the state header schema.

### When to use me

- User provides a ticket ID for a **new** incident ticket.
- Cipher 🔓 (Lead Orchestrator) dispatches this skill at the start of a new incident analysis.
- Keywords: `ticket-runbook`, the analysis working set (see **Working-set and record schema**), ticket ID when no existing working analysis is present.

### Arguments

From the user's request, extract:

- **ticket id** — the ticket number (e.g. `183700`). If not provided, ask the user.
- **`scaffold`** (optional second argument) — the user-guided mode. When present, this invocation only prepares the working set and stops (see **Mode branch — `scaffold`**). Absent, the invocation runs the standard register-first flow.

### Steps

#### Coordination preflight (every assignment and handoff)

Apply `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)`. Cipher 🔓 (Lead Orchestrator) owns dispatch, acceptance, capacity and authoritative incident-budget accounting. Record the workflow/ticket, task/instance, responsible role, accepted predecessor results and input identities, exact permitted writes and other resource access, allocated output destination, required gates, continuation/join owner and capacity/accounting owner in existing state/step Markdown or the dispatch. Add neither YAML fields nor analysis files. Owning a working file grants no shell command: Cipher 🔓 (Lead Orchestrator) runs analysis-directory validation, and Ledger 📒 (Record Keeper) retains ticket-record validation after record edits.

- Keep one current authorized step instance as sole writer of `state.md`, its step artifact and recorded counters until a coordinator-controlled handoff. Supporting evidence instances return bounded, attributed results to allocated destinations; they never write state/counters, issue identification verdicts, frame competing hypotheses or execute incident queries. Independent ready evidence work may run concurrently only against stable accepted inputs and compatible resources within declared capacity.
- Before dispatch, reject overlapping whole-file/directory/alias access unless isolation is verified. Allocate screenshot/report and session-validation destinations without overwrites; canonical fixed paths stay exclusively owned and serialized. Symptom/problem registers, durable records, response drafts, browser/auth sessions (including refresh), adapters and external capacity are separately declared resources, not implied grants. Unknown capacity or isolation blocks the affected operation.
- Preserve one incident allowance across all instances: hypotheses start at `3/3` outstanding and decrement per resolved hypothesis (cap 3); Query-budget starts at `0/6` used/limit; Same-query-reruns starts at `0/2` and stops reruns at 2. Only the sole writer records actual consumption under coordinator accounting. No allowance cloning, resets on transfer or invented consumption; each actual verifier adapter execution consumes one existing query slot. Query exhaustion is used = current authorized limit; raise the denominator only with user authorization before further execution, never used > limit or `14/6`. Preserve the 75%-SLA warning.
- At handoff, return task/instance, consumed input and output identities, actual results/counter values, gate evidence and current resource-use state. Cipher 🔓 (Lead Orchestrator) accepts all relevant finished results, observes cessation of the previous user's resource use and explicitly assigns the successor before ownership transfers. A timestamp, stop request, timeout or completed return alone is not cessation evidence. Keep H1→H2→H3 order; the next hypothesis proceeds only after Cipher 🔓 (Lead Orchestrator) accepts the return and explicitly dispatches it. Role identity is not independence.
- Hold reviewed outputs and dependencies stable; changed scope/inputs invalidate affected assignments/verdicts. Failed, incomplete, stale or still-mutating work cannot unblock a transition. Required edit checkpoints return `AWAITING_REVIEW`, not completion; only the parent accepts the existing owner gate and redispatches continuation. Missing inputs/resources return `BLOCKED` with exact evidence/need and bounded options; workers never expand scope or invoke the user-facing question tool.

#### 1. Read the ticket

Delegate all ticket data extraction to the project's ticket-read tool. Do not read the ticket system directly here.

Required outputs:
- System (business area)
- Module
- Country/region + campaign/period (if applicable)
- Symptom summary (1–2 sentences)
- the ticket's SLA deadline (ISO format)

Hold these values for later sections.

#### 1b. Mode branch — `scaffold` (user-guided)

If this invocation carried the `scaffold` argument (see **Arguments**), run only this bounded sequence and stop:

1. Perform step 1 (read the ticket) for context only. Do not match a register.
2. Before any creation or write, check for an existing working set: if present, stop and report it without overwriting. Check that the mandatory ticket context is available; a missing mandatory value is a reported blocker — never a guessed SLA, system, or module. Then perform only step 3.1–3.3 (create the ticket folder, screenshots directory, validations directory, ticket record, response-draft file, and the analysis working set) using only evidenced values. Populate the ticket identity, record metadata and symptom summary, and the identify-step `Pre` with this ticket's evidenced context before validation. Skip step 3.4: matching, discriminator/exclusion evaluation and the identification result remain explicitly not performed, with the verdict pending and step gates unchecked.
3. Initialize the state header with `identification_verdict: pending` and unchanged counters (`Hypotheses-outstanding 3/3`, `Query-budget 0/6`, `Same-query-reruns 0/2`).
4. Run step 4 (scaffold validation) and the complete post-write self-verification loop, including semantic comparison with the supplied context; structural exit 0 alone is not sufficient. Report the created set and the actual verification result.
5. **STOP.** Do not run step 2 identification, do not record a verdict, do not frame hypotheses, execute queries, or dispatch Investigator 🔍 (Incident Investigator) (step 5). Hand control back to the user; the normal invocation continues the standard flow.

**Refuse to overwrite:** if the ticket folder already holds a working set, stop and report the existing set instead of replacing it.

#### 2. Identify — register-first (`S-xx` → incident `P-NNN`)

Run this order. Do not skip or reorder, and do not consult any other source for a verdict.

1. **Normalize the ticket** — derive system, module, country, campaign, and the raw symptom/error text from step 1.
2. **Match `S-xx`** — match the ticket's error signature against the project's symptom register (see **Register paths**). A class matches only when every **Required signal** is present and no **Exclusion** is present. Record the matching class (or "no class match"). One class is primary; note any secondary classes.
3. **Filter incident `P-NNN`** — read the project's problem register (see **Register paths**) and select only rows where `Team: incident`, `Symptom` references the matched `S-xx`, `System` and `Module` align with the ticket, and `Lifecycle` is matchable (`candidate`, `active`, or `mitigated`; `resolved` and `retired` are never matched).
4. **Evaluate discriminators and exclusions** — for each candidate row, every `Discriminators` `field=value` must be evaluated against the current ticket, and any `Exclusions` condition present disqualifies the row.
5. **Issue the verdict** — `exact`, `structural`, or `no_match`, then write it to the identification-verdict header field in the analysis state file (see **Working-set and record schema**).

**Verdict rules (HARD):**

| Verdict | Condition |
|---|---|
| `exact` | Exactly one `active` incident `P-NNN` with `Allow_exact: yes` remains, and **every** discriminator is already evidenced in the current ticket. |
| `structural` | Exactly one `candidate` or `active` incident `P-NNN` remains; its hypothesis still requires current-ticket validation. |
| `no_match` | No eligible incident `P-NNN` remains. **An empty problem register (see Register paths) always yields `no_match` — never halt on an empty register.** |
| `pending` | Initial scaffold value only; replaced in this step. |

- If more than one incident `P-NNN` remains eligible after every filter, do NOT choose. Record every candidate and return `no_match` with an ambiguity note for Cipher 🔓 (Lead Orchestrator).
- **Verdict-source restriction (HARD RULE):** only `S-xx` → incident `P-NNN` can produce `exact` or `structural`. Resolved-ticket archives, patterns registers, KBA/RCA catalogs, and knowledge search are evidence/backfill sources only — they MUST NOT issue, upgrade, or echo an identification verdict. They may be consulted only after a `no_match`, and only as labeled investigation evidence.
- A row does not need to exist for `no_match`; an empty register is the canonical `no_match` case.

#### 3. Scaffold the working analysis (always)

Always scaffold, whatever the verdict — `exact`, `structural`, and `no_match` all get the same three working files.

1. If the ticket folder does not exist, create it first: ticket folder + the project's screenshots directory + the project's validations directory + ticket record (from the ticket record template — see **Working-set and record templates**) + the project's response-draft file (from the response-draft template — see **Working-set and record templates**).
2. Copy the analysis template from the analysis template directory (see **Working-set and record templates**) into the ticket folder's analysis subfolder as the project's analysis working set (see **Working-set and record schema**).
3. Initialize the analysis state-file header (see **Working-set and record schema**): `Phase` (`identify`), `SLA-due` (from ticket), `Updated` (current timestamp), `Hypotheses-outstanding` (`3/3`), `Query-budget` (`0/6`, used/limit, default limit 6), `identification_verdict` (`pending`), `Same-query-reruns` (`0/2`). **Query-budget (HARD):** exhausted means used equals the current limit; halt-and-ask at that point unless the user already raised the denominator. Raise the denominator first (`14/14`); never write used greater than limit; never write `14/6`.
4. Record the identification result in the identify-step artifact (see **Working-set and record templates**): system, module, matched `S-xx`, matched incident `P-NNN` (if any), discriminator/exclusion evaluation, verdict, and rationale.

**Screenshot naming convention:** files placed in the project's screenshots directory must follow the project's screenshot naming convention (see **Screenshot naming convention**). Forbidden initial names: `image1.png`, `screenshot.png`, or any name without the project's required prefix (see **Screenshot naming convention**). Investigator 🔍 (Incident Investigator) + Quill 🪶 (Note Drafter) dispatch prompts MUST reference final filenames; renaming at close-out is a process violation.

**Pre-stage rule:** ALL screenshots (query images and browser captures) MUST exist on disk in the project's screenshots directory (see **Working-set and record schema**) BEFORE Quill 🪶 (Note Drafter) is dispatched for the response phase. Dispatching Quill against not-yet-created image paths causes a guaranteed self-audit FAIL (`image_path_invalid`).

**Image location rule:** every used image records its local `path:` as a ticket-folder-relative file (the project's screenshot path spelling; see **Screenshot naming convention**) and, when the ticket system returned one, its remote `url:` (ticket-system location). Never record a remote `url:` that does not exist, never fabricate a local `path:`, and never spell the local path repo-relative (see **Screenshot naming convention**).

#### 4. Validate

Immediately after scaffolding, run the ticket-runbook validator script (see **Validator script**) with the ticket folder's analysis directory and `--scaffold`. Exit 0 → proceed. Non-zero exit → read the error output, fix the offending field, re-run. Do NOT continue until the validator passes.

> Evidence discipline applies: if the validator reports a field value violation, fix the value to match actual evidence — never invent a value to satisfy the validator.

**Per-step validator invocation (HARD RULE):** before advancing the completed step `NAME` (`identify`, `investigate`, `synthesize`), run the validator script (see **Validator script**) with `<analysis-dir> --step NAME`. Abort if exit ≠ 0. Do NOT advance the `Phase:` field until the validator exits clean. After the header advances, reserve default full validation — the validator script with `<analysis-dir>` — for checking every completed step through the `Phase:` header.

Validator success is not semantic coordination proof. Header advancement also requires coordinator acceptance of every relevant producer/consumer result and applicable gate; transfer writer ownership only through the preflight handoff.

#### 5. Dispatch the owning agent

After the analysis scaffolds and validates:

1. If the verdict is `exact` or `structural`: notify Cipher 🔓 (Lead Orchestrator) of the matched `P-NNN` and verdict so it dispatches Investigator 🔍 (Incident Investigator) for the investigate step.
2. If the verdict is `no_match`: notify Cipher 🔓 (Lead Orchestrator) that the register yielded no match and the investigate step starts from fresh hypotheses.

**HARD RULE — dispatch enforcement:** Cipher 🔓 (Lead Orchestrator) MUST dispatch Investigator 🔍 (Incident Investigator) to execute the investigate step. Cipher 🔓 (Lead Orchestrator) MUST NOT execute that step inline. Cipher 🔓 (Lead Orchestrator) owns all dispatch decisions. This skill does NOT dispatch agents directly.

#### 6. Register admission (confirmed root cause; non-destructive)

Preparation starts as soon as the root cause is confirmed — it does not wait for the close-out authorization (see **Working-set and record schema**). Cipher 🔓 (Lead Orchestrator) dispatches Scribe ✍️ (Docs & Problems Manager) to prepare an evidence-backed register draft. Scribe ✍️ (Docs & Problems Manager) presents it for exact user approval (`approved` or `aprobado`); only after that approval does Cipher 🔓 (Lead Orchestrator) apply the mutation through the destination's gated tool. If the destination workflow or tool is unavailable, stop and report; do not improvise. Complete the approved register mutation before destructive collapse:

1. Create the missing `S-xx` symptom class in the project's symptom register (see **Register paths**) when no class matches the confirmed failure signature.
2. Admit a novel cause as a `candidate` `P-NNN` row in the project's problem register (see **Register paths**) when no eligible problem exists.
3. Append the durable `case:` pointer for the current case to the existing `P-NNN` row's Evidence.
4. Promote a `candidate` to `active` only after a second independent confirmed case.

Register growth requires the durable case pointer but does not require a reusable diagnostic. When the confirming query is reusable, also persist it as parameterized SQL plus an adjacent `.verifier.yaml` sidecar at the destination project's declared query-storage path and record `diagnostic:<destination-relative-sidecar-path>` in the row's Evidence; if the destination has no declared path, ask for it — the `P-NNN` and case pointer are recorded first. When the proof path is a reusable identification pack rather than a one-row verifier, persist it at the destination-chosen path and record `pack:<destination-relative-pack-path>` in the row's Evidence; do not run the query-verification evaluator on a pack (see **Working-set and record templates**) — it is not a verifier and has no sidecar or result contract. A later `structural` ticket follows a recorded `pack:` pointer first — resolving the destination-relative path and replaying that correlation with current-ticket keys under destination-owned execution (the core never executes or parses the pack) — then follows `diagnostic:` through the verifier protocol when present (see **Working-set and record templates**), before framing a new query. The `case:` pointer is still recorded first, the destination chooses the pack layout, the core never names the directory, and the register row never receives SQL statements or result tables. This is symptom/problem register admission, not a patterns-catalog check.

This step is not destructive and never gates on file deletion.

#### 7. Close-out (two-stage: readiness gate, then authorized collapse)

Register-admission preparation starts at step 6; the approved mutation must be applied before collapse. This step only confirms that earlier mutation — it never re-admits. If approval or the destination's gated tool is missing, halt before collapse. The durable set is the durable ticket record plus the project's screenshots and validations directories (see **Working-set and record schema**), and every other cited evidence file. At close, run this order without skipping or reordering:

1. Complete posted-response synchronization: the responses section (see **Working-set and record schema**) of the durable ticket record mirrors the latest response **posted by us — our own notes only** — identified from the ticket tool's author evidence and note id; never the draft and never a third-party or requester note. An edit to a selected note updates its matching response block rather than appending a duplicate. Missing authorship is reported, never inferred.
2. Run the validator script (see **Validator script**) with `<ticket-folder> --pre-close`. This mode is read-only and requires: exactly one durable ticket record; the complete project analysis working set (state + step files; see **Working-set and record schema** — nothing missing, nothing unexpected); the project's response-draft file; the project's screenshots and validations directories (non-image evidence artifacts live under the ticket's session `validations/` directory, never the ticket root); a completed `synthesize` phase; every machine-addressable `path:` citation in the ticket record spelled ticket-folder-relative (the project's screenshot path spelling; see **Screenshot naming convention**) and resolving to an existing file inside the ticket folder; and valid identification/register consistency. Abort on any non-zero exit.
3. Semantic confirmation — the validator never claims this ground: confirm the earlier register admission completed (the case pointer, plus an identification-pack pointer or a diagnostic-sidecar pointer when applicable); every executed query from the investigate-step artifact (see **Working-set and record templates**) is preserved verbatim in the durable ticket record or a cited validations artifact (see the retention rule in the investigate template — **Working-set and record templates**); every non-local-path evidence citation (prose/backtick references) resolves to real evidence; every artifact under the session `validations/` directory is accounted for as either durably cited in `ticket_<id>.md` or intentionally uncited with an evidenced reason (no evidence is deleted to satisfy readiness); and record content/completeness gates pass. Require coordinator-accepted finished producer/consumer results (investigation, synthesis, screenshots, drafting, posted-response synchronization, retention and register admission as applicable) and observed cessation of every active user's access to the working files before collapse. Allocate the collapse writer explicitly; directory deletion conflicts with descendant access. Any relevant change invalidates readiness and requires current validation/acceptance again.
4. Obtain the exact close-out authorization phrase (see **Working-set and record schema**).
5. Remove the analysis working-set state file, every analysis step file, and the project's response-draft file (see **Working-set and record schema**) — nothing else.
6. Run the validator script (see **Validator script**) with `<ticket-folder> --close-out` and require exit 0. If it fails after collapse, halt without deleting anything further: the durable ticket record, the screenshots and validations directories, and every cited durable evidence file are never deleted to satisfy a validator.

### Optional verifier route (investigate step)

The investigate step documents an optional, incident-only verifier route. It is off by default; the manual per-hypothesis query path is unchanged and remains the default.

- The `query-verification` skill validates an incident-owned, sidecar-defined SQL verifier against an invocation-time query root and evaluates the destination-owned adapter's normalized output offline. The core never executes the query, holds credentials, or invokes the adapter.
- Exactly one adapter execution consumes exactly one existing Query-budget slot. The default Query-budget limit is 6 (exhausted when used equals limit); halt-and-ask at that point unless the user already raised the denominator. Never write used greater than limit; never write `14/6`. The `Same-query-reruns` cap of 2 and the normal per-hypothesis query path are unchanged; no new header field, counter, or budget is introduced.
- The redacted case-evidence record is written under the ticket's existing session-specific validations folder (see **Working-set and record schema**) with the verifier ID as the filename stem.
- The analysis and ticket evidence record only the verifier ID, the three-state verdict, the source/definition/evidence digests, and the redacted case-evidence path. Credentials, raw adapter output, rendered SQL, rendered parameter values, and unredacted configured identifiers are never retained.
- A `verified` verdict is symptom evidence only; it never establishes root-cause equivalence or authorizes a fix.

The normative contract lives in the `query-verification` skill and its protocol reference (see **Working-set and record templates**); the optional block and the synthesis restriction live in the investigate and synthesize templates (see **Working-set and record templates**).

### Post-write self-verification loop

Run immediately after scaffolding, before each step-header advance, and after every advance. Iterate until a full pass finds zero violations:

1. **Re-read** the written set: the analysis working-set state file, each written analysis step file (see **Working-set and record schema**), and the ticket folder structure.
2. **Mechanical pass** — immediately after scaffolding, run the validator script (see **Validator script**) with `<analysis-dir> --scaffold`; it verifies the header plus the copied step structure while later template bodies remain intentional. Before advancing completed step `NAME`, run the validator script (see **Validator script**) with `<analysis-dir> --step NAME`; a completed step must contain no unfilled tokens. After the header advances, reserve default full validation — the validator script with `<analysis-dir>` — for all completed steps through the header. Fix anything it reports.
3. **Analysis pass** — re-read each file against the consistency checklist (see **Working-set and record templates**): at scaffold time, verify the identify-step artifact's `Pre` has this ticket's context while later template bodies intentionally remain unfilled; after completion, verify no completed step has unfilled tokens. In every mode, verify header values match evidence (`SLA-due`, the identification-verdict field vs the register match, kill-switch counters reflect actual consumption), folder structure complete (the project's screenshots directory, validations directory, ticket record, and response-draft file; see **Working-set and record schema**), and the project's screenshot naming convention. Never invent a value to satisfy a check — stop and ask.
4. **Repeat** until a clean pass, then report the pass count.
5. **Cap (S-07):** after 3 iterations, or the same violation persisting twice unchanged, stop-and-ask instead of looping.

The validator script is a helper, not the authority — it catches repetitive mechanical drift; semantic correctness is the analysis pass.

### Examples

**Example 1 — new casuistic, no register match**

- User says: `#191700`
- Ticket: system X, module Y, region Z, period P; error matches `S-02`
- Register: no incident `P-NNN` for `S-02` + system X + module Y (register empty)
- Verdict: `identification_verdict: no_match`
- Result: analysis working set scaffolded (see **Working-set and record schema**); validator exits 0; Cipher 🔓 (Lead Orchestrator) dispatches Investigator 🔍 (Incident Investigator) to frame hypotheses.
- After the root cause is confirmed: Scribe ✍️ (Docs & Problems Manager) prepares the draft and does not wait for close-out authorization. After exact `approved` / `aprobado`, Cipher 🔓 (Lead Orchestrator) applies the gated mutation. Collapse still waits for close-out authorization.

**Example 2 — structural match**

- User says: `#191800`
- Ticket: system W, module V, region U, period T; error matches `S-03`
- Register: one `candidate` incident `P-NNN` on `Symptom` + `System` + `Module`; discriminators partially evidenced
- Verdict: `identification_verdict: structural` — cited source: the project's problem register (see **Register paths**) (P-NNN)
- Result: analysis working set scaffolded (see **Working-set and record schema**); Investigator 🔍 (Incident Investigator) validates the inherited hypothesis against the current ticket.

**Example 3 — exact match**

- User says: `#191900`
- Register: exactly one `active` incident `P-NNN` with `Allow_exact: yes`; every discriminator already evidenced in the ticket
- Verdict: `identification_verdict: exact` — cited source: the project's problem register (see **Register paths**) (P-NNN)
- Result: analysis working set scaffolded (see **Working-set and record schema**); Cipher 🔓 (Lead Orchestrator) dispatches the recorded fix path through the normal approval flow.

**Example 4 — non-production coordination walkthrough (not execution proof)**

- After an accepted `no_match`, two supporting evidence instances read distinct frozen documents and return separately attributed reports; neither writes working state, frames hypotheses or executes queries. The single investigate owner accepts no evidence until coordinator review and executes only the coordinator-chosen hypothesis; on rejection it returns without auto-pivoting to H2 or H3.
- Given Query-budget `2/6`, one observed verifier adapter execution yields `3/6`; a transfer preserves `3/6`, hypothesis outstanding and rerun values unchanged. A second state writer is rejected, not given another six slots.
- A finished investigator return with a still-active browser session does not permit session transfer; missing cessation evidence blocks that access. A stale producer report or active working-file consumer blocks collapse despite a clean validator and must be resolved before `Close out now`.

### Troubleshooting

**Ownership, freshness or capacity unknown:**
- Cause: conflicting assignments, stale reviewed input, an active prior user or undeclared external capacity; the recent-update warning is not a lock.
- Fix: halt the affected operation and return `BLOCKED` to Cipher 🔓 (Lead Orchestrator) with observed resource use, inputs and bounded options. Resume only on explicit compatible assignment with accepted current evidence and observed prior-user cessation; never infer permission from ten minutes elapsing.

**Analysis template missing:**
- Cause: the analysis template directory (see **Working-set and record templates**) does not exist in this skill.
- Fix: halt; report to Cipher 🔓 (Lead Orchestrator) — the template precondition is not met. Do not scaffold manually.

**Validator exits non-zero:**
- Cause: missing or malformed header field in the analysis state file (see **Working-set and record schema**), or a malformed step file.
- Fix: read the exact error line; edit only the offending field; re-run the validator.

**Empty problem register:**
- Cause: no incident `P-NNN` rows are registered yet.
- Fix: none — this is the valid `no_match` case. Scaffold the working analysis and proceed without halting.

**Ticket system auth error on read:**
- Cause: tool token expired.
- Fix: the ticket-read tool triggers the auth-refresh routine internally. If still failing after refresh, halt and report to Cipher 🔓 (Lead Orchestrator).

**Knowledge search unavailable:**
- Cause: the knowledge-search tool is not reachable.
- Fix: do not block — knowledge search is a backfill source, never a verdict source. Skip it and proceed with the register-first identification.

### Working-set and record templates

Ticket-runbook templates and references:

- Analysis template directory: `references/analysis/` (`state.md`, `01-identify.md`, `02-investigate.md`, `03-synthesize.md`)
- Ticket record template: `references/ticket-template.md`
- Response-draft template: `references/response-draft-template.md`
- Consistency checklist: `references/_consistency-checklist.md`
- Verifier protocol: `.opencode/skills/query-verification/SKILL.md` and `.opencode/skills/query-verification/references/protocol-v1.md`

### Working-set and record schema

- Per-ticket analysis working set: the `analysis/` subfolder containing `state.md`, `01-identify.md`, `02-investigate.md`, `03-synthesize.md`.
- Ticket folder artifacts: `screenshots/`, `validations/`, the ephemeral `response-draft.md`, and the durable `ticket_<id>.md` record.
- Ticket-record response section: `## Responses`.
- Close-out authorization phrase: `Close out now`.
<!-- core:end -->

<!-- project:begin -->
## Project extensions

### Register paths

- Symptom register: `knowledge/symptoms.md` (rows `S-xx`).
- Problem register: `knowledge/problems.md` (rows `P-NNN`; `Team: incident`; `case:` / `pack:` / `diagnostic:` pointers).

### Validator script

This project's ticket-runbook validator script is `python3 .opencode/skills/ticket-runbook/scripts/validate_runbook.py`.

### Screenshot naming convention

This project has not declared a screenshot naming convention or required filename prefix. Per the core rules, ask the user for the project's required prefix (and the screenshots-directory spelling) at first use of the screenshots directory, then record it here. Until a prefix is declared: never use a forbidden initial name (`image1.png`, `screenshot.png`, or any non-descriptive default), and spell every `path:` citation ticket-folder-relative as the image-location rule requires.

<!-- project:end -->
