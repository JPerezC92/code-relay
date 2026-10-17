"""Composition entry: IO helpers and per-mode CLI wiring for the ticket-runbook validator."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from ticket_runbook_pkg.application.validate import (
    ValidateAnalysis as _ValidateAnalysis,
)
from ticket_runbook_pkg.application.validate_close_out import ValidateCloseOut
from ticket_runbook_pkg.application.validate_pre_close import ValidatePreClose
from ticket_runbook_pkg.application.validate_scaffold import (
    ValidateScaffold as _ValidateScaffold,
)
from ticket_runbook_pkg.application.validate_step import (
    ValidateStep as _ValidateStep,
)
from ticket_runbook_pkg.domain.rules import (
    REQUIRED_ANALYSIS_FILES,
    STATE_FILE,
    STEP_FILE_BY_NAME,
    STEP_FILES,
    AnalysisHeader,
    ClockPort,
    CloseOutSnapshot,
    ModeFindings,
    ProblemRow,
    _cited_image_paths,
    check_concurrent_session as _check_concurrent_session,
    check_sla_clock as _check_sla_clock,
    parse_problem_register,
    parse_state_header,
)


# ── Composition-edge clock and compatibility surface ─────────────────────────


def _system_clock() -> datetime:
    """Return the current local naive timestamp; the composition-edge clock."""
    return datetime.now()


def check_sla_clock(
    header: AnalysisHeader, now: Optional[datetime] = None
) -> Optional[str]:
    """Edge-compatible SLA warning; an omitted ``now`` is resolved here only."""
    resolved = now if now is not None else _system_clock()
    return _check_sla_clock(header, resolved)


def check_concurrent_session(
    header: AnalysisHeader, now: Optional[datetime] = None
) -> Optional[str]:
    """Edge-compatible concurrency warning; an omitted ``now`` is resolved here only."""
    resolved = now if now is not None else _system_clock()
    return _check_concurrent_session(header, resolved)


class ValidateAnalysis:
    """Edge-compatible wrapper delegating to the clock-injected analysis use case."""

    def __init__(self, clock: Optional[ClockPort] = None) -> None:
        """Accept an optional clock; a concrete system clock is chosen here."""
        self._inner = _ValidateAnalysis(
            clock if clock is not None else _system_clock
        )

    def execute(
        self,
        header: AnalysisHeader,
        step_contents: dict[str, str],
        analysis_dir: str,
    ) -> ModeFindings:
        """Delegate to the injected use case without changing its signature."""
        return self._inner.execute(header, step_contents, analysis_dir)


class ValidateScaffold:
    """Edge-compatible wrapper delegating to the clock-injected scaffold use case."""

    def __init__(self, clock: Optional[ClockPort] = None) -> None:
        """Accept an optional clock; a concrete system clock is chosen here."""
        self._inner = _ValidateScaffold(
            clock if clock is not None else _system_clock
        )

    def execute(
        self,
        header: AnalysisHeader,
        step_contents: dict[str, str],
        analysis_dir: str,
    ) -> ModeFindings:
        """Delegate to the injected use case without changing its signature."""
        return self._inner.execute(header, step_contents, analysis_dir)


class ValidateStep:
    """Edge-compatible wrapper delegating to the clock-injected step use case."""

    def __init__(self, clock: Optional[ClockPort] = None) -> None:
        """Accept an optional clock; a concrete system clock is chosen here."""
        self._inner = _ValidateStep(clock if clock is not None else _system_clock)

    def execute(
        self,
        header: AnalysisHeader,
        step_contents: dict[str, str],
        step_name: str,
        analysis_dir: str,
    ) -> ModeFindings:
        """Delegate to the injected use case without changing its signature."""
        return self._inner.execute(header, step_contents, step_name, analysis_dir)


# ── IO helpers ───────────────────────────────────────────────────────────────


def load_text(path: Path) -> str:
    """Load UTF-8 text from ``path`` at the validator's IO boundary."""
    return path.read_text(encoding="utf-8")


def load_state_header(path: Path) -> AnalysisHeader:
    """Load and parse ``analysis/state.md`` at the validator's IO boundary."""
    return parse_state_header(load_text(path), str(path))


