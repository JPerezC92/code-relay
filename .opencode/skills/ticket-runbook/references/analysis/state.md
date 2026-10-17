---
Phase: "identify"
SLA-due: "YYYY-MM-DDTHH:MM"
Updated: "YYYY-MM-DDTHH:MM"
Hypotheses-outstanding: "3/3"
Query-budget: "0/6"
identification_verdict: "pending"
Same-query-reruns: "0/2"
---
<!-- Query-budget is used/limit, default 6; exhausted when used equals limit. -->
<!-- identification_verdict valid values:
     pending    — set at scaffold; the identify step replaces it
     exact      — exactly one active incident P-NNN with allow_exact: yes and every discriminator already evidenced
     structural — exactly one candidate or active incident P-NNN; its hypothesis still needs current-ticket validation
     no_match   — no eligible incident P-NNN (an empty register always yields no_match)
-->

# Working analysis — Ticket <ID>

> State header for the incident analysis flow. Only the current coordinator-authorized step instance writes this file and its counters. This file and the other `analysis/*.md` files are removed at close-out after the ticket record and cited evidence are verified and all working-file users have ceased access.

## Coordination and authoritative ownership

Record the actual assignment in this Markdown body or its dispatch: workflow/ticket, task/instance, role/responsibility, accepted predecessor results and input identities, exact writes/other access, allocated destinations, required gates, continuation/join owner, capacity allocation and accounting owner. Keep exactly the seven YAML fields above and the four-file analysis working set; supporting reports add no analysis artifact.

Cipher 🔓 (Lead Orchestrator) is the single authoritative coordinator and incident-budget accounting owner. The currently authorized step instance is the sole state/counter writer, not an independent allowance owner. Supporting instances return bounded attributed evidence to separately allocated destinations; they never update this header or the budget table. Registers, canonical reports/screenshots, validation artifacts, durable records, response drafts, browser/auth sessions and external capacity require separately compatible assignments.

For each handoff, record the outgoing/incoming instance, accepted inputs/outputs and gates, actual counter snapshot and observed resource-use cessation. The coordinator accepts finished results and explicitly transfers ownership only after prior access ceases; no transfer resets consumption or multiplies allowances. Keep inputs stable for review and invalidate affected evidence after relevant changes. A required checkpoint returns `AWAITING_REVIEW`; a missing boundary/input returns `BLOCKED`; neither authorizes a transition.

## Step index

| Step | File | Owner | Status |
|---|---|---|---|
| identify | `01-identify.md` | Cipher 🔓 (Lead Orchestrator) | ⬜ |
| investigate | `02-investigate.md` | Investigator 🔍 (Incident Investigator) | ⬜ |
| synthesize | `03-synthesize.md` | Cipher 🔓 (Lead Orchestrator) | ⬜ |
| respond | `response-draft.md` | Quill 🪶 (Note Drafter) | ⬜ |

## Kill-switch status

| Kill-switch | Budget | Consumed | Remaining |
|---|---|---|---|
| Hypotheses | 3 | 0 | 3 |
| Queries | 6 | 0 | 6 |
| Same-query reruns | 2 | 0 | 2 |
| SLA warn at | 75% | — | — |

`Hypotheses-outstanding` starts `3/3` and decrements per resolved hypothesis; no concurrent competing hypotheses. `Query-budget` is used/current-authorized-limit, initially `0/6`; record actual query consumption once, including one slot per actual verifier adapter execution. Exhaustion is used = limit; raise the denominator only with user authorization before further execution and never write used > limit or `14/6`. `Same-query-reruns` starts `0/2`; increment per identical rerun and stop reruns at 2. Transfer all three unchanged except for evidenced consumption; keep this table consistent with the header. Queries remain sequential H1→H2→H3.

> **Warn-if-recent rule:** If `Updated` is within the last 10 minutes AND `Phase` matches the step an agent is about to execute — halt and report: "state.md was updated less than 10 minutes ago. Another session may be active. Verify before proceeding."

This is an alert, not a lock, lease or proof of isolation. Neither an older timestamp, a stop request, a timeout nor a completed return proves cessation. Verify ownership with the coordinator even without a warning. Advance `Phase` only after the completed-step validator, all applicable gates and coordinator acceptance of current relevant results; collapse additionally requires no active working-file user and exact `Close out now` authorization.
