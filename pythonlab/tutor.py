"""The optional tutor: asks Claude Code (the `claude` CLI, signed in with the person's own Claude plan).

No API key is involved. Each question runs in an empty scratch folder with no tools allowed, so the tutor can
only read what it is sent (the lesson, the learner's code and its output) and answer in text.
Adapted from BioCanvas's claude_code.py.
"""
from __future__ import annotations

import glob
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

INSTALL_CMD = "curl -fsSL https://claude.ai/install.sh | bash"
_live: set[subprocess.Popen] = set()


def _version_key(path: str):
    m = re.search(r"/(\d+(?:\.\d+)+)/", path)
    return tuple(int(x) for x in m.group(1).split(".")) if m else (0,)


def find_cli() -> str | None:
    home = Path.home()
    for c in (shutil.which("claude"), home / ".local/bin/claude", home / ".claude/local/claude",
              "/opt/homebrew/bin/claude", "/usr/local/bin/claude"):
        if c and os.access(c, os.X_OK):
            return str(c)
    base = home / "Library/Application Support/Claude/claude-code"
    bundled = [p for pat in ("*/claude.app", "*/*/claude.app", "*/*/*/claude.app")
               for p in glob.glob(str(base / pat / "Contents/MacOS/claude"))]
    bundled = [b for b in bundled if os.access(b, os.X_OK)]
    return max(bundled, key=_version_key) if bundled else None


def _env() -> dict:
    env = dict(os.environ)
    env.pop("ANTHROPIC_API_KEY", None)  # the subscription login, never an API key by accident
    return env


_status: dict = {"t": 0.0, "value": None}


def status(refresh: bool = False) -> dict:
    if not refresh and _status["value"] and time.time() - _status["t"] < 60:
        return _status["value"]
    cli = find_cli()
    value = {"found": bool(cli), "logged_in": False}
    if cli:
        try:
            r = subprocess.run([cli, "auth", "status", "--json"], capture_output=True, text=True, timeout=20,
                               stdin=subprocess.DEVNULL, env=_env())
            value["logged_in"] = bool(json.loads(r.stdout or "{}").get("loggedIn"))
        except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
            pass
    _status.update(t=time.time(), value=value)
    return value


def open_signin() -> None:
    _status["value"] = None
    cli = find_cli()
    cmd = f"{shlex.quote(cli)} auth login --claudeai" if cli else f"{INSTALL_CMD} && ~/.local/bin/claude auth login --claudeai"
    safe = cmd.replace("\\", "\\\\").replace('"', '\\"')
    subprocess.run(["osascript", "-e", 'tell application "Terminal" to activate',
                    "-e", f'tell application "Terminal" to do script "{safe}"'], check=False)
    _status["value"] = None


GUIDE = """You are a patient Python tutor inside "Python Lab", an app that teaches Python to biologists \
(cell biology, sequencing, proteomics) by building real lab tools. The learner is a beginner.
Rules:
- Answer in plain, friendly English, short (under ~180 words unless they ask for more).
- Explain WHY, and point at the exact line. Use the learner's own variable names.
- If they are working on an exercise, do NOT give the full solution. Give the next step, a hint or a tiny \
example of the idea with different values. Only show full code if they explicitly ask for the solution.
- Use only Python concepts from the current chapter or earlier when you can.
- Format: Markdown with `inline code` and ```python blocks. No HTML. No headings bigger than ###.
"""


def ask(question: str, context: dict, timeout: int = 180) -> str:
    cli = find_cli()
    if not cli:
        raise RuntimeError("Claude Code isn't installed on this Mac. Press “Set up the tutor” to install it.")
    parts = [GUIDE]
    if context.get("lesson"):
        parts.append(f"## Lesson: {context['lesson']}\n{context.get('task', '')[:3000]}")
    if context.get("code") is not None:
        parts.append(f"## The learner's code\n```python\n{context['code'][:8000]}\n```")
    if context.get("output"):
        parts.append(f"## Output when they ran it\n```\n{context['output'][-3000:]}\n```")
    if context.get("error"):
        parts.append(f"## Error\n```\n{context['error'][-3000:]}\n```")
    if context.get("check"):
        parts.append(f"## The checker said\n{context['check'][:1000]}")
    for turn in (context.get("history") or [])[-6:]:
        parts.append(f"## Earlier — {turn.get('role', 'user')}\n{str(turn.get('text', ''))[:2000]}")
    parts.append(f"## Learner's question\n{question[:2000] or 'Help me understand what is wrong and what to try next.'}")
    prompt = "\n\n".join(parts)
    with tempfile.TemporaryDirectory(prefix="pylab-tutor-") as work:
        cmd = [cli, "-p", prompt, "--output-format", "json", "--tools", "", "--permission-mode", "dontAsk",
               "--strict-mcp-config", "--setting-sources", "project", "--no-session-persistence"]
        proc = subprocess.Popen(cmd, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                stdin=subprocess.DEVNULL, env=_env(), start_new_session=True)
        _live.add(proc)
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            raise RuntimeError("The tutor took too long and was stopped. Try a shorter question.")
        finally:
            _live.discard(proc)
    try:
        res = json.loads(stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        raise RuntimeError("The tutor didn't answer. " + (stderr.strip()[-300:] or ""))
    text = (res.get("result") or "").strip()
    if res.get("is_error"):
        low = text.lower()
        if any(w in low for w in ("authenticat", "oauth", "log in", "login", "logged in", "sign in")):
            # `auth status` can still say signed in when the saved session has expired; trust the failure
            _status.update(t=time.time(), value={"found": True, "logged_in": False})
            raise RuntimeError("Claude Code's sign-in has expired. Press “Sign in to Claude” below, finish in Terminal, then ask again.")
        raise RuntimeError(f"Tutor: {text or 'unknown error'}")
    return text


def kill_all() -> None:
    for p in list(_live):
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
