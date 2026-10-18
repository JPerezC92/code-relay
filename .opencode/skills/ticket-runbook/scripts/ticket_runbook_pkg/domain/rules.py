"""Pure ticket-runbook rules: constants, typed models, parsers, and content-in/content-out checks."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional, Protocol, TypedDict

import yaml

# ---------------------------------------------------------------------------
# Kill-switch pilot values (tunable per project)
# Source: the project's kill-switch configuration
# ---------------------------------------------------------------------------
KILL_MAX_HYPOTHESES: int = 3
KILL_MAX_QUERIES: int = 6
KILL_MAX_RERUNS: int = 2
SLA_WARN_PCT: float = 0.25  # warn when < 25% SLA remaining (= 75% consumed)

# Working-analysis file names. ``state.md`` is the header; the other three are
# the ordered steps.
STATE_FILE: str = "state.md"
STEP_FILES: list[str] = [
    "01-identify.md",
    "02-investigate.md",
    "03-synthesize.md",
]
REQUIRED_ANALYSIS_FILES: list[str] = [STATE_FILE] + STEP_FILES

STEP_NAMES: list[str] = ["identify", "investigate", "synthesize"]
STEP_FILE_BY_NAME: dict[str, str] = {
    "identify": "01-identify.md",
    "investigate": "02-investigate.md",
    "synthesize": "03-synthesize.md",
}

# Required ## headings in every step file.
REQUIRED_STEP_SECTIONS: list[str] = [
    "Steps",
    "Output",
    "Gate",
    "Abort conditions",
]

# Owner/Pre/Reads/Writes appear as blockquote lines, not ## headings.
REQUIRED_BLOCKQUOTE_LABELS: list[str] = [
    "Owner",
    "Pre",
    "Reads",
    "Writes",
]

# Allowed values for the state.md Phase header field.
ALLOWED_PHASES: frozenset[str] = frozenset(STEP_NAMES)

# Allowed values for the state.md identification_verdict header field.
# - "pending"    : initial value set at scaffold time
# - "exact"      : exactly one active incident P-NNN, every discriminator evidenced
# - "structural" : exactly one candidate or active incident P-NNN
# - "no_match"   : no eligible incident P-NNN (an empty register always yields this)
ALLOWED_IDENTIFICATION_VERDICTS: frozenset[str] = frozenset(
    {"pending", "exact", "structural", "no_match"}
)

# Problem-register schema (knowledge/problems.md).
REGISTER_COLUMNS: tuple[str, ...] = (
    "id",
    "date",
    "team",
    "symptom",
    "system",
    "module",
    "problem",
    "discriminators",
    "exclusions",
    "evidence",
    "root_cause",
    "lifecycle",
    "allow_exact",
    "status",
)
ALLOWED_TEAMS: frozenset[str] = frozenset({"incident", "dev"})
ALLOWED_LIFECYCLES: frozenset[str] = frozenset(
    {"candidate", "active", "mitigated", "resolved", "retired"}
)
ALLOWED_ALLOW_EXACT: frozenset[str] = frozenset({"yes", "no"})
ALLOWED_STATUSES: frozenset[str] = frozenset({"open", "closed"})

# Angle-bracket tokens that legitimately persist in fully-filled step files
# (boilerplate references and convention placeholders, not data placeholders).
# Every other <...> token is treated as an unfilled fill-marker.
EXCLUDE_FILL_TOKENS: frozenset[str] = frozenset(
    {
        "<now>",
        "<calculated>",
        "<ID>",
        "<SYSTEM>",
        "<timestamp>",
        "<sidecar-parent-dir>",
        "<sidecar-path>",
        "<python>",
    }
)

_DATETIME_FMT = "%Y-%m-%dT%H:%M"
_FRACTION_RE = re.compile(r"^(\d+)/(\d+)$")
_FILL_TOKEN_RE = re.compile(r"<[^>]+>")
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_PROBLEM_ID_RE = re.compile(r"^P-\d+$")
_SYMPTOM_ID_RE = re.compile(r"S-\d{2}")
_CITED_PATH_RE = re.compile(r"\bpath:\s*\**\s*([^\n]+)")


class AnalysisHeader(TypedDict):
    """The seven required YAML frontmatter fields for ``analysis/state.md``."""

    Phase: str
    SLA_due: str
    Updated: str
    Hypotheses_outstanding: str
    Query_budget: str
    Identification_verdict: str
    Same_query_reruns: str


class ProblemRow(TypedDict):
    """One parsed row of the ``knowledge/problems.md`` register."""

    id: str
    date: str
    team: str
    symptom: str
    system: str
    module: str
    problem: str
    discriminators: str
    exclusions: str
    evidence: str
    root_cause: str
    lifecycle: str
    allow_exact: str
    status: str


class RegisterRowsPort(Protocol):
    """Injected IO port that loads problem-register rows on demand."""

    def __call__(self) -> list[ProblemRow]: ...


class ClockPort(Protocol):
    """Injected clock port returning one local naive timestamp per call."""

    def __call__(self) -> datetime: ...


class TicketIdentification(TypedDict):
    """The identification fields parsed from a ``ticket_<id>.md`` record."""

    symptom_ids: list[str]
    known_problem_ids: list[str]
    identification_verdict: str


class CloseOutSnapshot(TypedDict):
    """Filesystem values required to evaluate pre-close and close-out sets."""

    ticket_file_names: list[str]
    ticket_content: Optional[str]
    working_analysis_files: list[str]
    analysis_contents: dict[str, str]
    response_draft_present: bool
    screenshots_dir_present: bool
    validations_dir_present: bool
    missing_image_paths: list[str]
    missing_ticket_paths: list[str]
    unsafe_ticket_paths: list[str]


class ModeFindings(TypedDict):
    """Findings returned by one validation mode: blocking violations and warnings."""

    violations: list[str]
    warnings: list[str]


# ── Parsing helpers ─────────────────────────────────────────────────────────


def _parse_fraction(value: str) -> tuple[int, int]:
    """Parse a ``'N/M'`` fraction string into ``(N, M)``.

    Raises ``ValueError`` when the string does not match the pattern.
    """
    m = _FRACTION_RE.match(str(value).strip())
    if not m:
        raise ValueError(f"Expected N/M fraction, got: {value!r}")
    return int(m.group(1)), int(m.group(2))


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    """Parse an ISO datetime string ``'YYYY-MM-DDTHH:MM'``.

    Returns ``None`` when the value is a placeholder (contains ``<`` or ``Y``
    characters indicating an unfilled template value).
    """
    s = str(value).strip()
    if "<" in s or "Y" in s:
        return None
    try:
        return datetime.strptime(s, _DATETIME_FMT)
    except ValueError:
        return None


def _load_front_matter(content: str, source: str) -> dict[str, object]:
    """Parse the YAML frontmatter block of ``content``.

    Raises ``ValueError`` when the block is absent, unclosed, not a mapping, or
    invalid YAML.
    """
    lines = content.splitlines(keepends=True)

    if not lines or lines[0].rstrip("\r\n") != "---":
        raise ValueError(f"No YAML frontmatter block found in {source}")

    closing: Optional[int] = None
    for i, line in enumerate(lines[1:], start=1):
        if line.rstrip("\r\n") == "---":
            closing = i
            break

    if closing is None:
        raise ValueError(f"Unclosed frontmatter in {source}")

    frontmatter_text = "".join(lines[1:closing])
    try:
        data = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML frontmatter in {source}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Frontmatter is not a YAML mapping in {source}")

    return data


def _split_table_row(line: str) -> list[str]:
    """Split a Markdown table row into stripped cells.

    Returns an empty list when the line is not a table row.
    """
    stripped = line.strip()
    if not stripped.startswith("|"):
        return []
    return [cell.strip() for cell in stripped.strip("|").split("|")]


def _coerce_str_list(value: object) -> list[str]:
    """Normalize a YAML scalar or list value into a list of strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text or text == "[]":
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


