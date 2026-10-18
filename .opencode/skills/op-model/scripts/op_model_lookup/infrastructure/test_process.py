"""Integration tests for the OpencodeModelSource process adapter over a stubbed subprocess.run."""

from __future__ import annotations

import subprocess
from typing import TypedDict

import pytest

from op_model_lookup.domain.catalog import Model, ModelSourceFailure
from op_model_lookup.infrastructure.process import OpencodeModelSource

STDOUT_CATALOG = "openai/gpt-4\ngoogle/gemini-2.5-flash\n"

EXPECTED_MODELS = (
    Model.create(
        config="openai/gpt-4",
        id="gpt-4",
        provider="openai",
        name="gpt-4",
        cost_in=0.0,
        cost_out=0.0,
    ),
    Model.create(
        config="google/gemini-2.5-flash",
        id="gemini-2.5-flash",
        provider="google",
        name="gemini-2.5-flash",
        cost_in=0.0,
        cost_out=0.0,
    ),
)


class Invocation(TypedDict):
    """Recorded subprocess.run call shape and option values."""

    command: list[str]
    capture_output: bool
    text: bool
    check: bool
    timeout: int


class OpencodeModelSourceTests:
    """Fetch behavior: checked invocation, stdout mapping, and boundary-failure channels."""

    def test_fetch_runs_checked_command_with_capture_and_timeout(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[Invocation] = []

        def stub_run(
            command: list[str],
            *,
            capture_output: bool,
            text: bool,
            check: bool,
            timeout: int,
        ) -> subprocess.CompletedProcess[str]:
            calls.append(
                Invocation(
                    command=list(command),
                    capture_output=capture_output,
                    text=text,
                    check=check,
                    timeout=timeout,
                )
            )
            return subprocess.CompletedProcess(
                args=command, returncode=0, stdout="", stderr=""
            )

        monkeypatch.setattr(subprocess, "run", stub_run)
        OpencodeModelSource().fetch()
        assert calls == [
            Invocation(
                command=["opencode", "models"],
                capture_output=True,
                text=True,
                check=True,
                timeout=60,
            )
        ]

    def test_fetch_maps_stdout_selector_lines_to_models(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def stub_run(
            command: list[str], **kwargs: object
        ) -> subprocess.CompletedProcess[str]:
            return subprocess.CompletedProcess(
                args=command, returncode=0, stdout=STDOUT_CATALOG, stderr=""
            )

        monkeypatch.setattr(subprocess, "run", stub_run)
        assert OpencodeModelSource().fetch() == EXPECTED_MODELS

    def test_missing_executable_raises_model_source_failure(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A missing `opencode` executable names the tool and reports it cannot list models."""

        def stub_run(
            command: list[str], **kwargs: object
        ) -> subprocess.CompletedProcess[str]:
            raise FileNotFoundError("opencode")

        monkeypatch.setattr(subprocess, "run", stub_run)
        with pytest.raises(ModelSourceFailure) as exc_info:
            OpencodeModelSource().fetch()
        assert (
            str(exc_info.value)
            == "ERROR: `opencode` not found on PATH. Cannot list models."
        )

    def test_failed_child_execution_raises_model_source_failure(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def stub_run(
            command: list[str], **kwargs: object
        ) -> subprocess.CompletedProcess[str]:
            raise subprocess.CalledProcessError(
                returncode=2, cmd=command, stderr="boom"
            )

        monkeypatch.setattr(subprocess, "run", stub_run)
        with pytest.raises(ModelSourceFailure) as exc_info:
            OpencodeModelSource().fetch()
        assert (
            str(exc_info.value)
            == "ERROR: `opencode models` failed (exit 2):\nboom"
        )

    def test_timeout_raises_model_source_failure(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def stub_run(
            command: list[str], **kwargs: object
        ) -> subprocess.CompletedProcess[str]:
            raise subprocess.TimeoutExpired(cmd=command, timeout=60)

        monkeypatch.setattr(subprocess, "run", stub_run)
        with pytest.raises(ModelSourceFailure) as exc_info:
            OpencodeModelSource().fetch()
        assert str(exc_info.value) == "ERROR: `opencode models` timed out."
