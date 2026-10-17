"""Composition entry: argparse CLI for the plan validator."""

from __future__ import annotations

import argparse
from typing import Optional

from plan_validate_pkg.application.validate import (
    validate_plan_dir,
    validate_single_file,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate a plan directory or single-file plan against the consistency checklist.",
        epilog="Exit code 0 = pass, 1 = fail. Warnings do not affect exit code.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("path", help="plan directory (subfolder layout) or plan.md file (with --single-file)")
    parser.add_argument("--single-file", action="store_true", help="treat PATH as a single-file plan.md")
    parser.add_argument("--stories", metavar="DIR", default=None, help="also check user-stories index mirroring in DIR")
    return parser


def run(argv: Optional[list[str]] = None) -> int:
    """Parse arguments and run the requested validation, returning its exit code."""
    args = _build_parser().parse_args(argv)
    if args.single_file:
        return validate_single_file(args.path)
    return validate_plan_dir(args.path, args.stories)
