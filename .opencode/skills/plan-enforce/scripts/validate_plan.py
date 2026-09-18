"""
Validate a plan directory (or single-file plan) against the plan/phase/story
consistency checklist.

Usage (from project root):
    python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan_dir>
    python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan.md> --single-file
    python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan_dir> --stories <dir>

Mechanical/repetitive subset only: Status enum, Completed line, required
sections, phase-file sections + blockquote labels, the canonical phase
executor-command table shape, unfilled <...>/TBD/date placeholders, and
user-stories index mirroring. Semantic correctness (values match evidence,
verdict/naming consistency, executor authority) is the skill loop's analysis
job — this script is a helper, not the authority.

Exit codes:
    0 — all checks pass (warnings do not affect exit code)
    1 — one or more violations found
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional, TypedDict

ALLOWED_STATUS = frozenset({"active", "completed"})

# Actions permitted in a plan's `## Write/delete manifest` table.
ALLOWED_MANIFEST_ACTIONS = frozenset({"Add", "Delete", "Modify"})

# Verdicts permitted in a plan's `## Audit` block.
ALLOWED_AUDIT_VERDICTS = frozenset({"[PENDING]", "[PASS]", "[FAIL]"})

# Sections every plan.md (base or programming template) must carry.
BASE_REQUIRED_SECTIONS = [
    "## Context",
    "## Goals",
    "## Critical files / tools",
    "## Verification",
]

# Either a base-template Body or a programming-template Current state is required.
BODY_ALTERNATIVES = ["## Body", "## Current state"]

# "## Out of scope" and "## Out of scope / Do-not-touch" are both valid.
OUT_OF_SCOPE_PREFIX = "## Out of scope"

# Every phase file must carry these ## headings and these blockquote labels.
PHASE_REQUIRED_SECTIONS = [
    "## Steps",
    "## Output",
    "## Verify commands",
    "## Gate",
    "## Abort conditions",
]
PHASE_REQUIRED_LABELS = ["Owner", "Pre", "Reads", "Writes"]

# Canonical column order for a phase `## Verify commands` table.
VERIFY_TABLE_HEADER = ("Executor", "Command")

_BACKTICK_RE = re.compile(r"`[^`]*`")
_ANGLE_RE = re.compile(r"<[^>]+>")
_TBD_RE = re.compile(r"\bTBD\b")
_DATE_RE = re.compile(r"YYYY-MM-DD")
_COMMENT_RE = re.compile(r"<!--")
_HTML_COMMENT_BLOCK_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_TABLE_SEPARATOR_CELL_RE = re.compile(r"^:?-+:?$")
_GOAL_DEFINITION_RE = re.compile(r"\*\*(G\d+):\*\*")
_GOAL_TOKEN_RE = re.compile(r"\bG\d+\b")
_PHASE_RUNBOOK_RE = re.compile(r"phase-\d+-[^\s/`]+\.md")
_WRITES_LABEL_RE = re.compile(r">\s*\*\*Writes:\*\*\s*(.*)$")
_VERIFICATION_BULLET_RE = re.compile(r"^- [⬜✅]")
_AUDIT_FIELD_RE = re.compile(r"^-\s*(\w+):\s*(.*)$")


class PlanMetadata(TypedDict, total=False):
    """Structured metadata fields read from a plan's leading blockquotes."""

    Status: str
    Started: str
    Subject: str
    Layout: str
    Completed: str


class StoryMetadata(TypedDict, total=False):
    """Structured metadata fields used when checking a user-story index."""

    Status: str


class PlanSnapshot(TypedDict):
    """Loaded plan file content and its display path."""

    path: str
    content: str


class PhaseSnapshot(TypedDict):
    """Loaded phase file content and its display name."""

    name: str
    content: str


class StorySnapshot(TypedDict):
    """Loaded user-story content and its index slug."""

    slug: str
    content: str


class StoryIndexSnapshot(TypedDict):
    """Loaded user-story index content and discoverable story files."""

    index_path: str
    index_content: Optional[str]
    stories: list[StorySnapshot]


def _strip_backticks(line: str) -> str:
    """Remove backtick code spans so rule prose (e.g. "no `<...>`") is not
    mistaken for an unfilled placeholder."""
    return _BACKTICK_RE.sub("", line)


def _mask_html_comment(match: re.Match[str]) -> str:
    """Mask comment text while preserving its line boundaries."""
    return re.sub(r"[^\n]", " ", match.group())


