"""
Validate a ticket working-analysis directory and its closed-out ticket set.

The ``ticket-runbook`` skill writes a working ``analysis/`` set — ``state.md`` plus
``01-identify.md``, ``02-investigate.md``, and ``03-synthesize.md`` — and collapses
it to one ``ticket_<id>.md`` record plus evidence at close.

Usage (from project root):
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py --help
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis_dir> --scaffold
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis_dir> --step identify
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <analysis_dir>
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <ticket_dir> --pre-close
    <python> .opencode/skills/ticket-runbook/scripts/validate_runbook.py <ticket_dir> --close-out

Modes:
    - default     : validate the ``state.md`` header and every present step file's
                    structure; scan completed steps for unfilled fill tokens.
    - --scaffold  : require all four analysis files and their structure, but
                    intentionally ignore step-body fill tokens.
    - --step NAME : validate only the named step file (identify | investigate |
                    synthesize) plus the state header.
    - --pre-close : validate the complete working and durable ticket set before
                    collapse; every cited ``path:`` must resolve to a file
                    inside the ticket folder.
    - --close-out : validate the durable ticket set after the working set is
                    removed; every cited Image ``path:`` value must resolve
                    to a file inside the ticket folder.

Exit codes:
    0 — all checks pass (warnings do not affect the exit code)
    1 — one or more violations found
    2 — close-out check skipped (ticket record not found)
"""

import argparse
import sys

from ticket_runbook_pkg import (
    KILL_MAX_HYPOTHESES,
    KILL_MAX_QUERIES,
    KILL_MAX_RERUNS,
    REGISTER_COLUMNS,
    STEP_NAMES,
    check_concurrent_session,
    check_identification_consistency,
    check_identification_verdict,
    check_kill_switches,
    check_phase,
    check_register_rows,
    check_step_files_exist,
    check_step_files_have_required_sections,
    evaluate_close_out,
    evaluate_pre_close,
    load_close_out_snapshot,
    load_state_header,
    load_step_file_contents,
    parse_problem_register,
    parse_ticket_record,
    validate,
    validate_close_out,
    validate_pre_close,
    validate_scaffold,
    validate_step,
)
from ticket_runbook_pkg.domain.rules import _check_step_body_fill_markers

# Explicit re-export surface preserved for `import validate_runbook as vr`
# consumers: the module keeps every test-facing symbol reachable by name.
__all__ = [
    "KILL_MAX_HYPOTHESES",
    "KILL_MAX_QUERIES",
    "KILL_MAX_RERUNS",
    "REGISTER_COLUMNS",
    "_build_parser",
    "_check_step_body_fill_markers",
    "check_concurrent_session",
    "check_identification_consistency",
    "check_identification_verdict",
    "check_kill_switches",
    "check_phase",
    "check_register_rows",
    "check_step_files_exist",
    "check_step_files_have_required_sections",
    "evaluate_close_out",
    "evaluate_pre_close",
    "load_close_out_snapshot",
    "load_state_header",
    "load_step_file_contents",
    "parse_problem_register",
    "parse_ticket_record",
    "validate",
    "validate_close_out",
    "validate_pre_close",
    "validate_scaffold",
    "validate_step",
]


# ── CLI entry point ──────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate a ticket working-analysis directory (state.md + steps) "
            "and its closed-out ticket set.\n\n"
            "Default: validate completed steps through the header Phase value.\n"
            "With --scaffold: structural-only validation of all copied steps.\n"
            "With --step NAME: strict validation of only that step + header.\n"
            "With --pre-close: validate readiness before working-set collapse.\n"
            "With --close-out: validate the collapsed ticket durable set."
        ),
        epilog="Exit code 0 = pass, 1 = fail, 2 = close-out skipped. "
               "Warnings do not affect the exit code.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "analysis_dir",
        help=(
            "Path to the analysis directory (or the ticket directory for "
            "--pre-close/--close-out)"
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--step",
        choices=STEP_NAMES,
        default=None,
        help=(
            "Validate only the named step file (identify | investigate | "
            "synthesize) plus the state.md header."
        ),
    )
    mode.add_argument(
        "--scaffold",
        action="store_true",
        default=False,
        help=(
            "Validate a freshly copied scaffold: require all four analysis "
            "files and their structure, but ignore step-body fill tokens."
        ),
    )
    mode.add_argument(
        "--pre-close",
        action="store_true",
        default=False,
        dest="pre_close",
        help=(
            "Validate pre-collapse readiness: exactly one ticket record, the "
            "complete analysis set, response draft, durable directories, and "
            "safe cited paths."
        ),
    )
    mode.add_argument(
        "--close-out",
        action="store_true",
        default=False,
        dest="close_out",
        help=(
            "Validate the collapsed durable ticket set: ticket_<id>.md, "
            "screenshots/, validations/, and every cited image path."
        ),
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        dest="repo_root",
        help="Repo root used to locate the problem register.",
    )
    return parser


if __name__ == "__main__":
    args = _build_parser().parse_args()
    if args.pre_close:
        sys.exit(validate_pre_close(args.analysis_dir, args.repo_root))
    if args.close_out:
        sys.exit(validate_close_out(args.analysis_dir, args.repo_root))
    if args.step is not None:
        sys.exit(validate_step(args.analysis_dir, args.step))
    if args.scaffold:
        sys.exit(validate_scaffold(args.analysis_dir))
    sys.exit(validate(args.analysis_dir))
