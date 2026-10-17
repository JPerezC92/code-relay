"""Application layer: full working-analysis validation use case."""

from __future__ import annotations

from ticket_runbook_pkg.domain.rules import (
    AnalysisHeader,
    ClockPort,
    ModeFindings,
    _current_step_rank,
    check_concurrent_session,
    check_identification_verdict,
    check_kill_switches,
    check_phase,
    check_sla_clock,
    check_step_files_exist,
    check_step_files_have_required_sections,
)

__all__ = ["ValidateAnalysis"]


class ValidateAnalysis:
    """Full working-analysis validation use case for the default CLI mode."""

    def __init__(self, clock: ClockPort) -> None:
        """Store the injected clock port; the use case never reads a clock."""
        self._clock = clock

    def execute(
        self,
        header: AnalysisHeader,
        step_contents: dict[str, str],
        analysis_dir: str,
    ) -> ModeFindings:
        """Validate the header and every present step through the header's phase rank."""
        violations: list[str] = []
        warnings: list[str] = []

        violations.extend(check_phase(header))
        violations.extend(check_identification_verdict(header))

        current_rank = _current_step_rank(header)
        if current_rank is not None:
            step_violations, step_warnings = check_step_files_exist(
                step_contents, analysis_dir, current_rank
            )
            violations.extend(step_violations)
            warnings.extend(step_warnings)

        for fname, item in check_step_files_have_required_sections(
            step_contents,
            fill_token_rank_limit=current_rank if current_rank is not None else 0,
        ):
            if item.startswith("UNFILLED-TOKEN:"):
                violations.append(f"{item} in {fname}")
            else:
                violations.append(f"MISSING-SECTION: {fname} is missing {item}")

        violations.extend(check_kill_switches(header))

        now = self._clock()
        sla_warn = check_sla_clock(header, now)
        if sla_warn:
            warnings.append(sla_warn)
        concurrent_warn = check_concurrent_session(header, now)
        if concurrent_warn:
            warnings.append(concurrent_warn)

        return {"violations": violations, "warnings": warnings}