def load_text(path: Path) -> str:
    """Load UTF-8 file text at the plan validator's IO boundary."""
    return path.read_text(encoding="utf-8")


def load_plan_snapshot(plan_path: Path) -> Optional[PlanSnapshot]:
    """Load a plan file and retain its path for diagnostic output."""
    if not plan_path.is_file():
        return None
    return {"path": str(plan_path), "content": load_text(plan_path)}


def load_phase_snapshot(phase_path: Path) -> Optional[PhaseSnapshot]:
    """Load a phase file and retain its filename for diagnostics."""
    if not phase_path.is_file():
        return None
    return {"name": phase_path.name, "content": load_text(phase_path)}


def load_phase_snapshots(plan_dir: Path) -> list[PhaseSnapshot]:
    """Discover and load phase files in their established lexical order."""
    snapshots: list[PhaseSnapshot] = []
    for phase_path in sorted(plan_dir.glob("phase-*.md")):
        snapshot = load_phase_snapshot(phase_path)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def load_story_snapshot(story_path: Path) -> StorySnapshot:
    """Load a user-story file and derive its index slug."""
    return {"slug": story_path.stem, "content": load_text(story_path)}


def load_story_index_snapshot(user_stories_dir: Path) -> StoryIndexSnapshot:
    """Discover and load user-story files plus an optional index at the IO boundary."""
    index_path = user_stories_dir / "index.md"
    story_paths = sorted(
        path for path in user_stories_dir.glob("*.md") if path.name != "index.md"
    )
    return {
        "index_path": str(index_path),
        "index_content": load_text(index_path) if index_path.is_file() else None,
        "stories": [load_story_snapshot(path) for path in story_paths],
    }


def parse_plan_metadata(content: str) -> PlanMetadata:
    """Extract the blockquote metadata fields from plan.md.

    Returns a dict with keys found in the leading ``> **Key:** value`` block.
    """
    values: dict[str, str] = {}
    for line in content.splitlines():
        if not line.startswith(">"):
            continue
        m = re.match(r">\s*\*\*([\w -]+):\*\*\s*(.*)$", line)
        if m:
            values[m.group(1).strip()] = m.group(2).strip()
    meta: PlanMetadata = {}
    for field in PlanMetadata.__annotations__:
        if field in values:
            meta[field] = values[field]
    return meta


def check_status(meta: PlanMetadata) -> list[str]:
    status = meta.get("Status", "").strip()
    if status not in ALLOWED_STATUS:
        return [f"STATUS: Status value {status!r} not in allowed set ({sorted(ALLOWED_STATUS)})"]
    return []


def check_completed_line(meta: PlanMetadata) -> list[str]:
    if meta.get("Status", "").strip() == "completed" and "Completed" not in meta:
        return ["COMPLETED-LINE: Status is completed but no `Completed:` line in metadata"]
    return []


def check_required_sections(content: str) -> list[str]:
    headings = {line.strip() for line in content.splitlines() if line.startswith("##")}
    missing = [s for s in BASE_REQUIRED_SECTIONS if s not in headings]
    if not any(s in headings for s in BODY_ALTERNATIVES):
        missing.append("one of " + " / ".join(BODY_ALTERNATIVES))
    if not any(s.startswith(OUT_OF_SCOPE_PREFIX) for s in headings):
        missing.append(f"a section starting with `{OUT_OF_SCOPE_PREFIX}`")
    return [f"MISSING-SECTION: plan.md is missing {s}" for s in missing]


def check_placeholders(content: str) -> list[str]:
    findings: list[str] = []
    comment_free_content = _HTML_COMMENT_BLOCK_RE.sub(
        _mask_html_comment, content
    )
    for line, comment_free_line in zip(
        content.splitlines(), comment_free_content.splitlines()
    ):
        cleaned = _strip_backticks(comment_free_line)
        for tok in _ANGLE_RE.findall(cleaned):
            findings.append(f"UNFILLED-TOKEN: {tok}")
        if _TBD_RE.search(cleaned):
            findings.append("UNFILLED-TOKEN: TBD")
        if _DATE_RE.search(cleaned):
            findings.append("UNFILLED-TOKEN: YYYY-MM-DD")
        if _COMMENT_RE.search(_strip_backticks(line)):
            findings.append("STRAY-COMMENT: <!-- ... -->")
    return findings


