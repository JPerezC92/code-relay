"""Tests for parity between verification checkboxes and discovered phases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import PHASE_AWARE_PLAN  # noqa: E402


class ValidatePlanVerificationParityTests:
    def test_verification_parity_valid_passes(self) -> None:
        assert vp.check_verification_parity(PHASE_AWARE_PLAN, 2) == []

    def test_verification_parity_mismatch_flagged(self) -> None:
        assert vp.check_verification_parity(PHASE_AWARE_PLAN, 1) == [
            "VERIFICATION-PARITY: ## Verification has 2 checkbox(es) but the "
            "plan has 1 phase file(s)"
        ]

    def test_verification_parity_counts_completed_bullets(self) -> None:
        plan = PHASE_AWARE_PLAN.replace("- ⬜ two", "- ✅ two", 1)
        assert vp.check_verification_parity(plan, 2) == []
