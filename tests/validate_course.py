"""Check every lesson: the solution passes its check, the starter does not, examples run cleanly.

    venv/bin/python tests/validate_course.py [chapter-file-substring ...]

Runs in a fresh temporary workspace so a learner's own files never affect the result.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["PL_HOME"] = tempfile.mkdtemp(prefix="pylab-validate-")

from pythonlab import execute, lessons  # noqa: E402


def check_lesson(l: dict) -> list[str]:
    problems = []
    ws = Path(os.environ["PL_HOME"]) / "workspace"
    import shutil
    shutil.rmtree(ws, ignore_errors=True)
    execute.ensure_workspace()
    if l.get("example"):
        r = execute.run_code(l["example"])
        if not r["ok"]:
            problems.append(f"example fails: {r['error']['type']}: {r['error']['message']}")
    r = execute.run_code(l["solution"], l["check"], l.get("stdin", ""))
    if not r["ok"]:
        problems.append(f"solution raises {r['error']['type']}: {r['error']['message']}\n{r['error']['traceback']}")
    elif not (r["check"] and r["check"]["passed"]):
        problems.append(f"solution does not pass: {r['check']}")
    shutil.rmtree(ws, ignore_errors=True)
    execute.ensure_workspace()
    s = execute.run_code(l.get("starter", ""), l["check"])
    if s["ok"] and s["check"] and s["check"]["passed"]:
        problems.append("starter code already passes the check")
    return problems


def main() -> int:
    lessons.course.cache_clear()
    want = sys.argv[1:]
    bad = 0
    total = 0
    files = sorted(lessons.CONTENT.glob("[0-9][0-9]_*.txt"))
    if want:  # parse only the chosen chapters, so a half-written chapter elsewhere can't break this run
        files = [f for f in files if any(w in f.stem for w in want)]
    for f in files:
        ch = lessons.parse_file(f)
        for i, l in enumerate(ch["lessons"], 1):
            l["number"] = f"{f.stem[:2].lstrip('0')}.{i}"
            total += 1
            probs = check_lesson(l)
            mark = "ok " if not probs else "BAD"
            print(f"{mark} {l['number']:>5} {l['id']:<28} {l['title']}")
            for p in probs:
                bad += 1
                print("      - " + p.replace("\n", "\n        "))
    print(f"\n{total} lessons, {bad} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
