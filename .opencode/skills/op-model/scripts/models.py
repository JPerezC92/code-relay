#!/usr/bin/env python3
"""models.py — fetch and filter the opencode models available to this user.

Entry point for the `op-model` skill's model lookup: composes the opencode
process source with the lookup CLI in `op_model_lookup`.

Usage:
  <python> .opencode/skills/op-model/scripts/models.py                list all available models grouped by provider as provider/model selectors (in/out cost shown only when the source provides it)
  <python> .opencode/skills/op-model/scripts/models.py "<query>"      list matching records only (JSON lines)

Output record fields:
  config      full config name, e.g. deepseek/deepseek-v4-flash
  id          model id, e.g. deepseek-v4-flash
  provider    provider id, e.g. deepseek
  name        human name, e.g. DeepSeek V4 Flash
  cost_in     input cost per 1M tokens (float, 0.0 when the source provides none)
  cost_out    output cost per 1M tokens (float, 0.0 when the source provides none)

Matching normalizes both sides: lowercase, strips non-alphanumerics, and
matches against the config name AND the human name.
"""

import sys

from op_model_lookup.application.find_models import execute
from op_model_lookup.domain.catalog import ModelSourceFailure
from op_model_lookup.infrastructure.cli import run_cli
from op_model_lookup.infrastructure.process import OpencodeModelSource


def main() -> None:
    """Compose the live model source with the use case and CLI renderer."""
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    source = OpencodeModelSource()
    try:
        outcome = execute(query, source)
    except ModelSourceFailure as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)
    sys.exit(run_cli(outcome, query))


if __name__ == "__main__":
    main()
