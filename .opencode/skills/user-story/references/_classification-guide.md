# User story — classification guide

> How to decide what belongs in a feature contract. The checklist states what a conforming
> story looks like; this guide is the decision procedure for getting there. Owned by the
> `user-story` skill.
>
> Provenance: distilled from requirements-engineering practice (ISO/IEC/IEEE 29148 lineage,
> Wiegers & Beatty *Software Requirements*, the requirement-vs-design-constraint debate),
> canonical user-story literature (Jeffries' 3Cs, Wake's INVEST, Cockburn's "token promising a
> conversation"), and BDD observability discipline (Cucumber's declarative-style guidance,
> Example Mapping). Where sources disagree, the disagreement is recorded below rather than
> smoothed over.

## What this artefact actually is

This repository's `user-stories/*.md` are **durable feature contracts**, not XP story cards.

Classic XP is explicit that a story is *"not an explicit contract for features; rather, details
will be co-created… A good story captures the essence, not the details"* (Wake, INVEST,
2003) and that the card is *"just enough text to identify the requirement… a token"*
(Jeffries, Card/Conversation/Confirmation, 2001). The skill deliberately treats the story as a
**requirements specification with acceptance criteria and completion reconciliation**. That is
a defensible choice for a governance tool — but it means requirements-engineering discipline
applies more than story-card advice.

Two consequences:

- Do not try to satisfy "keep it short / negotiable / one index card". That guidance describes a
  different artefact.
- Do apply the requirement / design-constraint / implementation distinction below. That is
  exactly where these files were failing.

## The nine categories

Every item you are tempted to write into a story belongs to exactly one of these.

| # | Category | In the story? | Where |
|---|---|---|---|
| 1 | **Story core** — real actor + need + observable goal | Yes | `## Persona` / `## Goal` / `## Scenario` |
| 2 | **Acceptance rule + observable example** | Yes | `## Acceptance criteria` |
| 3 | **External contract clause** — a surface a consumer relies on | Yes | `## Acceptance criteria`, phrased as the promise |
| 4 | **Quality criterion** — measurable threshold + method | Yes, if operationalized | `## Acceptance criteria` |
| 5 | **Design constraint** — pre-decided restriction + rationale | Yes, labelled | `## Constraints` |
| 6 | **Implementation detail** — internal structure or mechanism | No | the code |
| 7 | **Delivery plan** — tasks, sequence, phases, estimates | No | `plans/` |
| 8 | **Verification method** — tests, commands, evidence pointers | No | `## Proof`, or the plan |
| 9 | **Open question / unagreed assumption** | No | see "Open questions" below |

## Decision procedure

First determine ownership using **Shared versus project-owned content** below. The
categories classify an item's meaning; they do not independently authorize distribution.

Run every candidate item through these. Stop at the first decisive answer.

1. **Who observes it?** An end user, a consuming developer, an operator, an auditor, an adversary?
   No real observer → not story behaviour.
2. **Is pass/fail decidable at a boundary** — CLI output, file bytes, API response, screen, ops
   log — without reading code or internal state? No → move out.