def check_plan_file(plan_path: Path) -> list[str]:
    snapshot = load_plan_snapshot(plan_path)
    if snapshot is None:
        return [f"MISSING-FILE: {plan_path} not found"]
    return check_plan_snapshot(snapshot)


def check_plan_snapshot(snapshot: PlanSnapshot) -> list[str]:
    """Evaluate an already-loaded plan snapshot without file IO."""
    content = snapshot["content"]
    meta = parse_plan_metadata(content)
    findings: list[str] = []
    findings.extend(check_status(meta))
    findings.extend(check_completed_line(meta))
    findings.extend(check_required_sections(content))
    findings.extend(check_placeholders(content))
    return findings


def validate_plan_snapshot(
    snapshot: PlanSnapshot, phase_snapshots: list[PhaseSnapshot]
) -> list[str]:
    """Run the phase-aware plan invariants without file IO.

    Goal trace, manifest equality, verification parity, and the audit gate need
    the plan's phase files, so only directory validation calls this function;
    single-file validation keeps the phase-free checks.
    """
    content = snapshot["content"]
    status = parse_plan_metadata(content).get("Status", "").strip()
    phase_names = [phase["name"] for phase in phase_snapshots]
    findings: list[str] = []
    findings.extend(check_goal_trace(content, phase_names))
    findings.extend(check_manifest_equality(content, phase_snapshots))
    findings.extend(check_verification_parity(content, len(phase_snapshots)))
    findings.extend(check_audit_gate(content, status))
    return findings


def check_phase_file(phase_path: Path) -> list[str]:
    snapshot = load_phase_snapshot(phase_path)
    if snapshot is None:
        return [f"MISSING-FILE: {phase_path} not found"]
    return check_phase_snapshot(snapshot)


def _extract_section_lines(content: str, heading: str) -> Optional[list[str]]:
    """Return the body lines under a level-2 heading, or None when absent."""
    lines = content.splitlines()
    start: Optional[int] = None
    for index, line in enumerate(lines):
        if line.strip() == heading:
            start = index + 1
            break
    if start is None:
        return None
    for index in range(start, len(lines)):
        if lines[index].startswith("##"):
            return lines[start:index]
    return lines[start:]


def _extract_section_lines_starting(
    content: str, heading_prefix: str
) -> Optional[list[str]]:
    """Return the body lines under the first level-2 heading matching a prefix."""
    lines = content.splitlines()
    start: Optional[int] = None
    for index, line in enumerate(lines):
        if line.strip().startswith(heading_prefix):
            start = index + 1
            break
    if start is None:
        return None
    for index in range(start, len(lines)):
        if lines[index].startswith("##"):
            return lines[start:index]
    return lines[start:]


def _split_table_row(line: str) -> list[str]:
    """Split a Markdown table row into trimmed cells."""
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_table_separator(cells: list[str]) -> bool:
    """Return True for a Markdown separator row such as ``|---|---|``."""
    return bool(cells) and all(_TABLE_SEPARATOR_CELL_RE.match(cell) for cell in cells)


def _extract_table_block(section_lines: list[str]) -> list[str]:
    """Return the first contiguous Markdown table block in a section body."""
    block: list[str] = []
    for line in section_lines:
        if line.strip().startswith("|"):
            block.append(line)
        elif block:
            break
    return block


def check_phase_verify_table(phase_name: str, content: str) -> list[str]:
    """Validate a phase's canonical ``## Verify commands`` Executor/Command table.

    Declared traceability only: it confirms a non-empty table pairs each command
    with a non-empty executor. It never parses or inspects agent permissions.
    """
    section_lines = _extract_section_lines(content, "## Verify commands")
    if section_lines is None:
        return [f"VERIFY-TABLE: {phase_name} is missing the ## Verify commands section"]

    block = _extract_table_block(section_lines)
    if not block:
        return [f"VERIFY-TABLE: {phase_name} has no Executor/Command table"]

    header = _split_table_row(block[0])
    if tuple(header) != VERIFY_TABLE_HEADER:
        return [
            f"VERIFY-TABLE: {phase_name} table header must be exactly "
            "`Executor` then `Command`"
        ]

    data_rows = [
        row for row in block[1:] if not _is_table_separator(_split_table_row(row))
    ]
    if not data_rows:
        return [f"VERIFY-TABLE: {phase_name} table has no data rows"]

    findings: list[str] = []
    for index, row in enumerate(data_rows, start=1):
        cells = _split_table_row(row)
        if len(cells) != 2:
            findings.append(
                f"VERIFY-TABLE: {phase_name} data row {index} must have exactly "
                "two cells (`Executor`, `Command`)"
            )
            continue
        if not cells[0]:
            findings.append(
                f"VERIFY-TABLE: {phase_name} data row {index} has an empty `Executor` cell"
            )
        if not cells[1]:
            findings.append(
                f"VERIFY-TABLE: {phase_name} data row {index} has an empty `Command` cell"
            )
    return findings


