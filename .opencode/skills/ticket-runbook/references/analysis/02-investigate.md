# Investigate — Ticket <ID>

> ⚠️ **STOP — Cipher 🔓 (Lead Orchestrator) dispatch only.** This step Owner is Investigator 🔍 (Incident Investigator) (see `AGENTS.md` § Roster). Cipher 🔓 (Lead Orchestrator) MUST dispatch the Investigator — do NOT execute Steps inline.

> **Owner:** Investigator 🔍 (Incident Investigator)
> **Pre:** `01-identify.md` exists with a non-`pending` `identification_verdict`; `Phase` is `identify`; the coordinator has accepted identification and its current input/output identities and gates, observed the prior user's resource-use cessation, and explicitly assigned this investigate instance.
> **Reads:** `01-identify.md`; `state.md`; the ticket; `knowledge/problems.md` (the cited `P-NNN` row, if any); for the optional verifier route, `.opencode/skills/query-verification/SKILL.md` and `.opencode/skills/query-verification/references/protocol-v1.md`
> **Writes:** `02-investigate.md` (filled); updates `state.md` (`Phase`, kill-switch counters, `Updated`); optionally writes the redacted case-evidence record under the ticket's session-specific `validations/` folder

## Coordination assignment and handoff

Record workflow/ticket, task/instance, accepted predecessor/input identities, exact writes/other access, allocated destinations, required gates, continuation/join owner and capacity/accounting owner in existing Markdown or the dispatch. Cipher 🔓 (Lead Orchestrator) owns authoritative incident accounting; this assigned investigate instance alone writes state/counters and its step artifact. Durable retention writes require their own exact assignment or an accepted handoff to their authorized writer; this template's retention obligation is not an implicit write grant.

Supporting instances return bounded, separately attributed evidence on frozen compatible inputs; they never write state/counters, frame competing hypotheses or execute incident queries. One incident hypothesis allowance and one Query-budget remain shared, not cloned per instance. Allocate each screenshot/report and verifier-ID-stemmed evidence destination before work; a fixed canonical path stays exclusively owned/serialized. Declare adapter, browser/auth-session and external capacity access separately; unknown isolation/capacity blocks that operation. Preserve stored pack→diagnostic precedence and H1→H2→H3 order even when supporting evidence reads run concurrently. Execute one query for the coordinator-chosen hypothesis. On rejection, return to Cipher 🔓 (Lead Orchestrator); do not auto-pivot to H2 or H3. The next hypothesis proceeds only after Cipher 🔓 (Lead Orchestrator) accepts that return and explicitly dispatches it. Existing allowances stay unchanged.

Accept current relevant supporting results through the coordinator before consuming them. Return actual input/output identities, query/hypothesis/rerun values, gates and observed resource-use status; stale, incomplete or still-mutating results cannot unblock synthesis. Only the coordinator accepts the join and explicitly transfers ownership after prior access ceases. A completed return or old timestamp is not cessation proof; no transfer resets budgets.

## Steps

1. Branch on `identification_verdict`:
   - `exact` — record the cited `P-NNN`, restate its evidenced discriminators, and confirm the recorded root cause and fix still apply to the current ticket. No fresh hypothesis framing.
   - `structural` — restate the one inherited hypothesis from the cited `P-NNN`. If the row's Evidence carries a `pack:` pointer, resolve that destination-relative pack path FIRST: read the pack with destination tools and replay that correlation with current-ticket keys under destination-owned execution (the core never executes or parses the pack internals). Only then frame a new query — and only if the pack replay is rejected, inapplicable, or inconclusive. If the row instead (or also) carries a `diagnostic:` pointer, resolve that destination-relative sidecar path next: validate the adjacent SQL/sidecar pair with `<python> .opencode/skills/query-verification/scripts/query_verification.py validate --query-root <sidecar-parent-dir> --sidecar <sidecar-path>`, let the destination-owned adapter bind current-ticket values (consumes one existing Query-budget slot), and evaluate the normalized output. Only then frame a new query — and only if the stored diagnostic is rejected, inapplicable, `not_verified`, or `inconclusive`. If the row has neither pointer, validate the hypothesis with adapted queries as before.
   - `no_match` — frame ≤3 evidence-backed hypotheses (H1 most likely). Each hypothesis MUST have: statement, partial evidence, refutation criteria, and a proposed validation query. Do not suggest skills by name.
