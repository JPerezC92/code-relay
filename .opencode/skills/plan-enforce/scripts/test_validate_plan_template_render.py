"""Regression tests: a rendered plan-enforce template validates clean."""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import write_fixture  # noqa: E402

_REFERENCES = Path(__file__).resolve().parent.parent / "references"
_ANGLE_TOKEN_RE = re.compile(r"<[^>]+>")
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def _render_template(name: str) -> str:
    """Render a template: drop author comments and fill every placeholder."""
    text = (_REFERENCES / name).read_text(encoding="utf-8")
    text = _HTML_COMMENT_RE.sub("", text)
    text = _ANGLE_TOKEN_RE.sub("filled", text)
    return text.replace("YYYY-MM-DD", "2026-01-01")


class ValidatePlanTemplateRenderTests:
    def test_rendered_base_plan_template_validates_clean(self, tmp_path: Path) -> None:
        plan = write_fixture(tmp_path, "plan.md", _render_template("_template.md"))
        assert vp.check_plan_file(plan) == []

    def test_rendered_programming_plan_template_validates_clean(
        self, tmp_path: Path
    ) -> None:
        plan = write_fixture(
            tmp_path, "plan.md", _render_template("_template-programming.md")
        )
        assert vp.check_plan_file(plan) == []

    def test_rendered_phase_template_validates_clean(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path, "phase-01-x.md", _render_template("_phase-template.md")
        )
        assert vp.check_phase_file(phase) == []
