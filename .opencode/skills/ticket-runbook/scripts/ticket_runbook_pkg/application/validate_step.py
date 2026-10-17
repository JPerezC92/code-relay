"""Application layer: strict single-step validation use case."""

from __future__ import annotations

from ticket_runbook_pkg.domain.rules import (
    STEP_FILE_BY_NAME,
    AnalysisHeader,
    ClockPort,
    ModeFindings,
    check_concurrent_session,
    check_identification_verdict,
    check_kill_switches,
    check_phase,
    check_single_step_file_exists,
    check_single_step_sections,
    check_sla_clock,
)

__all__ = ["ValidateStep"]


class ValidateStep:
    """Strict single-step validation use case for the explicitly selected step."""

    def __init__(self, clock: ClockPort) -> None:
        """Store the injected clock port; the use case never reads a clock."""
        self._clock = clock

    def execute(
        self,
        header: AnalysisHeader,
        step_contents: dict[str, str],
        step_name: str,
        analysis_dir: str,
    ) -> ModeFindings:
        """Validate the header and the one named step; a missing step is the sole finding."""
        violations: list[str] = []
        warnings: list[str] = []

        violations.extend(check_phase(header))
        violations.extend(check_identification_verdict(header))

        fname = check_single_step_file_exists(step_contents, step_name)
        if fname is None:
            expected = STEP_FILE_BY_NAME.get(step_name, f"{step_name}.md")
            return {
                "violations": [
                    f"STEP-NOT-WRITTEN: step {step_name} ({expected}) "
                    f"not yet written in {analysis_dir}"
                ],
                "warnings": [],
            }

        for _fname, item in check_single_step_sections(step_contents, step_name):
            if item.startswith("UNFILLED-TOKEN:"):
                violations.append(f"{item} in {_fname}")
            else:
                violations.append(f"MISSING-SECTION: {_fname} is missing {item}")

        violations.extend(check_kill_switches(header))

        now = self._clock()
        sla_warn = check_sla_clock(header, now)
        if sla_warn:
            warnings.append(sla_warn)
        concurrent_warn = check_concurrent_session(header, now)
        if concurrent_warn:
            warnings.append(concurrent_warn)

        return {"violations": violations, "warnings": warnings}
