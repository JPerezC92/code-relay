"""Application layer: plan-validation use cases.

Composes the IO reader (infrastructure) with the pure rules (domain) and keeps
the validator's print/exit contract.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

from plan_validate_pkg.domain.rules import (
    check_phase_snapshot,
    check_plan_snapshot,
    validate_plan_snapshot,
)
from plan_validate_pkg.infrastructure.reader import (
    check_plan_file,
    check_story_index,
    load_phase_snapshots,
    load_plan_snapshot,
)


def validate_plan_dir(plan_dir: str, stories_dir: Optional[str]) -> int:
    base = Path(plan_dir)
    violations: list[str] = []

    plan_path = base / "plan.md"
    plan_snapshot = load_plan_snapshot(plan_path)
    phase_snapshots = load_phase_snapshots(base)

    if plan_snapshot is None:
        violations.extend(check_plan_file(plan_path))
    else:
        violations.extend(check_plan_snapshot(plan_snapshot))
        violations.extend(validate_plan_snapshot(plan_snapshot, phase_snapshots))

    for phase_snapshot in phase_snapshots:
        violations.extend(check_phase_snapshot(phase_snapshot))

    if stories_dir:
        violations.extend(check_story_index(stories_dir))

    if violations:
        for v in violations:
            print(v, file=sys.stderr)
        return 1

    print(f"ok  plan: {plan_dir}  phases: {len(phase_snapshots)}")
    return 0


def validate_single_file(plan_file: str) -> int:
    violations = check_plan_file(Path(plan_file))
    if violations:
        for v in violations:
            print(v, file=sys.stderr)
        return 1
    print(f"ok  single-file plan: {plan_file}")
    return 0
