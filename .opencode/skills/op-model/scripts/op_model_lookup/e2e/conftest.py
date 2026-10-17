"""E2E fixtures: hermetic fake `opencode` executable and bounded isolated `models.py` runs."""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

MODELS_SCRIPT = Path(__file__).resolve().parents[2] / "models.py"
FAKE_OPENCODE_TEMPLATE = (
    "#!{interpreter}\n"
    '"""Fake `opencode`: emit the controlled selector-line stdout payload and exit."""\n'
    "\n"
    "import sys\n"
    "\n"
    "sys.stdout.write({payload!r})\n"
)
RUN_TIMEOUT_SECONDS = 30.0


@pytest.fixture
def fake_opencode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Callable[[str], Path]:
    """Return an installer for a payload-controlled fake `opencode` on an isolated PATH.

    The installed fake prints a controlled `opencode models` selector-line payload
    (one `provider/model` per line) as its stdout. It lives in ``tmp_path/bin``
    with a literal absolute shebang from ``sys.executable``, preserving the
    project virtual environment without dereferencing its interpreter symlink or
    consulting PATH. PATH, HOME, XDG_CONFIG_HOME and OPENCODE_CONFIG are
    redirected via monkeypatch, so no installed or authenticated OpenCode and no
    real config is ever reachable.
    """
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    home_dir = tmp_path / "home"
    home_dir.mkdir()
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    monkeypatch.setenv("PATH", str(bin_dir))
    monkeypatch.setenv("HOME", str(home_dir))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(config_dir))
    monkeypatch.setenv("OPENCODE_CONFIG", str(tmp_path / "opencode.jsonc"))

    def install(payload: str) -> Path:
        """Write the fake `opencode` emitting the selector-line `payload`; return its path."""
        executable = bin_dir / "opencode"
        executable.write_text(
            FAKE_OPENCODE_TEMPLATE.format(
                interpreter=Path(sys.executable).absolute(), payload=payload
            ),
            encoding="utf-8",
        )
        executable.chmod(0o755)
        return executable

    return install


@pytest.fixture
def run_models(
    fake_opencode: Callable[[str], Path],
) -> Callable[..., subprocess.CompletedProcess[str]]:
    """Return a bounded runner over the fake-`opencode` environment for `models.py`."""

    def run(payload: str, *args: str) -> subprocess.CompletedProcess[str]:
        """Install the selector-line `payload` as fake `opencode` output, then run `models.py` with `args`."""
        fake_opencode(payload)
        return subprocess.run(
            [sys.executable, str(MODELS_SCRIPT), *args],
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT_SECONDS,
        )

    return run
