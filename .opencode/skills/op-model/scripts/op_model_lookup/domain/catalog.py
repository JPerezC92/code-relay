"""Pure model-catalog domain: immutable models, parsing, matching, and the source port."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

SELECTOR = re.compile(r"^(?P<provider>[A-Za-z0-9][A-Za-z0-9_+.-]*)/(?P<model>\S+)$")

CODE_NO_MODELS = "no_models_available"
CODE_NO_MATCH = "no_matching_models"


@dataclass(frozen=True)
class Model:
    """One opencode model entry with its identity and per-1M-token costs."""

    config: str
    id: str
    provider: str
    name: str
    cost_in: float
    cost_out: float

    @classmethod
    def create(
        cls,
        config: str,
        id: str,
        provider: str,
        name: str,
        cost_in: float,
        cost_out: float,
    ) -> Model:
        """Build one immutable model entry from its identity and cost fields."""
        return cls(
            config=config,
            id=id,
            provider=provider,
            name=name,
            cost_in=cost_in,
            cost_out=cost_out,
        )


@dataclass(frozen=True)
class ParseIssue:
    """One skipped catalog line, identified by a stable code and a message."""

    code: str
    message: str


@dataclass(frozen=True)
class CatalogParseResult:
    """The parsed models plus the issues recorded while parsing the catalog."""

    models: tuple[Model, ...]
    issues: tuple[ParseIssue, ...]


@dataclass(frozen=True)
class NoModelsAvailable:
    """Business outcome: the source produced no usable model records."""

    code: str
    message: str

    @classmethod
    def create(cls) -> NoModelsAvailable:
        """Build the no-models outcome with its stable code and message."""
        return cls(
            code=CODE_NO_MODELS,
            message="No models parsed from `opencode models` output.",
        )


@dataclass(frozen=True)
class NoMatchingModels:
    """Business outcome: the query matched no usable model record."""

    code: str
    message: str
    query: str

    @classmethod
    def create(cls, query: str) -> NoMatchingModels:
        """Build the no-match outcome for `query` with its stable code and message."""
        return cls(
            code=CODE_NO_MATCH,
            message=(
                f"No match for {query} in `opencode models`. "
                "Run `<python> .opencode/skills/op-model/scripts/models.py` "
                "to see all available models."
            ),
            query=query,
        )


class ModelSourceFailure(Exception):
    """A boundary failure raised when the model source transport fails."""


class ModelSource(Protocol):
    """Port for fetching the available models as domain values."""

    def fetch(self) -> tuple[Model, ...]:
        """Return the parsed models, raising ModelSourceFailure on boundary failure."""
        ...


def parse_records(stdout: str) -> CatalogParseResult:
    """Parse `opencode models` selector lines into models plus per-line issues.

    Each non-blank line that is a `provider/model` selector becomes a model whose
    name is its model id and whose in/out costs are 0.0; every other non-blank
    line is skipped and recorded as an `unrecognized_line` issue.
    """
    models: list[Model] = []
    issues: list[ParseIssue] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = SELECTOR.match(line)
        if match is None:
            issues.append(
                ParseIssue(
                    "unrecognized_line", f"{line}: not a provider/model selector"
                )
            )
            continue
        models.append(
            Model.create(
                config=line,
                id=match.group("model"),
                provider=match.group("provider"),
                name=match.group("model"),
                cost_in=0.0,
                cost_out=0.0,
            )
        )
    return CatalogParseResult(models=tuple(models), issues=tuple(issues))


def normalize(text: str) -> str:
    """Lowercase `text` and strip every non-alphanumeric character."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def matches(query: str, record: Model) -> bool:
    """Return True when `query` normalizes to a substring of the config or name."""
    needle = normalize(query)
    if not needle:
        return True
    return needle in normalize(record.config) or needle in normalize(record.name)
