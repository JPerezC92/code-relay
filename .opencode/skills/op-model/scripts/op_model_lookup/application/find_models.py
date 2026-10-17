"""Application use case: select the models matching a query from a model source."""

from __future__ import annotations

from op_model_lookup.domain.catalog import (
    Model,
    ModelSource,
    NoMatchingModels,
    NoModelsAvailable,
    matches,
)


def execute(
    query: str,
    source: ModelSource,
) -> tuple[Model, ...] | NoModelsAvailable | NoMatchingModels:
    """Return the matching models in encounter order, or a typed business outcome.

    An empty source returns NoModelsAvailable; a non-empty query without any
    match returns NoMatchingModels. Boundary failures from the source are not
    business outcomes and propagate to the delivery edge.
    """
    records = source.fetch()
    if not records:
        return NoModelsAvailable.create()
    selection = tuple(record for record in records if matches(query, record))
    if query and not selection:
        return NoMatchingModels.create(query)
    return selection
