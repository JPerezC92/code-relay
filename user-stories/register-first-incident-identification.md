<!-- core:begin -->
# User story — register-first-incident-identification

> **Created:** 2026-09-12
> **Title:** Register-first incident identification
> **Status:** active
> **version:** 1.2.0
> **Epic:** incident-diagnostics
> **Affected areas:** `.opencode/skills/ticket-runbook/`, `knowledge/symptoms.md`, `knowledge/problems.md`, `knowledge/agents.md`, `.opencode/agents/investigator.md`, `.opencode/agents/ledger.md`, `.opencode/agents/quill.md`, `.opencode/agents/scribe.md`

## Persona

- Cipher 🔓 (Lead Orchestrator) starting a new incident analysis, who must identify a known problem without scanning RAG, ticket archives, or KBA/RCA as matchers.

## Goal

- **G:** Normal incident identification is deterministic: ticket signal → symptom class → known problem → `exact` | `structural` | `no_match`; an explicit scaffold-only invocation prepares the same working set without starting identification or investigation.
  - Done when: normal identification against an empty problem register yields `no_match` and a full investigation; exact/structural require a cited problem identifier; scaffold-only invocation returns a validated bounded working set with identification pending; an evidence-backed register draft receives exact `approved` / `aprobado` authorization before gated mutation; a non-destructive pre-close gate ignores instructional comment examples but validates active citations; semantic close-out selects our own posted responses and accounts for every evidence artifact before authorized collapse; post-collapse validation leaves one durable ticket record plus local and remote image locations.

## Scenario

- A new incident arrives. In normal mode, Cipher 🔓 (Lead Orchestrator) runs `ticket-runbook`; the skill classifies a symptom, matches at most one known problem, and writes the working analysis. When root cause is confirmed, Scribe ✍️ (Docs & Problems Manager) prepares the register-admission draft immediately; after exact `approved` / `aprobado` user approval, Cipher 🔓 (Lead Orchestrator) applies it through the destination's gated tool before collapse. At close, Ledger 📒 (Record Keeper) runs the non-destructive pre-close gate, confirms the earlier register mutation plus query/evidence/content retention, obtains the exact `Close out now` authorization, removes only the working analysis markdown and the response draft, then runs the post-collapse validator over the ticket record and cited evidence.
- The user wants to guide analysis and invokes `ticket-runbook ID scaffold`: the working set, durable record, response draft, and evidence directories are prepared from evidenced context, validated, and returned with identification pending. No identification, hypotheses, incident queries, or investigation dispatch starts automatically.
- A third-party note follows our own posted response: archive synchronization selects our latest applicable own response using evidenced authorship and note identity, not the latest arbitrary note. An edit updates the matching response record.
- A ticket contains non-image evidence and instructional comment examples: evidence is placed in the session validation area; every artifact is cited or durably accounted for as intentionally uncited before collapse. Comment examples do not become real citations, and active missing or unsafe citations still fail.

## Acceptance criteria