2. Execute one query for the coordinator-chosen hypothesis, preserving H1→H2→H3 order and the existing hypothesis, Query-budget and same-query-rerun allowances. Before that query: check `Query-budget` — if used equals the current limit, stop and report budget exhausted (default limit 6; halt-and-ask unless the user already raised the denominator). On rejection, return to Cipher 🔓 (Lead Orchestrator) with the reason; do not auto-pivot to H2 or H3. The next hypothesis proceeds only after Cipher 🔓 (Lead Orchestrator) accepts that return and explicitly dispatches it.
3. After each query: write the result verbatim (exact counts, exact timestamps, exact field values). No paraphrase. Set `Confirmed: yes | no | inconclusive` for each hypothesis.
4. After each same-query re-run (identical query re-executed): increment `Same-query-reruns`. If it reaches 2, stop re-running; flag in output.
5. Write `02-investigate.md`: one block per hypothesis with Query / Result (verbatim) / Confirmed.
6. As sole writer, update `state.md` from actual consumption: decrement `Hypotheses-outstanding` per resolved hypothesis; update `Query-budget` as `used/limit`; update `Same-query-reruns`. Record each executed query's consumption once, including actual adapter executions even when their result is inconclusive; do not invent consumption for unexecuted work. Do not run validation or any shell command; owning `state.md` grants no command. Return the written state for Cipher 🔓 (Lead Orchestrator) to run analysis-directory validation. Ledger 📒 (Record Keeper) retains ticket-record validation after record edits. Defer `Phase: investigate`, `Updated: <now>` until Step 7 and the step gates are complete, Cipher's analysis-directory validation passes and the coordinator accepts current relevant results/gates. Return for parent-controlled acceptance/continuation rather than assuming a callback or self-dispatch.
7. **Retention (before any collapse):** Every executed query block — manual `Query:` blocks, pack-replay evidence, and verifier-routed evidence alike — must be preserved verbatim in the durable ticket record: copy each block into `ticket_<ID>.md` (Analysis section) or a cited artifact under `validations/` before close-out collapse deletes this file. Non-image case-evidence artifacts are written under the ticket's session `validations/` folder — never the ticket root — and before close-out every artifact under `validations/` must be durably cited in `ticket_<ID>.md` or intentionally uncited with an evidenced reason; no artifact is deleted to satisfy readiness. Collapse is the deletion step; the durable copy is the retention mechanism. A reusable `pack:` pointer is an extra durable pointer, not a substitute for verbatim ticket retention: every executed query block from the pack replay still copies into `ticket_<ID>.md` or a cited `validations/` artifact. Only the confirming reusable query is additionally promoted to a verifier pair at the destination project's declared query-storage path.

## Optional verifier route (query-verification pilot)

> Optional and incident-only. The manual per-hypothesis query path in Steps 1–6 is unchanged and remains the default. Use this route only when the hypothesis has an incident-owned verifier sidecar and the destination-owned adapter is available.

1. Validate the verifier before any execution. The core skill never executes SQL:
    `<python> .opencode/skills/query-verification/scripts/query_verification.py validate --query-root ./sql --sidecar ./sql/checks/example-amount.verifier.yaml`
   On non-zero exit, stop — the verifier is rejected and the destination-owned adapter MUST NOT execute it.
2. Hand the validated sidecar to the destination-owned adapter. The adapter binds the declared named parameters, executes the read-only query, and returns normalized JSON. The core does not execute the query, hold credentials, or invoke the adapter.
3. Evaluate the normalized output locally and write the redacted case evidence:
    `<python> .opencode/skills/query-verification/scripts/query_verification.py evaluate --sidecar ./sql/checks/example-amount.verifier.yaml --adapter-output ./validations/session/adapter-output.json --evidence ./validations/session/example-amount.evidence.json`
4. Record the verifier-evidence block below and update `state.md` as in Step 6.

**Query-budget accounting:** exactly one adapter execution consumes exactly one existing Query-budget slot. The default limit is 6 (exhausted when used equals limit). Raise the denominator only with user authorization; never write used greater than limit; never write `14/6`. The `Same-query-reruns` cap of 2 and the normal per-hypothesis query path are unchanged. No new counter, budget, or header field is introduced.

**Non-verifier queries:** any query not run through the verifier route keeps the required verbatim `Query:` / `Result (verbatim)` evidence from Steps 2 and 4.

**Evidence retention:** the redacted case-evidence record is written under the ticket's existing session-specific `validations/` folder with the verifier ID as the filename stem. Credentials, raw adapter output, rendered SQL, rendered parameter values, and unredacted configured identifiers MUST NOT appear in `02-investigate.md`, `state.md`, or the ticket record — only the verifier ID, the three-state verdict, the source/definition/evidence digests, and the redacted case-evidence path are recorded.

## Output

