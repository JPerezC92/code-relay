"""Unit tests for catalog.normalize and catalog.matches query matching."""

from op_model_lookup._test_support import literal_model
from op_model_lookup.domain.catalog import Model, matches, normalize

GPT_4O: Model = literal_model(
    config="openai/gpt-4o",
    id="gpt-4o",
    provider="openai",
    name="GPT-4o",
    cost_in=2.5,
    cost_out=10.0,
)
CLAUDE_3: Model = literal_model(
    config="anthropic/claude-3",
    id="claude-3",
    provider="anthropic",
    name="Claude 3 Sonnet",
    cost_in=3.0,
    cost_out=15.0,
)


def test_normalize_lowercases_and_strips_non_alphanumeric() -> None:
    assert normalize("GPT-4o Turbo!") == "gpt4oturbo"
    assert normalize("OpenAI/GPT-4o") == "openaigpt4o"
    assert normalize("Claude 3") == "claude3"


def test_normalize_punctuation_only_text_is_empty() -> None:
    assert normalize("  --__..!!  ") == ""
    assert normalize("") == ""


def test_config_substring_query_matches() -> None:
    assert matches("openai/gpt", GPT_4O) is True


def test_name_substring_query_matches() -> None:
    assert matches("sonnet", CLAUDE_3) is True


def test_query_matching_both_config_and_name_is_true() -> None:
    assert matches("gpt", GPT_4O) is True


def test_unrelated_query_matches_nothing() -> None:
    assert matches("llama", GPT_4O) is False
    assert matches("llama", CLAUDE_3) is False
    assert matches("gpt-5", GPT_4O) is False


def test_punctuation_only_query_matches_every_record() -> None:
    assert matches("._-!/", GPT_4O) is True
    assert matches("._-!/", CLAUDE_3) is True
    assert matches("", GPT_4O) is True


def test_matching_is_case_insensitive() -> None:
    assert matches("GPT-4O", GPT_4O) is True
    assert matches("OpenAI/GPT", GPT_4O) is True
    assert matches("SONNET", CLAUDE_3) is True
    assert matches("cLaUdE", CLAUDE_3) is True
