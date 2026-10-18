"""CLI adapter: render model selections and map outcomes to process exit codes."""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence

from op_model_lookup.domain.catalog import (
    Model,
    NoMatchingModels,
    NoModelsAvailable,
)


def render_selection(selection: Sequence[Model], query: str) -> str:
    """Render the selected models as JSON lines (query) or a grouped listing."""
    if not selection:
        return ""
    if query:
        return "".join(_render_record(model) + "\n" for model in selection)
    return _render_grouped(selection)


def _render_record(model: Model) -> str:
    """Serialize one model as a JSON object with the six contract fields in order."""
    return json.dumps(
        {
            "config": model.config,
            "id": model.id,
            "provider": model.provider,
            "name": model.name,
            "cost_in": model.cost_in,
            "cost_out": model.cost_out,
        }
    )


def _render_grouped(selection: Sequence[Model]) -> str:
    """Render the models grouped by provider, noting name and cost only when known."""
    by_provider: dict[str, list[Model]] = {}
    for model in selection:
        by_provider.setdefault(model.provider, []).append(model)
    lines: list[str] = []
    for provider in sorted(by_provider):
        lines.append(f"## {provider}")
        for model in sorted(by_provider[provider], key=lambda item: item.config):
            line = f"  {model.config}"
            if model.name != model.id:
                line += f" | {model.name}"
            if model.cost_in != 0.0 or model.cost_out != 0.0:
                line += f" | in:{model.cost_in} per 1M | out:{model.cost_out} per 1M"
            lines.append(line)
        lines.append("")
    return "\n".join(lines) + "\n"


def run_cli(outcome: Sequence[Model] | NoModelsAvailable | NoMatchingModels, query: str) -> int:
    """Render the lookup outcome and return the process exit code."""
    if isinstance(outcome, NoModelsAvailable | NoMatchingModels):
        print(outcome.message, file=sys.stderr)
        return 1
    sys.stdout.write(render_selection(outcome, query))
    return 0