- **Artifact:** `02-investigate.md` (filled).
- **Schema:** one block per hypothesis — `Query:` (exact SQL/document query), `Result:` (verbatim), `Confirmed: yes|no|inconclusive`. Plus kill-switch status summary at bottom. When the optional verifier route is used, also add a verifier-evidence block (verifier ID, three-state verdict, source/definition/evidence digests, redacted case-evidence path).
- **Handoff:** task/instance, accepted inputs and stable output identities, separately attributed supporting results, actual shared counter values, retention destinations/writer acceptance, validator/gate evidence and resource-use cessation status; coordinator acceptance precedes synthesis.

## Investigation results

### H1 — <title>
- **Statement:** The problem could be <X>
- **Partial evidence:** <what supports this>
- **Refutation criteria:** <what single result would rule it out>
- **Query:** `<exact query>`
- **Result (verbatim):** <exact counts, timestamps, field values>
- **Confirmed:** yes / no / inconclusive

### H2 — <title>
- **Statement:** The problem could be <X>
- **Partial evidence:** <what supports this>
- **Refutation criteria:** <what single result would rule it out>
- **Query:** `<exact query>`
- **Result (verbatim):** <exact counts, timestamps, field values>
- **Confirmed:** yes / no / inconclusive

### H3 — <title>
- **Statement:** The problem could be <X>
- **Partial evidence:** <what supports this>
- **Refutation criteria:** <what single result would rule it out>
- **Query:** `<exact query>`
- **Result (verbatim):** <exact counts, timestamps, field values>
- **Confirmed:** yes / no / inconclusive

## Kill-switch summary

| Kill-switch | Budget | Consumed | Status |
|---|---|---|---|
| Query-budget (used/limit) | 6 | <fill> | <ok / exhausted> |
| Same-query-reruns | 2 | <fill> | <ok / limit reached> |
| Hypotheses-outstanding | 3 | <fill> | <fill> remaining |

## Verifier evidence (optional)

> Include this block only when the optional verifier route was used; omit it entirely otherwise. A `verified` verdict is symptom evidence only — it does not establish root-cause equivalence or authorize a fix.

- **Hypothesis:** H1 | H2 | H3
- **Verifier ID:** the validated verifier `id`
- **Verdict:** verified | not_verified | inconclusive
- **Source digest:** the `sha256:` digest of the evaluated source bytes
- **Definition digest:** the `sha256:` digest of the sidecar bytes
- **Evidence digest:** the deterministic `sha256:` digest of the redacted record
- **Redacted case evidence:** the session `validations/` path to the verifier-ID-stemmed `.evidence.json`

## Gate

- ⬜ `exact` and `structural` cite the `P-NNN` inherited from `01-identify.md`; `no_match` frames ≤3 hypotheses
- ⬜ Each hypothesis has a Confirmed verdict
- ⬜ `Query-budget` in `state.md` is used/limit and used is less than or equal to the current limit (default 6)
- ⬜ `Same-query-reruns` counter does not exceed 2
- ⬜ All result values are verbatim — no paraphrase, no rounding
- ⬜ If the optional verifier route was used: the verifier-evidence block records the verifier ID, one of the three verdicts, the source/definition/evidence digests, and the redacted case-evidence path
- ⬜ The verifier route consumed exactly one Query-budget slot; the default Query-budget limit of 6, `Same-query-reruns`, and the manual per-hypothesis path are unchanged
- ⬜ A verifier verdict is recorded as symptom evidence only — not as root-cause proof or fix authorization
- ⬜ Every executed query block has a durable verbatim copy in `ticket_<ID>.md` or a cited `validations/` artifact
- ⬜ One authorized state/counter writer; actual consumption recorded once under coordinator accounting; supporting workers receive no duplicate allowance or concurrent query/hypothesis authority
- ⬜ Current relevant outputs/gates accepted and prior access cessation observed before writer transfer; reports/screenshots/validation files and external sessions have compatible allocated ownership

## Abort conditions

- `Query-budget` used equals the current limit with no confirmed hypothesis → halt-and-ask (unless the user already raised the denominator); return to Cipher 🔓 (Lead Orchestrator) with a budget-exhausted signal.
- `Same-query-reruns` reaches 2 → cease re-running; report to Cipher 🔓 (Lead Orchestrator).
- Cannot frame even one evidence-backed hypothesis → halt with an "insufficient data" finding. Do not invent hypotheses.
- Halt if the optional verifier route would require a state-header schema change, a query-budget increase, ticket data migration, or automatic query execution.
- Halt if a verifier verdict would be represented as root-cause proof or a user-authorized fix.
- Conflicting resources, stale inputs/results, unknown external capacity or missing handoff evidence → return `BLOCKED` before the affected operation; no scope expansion or worker question-tool call.