# ── State-header parsing and checks ──────────────────────────────────────────


def parse_state_header(content: str, source: str) -> AnalysisHeader:
    """Extract the seven YAML frontmatter fields from ``analysis/state.md``.

    Raises ``ValueError`` when the file cannot be parsed or is missing fields.
    """
    data = _load_front_matter(content, source)

    required_keys = {
        "Phase",
        "SLA-due",
        "Updated",
        "Hypotheses-outstanding",
        "Query-budget",
        "identification_verdict",
        "Same-query-reruns",
    }
    missing = required_keys - data.keys()
    if missing:
        raise ValueError(f"Missing header fields in {source}: {sorted(missing)}")

    return {
        "Phase": str(data["Phase"]),
        "SLA_due": str(data["SLA-due"]),
        "Updated": str(data["Updated"]),
        "Hypotheses_outstanding": str(data["Hypotheses-outstanding"]),
        "Query_budget": str(data["Query-budget"]),
        "Identification_verdict": str(data["identification_verdict"]),
        "Same_query_reruns": str(data["Same-query-reruns"]),
    }


def _step_rank(fname: str) -> int:
    """Return the 1-based rank of a step filename.

    Returns ``99`` for filenames that do not match a known step (treated as
    always-required).
    """
    if fname in STEP_FILES:
        return STEP_FILES.index(fname) + 1
    return 99


