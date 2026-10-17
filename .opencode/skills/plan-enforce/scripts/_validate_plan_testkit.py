"""Shared plan and phase fixture builders for focused validator tests."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402


VALID_PLAN = """# Plan — sample

> **Status:** active
> **Started:** 2026-08-20 18:37
> **Subject:** sample plan
> **Layout:** subfolder pattern

## Context

- Prompted by: test

## Goals

- ⬜ **G1:** sample goal

## Current state

| Area | Current file / behavior | Evidence |
|---|---|---|
| sample | sample | sample |

## Phase index — dispatch table

| # | Phase | Owner | Runbook | Output | Goals |
|---|---|---|---|---|---|
| 1 | sample | Vault (Catalog Steward) | `phase-01-owner.md` | sample | G1 |

## Write/delete manifest

| Action | Path |
|---|---|

## Critical files / tools

-

## Verification

- ⬜ sample

## Out of scope

-
"""

VALID_PHASE = """# Phase 1 — sample

> **Owner:** Vault (Catalog Steward)
> **Pre:** ready.
> **Reads:** none.
> **Writes:** none.

## Steps

1. do it

## Output

- **Artifact:** `x`

## Verify commands

| Executor | Command |
|---|---|
| Test Executor | `python3 sample.py` |

## Gate

- ⬜ done

## Abort conditions

- halt if broken
"""

AUDIT_PENDING = """## Audit

- Auditor: not yet run
- Verdict: [PENDING]
- Findings: 0
- Date: set when the independent audit runs
"""

AUDIT_PASS = """## Audit

- Auditor: Sentinel (Quality Guardian)
- Verdict: [PASS]
- Findings: 0
- Date: 2026-09-15
"""

AUDIT_FAIL = """## Audit

- Auditor: Sentinel (Quality Guardian)
- Verdict: [FAIL]
- Findings: 2
- Date: 2026-09-15
"""

AUDIT_UNKNOWN = """## Audit

- Auditor: Sentinel (Quality Guardian)
- Verdict: [MAYBE]
- Findings: 0
- Date: 2026-09-15
"""

PHASE_AWARE_PLAN = """# Plan — sample

> **Status:** active
> **Started:** 2026-08-20 18:37
> **Subject:** sample plan
> **Layout:** subfolder pattern

## Context

- Prompted by: test

## Goals

- ⬜ **G1:** sample goal
- ⬜ **G2:** second goal

## Current state

| Area | Current file / behavior | Evidence |
|---|---|---|
| sample | sample | sample |

## Phase index — dispatch table

| # | Phase | Owner | Runbook | Output | Goals |
|---|---|---|---|---|---|
| 1 | one | Owner | `phase-01-owner.md` | out one | G1 |
| 2 | two | Owner | `phase-02-owner.md` | out two | G2 |

## Write/delete manifest

| Action | Path |
|---|---|
| Modify | `src/a.py` |
| Modify | `src/b.py` |

## Critical files / tools

-

## Verification

- ⬜ one
- ⬜ two

## Out of scope

-
"""

PHASE_ONE = VALID_PHASE.replace("> **Writes:** none.", "> **Writes:** `src/a.py`.")
PHASE_TWO = VALID_PHASE.replace("> **Writes:** none.", "> **Writes:** `src/b.py`.")


def write_fixture(root: Path, name: str, content: str) -> Path:
    """Write UTF-8 fixture content under the provided pytest temporary root."""
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def phase_snapshot(name: str, content: str) -> vp.PhaseSnapshot:
    """Build a loaded phase snapshot for pure validator checks."""
    return {"name": name, "content": content}
