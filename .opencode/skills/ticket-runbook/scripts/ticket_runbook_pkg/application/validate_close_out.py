"""Application layer: close-out postcondition validation use case."""

from __future__ import annotations

from ticket_runbook_pkg.domain.rules import (
    CloseOutSnapshot,
    ModeFindings,
    RegisterRowsPort,
    check_identification_consistency,
    evaluate_close_out,
    parse_ticket_record,
)

__all__ = ["ValidateCloseOut"]


class ValidateCloseOut:
    """Close-out postcondition use case for the collapsed durable ticket set."""

    def execute(
        self,
        snapshot: CloseOutSnapshot,
        load_register_rows: RegisterRowsPort,
    ) -> ModeFindings:
        """Evaluate durable postconditions, loading register rows only when cited."""
        violations = evaluate_close_out(snapshot)

        if len(snapshot["ticket_file_names"]) == 1:
            if snapshot["ticket_content"] is not None:
                record = parse_ticket_record(
                    snapshot["ticket_content"],
                    snapshot["ticket_file_names"][0],
                )
                violations.extend(
                    check_identification_consistency(
                        record["identification_verdict"],
                        record["known_problem_ids"],
                        load_register_rows(),
                    )
                )

        return {"violations": violations, "warnings": []}
