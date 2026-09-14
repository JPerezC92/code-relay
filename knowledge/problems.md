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
- **Evidence** — command output, log excerpt, or file:line
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
