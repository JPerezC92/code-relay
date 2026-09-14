# Diagnostic Symptom Catalog

This catalog is the fixed, durable index of error-signature classes shared by incident and dev work; each class carries the matching signals used by identification, the canonical diagnostic, and the fix routing.

## Symptom classes

| ID | Symptom / error signature | Required signals | Exclusions | Canonical diagnostic | Canonical fix routing |
|---|---|---|---|---|---|
| S-01 | Version-support mismatch — "does not support X on Y", "unsupported platform/OS", "requires version >= Z" | an explicit version or platform support statement ("does not support", "unsupported", "requires version", "minimum version") | generic failure with no version/platform reference; a named binary reported absent (S-02) | check the current tool version + release notes/platform support | upgrade to a supported version, then re-verify |
| S-02 | Missing prerequisite/binary — "Executable doesn't exist", "command not found" | a named binary or path reported absent ("executable doesn't exist", "command not found", "no such file") | an existing binary rejected by version (S-01) or by permission (S-06) | locate the expected binary, check install state | install the prerequisite |
| S-03 | Config mismatch — alias/resolution errors, unknown rule, conflicting config | a configuration, alias, resolution, or rule conflict named in the error | an absent config file (S-02); a network transport failure (S-05) | diff config vs the source of truth | align config to the source of truth |
| S-04 | Supply-chain / dependency health — dead package, advisory, peer conflict | a dependency-health signal (audit advisory, end-of-life package, peer conflict) | a version-support mismatch for a maintained product (S-01); a download failure (S-05) | dependency audit (Warden 🔒 (Dependency Warden) gate in projects that ship the roster) | substitute a maintained package through the dependency gate |
| S-05 | Network / download — slow CDN, timeout, 403, proxy | a network transport failure (timeout, 403, proxy, CDN) | a named binary reported absent after a successful download (S-02); a proxy configuration error (S-03) | connectivity + artifact size + alternate hosts | one bounded retry; escalate to the user if repeated |
| S-06 | Environment / OS — unsupported OS, missing system libs, permission denies | an OS, system-library, or permission condition | an explicit tool version-support mismatch (S-01) | OS version + product support matrix + permission gates | version upgrade first; else environment-appropriate solution; else ask the user |
| S-07 | Process / behavioral — operation failed 2x, long-running grind | the same operation has failed at least twice, or a bounded operation grinds without completing | a single first failure (classify by its own signature first) | reassess the approach itself | STOP, present options to the user |

## Matching rules

- IDs are durable and immutable: an `S-xx` is never deleted, renumbered, or reused. New classes are appended with approval.
- A class matches only when every **Required signal** is present in the ticket text; any **Exclusion** present disqualifies the class even when the required signals are present.
- Only this catalog matches a symptom class. Ticket archives, patterns registers, KBA/RCA catalogs, and knowledge search are evidence/backfill sources — they never match a class and never issue an identification verdict.
- Every record in `knowledge/problems.md` MUST reference >=1 class here.
- Routing is canonical — no workaround before the canonical diagnostic runs (version-first and stop-and-ask per `knowledge/agents.md`).

## Register

Filed instances live in `knowledge/problems.md`.
