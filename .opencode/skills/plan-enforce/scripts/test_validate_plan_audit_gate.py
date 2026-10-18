"""Tests for the completed-plan audit gate and accepted verdict set."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import (  # noqa: E402
    AUDIT_FAIL,
    AUDIT_PASS,
    AUDIT_PENDING,
    AUDIT_UNKNOWN,
    PHASE_AWARE_PLAN,
)


class ValidatePlanAuditGateTests:
    def test_audit_gate_pending_active_passes(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN + AUDIT_PENDING, "active") == []

    def test_audit_gate_absent_on_active_passes(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN, "active") == []

    def test_audit_gate_completed_without_audit_flagged(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN, "completed") == [
            "AUDIT: completed plan is missing the ## Audit section"
        ]

    def test_audit_gate_completed_fail_flagged(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN + AUDIT_FAIL, "completed") == [
            "AUDIT: completed plan Verdict must be [PASS], found '[FAIL]'"
        ]

    def test_audit_gate_unknown_verdict_flagged(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN + AUDIT_UNKNOWN, "active") == [
            "AUDIT: Verdict '[MAYBE]' not in ['[FAIL]', '[PASS]', '[PENDING]']"
        ]

    def test_audit_gate_completed_pass_passes(self) -> None:
        assert vp.check_audit_gate(PHASE_AWARE_PLAN + AUDIT_PASS, "completed") == []
