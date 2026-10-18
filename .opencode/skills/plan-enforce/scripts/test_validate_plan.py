"""Tests for structural validation of an individual plan file."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import VALID_PLAN, write_fixture  # noqa: E402


class ValidatePlanStructureTests:
    def test_valid_plan_file_passes(self, tmp_path: Path) -> None:
        plan_path = write_fixture(tmp_path, "plan.md", VALID_PLAN)
        assert vp.check_plan_file(plan_path) == []

    def test_valid_single_file_passes(self, tmp_path: Path) -> None:
        plan_path = write_fixture(tmp_path, "plan.md", VALID_PLAN)
        assert vp.check_plan_file(plan_path) == []

    def test_bad_status_flagged(self) -> None:
        bad = VALID_PLAN.replace("> **Status:** active", "> **Status:** bogus")
        meta = vp.parse_plan_metadata(bad)
        assert vp.check_status(meta) == [
            "STATUS: Status value 'bogus' not in allowed set (['active', 'completed'])"
        ]

    def test_completed_requires_line(self) -> None:
        bad = VALID_PLAN.replace("> **Status:** active", "> **Status:** completed")
        meta = vp.parse_plan_metadata(bad)
        assert vp.check_completed_line(meta) == [
            "COMPLETED-LINE: Status is completed but no `Completed:` line in metadata"
        ]

    def test_missing_section_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Verification", "## Not Verification")
        assert vp.check_required_sections(bad) == [
            "MISSING-SECTION: plan.md is missing ## Verification"
        ]

    def test_missing_body_alternative_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Current state", "## Something Else")
        assert vp.check_required_sections(bad) == [
            "MISSING-SECTION: plan.md is missing one of "
            "## Body / ## Current state"
        ]

    def test_unfilled_angle_token_flagged(self) -> None:
        bad = VALID_PLAN.replace("- Prompted by: test", "- Prompted by: <task subject>")
        assert vp.check_placeholders(bad) == ["UNFILLED-TOKEN: <task subject>"]

    def test_unfilled_tbd_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Out of scope\n\n-", "## Out of scope\n\n- TBD")
        assert vp.check_placeholders(bad) == ["UNFILLED-TOKEN: TBD"]

    def test_stray_comment_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Goals", "<!-- fixture comment -->\n## Goals")
        assert vp.check_placeholders(bad) == ["STRAY-COMMENT: <!-- ... -->"]

    def test_multiline_comment_masks_placeholders_but_not_real_tokens(self) -> None:
        content = "<!-- fixture comment\n<ignored-placeholder>\n-->\n<real-placeholder>"
        assert vp.check_placeholders(content) == [
            "STRAY-COMMENT: <!-- ... -->",
            "UNFILLED-TOKEN: <real-placeholder>",
        ]
