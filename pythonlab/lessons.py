"""The course: chapter files in content/, parsed into chapters and lessons.

A chapter file (content/NN_name.txt) looks like this:

    @chapter First steps
    @blurb Print, numbers, variables and text — the building blocks.
    @icon spark

    === lesson hello
    title: Hello, lab!
    minutes: 5
    --- text
    Markdown explaining the idea.
    --- example
    print("an example the learner can run")
    --- task
    Markdown describing the exercise.
    --- starter
    # code the editor starts with
    --- check
    if "Hello" not in out:
        fail("Print a line that contains Hello.")
    --- hint
    First hint (several "--- hint" sections are shown one at a time).
    --- solution
    print("Hello, lab!")

Sections other than text, task, starter, check and solution are optional.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

CONTENT = Path(__file__).resolve().parent / "content"
SECTIONS = {"text", "example", "task", "starter", "check", "hint", "solution", "explain"}
REQUIRED = ("text", "task", "check", "solution")


def parse_file(path: Path) -> dict:
    meta = {"id": path.stem, "title": path.stem, "blurb": "", "icon": "", "kind": "course", "lessons": []}
    lesson = None
    section = None
    buf: list[str] = []

    def flush():
        nonlocal buf
        if lesson is not None and section:
            body = "\n".join(buf).strip("\n")
            if section == "hint":
                lesson["hints"].append(body.strip())
            else:
                lesson[section] = body
        buf = []

    for raw in path.read_text(encoding="utf-8").splitlines():
        if lesson is None and raw.startswith("@"):
            key, _, val = raw[1:].partition(" ")
            meta[{"chapter": "title"}.get(key, key)] = val.strip()
            continue
        m = re.match(r"^=== lesson (\S+)\s*$", raw)
        if m:
            flush()
            section = None
            lesson = {"id": m.group(1), "title": m.group(1), "minutes": 5, "hints": [], "starter": "", "example": ""}
            meta["lessons"].append(lesson)
            continue
        m = re.match(r"^--- (\w+)\s*$", raw)
        if m and lesson is not None and m.group(1) in SECTIONS:
            flush()
            section = m.group(1)
            continue
        if lesson is not None and section is None:
            k, _, v = raw.partition(":")
            if k.strip() == "title":
                lesson["title"] = v.strip()
            elif k.strip() == "minutes":
                lesson["minutes"] = int(v.strip() or 5)
            continue
        buf.append(raw)
    flush()
    for l in meta["lessons"]:
        missing = [s for s in REQUIRED if not l.get(s)]
        if missing:
            raise ValueError(f"{path.name}: lesson {l['id']} is missing {', '.join(missing)}")
    return meta


@lru_cache(maxsize=1)
def course() -> list[dict]:
    chapters = [parse_file(p) for p in sorted(CONTENT.glob("[0-9][0-9]_*.txt"))]
    seen = set()
    for n, ch in enumerate(chapters, 1):
        ch["number"] = n
        for i, l in enumerate(ch["lessons"], 1):
            if l["id"] in seen:
                raise ValueError(f"duplicate lesson id {l['id']}")
            seen.add(l["id"])
            l["chapter"] = ch["id"]
            l["number"] = f"{n}.{i}"
    return chapters


def lesson(lesson_id: str) -> dict:
    for ch in course():
        for l in ch["lessons"]:
            if l["id"] == lesson_id:
                return l
    raise ValueError(f"No lesson called {lesson_id!r}.")


def public_course() -> list[dict]:
    """Everything the page needs except the checks (which stay on the server)."""
    out = []
    for ch in course():
        c = {k: v for k, v in ch.items() if k != "lessons"}
        c["lessons"] = [{k: v for k, v in l.items() if k != "check"} for l in ch["lessons"]]
        out.append(c)
    return out


def reference() -> str:
    p = CONTENT / "reference.md"
    return p.read_text(encoding="utf-8") if p.exists() else ""