def _extract_goal_ids(content: str) -> list[str]:
    """Return ordered, de-duplicated goal ids declared under `## Goals`."""
    section_lines = _extract_section_lines(content, "## Goals")
    if section_lines is None:
        return []
    goal_ids: list[str] = []
    for line in section_lines:
        for match in _GOAL_DEFINITION_RE.finditer(line):
            goal_id = match.group(1)
            if goal_id not in goal_ids:
                goal_ids.append(goal_id)
    return goal_ids


def check_goal_trace(plan_content: str, phase_names: list[str]) -> list[str]:
    """Cross-check declared goals, the dispatch table, and phase runbooks.

    Each dispatch row must name an existing `phase-*.md` runbook and every
    existing phase file must appear in a row. When the dispatch table ends in a
    `Goals` column, every cited goal id must be declared and every declared goal
    id must be cited. Tables without a `Goals` column (base template) are still
    checked for runbook existence and phase coverage.
    """
    findings: list[str] = []
    goal_ids = _extract_goal_ids(plan_content)

    section_lines = _extract_section_lines_starting(plan_content, "## Phase index")
    if section_lines is None:
        return ["GOAL-TRACE: plan.md is missing the ## Phase index dispatch section"]

    block = _extract_table_block(section_lines)
    if not block:
        return ["GOAL-TRACE: ## Phase index has no dispatch table"]

    header = _split_table_row(block[0])
    has_goals_column = bool(header) and header[-1] == "Goals"

    data_rows = [
        row for row in block[1:] if not _is_table_separator(_split_table_row(row))
    ]
    if not data_rows:
        return ["GOAL-TRACE: ## Phase index dispatch table has no data rows"]

    referenced_runbooks: set[str] = set()
    cited_goals: set[str] = set()
    for index, row in enumerate(data_rows, start=1):
        cells = _split_table_row(row)
        runbook_cell = cells[3] if len(cells) > 3 else ""
        runbook_match = _PHASE_RUNBOOK_RE.search(runbook_cell.replace("`", ""))
        if runbook_match is None:
            findings.append(
                f"GOAL-TRACE: dispatch row {index} has no phase runbook reference"
            )
        else:
            runbook = runbook_match.group(0)
            if runbook not in phase_names:
                findings.append(
                    f"GOAL-TRACE: dispatch row {index} references missing phase file `{runbook}`"
                )
            else:
                referenced_runbooks.add(runbook)

        if has_goals_column and cells:
            for goal_id in _GOAL_TOKEN_RE.findall(cells[-1]):
                if goal_id not in goal_ids:
                    findings.append(
                        f"GOAL-TRACE: dispatch row {index} cites unknown goal `{goal_id}`"
                    )
                cited_goals.add(goal_id)

    for phase_name in phase_names:
        if phase_name not in referenced_runbooks:
            findings.append(
                f"GOAL-TRACE: phase file `{phase_name}` is not referenced by the phase index"
            )

    if has_goals_column:
        for goal_id in goal_ids:
            if goal_id not in cited_goals:
                findings.append(
                    f"GOAL-TRACE: goal `{goal_id}` is not cited by any phase"
                )
    return findings


def _is_none_marker(text: str) -> bool:
    """Return True for a `Writes` marker that declares "no writes" (`none`,
    `None`, or the sentence form `none.`)."""
    return text.replace("`", "").strip().rstrip(".").strip().lower() == "none"


def _extract_writes_paths(content: str) -> set[str]:
    """Return the normalized write paths declared in a phase's `Writes:` label."""
    paths: set[str] = set()
    for line in content.splitlines():
        match = _WRITES_LABEL_RE.match(line)
        if match is None:
            continue
        value = match.group(1).strip()
        if _is_none_marker(value):
            continue
        for raw in value.split(";"):
            if _is_none_marker(raw):
                continue
            path = raw.replace("`", "").strip().rstrip(".").strip()
            if path:
                paths.add(path)
    return paths