3. **Will this wording change if the implementation changes?** Yes → reframe as behaviour or move
   to design. *(Cucumber's litmus; the single highest-yield test.)*
4. **Consumer promise or internal mechanism?** Promise → contract clause (category 3).
   Mechanism → design (category 6).
5. **Was it pre-decided regardless of behaviour** — a chosen technology, a chosen structure, a
   chosen policy? → `## Constraints` with `— because <reason>`. Never dress a pre-decision as
   "the system shall…" behaviour.
6. **Is it measurable with threshold, window, and method?** Yes → quality criterion (category 4).
   No → open question.
7. **Does it describe how or when work happens?** → `plans/`.
8. **Is it a vertical, stakeholder-recognizable slice?** Layer-shaped or inventory-shaped →
   re-slice, or type it honestly as enabling work.
9. **Enabler/technical work:** name the real stakeholder and a demonstrable outcome, or state
   plainly that it is enabling scope. Never invent a persona to satisfy a template.
10. **Is anything unagreed or unanswered?** → open question, never an acceptance criterion.

## Shared versus project-owned content

Classify semantically, not by file location, heading, framework name, or phrases such as
"this project". A concrete shared workflow interpretation remains shared; a genuine
local selection, requirement, grant, run, or record is project-owned.

| Content | Ownership / treatment |
|---|---|
| Reusable approved behavioural contract | Shared story core: H1/shared metadata, Persona, Goal, Scenario, criteria plus shared marks, portable Proof, Constraints; one contiguous region through Constraints |
| Source-only feature contract | Retain in the source catalogue; do not clear it or copy its row merely because other stories ship |
| Genuine project-specific requirement | Project-owned content, subject to existing ownership/collision/approval review; cannot replace or weaken the shared baseline |
| Shared criterion's completion mark | Core alongside its promise; means evidenced shared delivery, not a verification run at each destination |
| Resolvable portable proving path and section/symbol | One canonical Proof entry for the criterion in core; identify a future target as pending/unverified |
| Actual source/local run, dated audit verdict, operational grant or release observation | Project-owned Local evidence or history, keyed to existing AC ids where useful; not universal Proof or a second shared-status table |
| Local approval record or approved revision awaiting matching history | Project-owned Revision tracking, outside feature Change log and shipped core; not delivery evidence |
| Feature delivery history and actual release events | Project-owned bounded Change log with real matching anchors; never a shared requirement |
| Story catalogue | One project-owned index of actual shared and local files, not a transported copy of the source index |

For a proposed shared revision, preserve unchanged criterion identities and account for
changed/retired promises, Proof, and dependencies under the consistency checklist.
Review current evidence before retaining marks; neither approval nor synchronization
proves implementation or destination checks. Destinations never edit inherited core.

Distinguish **required behavioural dependencies** from historical mentions, Proof/tool
references, and common affected areas. Only the former require an available compatible
contract before delivery. A source-local mention cannot silently impose an adopter
requirement. If a required promise is unavailable, report the blocker; do not import a
source-only story by implication or invent a portable proof target.

On adoption, reconcile displaced duplicate contracts/metadata and retain genuine local
evidence/history. Initialize empty local history without a fabricated receipt event;
reconcile the destination's index rather than shipping the source catalogue. Follow the
checklist's destination procedure and the supported `core-sync` enrollment path.

## Hard cases and where they belong

These are the ones that look like leakage but are not — and the ones that look like contract but are.

| Item | Belongs | Why |
|---|---|---|
| **CLI exit codes** | `## Acceptance criteria` (category 3) | A developer-user observes them at the process boundary. `exit 2 = malformed` is a promise. |
| **Marker / schema spellings** (`<!-- core:begin -->`, `mode: merge`) | `## Acceptance criteria` (category 3) | Another tool parses them. The spelling *is* the interface. |
| **Public API shape** (names, semantics, error model) | `## Acceptance criteria` (category 3) | Consumers code against it. Versioning/evolution policy → `## Constraints`. |
| **File-layout contracts** consumed by external tools | `## Acceptance criteria` (category 3) | Repo-internal layout with no external consumer → design detail. |
| **Error messages** that users see or machines parse | `## Acceptance criteria` (category 3) | Prefer category/stability rules over exact strings. Cosmetic wording → design. |
| **Security boundaries** (read-only, no credentials, redaction) | `## Acceptance criteria` (category 2/3) | Observable outcomes: rejected input, no data retained, audit event emitted. Algorithm choices → `## Constraints`. |
| **Performance SLOs** | `## Acceptance criteria` (category 4) | Only once operationalized: threshold + window + measurement method. Org-wide SLOs belong in a linked quality spec, not copied per story. |
| **Architecture-as-contract** (`execute()`, layering, plugin surface) | `## Acceptance criteria` when it *is* the deliverable | Extension points consumers code against are contract. Internal architecture → `## Constraints` or a design doc. |
| **Type/function names, module paths, test class names** | `## Proof` | They churn on refactor. Never in criterion text. |
| **File inventories** ("these 40 test files exist") | nowhere | Derivable from the tree and churns on every addition. The promise is the *behaviour*, not the list. |
| **Checkpoint SHAs, version pins, "former X superseded by Y"** | `## Change log` or git history | Delivery history, not feature contract. |
| **Runtime-spec version numbers** | only if the version *is* the requirement | Otherwise they churn every bump. |
| **Phases, grants, executors, scheduling** | `plans/` | Delivery mechanics. |

## The requirement vs design-constraint disagreement

Requirements engineering does not agree on where this line falls, and it is worth knowing you
are choosing a side:

- The **externally-observable school** holds that requirements specifying *"internal
  architecture, design, implementation, or testing decisions are probably constraints"* and
  belong in a Constraints section.
- The **contrasting school** holds that *"a constraint limits design alternatives, whereas a
  requirement specifies design characteristics"* — and that user-invisible interfaces can still
  be requirements.

Ralph (2012, *Requirements Engineering* 18(3)) names the failure mode directly: requirements
can be *"an illusion created by misrepresenting design decisions as requirements."*

This repository takes a **hybrid**, which is why categories 3 and 5 both exist:

- A pre-decided restriction is a **constraint** (`## Constraints`, with rationale) regardless of
  observability.
- A relied-on interface — even one no end user sees — is a **contract clause** and stays in
  `## Acceptance criteria`, phrased as the promise, with its proof moved out.

## Open questions

Unagreed items currently have no home in the template. Two acceptable treatments:

- Hold them in the discussion and do not persist them until agreed.
- If the user approves a conditional promise, state that agreed condition explicitly; keep
  unanswered discussion outside the approved contract. Record a truthful revision in the
  matching delivery's change-log entry, or pending local Revision tracking during approved
  staged persistence. Never invent a delivery entry to house an open question.

Do **not** write an unanswered question as an acceptance criterion. Example Mapping calls these
red cards for a reason: they are not promises.

## Persona for technical work

No source mandates an end-user persona. Under IEEE 610.12 / BABOK a stakeholder is anyone
affected — a consuming developer, SRE, or maintainer is a legitimate actor. SAFe formalizes
non-user work as **enabler stories** (*"Enabler stories outline the necessary work of
exploration, architecture, infrastructure, and compliance"*). Classic XP instead pressures
technical work toward demonstrable customer value (Wake: *"Valuable"* means valuable to the
customer; a full database layer *"has little value to the customer"*).

Both reject **fictional** users. Name the real actor, or state plainly that the work is enabling
scope.

## Gaps in the source guidance

Recorded so they are not rediscovered:

- ISO/IEC/IEEE 29148:2018 is paywalled; its design-constraint definition and shall/should clause
  are unverified here. Do not cite clause numbers from this guide.
- Wiegers, Cohn *User Stories Applied*, Patton *User Story Mapping*, and Adzic *Specification by
  Example* were consulted via publisher/author pages and citations, not read in full.
- There is no dedicated published guidance for writing stories about API/SDK/CLI/infrastructure
  work. The enabler-story and stakeholder-inclusive persona positions are the best available.
- Classic XP says a story is not a contract. This repository deliberately uses one as a contract.
  Judge these files against that intent, not against INVEST.
