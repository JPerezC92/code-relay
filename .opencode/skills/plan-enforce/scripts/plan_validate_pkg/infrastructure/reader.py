"""Infrastructure layer: file IO and snapshot loading for the plan validator.

Loads plan/phase/story text from disk and delegates every rule to the domain
layer; holds no rule logic of its own.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from plan_validate_pkg.domain.rules import (
    PhaseSnapshot,
    PlanSnapshot,
    StoryIndexSnapshot,
    StorySnapshot,
    check_phase_snapshot,
    check_plan_snapshot,
    check_story_index_snapshot,
)


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


def check_plan_file(plan_path: Path) -> list[str]:
    snapshot = load_plan_snapshot(plan_path)
    if snapshot is None:
        return [f"MISSING-FILE: {plan_path} not found"]
    return check_plan_snapshot(snapshot)


def check_phase_file(phase_path: Path) -> list[str]:
    snapshot = load_phase_snapshot(phase_path)
    if snapshot is None:
        return [f"MISSING-FILE: {phase_path} not found"]
    return check_phase_snapshot(snapshot)


def check_story_index(user_stories_dir: str) -> list[str]:
    return check_story_index_snapshot(load_story_index_snapshot(Path(user_stories_dir)))
