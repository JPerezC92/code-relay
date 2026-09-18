# Known Problem Pattern Register

Chronological, evidence-backed recurring problem patterns shared by incident and dev work. Each row is a child instance of a symptom class in `knowledge/symptoms.md`; when a row references several classes, the primary symptom class comes first.

## Entry format

One row per record; columns exactly `ID | Date | Team | Symptom | System | Module | Problem | Discriminators | Exclusions | Evidence | Root cause | Lifecycle | Allow_exact | Status`:

- **ID** — `P-NNN` (durable — never renumbered or reused)
- **Date** — when the problem was first confirmed
- **Team** — `incident` | `dev` (mandatory discriminator)
- **Symptom** — >=1 S-xx refs from `knowledge/symptoms.md`, comma-separated, primary first (e.g. `S-05, S-07`)
- **System** — system the problem belongs to
- **Module** — module / component / package / tool the problem belongs to
- **Problem** — one-liner
- **Discriminators** — `field=value` signals that must all be evidenced for an `exact` match
- **Exclusions** — conditions that disqualify a match even when the discriminators align
- **Evidence** — at least one durable `case:<durable-ticket-path>` pointer (repo-relative ticket-record path); optionally `pack:<destination-relative-pack-path>` for a reusable identification pack — a multi-statement or multi-result correlation stored at the destination's declared path — and optionally `diagnostic:<destination-relative-sidecar-path>` when a reusable one-row confirming query exists. The `diagnostic:` sidecar and its adjacent parameterized `.sql` source must exist and follow query-verification protocol-v1; a `pack:` is not a verifier and is never evaluated by `query_verification.py`. AICore never defines the destination directory. Register rows carry pointers only — never SQL statements or result tables.
- **Root cause** — the actual cause, not the symptom
- **Lifecycle** — `candidate | active | mitigated | resolved | retired` (see below)
- **Allow_exact** — `yes | no`; the per-record gate for an `exact` verdict
- **Status** — `open | closed` (open = still under analysis or awaiting a confirming case; closed = no further action)

## Lifecycle

| Lifecycle | Meaning | Eligible verdict |
|---|---|---|
| `candidate` | First confirmed case. | `structural` only |
| `active` | A second independent confirmed case confirmed the pattern. | `structural`; `exact` only when `Allow_exact: yes` and every discriminator is already evidenced in the current ticket |
| `mitigated` | A fix is in place but the problem may recur. | `structural` only |
| `resolved` | Confirmed fixed; retained for history. | none — never matched |
| `retired` | Permanently removed from matching. | none — never matched |

**Admission:** the first confirmed case admits a row as `candidate`; a `candidate` row is never an `exact` match. A second independent confirmed case may promote a `candidate` to `active`, which makes it eligible for `exact` when `Allow_exact: yes`.

**Operational gate:** admission runs via the ticket-runbook register-admission step when the root cause is confirmed — before destructive collapse, never waiting for `Close out now`. Admission requires the durable `case:` pointer and never blocks on a reusable `pack:` or `diagnostic:`. If a reusable confirming query exists but the destination has no declared storage path, ask for the destination-relative path, then record the `diagnostic:` pointer beside its adjacent SQL source. If the proof path is a reusable identification pack (a multi-statement or multi-result correlation) and the destination has not declared storage, ask for the destination-relative path and record `pack:` with it; the destination chooses the pack layout, AICore never names the directory, and a register row never receives SQL statements or result tables.

Only `Team: incident` rows participate in incident identification.

## Rules

- Every row MUST reference >=1 existing S-xx from `knowledge/symptoms.md`.
- Team MUST be `incident` or `dev`.
- Evidence-backed only — no rows without cited evidence.
- Duplicates merge into the existing row, never re-filed.
- **An empty register is valid.** With no incident rows, identification returns `no_match` and the investigation proceeds normally — never halt on an empty register.
- This register is destination-seeded — ships empty.

## Register

| ID | Date | Team | Symptom | System | Module | Problem | Discriminators | Exclusions | Evidence | Root cause | Lifecycle | Allow_exact | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

(no entries yet — an empty register is valid and identifies as `no_match`)