def load_step_file_contents(analysis_dir: Path) -> dict[str, str]:
    """Load every present step file at the validator's IO boundary."""
    return {
        fname: load_text(analysis_dir / fname)
        for fname in STEP_FILES
        if (analysis_dir / fname).is_file()
    }


def load_register_rows(repo_root: Path) -> list[ProblemRow]:
    """Load ``knowledge/problems.md`` incident rows at the IO boundary."""
    register_path = repo_root / "knowledge" / "problems.md"
    if not register_path.is_file():
        return []
    return parse_problem_register(load_text(register_path))


def _resolve_ticket_path(value: str, ticket_dir: Path) -> tuple[Path, bool]:
    """Resolve one cited ``path:`` value strictly inside the ticket folder.

    The single resolver shared by ``--pre-close`` and ``--close-out``:
    ``ticket_dir / value`` → ``resolve()`` → ``relative_to(ticket_dir.resolve())``.
    There is no repo-root fallback and no accepted absolute spelling — both
    count as outside the ticket folder.  Returns ``(resolved, inside)`` where
    ``inside`` reports whether the resolved path stays within the ticket root.
    """
    ticket_root = ticket_dir.resolve()
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate.resolve(), False
    resolved = (ticket_dir / candidate).resolve()
    try:
        resolved.relative_to(ticket_root)
    except ValueError:
        return resolved, False
    return resolved, True


def load_close_out_snapshot(ticket_dir: Path) -> CloseOutSnapshot:
    """Load pre-close/close-out filesystem values at the IO boundary."""
    analysis_dir = ticket_dir / "analysis"
    working_files = (
        sorted(p.name for p in analysis_dir.glob("*.md"))
        if analysis_dir.is_dir()
        else []
    )
    analysis_contents = {
        name: load_text(analysis_dir / name)
        for name in REQUIRED_ANALYSIS_FILES
        if (analysis_dir / name).is_file()
    }

    ticket_files = sorted(
        path for path in ticket_dir.glob("ticket_*.md") if path.is_file()
    )
    ticket_names = [path.name for path in ticket_files]
    ticket_content: Optional[str] = None
    missing_paths: list[str] = []
    missing_ticket_paths: list[str] = []
    unsafe_ticket_paths: list[str] = []

    if len(ticket_files) == 1:
        ticket_content = load_text(ticket_files[0])
        for value in _cited_image_paths(ticket_content):
            resolved, inside = _resolve_ticket_path(value, ticket_dir)
            if not inside:
                # Absolute or escaping spellings are unsafe in both modes.
                unsafe_ticket_paths.append(value)
                missing_paths.append(value)
                continue
            # Both modes require an existing file inside the ticket root:
            # PRE-CLOSE-7 and CLOSE-5 reject a spelling that is missing or that
            # exists but is not a file (for example a directory).
            if not resolved.is_file():
                missing_ticket_paths.append(value)
                missing_paths.append(value)

    return {
        "ticket_file_names": ticket_names,
        "ticket_content": ticket_content,
        "working_analysis_files": working_files,
        "analysis_contents": analysis_contents,
        "response_draft_present": (ticket_dir / "response-draft.md").is_file(),
        "screenshots_dir_present": (ticket_dir / "screenshots").is_dir(),
        "validations_dir_present": (ticket_dir / "validations").is_dir(),
        "missing_image_paths": missing_paths,
        "missing_ticket_paths": missing_ticket_paths,
        "unsafe_ticket_paths": unsafe_ticket_paths,
    }


# ── Mode entry points ────────────────────────────────────────────────────────


