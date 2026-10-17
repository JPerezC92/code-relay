"""Independent fixture builders for op_model_lookup tests.

Builds raw `opencode models` stdout payloads (one `provider/model` selector per
line) and literal Model values from hand-written field literals. Expected values
are never derived by running production parsing, and importing this module
performs no work.
"""

from op_model_lookup.domain.catalog import Model


def selector_line(provider: str, model_id: str) -> str:
    """Return one `provider/model_id` selector line as `opencode models` prints it."""
    return f"{provider}/{model_id}"


def raw_stdout(*lines: str) -> str:
    """Return one raw stdout payload joining the given lines with trailing newlines."""
    return "".join(f"{line}\n" for line in lines)


def literal_model(
    config: str,
    id: str,
    provider: str,
    name: str,
    cost_in: float,
    cost_out: float,
) -> Model:
    """Return one Model built from the given literal field values, un-parsed."""
    return Model(
        config=config,
        id=id,
        provider=provider,
        name=name,
        cost_in=cost_in,
        cost_out=cost_out,
    )
