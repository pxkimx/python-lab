"""Start the runner in its own process (and process group), with a time limit."""
from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

PKG = Path(__file__).resolve().parent
HOME = Path(os.environ.get("PL_HOME") or Path.home() / "Library/Application Support/Python Lab")
WORKSPACE = HOME / "workspace"
DATA = PKG / "data"
RUNNER = PKG / "runner.py"

_live: set[subprocess.Popen] = set()
_lock = threading.Lock()


def ensure_workspace() -> Path:
    """The learner's folder. Example data files are copied in when missing (never overwritten)."""
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    for src in DATA.rglob("*"):
        if src.is_file() and not src.name.startswith("."):
            dst = WORKSPACE / src.relative_to(DATA)
            if not dst.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
    return WORKSPACE


def restore_file(rel: str) -> None:
    src = (DATA / rel).resolve()
    if DATA.resolve() not in src.parents or not src.is_file():
        raise ValueError("Not one of the example files.")
    shutil.copy2(src, WORKSPACE / rel)


def run_code(code: str, check: str | None = None, stdin: str = "", timeout: float = 15.0,
             cwd: Path | None = None) -> dict:
    cwd = cwd or ensure_workspace()
    with tempfile.TemporaryDirectory(prefix="pylab-") as tmp:
        job, res = Path(tmp) / "job.json", Path(tmp) / "result.json"
        job.write_text(json.dumps({"code": code, "check": check, "stdin": stdin}), encoding="utf-8")
        env = dict(os.environ, MPLBACKEND="Agg", PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1",
                   MPLCONFIGDIR=str(HOME / "mplconfig"))
        env.pop("PYTHONPATH", None)
        t0 = time.time()
        # -I: the workspace may hold the learner's own random.py or json.py; never let it shadow the runner's imports
        proc = subprocess.Popen([sys.executable, "-I", str(RUNNER), str(job), str(res)], cwd=str(cwd), env=env,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                start_new_session=True)
        with _lock:
            _live.add(proc)
        timed_out = False
        try:
            _, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill(proc)
            _, err = proc.communicate()
        finally:
            with _lock:
                _live.discard(proc)
        elapsed = round(time.time() - t0, 2)
        if timed_out:
            return {"ok": False, "output": "", "variables": [], "figures": [], "elapsed": elapsed, "check": None,
                    "error": {"type": "Timeout", "line": None, "traceback": "",
                              "message": f"Your code was still running after {timeout:g} seconds and was stopped.",
                              "friendly": "This usually means a loop that never ends: check that a while loop's "
                                          "condition eventually becomes False."}}
        if not res.exists():
            return {"ok": False, "output": "", "variables": [], "figures": [], "elapsed": elapsed, "check": None,
                    "error": {"type": "Crash", "line": None, "message": "Python stopped unexpectedly.",
                              "traceback": (err or b"").decode("utf-8", "replace")[-2000:], "friendly": ""}}
        out = json.loads(res.read_text(encoding="utf-8"))
        out["elapsed"] = elapsed
        return out


def _kill(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def kill_all() -> None:
    with _lock:
        for p in list(_live):
            _kill(p)


def list_files() -> list[dict]:
    ws = ensure_workspace()
    rows = []
    for p in sorted(ws.rglob("*")):
        if p.is_file() and not any(part.startswith(".") for part in p.relative_to(ws).parts):
            rel = str(p.relative_to(ws))
            rows.append({"name": rel, "size": p.stat().st_size, "example": (DATA / rel).is_file(),
                         "modified": p.stat().st_mtime})
    return rows


def read_file(rel: str, limit: int = 100_000) -> str:
    ws = ensure_workspace().resolve()
    p = (ws / rel).resolve()
    if ws not in p.parents or not p.is_file():
        raise ValueError("No such file in the workspace.")
    data = p.read_bytes()[:limit]
    return data.decode("utf-8", "replace")
