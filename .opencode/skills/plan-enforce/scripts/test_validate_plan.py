"""Tests for validate_plan.py — proves the mechanical validator catches each
violation class and passes a well-formed plan.

Run: python3 .opencode/skills/plan-enforce/scripts/test_validate_plan.py
"""

import contextlib
import io
import sys
import tempfile
import unittest
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


class ValidatePlanTests(unittest.TestCase):
    def _write(self, d: str, name: str, content: str) -> Path:
        p = Path(d) / name
        p.write_text(content, encoding="utf-8")
        return p

    def test_valid_subfolder_passes(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(d, "plan.md", VALID_PLAN)
            self._write(d, "phase-01-owner.md", VALID_PHASE)
            self.assertEqual(vp.check_plan_file(Path(d) / "plan.md"), [])
            self.assertEqual(vp.check_phase_file(Path(d) / "phase-01-owner.md"), [])

    def test_valid_single_file_passes(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(d, "plan.md", VALID_PLAN)
            self.assertEqual(vp.check_plan_file(p), [])

    def test_validate_plan_dir_valid_fixture_outputs_success(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(d, "plan.md", VALID_PLAN)
            self._write(d, "phase-01-owner.md", VALID_PHASE)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                result = vp.validate_plan_dir(d, stories_dir=None)

            self.assertEqual(result, 0)
            self.assertEqual(stdout.getvalue(), f"ok  plan: {d}  phases: 1\n")

    def test_validate_plan_dir_missing_plan_outputs_exact_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = vp.validate_plan_dir(d, stories_dir=None)

            self.assertEqual(result, 1)
            self.assertEqual(
                stderr.getvalue(), f"MISSING-FILE: {Path(d) / 'plan.md'} not found\n"
            )

    def test_validate_plan_dir_unfilled_date_outputs_exact_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(
                d,
                "plan.md",
                VALID_PLAN.replace("2026-08-20 18:37", "YYYY-MM-DD"),
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = vp.validate_plan_dir(d, stories_dir=None)

            self.assertEqual(result, 1)
            self.assertEqual(stderr.getvalue(), "UNFILLED-TOKEN: YYYY-MM-DD\n")

    def test_validate_single_file_valid_fixture_outputs_success(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            plan_file = self._write(d, "plan.md", VALID_PLAN)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                result = vp.validate_single_file(str(plan_file))

            self.assertEqual(result, 0)
            self.assertEqual(
                stdout.getvalue(), f"ok  single-file plan: {plan_file}\n"
            )

    def test_validate_single_file_invalid_fixture_outputs_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            plan_file = self._write(
                d,
                "plan.md",
                VALID_PLAN.replace("> **Status:** active", "> **Status:** bogus"),
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = vp.validate_single_file(str(plan_file))

            self.assertEqual(result, 1)
            self.assertEqual(
                stderr.getvalue(),
                "STATUS: Status value 'bogus' not in allowed set "
                "(['active', 'completed'])\n",
            )

    def test_missing_phase_file_returns_exact_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            phase_file = Path(d) / "phase-01-owner.md"
            self.assertEqual(
                vp.check_phase_file(phase_file),
                [f"MISSING-FILE: {phase_file} not found"],
            )

    def test_validate_plan_dir_missing_story_index_outputs_exact_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(d, "plan.md", VALID_PLAN)
            stories_dir = Path(d) / "user-stories"
            stories_dir.mkdir()
            self._write(
                str(stories_dir),
                "my-feature.md",
                "# User story — my-feature\n\n> **Status:** active\n",
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = vp.validate_plan_dir(d, stories_dir=str(stories_dir))

            self.assertEqual(result, 1)
            self.assertEqual(
                stderr.getvalue(),
                f"MISSING-INDEX: {stories_dir / 'index.md'} not found but story files exist\n",
            )

    def test_validate_plan_dir_story_status_mismatch_outputs_exact_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(d, "plan.md", VALID_PLAN)
            stories_dir = Path(d) / "user-stories"
            stories_dir.mkdir()
            self._write(
                str(stories_dir),
                "index.md",
                "# User stories\n\n| Slug | Status |\n|---|---|\n| my-feature | completed |\n",
            )
            self._write(
                str(stories_dir),
                "my-feature.md",
                "# User story — my-feature\n\n> **Status:** active\n",
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                result = vp.validate_plan_dir(d, stories_dir=str(stories_dir))

            self.assertEqual(result, 1)
            self.assertEqual(
                stderr.getvalue(),
                "INDEX-MISMATCH: story `my-feature` Status 'active' not mirrored "
                "in index.md\n",
            )

    def test_bad_status_flagged(self) -> None:
        bad = VALID_PLAN.replace("> **Status:** active", "> **Status:** bogus")
        meta = vp.parse_plan_metadata(bad)
        self.assertEqual(
            vp.check_status(meta),
            ["STATUS: Status value 'bogus' not in allowed set (['active', 'completed'])"],
        )

    def test_completed_requires_line(self) -> None:
        bad = VALID_PLAN.replace("> **Status:** active", "> **Status:** completed")
        meta = vp.parse_plan_metadata(bad)
        self.assertEqual(
            vp.check_completed_line(meta),
            ["COMPLETED-LINE: Status is completed but no `Completed:` line in metadata"],
        )

    def test_missing_section_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Verification", "## Not Verification")
        self.assertEqual(
            vp.check_required_sections(bad),
            ["MISSING-SECTION: plan.md is missing ## Verification"],
        )

    def test_missing_body_alternative_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Current state", "## Something Else")
        self.assertEqual(
            vp.check_required_sections(bad),
            [
                "MISSING-SECTION: plan.md is missing one of "
                "## Body / ## Current state"
            ],
        )

    def test_unfilled_angle_token_flagged(self) -> None:
        bad = VALID_PLAN.replace("- Prompted by: test", "- Prompted by: <task subject>")
        self.assertEqual(vp.check_placeholders(bad), ["UNFILLED-TOKEN: <task subject>"])

    def test_unfilled_tbd_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Out of scope\n\n-", "## Out of scope\n\n- TBD")
        self.assertEqual(vp.check_placeholders(bad), ["UNFILLED-TOKEN: TBD"])

    def test_stray_comment_flagged(self) -> None:
        bad = VALID_PLAN.replace("## Goals", "<!-- fixture comment -->\n## Goals")
        self.assertEqual(vp.check_placeholders(bad), ["STRAY-COMMENT: <!-- ... -->"])

    def test_multiline_comment_masks_placeholders_but_not_real_tokens(self) -> None:
        content = "<!-- fixture comment\n<ignored-placeholder>\n-->\n<real-placeholder>"
        self.assertEqual(
            vp.check_placeholders(content),
            [
                "STRAY-COMMENT: <!-- ... -->",
                "UNFILLED-TOKEN: <real-placeholder>",
            ],
        )

    def test_missing_phase_section_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(d, "phase-01-x.md", VALID_PHASE.replace("## Gate", "## Not Gate"))
            self.assertEqual(
                vp.check_phase_file(p),
                ["MISSING-SECTION: phase-01-x.md is missing ## Gate"],
            )

    def test_missing_phase_label_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(d, "phase-01-x.md", VALID_PHASE.replace("> **Owner:**", "> **NotOwner:**"))
            self.assertEqual(
                vp.check_phase_file(p),
                ["MISSING-LABEL: phase-01-x.md is missing **Owner:**"],
            )

    def test_valid_phase_verify_table_passes(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(d, "phase-01-x.md", VALID_PHASE)
            self.assertEqual(vp.check_phase_file(p), [])

    def test_missing_verify_commands_section_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace("## Verify commands", "## Not Verify"),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                [
                    "MISSING-SECTION: phase-01-x.md is missing ## Verify commands",
                    "VERIFY-TABLE: phase-01-x.md is missing the ## Verify commands section",
                ],
            )

    def test_verify_table_absent_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace(
                    "| Executor | Command |\n"
                    "|---|---|\n"
                    "| Test Executor | `python3 sample.py` |\n",
                    "",
                ),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                ["VERIFY-TABLE: phase-01-x.md has no Executor/Command table"],
            )

    def test_verify_table_wrong_header_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace("| Executor | Command |", "| Runner | Command |"),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                [
                    "VERIFY-TABLE: phase-01-x.md table header must be exactly "
                    "`Executor` then `Command`"
                ],
            )

    def test_verify_table_extra_column_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace(
                    "| Executor | Command |", "| Executor | Command | Notes |"
                ),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                [
                    "VERIFY-TABLE: phase-01-x.md table header must be exactly "
                    "`Executor` then `Command`"
                ],
            )

    def test_verify_table_header_only_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace(
                    "| Test Executor | `python3 sample.py` |\n", ""
                ),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                ["VERIFY-TABLE: phase-01-x.md table has no data rows"],
            )

    def test_verify_table_empty_executor_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace(
                    "| Test Executor | `python3 sample.py` |",
                    "|  | `python3 sample.py` |",
                ),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                ["VERIFY-TABLE: phase-01-x.md data row 1 has an empty `Executor` cell"],
            )

    def test_verify_table_empty_command_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = self._write(
                d,
                "phase-01-x.md",
                VALID_PHASE.replace(
                    "| Test Executor | `python3 sample.py` |",
                    "| Test Executor |  |",
                ),
            )
            self.assertEqual(
                vp.check_phase_file(p),
                ["VERIFY-TABLE: phase-01-x.md data row 1 has an empty `Command` cell"],
            )

    def test_index_missing_slug_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            self._write(d, "index.md", "# Index\n\n| Title | Status |\n|---|---|\n| other | active |\n")
            self._write(d, "my-feature.md", "# User story — my-feature\n\n> **Status:** active\n")
            findings = vp.check_story_index(d)
            self.assertEqual(
                findings,
                ["INDEX-MISSING: story slug `my-feature` not listed in index.md"],
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
