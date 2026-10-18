# Synthesize — Ticket <ID>

> **Owner:** Cipher 🔓 (Lead Orchestrator)
> **Pre:** `02-investigate.md` exists; ≥1 hypothesis has `Confirmed: yes` or all are `inconclusive`; `Phase` is `investigate`; the coordinator has accepted investigation's current outputs/gates and counter snapshot, observed prior resource-use cessation, and explicitly assigned this synthesis instance.
> **Reads:** `01-identify.md`; `02-investigate.md`; the escalation matrix
> **Writes:** `03-synthesize.md` (filled); updates `state.md` (`Phase`, `Updated`)

## Coordination assignment and accepted join

Record workflow/ticket, task/instance, accepted predecessor/input identities, exact writes/other access, allocated destinations, gates, continuation/join owner and capacity/accounting owner in existing Markdown or the dispatch. Cipher 🔓 (Lead Orchestrator) remains the acceptance/accounting owner; this assigned synthesis instance is sole writer of the named working files. Read stable accepted investigation and supporting results with separate attribution; do not reset or independently mutate hypothesis/query/rerun counters. New investigation needs return to the coordinator through the existing order and allowances, never parallel queries or hypotheses.

Hold outputs and dependencies stable through review; relevant changes invalidate affected evidence and joins. Return current input/output identities, actual counters, gate evidence and resource-use status for coordinator acceptance before downstream work. Supporting workers have no state-write grant. Screenshot/report destinations, response drafts, durable records, registers and browser/auth sessions retain their own exclusive resource assignments; a step return does not transfer them implicitly.

## Steps

1. Read the `02-investigate.md` verbatim results. Identify the confirmed hypothesis (or the most-supported inconclusive if no confirmation).
2. State the root cause in ≤3 bullet lines, each labeled `Fact` (direct evidence) or `Hypothesis` (partial evidence + refutation criteria cited).
3. Select the derivation path from the escalation matrix based on system + root-cause type.
4. Identify the response surface: what the visible note must convey — symptom confirmed, root cause (labeled), recommended action, derivation target. ≤15 lines total including the derivation call.
5. Write `03-synthesize.md`: root-cause block (Fact/Hypothesis labeled), derivation decision, response surface.
6. Run completed-step validation and obtain coordinator acceptance of current relevant results/gates; only then update `state.md`: `Phase: synthesize`, `Updated: <now>`, and run full validation. Preserve the accepted incident counter snapshot.

> **Verifier-evidence rule:** a `verified` verdict from the optional investigate-step verifier route is symptom evidence only. It cannot by itself establish root-cause equivalence or authorize a fix. Any root cause it supports must still be labeled `Fact` or `Hypothesis` under Step 2 and meet the same evidence bar as any other hypothesis.

## Output

- **Artifact:** `03-synthesize.md` (filled).
- **Schema:** root-cause block (≤3 bullets, each labeled Fact/Hypothesis), derivation target (named, not TBD), response surface (≤15 lines). A verifier `verified` verdict is symptom evidence only and is never represented as root-cause proof or fix authorization.
- **Handoff:** task/instance, consumed input/output identities, accepted supporting results, unchanged counter snapshot, validator/gate evidence and actual resource-use cessation status. Accept all screenshot producer results and existing local files before response drafting. Before collapse, require accepted finished producer/consumer results and no active working-file user, prior approved register mutation, durable retention, current pre-close/semantic gates and exact `Close out now` authorization; synthesis never authorizes deletion or fixes.

## Root cause

- **[Fact/Hypothesis]:** <root cause bullet 1>
- **[Fact/Hypothesis]:** <root cause bullet 2 — if needed>
- **[Fact/Hypothesis]:** <root cause bullet 3 — if needed>

## Derivation decision

- **Target:** <named from the escalation matrix>
- **Target team:** <team>
- **Rationale:** <one line from the escalation matrix>

## Response surface (≤15 lines)

<what the visible note must convey — symptom, root cause labeled, action, derivation target>

## Gate

- ⬜ Root-cause bullets present and labeled Fact or Hypothesis
- ⬜ Derivation target named (not "TBD")
- ⬜ Response surface ≤15 lines
- ⬜ A verifier `verified` verdict, if present, is treated as symptom evidence only — not as root-cause proof or fix authorization
- ⬜ Stable relevant investigation/supporting results accepted; sole writer, conserved accounting and completed-step validation confirmed before header advance
- ⬜ Screenshot files and accepted producer outputs precede drafting; downstream ownership transfers require observed prior-user cessation and explicit coordinator assignment

## Abort conditions

- All `02-investigate.md` verdicts are `inconclusive` AND no partial evidence is sufficient for a labeled hypothesis → halt; Cipher 🔓 (Lead Orchestrator) escalates without a response surface.
- Halt if a verifier verdict would be represented as root-cause proof or a user-authorized fix.
- Stale/incomplete/still-mutating predecessors, conflicting access or unobserved prior-user cessation → return `BLOCKED` before transition, transfer or collapse; do not infer acceptance or use the worker question tool.
