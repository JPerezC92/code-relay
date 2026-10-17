"""Tests for the absence of process, network, and dynamic-SQL surfaces."""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _query_verification_testkit import (  # noqa: E402
    SCRIPTS_DIR,
    _FORBIDDEN_SCRIPT_PATTERNS,
)


class QueryVerificationExecutionSurfaceTests:
    def test_pilot_scripts_have_no_execution_surfaces(self, tmp_path: Path) -> None:
        source_scripts = sorted(
            path
            for path in SCRIPTS_DIR.glob("*.py")
            if not path.name.startswith("test_")
        )
        assert source_scripts, "expected a production pilot script"
        snapshots: list[Path] = []
        for source_path in source_scripts:
            snapshot = tmp_path / source_path.name
            snapshot.write_text(
                source_path.read_text(encoding="utf-8"), encoding="utf-8"
            )
            snapshots.append(snapshot)
        for path in snapshots:
            source = path.read_text(encoding="utf-8")
            for pattern in _FORBIDDEN_SCRIPT_PATTERNS:
                assert re.search(pattern, source) is None, (
                    f"{path.name} matches forbidden pattern {pattern!r}"
                )
