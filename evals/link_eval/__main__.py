from __future__ import annotations

import argparse
import json
from pathlib import Path

from .calibration import calibrate
from .review import apply_review
from .runner import compare_reports, evaluate, selftest, write_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline Link voice accuracy evaluation")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--gold", type=Path, required=True)
    run.add_argument("--predictions", type=Path, required=True)
    run.add_argument("--out", type=Path, required=True)
    compare = commands.add_parser("compare")
    compare.add_argument("left", type=Path)
    compare.add_argument("right", type=Path)
    test = commands.add_parser("selftest")
    test.add_argument(
        "--gold",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "gold" / "synthetic",
    )
    test.add_argument("--unlock-gold", action="store_true")
    review = commands.add_parser("apply-review")
    review.add_argument("review_csv", type=Path)
    calibration = commands.add_parser("calibrate")
    calibration.add_argument("--predictions", type=Path, required=True)
    calibration.add_argument("--gold", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "run":
            report = evaluate(args.gold, args.predictions)
            write_report(report, args.out)
            print(f"{report['release_gate']} — identity gate; report: {args.out}")
            return (
                1
                if report["release_gate"] == "FAIL"
                else 2
                if report["release_gate"] == "INCOMPLETE"
                else 0
            )
        if args.command == "compare":
            print(compare_reports(args.left, args.right))
        elif args.command == "selftest":
            print(json.dumps(selftest(args.gold, unlock_gold=args.unlock_gold), ensure_ascii=False, indent=2))
        elif args.command == "apply-review":
            print(f"Applied {apply_review(args.review_csv)} reviewed scripts and re-locked gold.")
        else:
            print(calibrate(args.predictions, args.gold))
        return 0
    except (ValueError, OSError, AssertionError) as exc:
        parser.exit(2, f"Evaluation error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
