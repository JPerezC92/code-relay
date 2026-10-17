"""Application layer: pre-close readiness validation use case."""

from __future__ import annotations

from ticket_runbook_pkg.domain.rules import (
    CloseOutSnapshot,
    ModeFindings,
    ProblemRow,
    evaluate_pre_close,
)

__all__ = ["ValidatePreClose"]


class ValidatePreClose:
    """Pre-close readiness use case for the working and durable ticket set."""

    def execute(
        self,
        snapshot: CloseOutSnapshot,
        register_rows: list[ProblemRow],
    ) -> ModeFindings:
        """Evaluate pre-collapse readiness from an already-loaded snapshot."""
        return {
            "violations": evaluate_pre_close(snapshot, register_rows),
            "warnings": [],
        }
