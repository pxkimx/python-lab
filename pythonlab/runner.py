"""Runs one piece of learner code in its own process and writes the result as JSON.

    python runner.py job.json result.json

job.json: {"code": str, "check": str | None, "stdin": str}
The working directory is the learner's workspace (data files live there). The check, when
given, runs after the code in the same namespace and sees `ns` (the learner's variables),
`out` (everything printed), `fail(message)` and `ok(message)`.
"""
from __future__ import annotations

import base64
import builtins
import contextlib
import io
import json
import re
import sys
import traceback
import types
import warnings

MAX_OUT = 200_000
CODE_FILE = "<your code>"


class Capped(io.StringIO):
    def write(self, s):
        if self.tell() > MAX_OUT:
            return len(s)
        return super().write(s)


class CheckFailed(Exception):
    pass


FRIENDLY = {
    "NameError": "Python doesn't know this name. Check the spelling (Python is case-sensitive), "
                 "and make sure the variable or function is created before the line that uses it.",
    "SyntaxError": "Python couldn't read this line. Look for a missing colon at the end of if/for/def lines, "
                   "an unclosed bracket or quote, or a typo just before the marked spot.",
    "IndentationError": "The spaces at the start of a line don't match. Lines inside if/for/def need the same "
                        "indent (4 spaces is the convention).",
    "TypeError": "An operation got the wrong kind of value, for example adding text to a number. "
                 "Convert with int(), float() or str() first, or check how many arguments a function takes.",
    "ValueError": "The type was right but the value wasn't, for example float('n/a').",
    "IndexError": "You asked for a position that doesn't exist. Remember positions start at 0, "
                  "so the last item of a list of 5 is at index 4 (or -1).",
    "KeyError": "That key isn't in the dictionary. Check the spelling, or use d.get(key, default).",
    "ZeroDivisionError": "Division by zero. Check for an empty list or a zero value before dividing.",
    "FileNotFoundError": "No file with that name in the workspace. File names are case-sensitive; "
                         "the Files list in the Playground shows what is there.",
    "AttributeError": "This kind of value doesn't have that method or attribute. "
                      "Check the spelling, or print(type(x)) to see what x really is.",
    "ModuleNotFoundError": "That module isn't installed here. The standard library plus numpy, pandas "
                           "and matplotlib are available.",
    "RecursionError": "A function kept calling itself without stopping.",
    "EOFError": "input() wanted another line. Type the program's input in the Input box (one answer per line).",
    "UnboundLocalError": "A variable was used inside a function before it got a value there.",
}


def summarize(ns: dict) -> list:
    """The learner's variables, for the Variables panel."""
    rows = []
    for k, v in ns.items():
        if k.startswith("_") or isinstance(v, types.ModuleType) or k in ("fail", "ok"):
            continue
        if isinstance(v, type) and v.__module__ != "__main__":
            continue
        try:
            r = repr(v)
        except Exception:
            r = "<unprintable>"
        if len(r) > 160:
            r = r[:157] + "…"
        size = None
        try:
            if hasattr(v, "__len__") and not isinstance(v, type):
                size = len(v)
        except Exception:
            pass
        shape = getattr(v, "shape", None)
        if isinstance(shape, tuple):
            size = " × ".join(str(x) for x in shape)
        rows.append({"name": k, "type": type(v).__name__, "value": r, "size": size})
    return rows[:80]


def error_info(e: BaseException) -> dict:
    name = type(e).__name__
    line = None
    if isinstance(e, SyntaxError) and e.filename == CODE_FILE:
        line = e.lineno
    else:
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == CODE_FILE:
                line = fr.lineno
    tb = traceback.format_exception(type(e), e, e.__traceback__)
    # drop the runner's own frames so the learner sees only their code
    keep, skipping = [], False
    for part in tb:
        if part.startswith('  File "') and CODE_FILE not in part:
            skipping = True
            continue
        if skipping and part.startswith("    "):
            continue
        skipping = False
        keep.append(part)
    friendly = FRIENDLY.get(name, "")
    if isinstance(e, SyntaxError) and e.text and re.match(r"^\s*[A-Za-z_]\w*\s*=\s*$", e.text):
        friendly = f"Line {line} is unfinished: put a value after the = sign (that's your job in this exercise)."
    return {"type": name, "message": str(e), "line": line, "traceback": "".join(keep).rstrip(),
            "friendly": friendly}


def figures() -> list:
    if "matplotlib.pyplot" not in sys.modules:
        return []
    plt = sys.modules["matplotlib.pyplot"]
    out = []
    for num in plt.get_fignums()[:6]:
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out


def run(job: dict) -> dict:
    code, check, stdin = job.get("code", ""), job.get("check"), job.get("stdin", "") or ""
    buf = Capped()
    lines = iter(stdin.splitlines())

    def fake_input(prompt=""):
        buf.write(str(prompt))
        try:
            v = next(lines)
        except StopIteration:
            raise EOFError("input() needed more lines than the Input box has") from None
        buf.write(v + "\n")
        return v

    builtins.input = fake_input
    import os
    if os.getcwd() not in sys.path:
        sys.path.append(os.getcwd())  # the learner's own modules, after the standard library so they never shadow it
    warnings.filterwarnings("ignore", message=".*non-interactive.*")
    warnings.filterwarnings("ignore", message=".*FigureCanvasAgg.*")
    ns: dict = {"__name__": "__main__", "__builtins__": builtins}
    res = {"ok": True, "error": None, "check": None}
    try:
        compiled = compile(code, CODE_FILE, "exec")
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec(compiled, ns)
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001 - report everything the learner's code raised
        res["ok"] = False
        res["error"] = error_info(e)
    out = buf.getvalue().replace("Matplotlib is building the font cache; this may take a moment.\n", "")
    if check and res["ok"]:
        messages = []

        def fail(msg="Not quite yet."):
            raise CheckFailed(msg)

        def ok(msg):
            messages.append(str(msg))

        cns = {"ns": ns, "out": out, "fail": fail, "ok": ok, "__builtins__": builtins}
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(check, "<check>", "exec"), cns)
            res["check"] = {"passed": True, "messages": messages}
        except CheckFailed as e:
            res["check"] = {"passed": False, "messages": [str(e)]}
        except AssertionError as e:
            res["check"] = {"passed": False, "messages": [str(e) or "Not quite yet — compare your result with the task."]}
        except Exception as e:  # noqa: BLE001
            res["check"] = {"passed": False, "messages": [f"Your code ran, but checking it hit {type(e).__name__}: {e}. "
                                                          "Did you create every variable or function the task names?"]}
    if len(out) > MAX_OUT:
        out = out[:MAX_OUT] + "\n… (output cut off)"
    res["output"] = out
    try:
        res["variables"] = summarize(ns)
    except Exception:
        res["variables"] = []
    try:
        res["figures"] = figures()
    except Exception as e:  # noqa: BLE001
        res["figures"] = []
        res["output"] += f"\n(Could not draw the figure: {e})"
    return res


def main() -> None:
    with open(sys.argv[1], encoding="utf-8") as f:
        job = json.load(f)
    res = run(job)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(res, f, default=str)


if __name__ == "__main__":
    main()