def _current_step_rank(header: AnalysisHeader) -> Optional[int]:
    """Map the ``Phase`` header value to a 1-based step rank.

    Returns ``None`` when ``Phase`` is not a known step name.
    """
    phase = header["Phase"].strip()
    if phase in STEP_FILE_BY_NAME:
        return STEP_FILES.index(STEP_FILE_BY_NAME[phase]) + 1
    return None


def check_phase(header: AnalysisHeader) -> list[str]:
    """Check that ``Phase`` is a known step name.

    Violations:
        PHASE-ERROR: value not in ALLOWED_PHASES
    """
    value = header["Phase"].strip()
    if value not in ALLOWED_PHASES:
        allowed = ", ".join(STEP_NAMES)
        return [
            f"PHASE-ERROR: Phase value {value!r} not in allowed set ({allowed})"
        ]
    return []


def check_identification_verdict(header: AnalysisHeader) -> list[str]:
    """Check that ``identification_verdict`` is an allowed enum value.

    Violations:
        VERDICT-1: value not in ALLOWED_IDENTIFICATION_VERDICTS
    """
    value = header["Identification_verdict"].strip()
    if value not in ALLOWED_IDENTIFICATION_VERDICTS:
        allowed = ", ".join(sorted(ALLOWED_IDENTIFICATION_VERDICTS))
        return [
            f"VERDICT-1: identification_verdict value {value!r} not in "
            f"allowed set ({allowed})"
        ]
    return []


def check_kill_switches(header: AnalysisHeader) -> list[str]:
    """Check kill-switch counters in the parsed header dict.

    Returns a list of violation strings.  Empty list means no kill-switch is
    tripped.

    Violations:
        KILL-1: Hypotheses-outstanding numerator > KILL_MAX_HYPOTHESES
        KILL-2: Query-budget numerator > denominator
        KILL-3: Same-query-reruns numerator > KILL_MAX_RERUNS
    """
    violations: list[str] = []

    try:
        hyp_consumed, _ = _parse_fraction(header["Hypotheses_outstanding"])
        if hyp_consumed > KILL_MAX_HYPOTHESES:
            violations.append(
                f"KILL-1: hypothesis cap exceeded "
                f"({hyp_consumed} > {KILL_MAX_HYPOTHESES})"
            )
    except ValueError as exc:
        violations.append(f"KILL-1: cannot parse Hypotheses-outstanding — {exc}")

    try:
        q_consumed, q_limit = _parse_fraction(header["Query_budget"])
        if q_consumed > q_limit:
            violations.append(
                f"KILL-2: query budget exhausted "
                f"({q_consumed} > {q_limit})"
            )
    except ValueError as exc:
        violations.append(f"KILL-2: cannot parse Query-budget — {exc}")

    try:
        rerun_consumed, _ = _parse_fraction(header["Same_query_reruns"])
        if rerun_consumed > KILL_MAX_RERUNS:
            violations.append(
                f"KILL-3: re-run cap exceeded "
                f"({rerun_consumed} > {KILL_MAX_RERUNS})"
            )
    except ValueError as exc:
        violations.append(f"KILL-3: cannot parse Same-query-reruns — {exc}")

    return violations