- ✅ **AC1:** An empty problem register is a valid state and produces a `no_match` verdict rather than halting the workflow.
- ✅ **AC2:** `exact` and `structural` verdicts cite an existing problem identifier; archives, patterns, knowledge-base articles, and knowledge search cannot issue those verdicts.
- ✅ **AC3:** A problem entry is admitted as `candidate` on the first confirmed case and may be promoted to `active` only after a second independent confirmed case.
- ✅ **AC4:** Working analysis is a bounded working set of a state file and three ordered analysis steps — identify, investigate, synthesize — and nothing else.
- ✅ **AC5:** Close-out retains one durable ticket record plus its screenshots, validations, and other cited evidence; each used image records a local path and a remote URL when both exist.
- ✅ **AC6:** Close-out runs two ordered stages: a read-only pre-close gate, then an authorized collapse. The gate requires exactly one ticket record, the complete working set and response draft, durable directories, every machine-addressable citation, and consistent identification/register state. Semantic review then confirms prior register admission and all other cited evidence before the explicit collapse authorization. Both validator modes are read-only; the separately authorized collapse performs the documented working-file deletion.
- ✅ **AC7:** Image citations in a ticket record are ticket-folder-relative and resolve inside the ticket folder; repository-relative spellings and parent-directory escapes are rejected at both close-out stages.
- ✅ **AC8:** Optional query verification remains symptom evidence only and consumes one existing query-budget slot on the investigate step.
- ✅ **AC9:** Register admission is prepared before destructive collapse and does not wait for the collapse authorization; a missing admission workflow or gated tool halts the operation.
- ✅ **AC10:** Every executed investigation query survives collapse verbatim in the ticket record or a cited validation artifact; a reusable confirming query is optionally persisted as SQL plus an adjacent sidecar referenced from Evidence.
- ✅ **AC11:** When the proof path is a reusable identification pack, Evidence records a pointer to a destination-relative pack path rather than inlining SQL or result tables in the registers, and a later structural match follows that pointer before framing a new query.
- ✅ **AC12:** Fill-token and citation scanning ignore instructional HTML comments, so commented-out example tokens and paths do not cause unfilled-token or missing-citation failures; active content remains subject to the applicable validation checks.
- ✅ **AC13:** Placeholders inside documented command examples do not fail step validation; genuine unfilled output tokens still fail until filled.
- ✅ **AC14:** Query-budget enforcement compares used slots to the declared denominator rather than a fixed default; the scaffold default remains six.
- ✅ **AC15:** A scaffold-only invocation returns a validated bounded working set with truthful context and pending identification, without identification, hypothesis work, incident-query execution, or investigation dispatch.
- ✅ **AC16:** Durable responses select only our own posted notes using tool-evidenced authorship; third-party notes never replace them, and editing a selected note updates its matching record instead of creating a duplicate. Missing authorship is reported rather than inferred.
- ✅ **AC17:** Non-image case evidence is placed in the ticket's session validation area; before collapse every artifact is durably cited or explicitly accounted for as intentionally uncited with an evidenced reason, and no evidence is deleted to satisfy readiness.

## Proof