def check_manifest_equality(
    plan_content: str, phase_snapshots: list[PhaseSnapshot]
) -> list[str]:
    """Compare the plan's write/delete manifest with the union of phase Writes.

    The `## Write/delete manifest` table must use the exact `Action`/`Path`
    header, each action must be `Modify`, `Add`, or `Delete`, and its normalized
    path set must equal the union of every phase's normalized `**Writes:**`
    paths (a `Writes` value of `none` contributes nothing).
    """
    findings: list[str] = []
    writes_paths: set[str] = set()
    for snapshot in phase_snapshots:
        writes_paths |= _extract_writes_paths(snapshot["content"])

    section_lines = _extract_section_lines(plan_content, "## Write/delete manifest")
    if section_lines is None:
        if writes_paths:
            return [
                "MANIFEST: plan.md is missing the ## Write/delete manifest section"
            ]
        return findings

    block = _extract_table_block(section_lines)
    if not block:
        return ["MANIFEST: ## Write/delete manifest has no Action/Path table"]

    header = _split_table_row(block[0])
    if tuple(header) != ("Action", "Path"):
        return [
            "MANIFEST: ## Write/delete manifest table header must be exactly "
            "`Action` then `Path`"
        ]

    manifest_paths: set[str] = set()
    data_rows = [
        row for row in block[1:] if not _is_table_separator(_split_table_row(row))
    ]
    for index, row in enumerate(data_rows, start=1):
        cells = _split_table_row(row)
        if len(cells) != 2:
            findings.append(
                f"MANIFEST: manifest row {index} must have exactly two cells "
                "(`Action`, `Path`)"
            )
            continue
        action = cells[0].strip()
        path = cells[1].replace("`", "").strip()
        if action not in ALLOWED_MANIFEST_ACTIONS:
            findings.append(
                f"MANIFEST: manifest row {index} action {action!r} not in "
                f"{sorted(ALLOWED_MANIFEST_ACTIONS)}"
            )
        if path:
            manifest_paths.add(path)

    for path in sorted(writes_paths - manifest_paths):
        findings.append(
            f"MANIFEST: phase Writes path `{path}` is missing from the write/delete manifest"
        )
    for path in sorted(manifest_paths - writes_paths):
        findings.append(
            f"MANIFEST: manifest path `{path}` is not declared in any phase Writes"
        )
    return findings


def check_verification_parity(plan_content: str, phase_count: int) -> list[str]:
    """Require one `## Verification` checkbox per discovered phase file."""
    section_lines = _extract_section_lines(plan_content, "## Verification")
    if section_lines is None:
        return ["VERIFICATION-PARITY: plan.md is missing the ## Verification section"]
    count = sum(1 for line in section_lines if _VERIFICATION_BULLET_RE.match(line))
    if count != phase_count:
        return [
            "VERIFICATION-PARITY: ## Verification has "
            f"{count} checkbox(es) but the plan has {phase_count} phase file(s)"
        ]
    return []


def _parse_audit_fields(content: str) -> Optional[dict[str, str]]:
    """Return the `## Audit` fields when the section is present, else None."""
    section_lines = _extract_section_lines(content, "## Audit")
    if section_lines is None:
        return None
    fields: dict[str, str] = {}
    for line in section_lines:
        match = _AUDIT_FIELD_RE.match(line.strip())
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def check_audit_gate(plan_content: str, status: str) -> list[str]:
    """Enforce the audit contract: any verdict must be known, and a completed
    plan must carry `[PASS]` with a non-empty auditor and a date."""
    findings: list[str] = []
    fields = _parse_audit_fields(plan_content)
    if fields is not None:
        verdict = fields.get("Verdict", "")
        if verdict not in ALLOWED_AUDIT_VERDICTS:
            findings.append(
                f"AUDIT: Verdict {verdict!r} not in {sorted(ALLOWED_AUDIT_VERDICTS)}"
            )

    if status != "completed":
        return findings

    if fields is None:
        findings.append("AUDIT: completed plan is missing the ## Audit section")
        return findings

    verdict = fields.get("Verdict", "")
    if verdict != "[PASS]":
        findings.append(
            f"AUDIT: completed plan Verdict must be [PASS], found {verdict!r}"
        )
    if not fields.get("Auditor", ""):
        findings.append("AUDIT: completed plan has an empty Auditor")
    if not fields.get("Date", ""):
        findings.append("AUDIT: completed plan has no Date")
    return findings


