"""Local web server: the page, the course, running code, progress and the tutor. Standard library only."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import __version__, execute, lessons, tutor
from .lifecycle import Lifecycle

WEB = Path(__file__).resolve().parent / "web"
DEFAULT_PORT = 8786
MAX_BODY = 50 * 1024 ** 2
PROGRESS = execute.HOME / "progress.json"
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}
LIFE: Lifecycle | None = None
_plock = threading.Lock()


# ---------------------------------------------------------------- progress
def load_progress() -> dict:
    try:
        p = json.loads(PROGRESS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        p = {}
    p.setdefault("done", {})
    p.setdefault("code", {})
    p.setdefault("hints", {})
    p.setdefault("last", None)
    p.setdefault("playground", "")
    p.setdefault("streak", [])
    return p


def save_progress(p: dict) -> None:
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    tmp = PROGRESS.with_suffix(".tmp")
    tmp.write_text(json.dumps(p, indent=1), encoding="utf-8")
    os.replace(tmp, PROGRESS)


def update_progress(d: dict) -> dict:
    with _plock:
        p = load_progress()
        for key in ("code", "hints"):
            for k, v in (d.get(key) or {}).items():
                if v is None:
                    p[key].pop(k, None)
                else:
                    p[key][k] = v
        if "last" in d:
            p["last"] = d["last"]
        if "playground" in d:
            p["playground"] = str(d["playground"])[:500_000]
        if d.get("reset"):
            p = {"done": {}, "code": {}, "hints": {}, "last": None, "playground": p.get("playground", ""), "streak": []}
        if d.get("undone"):
            p["done"].pop(d["undone"], None)
        save_progress(p)
        return p


def mark_done(lesson_id: str) -> dict:
    with _plock:
        p = load_progress()
        p["done"].setdefault(lesson_id, time.strftime("%Y-%m-%d %H:%M"))
        today = time.strftime("%Y-%m-%d")
        if today not in p["streak"]:
            p["streak"] = (p["streak"] + [today])[-400:]
        save_progress(p)
        return p


# ---------------------------------------------------------------- actions
def run(d: dict) -> dict:
    code = str(d.get("code", ""))
    if len(code) > 200_000:
        raise ValueError("That program is too long to run here.")
    lesson_id = d.get("lesson")
    check = None
    if d.get("mode") == "check":
        if not lesson_id:
            raise ValueError("Nothing to check in the playground — press Run instead.")
        check = lessons.lesson(lesson_id)["check"]
    timeout = 30.0 if d.get("mode") == "playground" else 15.0
    res = execute.run_code(code, check, str(d.get("stdin", "")), timeout=timeout)
    if lesson_id:
        update_progress({"code": {lesson_id: code}, "last": lesson_id})
    if check and res.get("check", {}) and res["check"].get("passed"):
        res["progress"] = mark_done(lesson_id)
    return res


def state() -> dict:
    p = load_progress()
    total = sum(len(c["lessons"]) for c in lessons.course())
    return {"version": __version__, "python": sys.version.split()[0], "workspace": str(execute.WORKSPACE),
            "done": len(p["done"]), "total": total}


def save_upload(name: str, body: bytes) -> dict:
    name = Path(name).name
    if not name or name.startswith(".") or not re.match(r"^[\w .()+-]+$", name):
        raise ValueError("Please use a simple file name (letters, numbers, - _ .).")
    ws = execute.ensure_workspace()
    (ws / name).write_bytes(body)
    return {"ok": True, "name": name}


def delete_file(name: str) -> dict:
    ws = execute.ensure_workspace().resolve()
    p = (ws / name).resolve()
    if ws not in p.parents or not p.is_file():
        raise ValueError("No such file.")
    p.unlink()
    execute.ensure_workspace()  # example files come back as originals
    return {"ok": True}


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "PythonLab"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code: int, body: bytes, ctype: str = "application/json", extra: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, default=str).encode())

    def _guard(self, fn):
        try:
            self._json(fn())
        except (ValueError, FileNotFoundError, RuntimeError) as e:
            self._json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            self._json({"error": f"{type(e).__name__}: {e}"}, 500)

    def _body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("That file is larger than 50 MB.")
        return self.rfile.read(n) if n else b""

    def _local_only(self) -> bool:
        # refuse requests a web page on another site could make in the background
        origin = self.headers.get("Origin") or ""
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("localhost", "127.0.0.1"):
            return False
        return not origin or re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin) is not None

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if not self._local_only():
            return self._send(403, b"forbidden", "text/plain")
        if u.path == "/api/window":
            return self._window()
        if u.path == "/api/state":
            return self._guard(state)
        if u.path == "/api/course":
            return self._guard(lambda: {"chapters": lessons.public_course(), "reference": lessons.reference()})
        if u.path == "/api/progress":
            return self._guard(load_progress)
        if u.path == "/api/files":
            return self._guard(lambda: {"files": execute.list_files(), "folder": str(execute.WORKSPACE)})
        if u.path == "/api/file":
            return self._guard(lambda: {"name": q.get("name", ""), "text": execute.read_file(q.get("name", ""))})
        if u.path == "/api/tutor/status":
            return self._guard(lambda: tutor.status(q.get("refresh") == "1"))
        rel = "index.html" if u.path in ("/", "") else u.path.lstrip("/")
        f = (WEB / rel).resolve()
        if WEB.resolve() not in f.parents or not f.is_file():
            return self._send(404, b"not found", "text/plain")
        self._send(200, f.read_bytes(), TYPES.get(f.suffix, "application/octet-stream"))

    def do_POST(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if not self._local_only():
            return self._send(403, b"forbidden", "text/plain")
        try:
            body = self._body()
        except ValueError as e:
            return self._json({"error": str(e)}, 413)
        js = lambda: json.loads(body or b"{}")  # noqa: E731
        if u.path == "/api/run":
            return self._guard(lambda: run(js()))
        if u.path == "/api/stop":
            return self._guard(lambda: (execute.kill_all(), {"ok": True})[1])
        if u.path == "/api/progress":
            return self._guard(lambda: update_progress(js()))
        if u.path == "/api/files/upload":
            return self._guard(lambda: save_upload(q.get("name", ""), body))
        if u.path == "/api/files/restore":
            return self._guard(lambda: (execute.restore_file(js().get("name", "")), {"ok": True})[1])
        if u.path == "/api/files/delete":
            return self._guard(lambda: delete_file(js().get("name", "")))
        if u.path == "/api/files/reveal":
            return self._guard(lambda: (subprocess.run(["open", str(execute.ensure_workspace())], check=False), {"ok": True})[1])
        if u.path == "/api/tutor/ask":
            d = js()
            return self._guard(lambda: {"answer": tutor.ask(str(d.get("question", "")), d.get("context") or {})})
        if u.path == "/api/tutor/setup":
            return self._guard(lambda: (tutor.open_signin(), {"ok": True})[1])
        if u.path == "/api/quit":
            self._json({"ok": True})
            if LIFE:
                LIFE.quit_now()
            return
        self._send(404, b"not found", "text/plain")

    def _window(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        if LIFE:
            LIFE.window_opened()
        try:
            while True:
                self.wfile.write(b": hold\n\n")
                self.wfile.flush()
                threading.Event().wait(2.0)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            if LIFE:
                LIFE.window_closed()
        self.close_connection = True


def serve(port: int = DEFAULT_PORT, open_browser: bool = True) -> None:
    global LIFE
    execute.ensure_workspace()
    lessons.course()  # fail at start-up, not on first click, if a chapter file is broken
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True

    def quit_():
        sys.stdout.flush()
        execute.kill_all()   # never leave a learner's program or the tutor running after the app quits
        tutor.kill_all()
        os._exit(0)

    LIFE = Lifecycle(on_quit=quit_)
    LIFE.watch()
    url = f"http://localhost:{port}"
    print(f"Python Lab {__version__} at {url}", flush=True)
    if open_browser:
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        quit_()


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(prog="python-lab", description="Python Lab local app")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PL_PORT", DEFAULT_PORT)))
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    serve(a.port, not a.no_browser)


if __name__ == "__main__":
    main()
