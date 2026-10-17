"""Process adapter: fetch `opencode models` output and map it to models."""

from __future__ import annotations

import subprocess

from op_model_lookup.domain.catalog import (
    Model,
    ModelSourceFailure,
    parse_records,
)


class OpencodeModelSource:
    """ModelSource adapter over the local `opencode models` process."""

    def fetch(self) -> tuple[Model, ...]:
        """Run the checked live command and return the valid parsed models.

        A missing executable, failed child execution, or timeout is raised as
        ModelSourceFailure; no fallback or partial output is ever returned.
        """
        try:
            completed = subprocess.run(
                ["opencode", "models"],
                capture_output=True,
                text=True,
                check=True,
                timeout=60,
            )
        except FileNotFoundError as exc:
            raise ModelSourceFailure(
                "ERROR: `opencode` not found on PATH. Cannot list models."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise ModelSourceFailure(
                f"ERROR: `opencode models` failed (exit {exc.returncode}):\n"
                f"{exc.stderr}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ModelSourceFailure(
                "ERROR: `opencode models` timed out."
            ) from exc
        return parse_records(completed.stdout).models
