"""Tests for parsing and validating register-first identification evidence."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import _register, _row  # noqa: E402


class ValidateRunbookRegisterFirstTests:
    def test_parse_problem_register_empty(self) -> None:
        content = (
            "## Register\n\n"
            "| ID | Date | Team | Symptom | System | Module | Problem | "
            "Discriminators | Exclusions | Evidence | Root cause | Lifecycle | "
            "Allow_exact | Status |\n"
            "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n\n"
            "(no entries yet)"
        )
        assert vr.parse_problem_register(content) == []

    def test_parse_problem_register_rows(self) -> None:
        row = _row(
            id="P-001",
            date="2026-01-01",
            team="incident",
            symptom="S-05, S-07",
            system="sys",
            module="mod",
            problem="slow CDN",
            discriminators="host=cdn-a",
            exclusions="host=cdn-b",
            evidence="log:42",
            root_cause="cache miss",
            lifecycle="candidate",
            allow_exact="no",
            status="open",
        )
        rows = vr.parse_problem_register(_register(row))
        assert len(rows) == 1
        assert rows[0]["id"] == "P-001"
        assert rows[0]["team"] == "incident"
        assert rows[0]["symptom"] == "S-05, S-07"
        assert rows[0]["lifecycle"] == "candidate"
        assert rows[0]["allow_exact"] == "no"

    def test_register_schema_rejects_bad_lifecycle(self) -> None:
        row = _row(
            id="P-001",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="bogus",
            allow_exact="no",
            status="open",
        )
        violations = vr.check_register_rows(_register(row))
        assert any("REGISTER-3" in item for item in violations), violations

    def test_register_schema_rejects_bad_column_count(self) -> None:
        content = "## Register\n\n| P-001 | 2026-01-01 | incident |\n"
        violations = vr.check_register_rows(content)
        assert any("REGISTER-1" in item for item in violations), violations

    def test_empty_register_verdict_no_match_ok(self) -> None:
        assert vr.check_identification_consistency("no_match", [], []) == []

    def test_empty_register_verdict_exact_rejected(self) -> None:
        violations = vr.check_identification_consistency("exact", ["P-001"], [])
        assert any("VERDICT-4" in item for item in violations), violations

    def test_exact_requires_cited_p_nnn(self) -> None:
        assert vr.check_identification_consistency("exact", [], []) == [
            "VERDICT-3: exact requires a cited incident P-NNN"
        ]

    def test_exact_requires_active_and_allow_exact(self) -> None:
        candidate = _row(
            id="P-001",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="candidate",
            allow_exact="no",
            status="open",
        )
        violations = vr.check_identification_consistency(
            "exact", ["P-001"], vr.parse_problem_register(_register(candidate))
        )
        assert any("VERDICT-6" in item for item in violations), violations
        assert any("VERDICT-7" in item for item in violations), violations
        active = _row(
            id="P-002",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="active",
            allow_exact="yes",
            status="open",
        )
        assert vr.check_identification_consistency(
            "exact", ["P-002"], vr.parse_problem_register(_register(active))
        ) == []

    def test_structural_requires_candidate_or_active(self) -> None:
        mitigated = _row(
            id="P-001",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="mitigated",
            allow_exact="no",
            status="open",
        )
        violations = vr.check_identification_consistency(
            "structural", ["P-001"], vr.parse_problem_register(_register(mitigated))
        )
        assert any("VERDICT-8" in item for item in violations), violations
        candidate = _row(
            id="P-002",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="candidate",
            allow_exact="no",
            status="open",
        )
        assert vr.check_identification_consistency(
            "structural", ["P-002"], vr.parse_problem_register(_register(candidate))
        ) == []

    def test_no_match_rejects_cited_p_nnn(self) -> None:
        active = _row(
            id="P-001",
            date="2026-01-01",
            team="incident",
            symptom="S-05",
            lifecycle="active",
            allow_exact="yes",
            status="open",
        )
        violations = vr.check_identification_consistency(
            "no_match", ["P-001"], vr.parse_problem_register(_register(active))
        )
        assert violations == [
            "VERDICT-2: no_match must not cite a P-NNN (cited: ['P-001'])"
        ]

    def test_parse_ticket_record(self) -> None:
        content = (
            "---\n"
            "symptom_ids: [S-05, S-07]\n"
            "known_problem_ids: [P-001]\n"
            "identification_verdict: structural\n"
            "---\n\n# ticket\n"
        )
        record = vr.parse_ticket_record(content, "ticket_1.md")
        assert record["symptom_ids"] == ["S-05", "S-07"]
        assert record["known_problem_ids"] == ["P-001"]
        assert record["identification_verdict"] == "structural"