- AC1 → `knowledge/problems.md` `## Rules` · `.opencode/skills/ticket-runbook/SKILL.md` `#### 2. Identify — register-first` verdict table · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_register_first.py` `test_empty_register_verdict_no_match_ok`
- AC2 → `knowledge/agents.md` `### Register-first identification (HARD RULE)` · `.opencode/agents/investigator.md` `### Hard Rules` verdict-source restriction · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_register_first.py` `test_exact_requires_cited_p_nnn`
- AC3 → `knowledge/problems.md` `## Lifecycle`
- AC4 → `.opencode/skills/ticket-runbook/SKILL.md` `### Working-set and record templates` · `.opencode/skills/ticket-runbook/references/analysis/state.md` and ordered analysis-step templates
- AC5 → `.opencode/skills/ticket-runbook/SKILL.md` `#### 7. Close-out (two-stage: readiness gate, then authorized collapse)` · `.opencode/agents/ledger.md` `#### Close-out collapse (two-stage contract)` · `.opencode/agents/quill.md` `### Hard Rules` image discipline/footer
- AC6 → `.opencode/skills/ticket-runbook/scripts/ticket_runbook_pkg/entry.py` `validate_pre_close` and `validate_close_out` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_pre_close.py` `ValidateRunbookPreCloseTests` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_close_out.py` `ValidateRunbookCloseOutTests`
- AC7 → `.opencode/skills/ticket-runbook/scripts/ticket_runbook_pkg/entry.py` `_resolve_ticket_path` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_paths.py` `ValidateRunbookPathCitationTests` · `.opencode/agents/ledger.md` `#### Images scope` · `.opencode/agents/quill.md` `#### Self-audit before return (CRITICAL)`
- AC8 → `.opencode/skills/ticket-runbook/SKILL.md` `### Optional verifier route (investigate step)` · `.opencode/skills/ticket-runbook/references/analysis/02-investigate.md` optional verifier route and query-budget accounting
- AC9 → `.opencode/skills/ticket-runbook/SKILL.md` register-admission and two-stage close-out workflow · `knowledge/agents.md` `### Register-first identification (HARD RULE)` proactive admission · `.opencode/agents/scribe.md` `#### Problem record management`
- AC10 → `.opencode/skills/ticket-runbook/references/analysis/02-investigate.md` Step 7 Retention · `knowledge/problems.md` `## Entry format` Evidence
- AC11 → `knowledge/problems.md` `## Entry format` Evidence and `## Lifecycle` operational gate · `knowledge/agents.md` `### Register-first identification (HARD RULE)` proactive admission · `.opencode/skills/ticket-runbook/references/analysis/02-investigate.md` Step 7 Retention
- AC12 → `.opencode/skills/ticket-runbook/scripts/ticket_runbook_pkg/domain/rules.py` `_cited_image_paths` comment stripping · `.opencode/skills/ticket-runbook/scripts/e2e/test_validate_runbook_citation_comments.py` commented-path acceptance in both close stages · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_paths.py` active missing/escaping/directory rejection · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook.py` `test_state_html_comment_is_not_unfilled_token`
- AC13 → `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_step_mode.py` `test_filled_investigate_keeps_sidecar_command_examples`, `test_unfilled_output_fill_fails_step_investigate`
- AC14 → `.opencode/skills/ticket-runbook/SKILL.md` `#### 3. Scaffold the working analysis (always)` Query-budget rule · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_header_budgets.py` `test_query_budget_compared_to_denominator` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_pre_close.py` raised/exceeded denominator cases
- AC15 → `.opencode/skills/ticket-runbook/SKILL.md` `### Arguments` second argument and `#### 1b. Mode branch — `scaffold` (user-guided)` · `.opencode/skills/ticket-runbook/references/_consistency-checklist.md` `## Validation modes` scaffold-only note · `.opencode/skills/ticket-runbook/scripts/validate_runbook.py` `--scaffold` mode
- AC16 → `.opencode/agents/ledger.md` `#### Own-authorship filter` (identity, note-id keying, ordering, missing-author stop) and `#### Incremental sync per phase` · `.opencode/skills/ticket-runbook/SKILL.md` `#### 7. Close-out (two-stage: readiness gate, then authorized collapse)` step 1 · `.opencode/skills/ticket-runbook/references/ticket-template.md` `## Responses` comment · walkthrough 2026-10-16: own n1 / third-party n2 / own n3 edit; n2 never replaces our response, the n3 edit updates its matching block, missing authorship blocks selection
- AC17 → `.opencode/skills/ticket-runbook/SKILL.md` `#### 7. Close-out (two-stage: readiness gate, then authorized collapse)` step 3 · `.opencode/skills/ticket-runbook/references/_consistency-checklist.md` `## Semantic close-out confirmation (before authorization)` · `.opencode/skills/ticket-runbook/references/analysis/02-investigate.md` `## Steps` Step 7 Retention · `.opencode/agents/ledger.md` `#### Multi-session ticket layout` and `#### Close-out collapse (two-stage contract)` Stage 1 · walkthrough 2026-10-16: q1/q3 cited and retained, q2 recorded as intentionally uncited with an evidenced reason, no deletion to satisfy readiness

## Constraints

- Identification is register-first: only the problem register can issue `exact` or `structural`, and each cites an existing problem identifier — because matching against archives or knowledge bases reintroduces the guessing the register exists to remove.
- Register growth happens before destructive collapse — because a confirmed root cause that is lost with the working set is unrecoverable.
- Both close-out validator modes are non-mutating — because a validator that writes cannot honestly serve as a gate.
- Ticket image citations use one ticket-folder-relative form — because two accepted spellings produce two resolution bugs.
- Identification packs are an Evidence pointer, not inlined diagnostic content — because the destination owns the storage layout and the registers must stay thin.
- Collapse requires an exact user authorization string — because deleting working analysis is destructive and is never implied by a readiness gate.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