def check_phase_snapshot(snapshot: PhaseSnapshot) -> list[str]:
    """Evaluate an already-loaded phase snapshot without file IO."""
    content = snapshot["content"]
    phase_name = snapshot["name"]
    lines = content.splitlines()
    headings = {line.strip() for line in lines if line.startswith("##")}
    labels: set[str] = set()
    for line in lines:
        m = re.match(r">\s*\*\*(\w[\w\s-]*):\*\*", line)
        if m:
            labels.add(m.group(1).strip())

    findings: list[str] = []
    for section in PHASE_REQUIRED_SECTIONS:
        if section not in headings:
            findings.append(f"MISSING-SECTION: {phase_name} is missing {section}")
    for label in PHASE_REQUIRED_LABELS:
        if label not in labels:
            findings.append(f"MISSING-LABEL: {phase_name} is missing **{label}:**")
    findings.extend(check_phase_verify_table(phase_name, content))
    findings.extend(f"{phase_name}: {f}" for f in check_placeholders(content))
    return findings


def parse_story_metadata(content: str) -> StoryMetadata:
    """Extract structured metadata used by user-story index validation."""
    fields: StoryMetadata = {}
    for line in content.splitlines():
        m = re.match(r">\s*\*\*(\w[\w ]*):\*\*\s*(.*)$", line)
        if m and m.group(1).strip() == "Status":
            fields["Status"] = m.group(2).strip()
    return fields


def check_story_index(user_stories_dir: str) -> list[str]:
    return check_story_index_snapshot(load_story_index_snapshot(Path(user_stories_dir)))


def check_story_index_snapshot(snapshot: StoryIndexSnapshot) -> list[str]:
    """Evaluate an already-loaded user-story index snapshot without file IO."""
    stories = snapshot["stories"]
    if not stories:
        return []

    findings: list[str] = []
    index_content = snapshot["index_content"]
    if index_content is None:
        findings.append(
            f"MISSING-INDEX: {snapshot['index_path']} not found but story files exist"
        )
        return findings

    for story in stories:
        slug = story["slug"]
        if slug not in index_content:
            findings.append(f"INDEX-MISSING: story slug `{slug}` not listed in index.md")
            continue
        fields = parse_story_metadata(story["content"])
        status = fields.get("Status", "")
        if status and status not in index_content:
            findings.append(f"INDEX-MISMATCH: story `{slug}` Status {status!r} not mirrored in index.md")
    return findings


def validate_plan_dir(plan_dir: str, stories_dir: Optional[str]) -> int:
    base = Path(plan_dir)
    violations: list[str] = []

    plan_path = base / "plan.md"
    plan_snapshot = load_plan_snapshot(plan_path)
    phase_snapshots = load_phase_snapshots(base)

    if plan_snapshot is None:
        violations.extend(check_plan_file(plan_path))
    else:
        violations.extend(check_plan_snapshot(plan_snapshot))
        violations.extend(validate_plan_snapshot(plan_snapshot, phase_snapshots))

    for phase_snapshot in phase_snapshots:
        violations.extend(check_phase_snapshot(phase_snapshot))

    if stories_dir:
        violations.extend(check_story_index(stories_dir))

    if violations:
        for v in violations:
            print(v, file=sys.stderr)
        return 1

    print(f"ok  plan: {plan_dir}  phases: {len(phase_snapshots)}")
    return 0


def validate_single_file(plan_file: str) -> int:
    violations = check_plan_file(Path(plan_file))
    if violations:
        for v in violations:
            print(v, file=sys.stderr)
        return 1
    print(f"ok  single-file plan: {plan_file}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate a plan directory or single-file plan against the consistency checklist.",
        epilog="Exit code 0 = pass, 1 = fail. Warnings do not affect exit code.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("path", help="plan directory (subfolder layout) or plan.md file (with --single-file)")
    parser.add_argument("--single-file", action="store_true", help="treat PATH as a single-file plan.md")
    parser.add_argument("--stories", metavar="DIR", default=None, help="also check user-stories index mirroring in DIR")
    return parser


if __name__ == "__main__":
    args = _build_parser().parse_args()
    if args.single_file:
        sys.exit(validate_single_file(args.path))
    sys.exit(validate_plan_dir(args.path, args.stories))