def validate(analysis_dir: str) -> int:
    """Run all checks on a working ``analysis/`` directory (default mode).

    Returns 0 when all checks pass, 1 when violations are found.  Warnings
    (incomplete analysis, SLA, concurrent session) do not affect the exit code.
    """
    try:
        header = load_state_header(Path(analysis_dir) / STATE_FILE)
    except (OSError, ValueError) as exc:
        print(f"HEADER-ERROR: {exc}", file=sys.stderr)
        return 1

    step_contents = load_step_file_contents(Path(analysis_dir))
    findings = ValidateAnalysis(_system_clock).execute(
        header, step_contents, analysis_dir
    )

    for warning in findings["warnings"]:
        print(f"WARN: {warning}", file=sys.stderr)

    if findings["violations"]:
        for violation in findings["violations"]:
            print(violation, file=sys.stderr)
        return 1

    base = Path(analysis_dir)
    print(f"\nAnalysis: {analysis_dir}  Phase: {header['Phase']}\n")
    print(f"{'Analysis file':<35} {'Status'}")
    print("-" * 45)
    for fname in REQUIRED_ANALYSIS_FILES:
        status = "ok" if (base / fname).is_file() else "absent (not yet written)"
        print(f"  {fname:<33} {status}")
    print()

    return 0


def validate_scaffold(analysis_dir: str) -> int:
    """Validate a freshly copied ``analysis/`` scaffold without fill tokens."""
    try:
        header = load_state_header(Path(analysis_dir) / STATE_FILE)
    except (OSError, ValueError) as exc:
        print(f"HEADER-ERROR: {exc}", file=sys.stderr)
        return 1

    step_contents = load_step_file_contents(Path(analysis_dir))
    findings = ValidateScaffold(_system_clock).execute(
        header, step_contents, analysis_dir
    )

    for warning in findings["warnings"]:
        print(f"WARN: {warning}", file=sys.stderr)
    if findings["violations"]:
        for violation in findings["violations"]:
            print(violation, file=sys.stderr)
        return 1

    print(f"ok  scaffold: {analysis_dir}")
    return 0


def validate_step(analysis_dir: str, step_name: str) -> int:
    """Validate a single step file plus the ``state.md`` header.

    Returns 0 when all checks pass, 1 when violations are found.  Exits 1 with a
    clear "step not yet written" message when the named step file is absent.
    """
    try:
        header = load_state_header(Path(analysis_dir) / STATE_FILE)
    except (OSError, ValueError) as exc:
        print(f"HEADER-ERROR: {exc}", file=sys.stderr)
        return 1

    step_contents = load_step_file_contents(Path(analysis_dir))
    findings = ValidateStep(_system_clock).execute(
        header, step_contents, step_name, analysis_dir
    )

    for warning in findings["warnings"]:
        print(f"WARN: {warning}", file=sys.stderr)

    if findings["violations"]:
        for violation in findings["violations"]:
            print(violation, file=sys.stderr)
        return 1

    fname = STEP_FILE_BY_NAME.get(step_name, f"{step_name}.md")
    print(f"ok  step {step_name} ({fname})  [analysis: {analysis_dir}]")
    return 0


def validate_close_out(ticket_dir: str, repo_root: str) -> int:
    """Validate the collapsed durable ticket set.

    Returns 0 when the close-out set is complete, 1 when violations are found,
    and 2 when no ``ticket_<id>.md`` record exists (nothing to check).
    """
    snapshot = load_close_out_snapshot(Path(ticket_dir))

    if not snapshot["ticket_file_names"]:
        print(
            "CLOSE-SKIPPED: ticket_<id>.md not found at "
            f"{ticket_dir}",
            file=sys.stderr,
        )
        return 2

    findings = ValidateCloseOut().execute(
        snapshot,
        lambda: load_register_rows(Path(repo_root)),
    )

    if findings["violations"]:
        for violation in findings["violations"]:
            print(violation, file=sys.stderr)
        return 1

    print(
        f"ok  close-out: {ticket_dir}  "
        f"({snapshot['ticket_file_names'][0]})"
    )
    return 0


def validate_pre_close(ticket_dir: str, repo_root: str) -> int:
    """Validate the complete ticket set immediately before collapse."""
    try:
        snapshot = load_close_out_snapshot(Path(ticket_dir))
        register_rows = load_register_rows(Path(repo_root))
    except OSError as exc:
        print(f"PRE-CLOSE-IO: {exc}", file=sys.stderr)
        return 1

    findings = ValidatePreClose().execute(snapshot, register_rows)
    if findings["violations"]:
        for violation in findings["violations"]:
            print(violation, file=sys.stderr)
        return 1

    print(
        f"ok  pre-close: {ticket_dir}  "
        f"({snapshot['ticket_file_names'][0]})"
    )
    return 0
