"""Unit tests for the find-models use case with a doubled ModelSource port."""

from __future__ import annotations

from op_model_lookup.application.find_models import execute
from op_model_lookup.domain.catalog import (
    Model,
    NoMatchingModels,
    NoModelsAvailable,
)

GPT4 = Model.create(
    config="openai/gpt-4",
    id="gpt-4",
    provider="openai",
    name="GPT-4",
    cost_in=30.0,
    cost_out=60.0,
)
CLAUDE = Model.create(
    config="anthropic/claude-3-5-sonnet",
    id="claude-3-5-sonnet",
    provider="anthropic",
    name="Claude 3.5 Sonnet",
    cost_in=3.0,
    cost_out=15.0,
)
GEMINI_PRO = Model.create(
    config="google/gemini-2.5-pro",
    id="gemini-2.5-pro",
    provider="google",
    name="Gemini 2.5 Pro",
    cost_in=1.25,
    cost_out=10.0,
)
GEMINI_FLASH = Model.create(
    config="google/gemini-2.5-flash",
    id="gemini-2.5-flash",
    provider="google",
    name="Gemini 2.5 Flash",
    cost_in=0.3,
    cost_out=2.5,
)

EMPTY_SOURCE_MESSAGE = "No models parsed from `opencode models` output."
NO_MATCH_MESSAGE = (
    "No match for mistral in `opencode models`. "
    "Run `<python> .opencode/skills/op-model/scripts/models.py` "
    "to see all available models."
)


class FixedModelSource:
    """ModelSource double returning a fixed catalog without any IO."""

    def __init__(self, records: tuple[Model, ...]) -> None:
        self._records = records

    def fetch(self) -> tuple[Model, ...]:
        return self._records


class FindModelsExecuteTests:
    """Selection and typed business outcomes of `execute()` over a doubled port."""

    def test_empty_query_returns_all_models_in_encounter_order(self) -> None:
        source = FixedModelSource((GEMINI_FLASH, CLAUDE, GPT4, GEMINI_PRO))
        result = execute("", source)
        assert result == (GEMINI_FLASH, CLAUDE, GPT4, GEMINI_PRO)

    def test_filtered_matches_return_in_encounter_order(self) -> None:
        source = FixedModelSource((GEMINI_PRO, GPT4, CLAUDE, GEMINI_FLASH))
        result = execute("gemini", source)
        assert result == (GEMINI_PRO, GEMINI_FLASH)

    def test_empty_source_returns_no_models_available_value(self) -> None:
        result = execute("gpt", FixedModelSource(()))
        assert isinstance(result, NoModelsAvailable)
        assert result.code == "no_models_available"
        assert result.message == EMPTY_SOURCE_MESSAGE

    def test_non_empty_query_without_hits_returns_no_matching_models_value(
        self,
    ) -> None:
        result = execute("mistral", FixedModelSource((GPT4, CLAUDE)))
        assert isinstance(result, NoMatchingModels)
        assert result.code == "no_matching_models"
        assert result.message == NO_MATCH_MESSAGE
        assert result.query == "mistral"

    def test_normalized_empty_query_returns_all_models(self) -> None:
        source = FixedModelSource((GEMINI_FLASH, CLAUDE, GPT4, GEMINI_PRO))
        result = execute("!!!", source)
        assert result == (GEMINI_FLASH, CLAUDE, GPT4, GEMINI_PRO)