def check_sla_clock(header: AnalysisHeader, now: datetime) -> Optional[str]:
    """Warn when the SLA time remaining is below ``SLA_WARN_PCT`` of the window.

    Returns a warning string when the threshold is breached, ``None`` otherwise.
    Skips the check silently when SLA-due or Updated are placeholder values.
    ``now`` is an explicit injected input; the domain never reads a clock.
    """
    sla_due = _parse_iso_datetime(header["SLA_due"])
    updated = _parse_iso_datetime(header["Updated"])

    if sla_due is None or updated is None:
        return None  # placeholder values — template not yet filled

    total_window = (sla_due - updated).total_seconds()
    if total_window <= 0:
        return None  # degenerate window — cannot compute ratio

    remaining = (sla_due - now).total_seconds()
    remaining_pct = remaining / total_window

    if remaining_pct < SLA_WARN_PCT:
        hours_remaining = max(remaining / 3600, 0.0)
        return (
            f"SLA-WARN: {hours_remaining:.1f} hours remaining "
            f"({remaining_pct * 100:.0f}% of window left)"
        )
    return None


def check_concurrent_session(header: AnalysisHeader, now: datetime) -> Optional[str]:
    """Warn when ``Updated`` was written less than 10 minutes ago.

    This is a non-blocking safety warning: another agent session may still be
    active on the same analysis.  Returns a warning string when the condition is
    met, ``None`` otherwise.  Skips silently when ``Updated`` is a placeholder.
    ``now`` is an explicit injected input; the domain never reads a clock.
    """
    updated = _parse_iso_datetime(header["Updated"])
    if updated is None:
        return None  # placeholder — template not yet filled

    delta_seconds = (now - updated).total_seconds()

    if delta_seconds < 600:  # 10 minutes = 600 seconds
        minutes_ago = int(delta_seconds // 60)
        return (
            f"CONCURRENT: another session updated {minutes_ago} minutes ago "
            f"(Updated: {header['Updated']})"
        )
    return None


# ── Step-file structure checks ───────────────────────────────────────────────


def check_step_files_exist(
    step_contents: dict[str, str],
    analysis_dir: str,
    current_rank: Optional[int] = None,
) -> tuple[list[str], list[str]]:
    """Verify that required step files exist in ``analysis_dir``.

    When ``current_rank`` is supplied, step files through that rank are
    violations when absent; later step files are warnings when absent.  Without
    ``current_rank``, absent steps at or below the highest present rank are
    violations and later absences are warnings.

    Returns:
        (violations, warnings) — two separate lists of strings.
    """
    presence = {fname: fname in step_contents for fname in STEP_FILES}

    violations: list[str] = []
    warnings: list[str] = []

    for fname in STEP_FILES:
        rank = _step_rank(fname)
        if presence[fname]:
            continue
        if current_rank is not None and rank <= current_rank:
            violations.append(
                f"MISSING-STEP: {fname} not found in {analysis_dir}"
            )
        elif current_rank is not None:
            warnings.append(
                f"INCOMPLETE-ANALYSIS: {fname} not yet written "
                f"(current step rank: {current_rank:02d})"
            )
        else:
            highest_present = max(
                (r for f, r in ((f, _step_rank(f)) for f in STEP_FILES)
                 if presence[f]),
                default=0,
            )
            if rank <= highest_present:
                violations.append(
                    f"MISSING-STEP: {fname} not found in {analysis_dir}"
                )
            else:
                warnings.append(
                    f"INCOMPLETE-ANALYSIS: {fname} not yet written "
                    f"(highest written rank: {highest_present:02d})"
                )

    return violations, warnings


def check_single_step_file_exists(
    step_contents: dict[str, str], step_name: str
) -> Optional[str]:
    """Return the filename for ``step_name`` when it is present, else ``None``."""
    fname = STEP_FILE_BY_NAME.get(step_name)
    if fname is None:
        return None
    return fname if fname in step_contents else None


def _check_step_body_fill_markers(
    content: str, fname: str
) -> list[tuple[str, str]]:
    """Scan step-file content for unfilled ``<...>`` placeholder tokens.

    Any ``<token>`` NOT in ``EXCLUDE_FILL_TOKENS`` is treated as an unfilled data
    placeholder left over from the scaffold template.  HTML comments are
    stripped before the scan.  Accepts already-read content (no IO performed
    here).
    """
    findings: list[tuple[str, str]] = []
    stripped = _HTML_COMMENT_RE.sub("", content)
    for line in stripped.splitlines():
        for tok in _FILL_TOKEN_RE.findall(line):
            if tok not in EXCLUDE_FILL_TOKENS:
                findings.append((fname, f"UNFILLED-TOKEN: {tok}"))
    return findings


def _check_step_file_sections(
    content: str,
    fname: str,
    include_fill_tokens: bool = True,
) -> list[tuple[str, str]]:
    """Check one step file for required headings, blockquote labels, and tokens.

    Returns a list of ``(filename, missing_item)`` tuples.  Empty list means the
    file is structurally complete.  The caller supplies already-loaded content.
    """
    findings: list[tuple[str, str]] = []
    h2_re = re.compile(r"^##\s+(.+)$")
    blockquote_label_re = re.compile(r"^>\s+\*\*(\w[\w\s-]*):\*\*")

    h2_present: set[str] = set()
    labels_present: set[str] = set()

    for line in content.splitlines():
        h2_match = h2_re.match(line)
        if h2_match:
            h2_present.add(h2_match.group(1).strip())

        bq_match = blockquote_label_re.match(line)
        if bq_match:
            labels_present.add(bq_match.group(1).strip())

    for section in REQUIRED_STEP_SECTIONS:
        if section not in h2_present:
            findings.append((fname, f"## {section}"))

    for label in REQUIRED_BLOCKQUOTE_LABELS:
        if label not in labels_present:
            findings.append((fname, f"**{label}:**"))

    if include_fill_tokens:
        findings.extend(_check_step_body_fill_markers(content, fname))

    return findings


def check_step_files_have_required_sections(
    step_contents: dict[str, str],
    fill_token_rank_limit: Optional[int] = None,
) -> list[tuple[str, str]]:
    """Validate required structure in every present step file.

    Fill-token checks apply to every present step by default.  When
    ``fill_token_rank_limit`` is supplied, they apply only through that rank;
    all later present step files still receive structural checks.
    """
    findings: list[tuple[str, str]] = []

    for fname in STEP_FILES:
        content = step_contents.get(fname)
        if content is None:
            continue  # missing-file check handled by check_step_files_exist
        include_fill_tokens = (
            fill_token_rank_limit is None
            or _step_rank(fname) <= fill_token_rank_limit
        )
        findings.extend(
            _check_step_file_sections(content, fname, include_fill_tokens)
        )

    return findings


def check_single_step_sections(
    step_contents: dict[str, str], step_name: str
) -> list[tuple[str, str]]:
    """Check the required sections for the single step file matching ``step_name``."""
    findings: list[tuple[str, str]] = []
    fname = STEP_FILE_BY_NAME.get(step_name)
    if fname is None:
        return findings
    content = step_contents.get(fname)
    if content is not None:
        findings.extend(_check_step_file_sections(content, fname))
    return findings


# ── Register-first identification checks ─────────────────────────────────────


def parse_problem_register(content: str) -> list[ProblemRow]:
    """Parse the data rows of a ``knowledge/problems.md`` register.

    Returns one ``ProblemRow`` per well-formed ``P-NNN`` row.  An empty register
    (or a register with only header/separator/no-entry rows) returns ``[]``.
    """
    rows: list[ProblemRow] = []
    for line in content.splitlines():
        cells = _split_table_row(line)
        if not cells or not _PROBLEM_ID_RE.match(cells[0]):
            continue
        if len(cells) != len(REGISTER_COLUMNS):
            continue
        rows.append(
            ProblemRow(
                id=cells[0],
                date=cells[1],
                team=cells[2],
                symptom=cells[3],
                system=cells[4],
                module=cells[5],
                problem=cells[6],
                discriminators=cells[7],
                exclusions=cells[8],
                evidence=cells[9],
                root_cause=cells[10],
                lifecycle=cells[11],
                allow_exact=cells[12],
                status=cells[13],
            )
        )
    return rows


def check_register_rows(content: str) -> list[str]:
    """Validate the schema of every ``P-NNN`` row in a register.

    Violations:
        REGISTER-1: row does not have exactly len(REGISTER_COLUMNS) cells
        REGISTER-2: Team is not `incident` | `dev`
        REGISTER-3: Lifecycle is not an allowed value
        REGISTER-4: Allow_exact is not `yes` | `no`
        REGISTER-5: Status is not `open` | `closed`
        REGISTER-6: Symptom does not reference >=1 S-xx class
    """
    violations: list[str] = []
    for lineno, line in enumerate(content.splitlines(), start=1):
        cells = _split_table_row(line)
        if not cells or not _PROBLEM_ID_RE.match(cells[0]):
            continue
        pi = cells[0]
        if len(cells) != len(REGISTER_COLUMNS):
            violations.append(
                f"REGISTER-1: {pi} (line {lineno}) has {len(cells)} columns, "
                f"expected {len(REGISTER_COLUMNS)}"
            )
            continue
        row = ProblemRow(
            id=cells[0],
            date=cells[1],
            team=cells[2],
            symptom=cells[3],
            system=cells[4],
            module=cells[5],
            problem=cells[6],
            discriminators=cells[7],
            exclusions=cells[8],
            evidence=cells[9],
            root_cause=cells[10],
            lifecycle=cells[11],
            allow_exact=cells[12],
            status=cells[13],
        )
        if row["team"] not in ALLOWED_TEAMS:
            violations.append(
                f"REGISTER-2: {pi} Team {row['team']!r} not in "
                f"({', '.join(sorted(ALLOWED_TEAMS))})"
            )
        if row["lifecycle"] not in ALLOWED_LIFECYCLES:
            violations.append(
                f"REGISTER-3: {pi} Lifecycle {row['lifecycle']!r} not in "
                f"({', '.join(sorted(ALLOWED_LIFECYCLES))})"
            )
        if row["allow_exact"] not in ALLOWED_ALLOW_EXACT:
            violations.append(
                f"REGISTER-4: {pi} Allow_exact {row['allow_exact']!r} not in "
                f"({', '.join(sorted(ALLOWED_ALLOW_EXACT))})"
            )
        if row["status"] not in ALLOWED_STATUSES:
            violations.append(
                f"REGISTER-5: {pi} Status {row['status']!r} not in "
                f"({', '.join(sorted(ALLOWED_STATUSES))})"
            )
        if not _SYMPTOM_ID_RE.search(row["symptom"]):
            violations.append(
                f"REGISTER-6: {pi} Symptom {row['symptom']!r} references no S-xx"
            )
    return violations


def check_identification_consistency(
    verdict: str,
    cited_problem_ids: list[str],
    register_rows: list[ProblemRow],
) -> list[str]:
    """Check a verdict against the incident rows it cites.

    Rules:
        - ``no_match`` cites no P-NNN.
        - ``pending`` is scaffold-only.
        - ``exact``/``structural`` cite at least one incident P-NNN.
        - ``exact`` cites exactly one ``active`` row with ``allow_exact: yes``.
        - ``structural`` cites only ``candidate``/``active`` rows.
        - An empty register can only yield ``no_match``.

    Violations:
        VERDICT-2: no_match cites a P-NNN
        VERDICT-3: exact/structural cite no P-NNN
        VERDICT-4: cited ID is not an incident row in the register
        VERDICT-5: exact cites more than one P-NNN
        VERDICT-6: exact cites a non-active row
        VERDICT-7: exact cites a row with allow_exact != yes
        VERDICT-8: structural cites a row outside candidate|active
    """
    violations: list[str] = []
    incident_rows = [row for row in register_rows if row["team"] == "incident"]
    cited = list(dict.fromkeys(cited_problem_ids))

    if verdict == "pending":
        return violations

    if verdict == "no_match":
        if cited:
            violations.append(
                f"VERDICT-2: no_match must not cite a P-NNN (cited: {cited})"
            )
        return violations

    if verdict not in ("exact", "structural"):
        return violations

    if not cited:
        violations.append(
            f"VERDICT-3: {verdict} requires a cited incident P-NNN"
        )
        return violations

    matched = [row for row in incident_rows if row["id"] in set(cited)]
    for cid in cited:
        if not any(row["id"] == cid for row in incident_rows):
            violations.append(
                f"VERDICT-4: cited {cid} is not an incident P-NNN row"
            )

    if verdict == "exact":
        if len(cited) != 1:
            violations.append(
                f"VERDICT-5: exact requires exactly one cited P-NNN "
                f"(cited: {cited})"
            )
        for row in matched:
            if row["lifecycle"] != "active":
                violations.append(
                    f"VERDICT-6: exact requires an active P-NNN "
                    f"({row['id']} is {row['lifecycle']})"
                )
            if row["allow_exact"] != "yes":
                violations.append(
                    f"VERDICT-7: exact requires allow_exact=yes "
                    f"({row['id']} is {row['allow_exact']})"
                )

    if verdict == "structural":
        for row in matched:
            if row["lifecycle"] not in ("candidate", "active"):
                violations.append(
                    f"VERDICT-8: structural requires candidate|active "
                    f"({row['id']} is {row['lifecycle']})"
                )

    return violations


def parse_ticket_record(content: str, source: str) -> TicketIdentification:
    """Extract identification fields from a ``ticket_<id>.md`` frontmatter.

    Missing fields default to an empty list / ``pending`` so a template record
    validates without inventing data.
    """
    data = _load_front_matter(content, source)
    return {
        "symptom_ids": _coerce_str_list(data.get("symptom_ids")),
        "known_problem_ids": _coerce_str_list(data.get("known_problem_ids")),
        "identification_verdict": str(
            data.get("identification_verdict", "pending")
        ).strip(),
    }


# ── Close-out checks ─────────────────────────────────────────────────────────


def _cited_image_paths(content: str) -> list[str]:
    """Return every ``path:`` value found in Image-style blocks.

    Instructional HTML comments are stripped before matching, so a commented
    example (for example a template's Imagen-footer hint) is not read as a real
    citation.  Active citations keep the existing extraction and the downstream
    containment/existence checks in both close modes.
    """
    paths: list[str] = []
    stripped = _HTML_COMMENT_RE.sub("", content)
    for match in _CITED_PATH_RE.finditer(stripped):
        value = match.group(1).strip().strip("`").strip()
        if value:
            paths.append(value)
    return paths


def evaluate_pre_close(
    snapshot: CloseOutSnapshot, register_rows: list[ProblemRow]
) -> list[str]:
    """Evaluate pre-collapse readiness from an already-loaded snapshot."""
    violations: list[str] = []
    ticket_names = snapshot["ticket_file_names"]

    if not ticket_names:
        violations.append("PRE-CLOSE-0: ticket_<id>.md not found")
    elif len(ticket_names) > 1:
        violations.append(
            "PRE-CLOSE-1: multiple ticket_<id>.md records found: "
            + ", ".join(ticket_names)
        )

    actual_analysis = set(snapshot["working_analysis_files"])
    required_analysis = set(REQUIRED_ANALYSIS_FILES)
    for name in sorted(required_analysis - actual_analysis):
        violations.append(f"PRE-CLOSE-2: required analysis file missing: {name}")
    for name in sorted(actual_analysis - required_analysis):
        violations.append(f"PRE-CLOSE-2: unexpected analysis file present: {name}")

    if not snapshot["response_draft_present"]:
        violations.append("PRE-CLOSE-3: response-draft.md not found")
    if not snapshot["screenshots_dir_present"]:
        violations.append("PRE-CLOSE-4: screenshots/ not found")
    if not snapshot["validations_dir_present"]:
        violations.append("PRE-CLOSE-5: validations/ not found")

    for value in snapshot["unsafe_ticket_paths"]:
        violations.append(
            f"PRE-CLOSE-6: cited path escapes the ticket root: {value}"
        )
    for value in snapshot["missing_ticket_paths"]:
        violations.append(
            f"PRE-CLOSE-7: cited path is not an existing file: {value}"
        )

    if len(ticket_names) == 1 and snapshot["ticket_content"] is not None:
        try:
            record = parse_ticket_record(
                snapshot["ticket_content"], ticket_names[0]
            )
        except ValueError as exc:
            violations.append(f"PRE-CLOSE-8: ticket record cannot be parsed: {exc}")
        else:
            violations.extend(
                check_identification_consistency(
                    record["identification_verdict"],
                    record["known_problem_ids"],
                    register_rows,
                )
            )

    state_content = snapshot["analysis_contents"].get(STATE_FILE)
    if state_content is not None:
        try:
            header = parse_state_header(state_content, STATE_FILE)
        except ValueError as exc:
            violations.append(f"PRE-CLOSE-9: state.md cannot be parsed: {exc}")
        else:
            violations.extend(check_phase(header))
            if header["Phase"].strip() != "synthesize":
                violations.append(
                    "PRE-CLOSE-10: state.md Phase must be 'synthesize'"
                )
            violations.extend(check_identification_verdict(header))
            violations.extend(check_kill_switches(header))
            for _fname, item in _check_step_body_fill_markers(
                state_content, STATE_FILE
            ):
                violations.append(f"{item} in {_fname}")

    step_contents = {
        name: content
        for name, content in snapshot["analysis_contents"].items()
        if name in STEP_FILES
    }
    for fname, item in check_step_files_have_required_sections(step_contents):
        if item.startswith("UNFILLED-TOKEN:"):
            violations.append(f"{item} in {fname}")
        else:
            violations.append(f"MISSING-SECTION: {fname} is missing {item}")

    return violations


def evaluate_close_out(snapshot: CloseOutSnapshot) -> list[str]:
    """Evaluate a loaded close-out snapshot without performing IO.

    Violations:
        CLOSE-0: ticket_<id>.md missing
        CLOSE-1: a working analysis file remains
        CLOSE-2: response-draft.md remains
        CLOSE-3: screenshots/ missing from the durable set
        CLOSE-4: validations/ missing from the durable set
        CLOSE-5: a cited image path is not an existing file inside the
                 ticket folder
        CLOSE-6: multiple ticket_<id>.md records exist
    """
    violations: list[str] = []

    if not snapshot["ticket_file_names"]:
        violations.append("CLOSE-0: ticket_<id>.md not found")
    elif len(snapshot["ticket_file_names"]) > 1:
        violations.append(
            "CLOSE-6: multiple ticket_<id>.md records found: "
            + ", ".join(snapshot["ticket_file_names"])
        )

    for name in snapshot["working_analysis_files"]:
        violations.append(
            f"CLOSE-1: working analysis file remains after close: {name}"
        )

    if snapshot["response_draft_present"]:
        violations.append("CLOSE-2: response-draft.md remains after close")

    if not snapshot["screenshots_dir_present"]:
        violations.append("CLOSE-3: screenshots/ missing from the durable set")

    if not snapshot["validations_dir_present"]:
        violations.append("CLOSE-4: validations/ missing from the durable set")

    for value in snapshot["missing_image_paths"]:
        violations.append(
            f"CLOSE-5: cited image path is not an existing file inside the "
            f"ticket folder: {value}"
        )

    return violations
