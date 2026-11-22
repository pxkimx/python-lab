"""Runner, server and quit-when-closed tests.   venv/bin/python -m unittest discover tests"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["PL_HOME"] = tempfile.mkdtemp(prefix="pylab-test-")

from pythonlab import execute, lessons  # noqa: E402


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Runner(unittest.TestCase):
    def test_output_and_variables(self):
        r = execute.run_code('seq = "ATGC"\nprint(len(seq))')
        self.assertTrue(r["ok"])
        self.assertEqual(r["output"], "4\n")
        self.assertIn({"name": "seq", "type": "str", "value": "'ATGC'", "size": 4}, r["variables"])

    def test_error_line_and_friendly(self):
        r = execute.run_code("x = 1\nprint(y)")
        self.assertEqual(r["error"]["type"], "NameError")
        self.assertEqual(r["error"]["line"], 2)
        self.assertTrue(r["error"]["friendly"])
        self.assertNotIn("runner.py", r["error"]["traceback"])

    def test_syntax_error_unfinished_line(self):
        r = execute.run_code("stock = \n")
        self.assertEqual(r["error"]["type"], "SyntaxError")
        self.assertIn("unfinished", r["error"]["friendly"])

    def test_check_pass_and_fail(self):
        chk = 'if ns.get("x") != 2:\n    fail("x should be 2")\nok("good")'
        self.assertTrue(execute.run_code("x = 2", chk)["check"]["passed"])
        bad = execute.run_code("x = 3", chk)["check"]
        self.assertFalse(bad["passed"])
        self.assertEqual(bad["messages"], ["x should be 2"])

    def test_timeout_kills_loop(self):
        t = time.time()
        r = execute.run_code("while True:\n    pass", timeout=2)
        self.assertEqual(r["error"]["type"], "Timeout")
        self.assertLess(time.time() - t, 6)

    def test_input_box(self):
        r = execute.run_code('a = input("Name? ")\nprint("hi", a)', stdin="Paul\n")
        self.assertIn("hi Paul", r["output"])

    def test_figure_captured(self):
        r = execute.run_code("import matplotlib.pyplot as plt\nplt.plot([1, 2, 3])\nplt.show()")
        self.assertTrue(r["ok"], r.get("error"))
        self.assertEqual(len(r["figures"]), 1)
        self.assertTrue(r["figures"][0].startswith("data:image/png;base64,"))

    def test_workspace_file_cannot_shadow_stdlib(self):
        ws = execute.ensure_workspace()
        (ws / "json.py").write_text("raise SystemExit('shadowed')")
        try:
            r = execute.run_code("import json\nprint(json.dumps([1]))")
            self.assertEqual(r["output"], "[1]\n")
        finally:
            (ws / "json.py").unlink()

    def test_own_module_importable(self):
        ws = execute.ensure_workspace()
        (ws / "mytools_test.py").write_text("def gc(s):\n    return s.count('G')\n")
        try:
            self.assertEqual(execute.run_code("import mytools_test\nprint(mytools_test.gc('GGA'))")["output"], "2\n")
        finally:
            (ws / "mytools_test.py").unlink()


class Course(unittest.TestCase):
    def test_course_parses_and_checks_stay_private(self):
        chapters = lessons.course()
        self.assertGreaterEqual(len(chapters), 10)
        for ch in lessons.public_course():
            for l in ch["lessons"]:
                self.assertNotIn("check", l)


class Server(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        cls.proc = subprocess.Popen([sys.executable, "-m", "pythonlab.server", "--port", str(cls.port), "--no-browser"], cwd=ROOT,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                cls.get("/api/state")
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.kill()
        cls.proc.wait()

    @classmethod
    def get(cls, path):
        with urllib.request.urlopen(f"http://localhost:{cls.port}{path}", timeout=20) as r:
            return json.loads(r.read())

    def post(self, path, body):
        req = urllib.request.Request(f"http://localhost:{self.port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())

    def test_check_marks_done(self):
        l = lessons.course()[0]["lessons"][0]
        r = self.post("/api/run", {"code": l["solution"], "lesson": l["id"], "mode": "check"})
        self.assertTrue(r["check"]["passed"])
        self.assertIn(l["id"], self.get("/api/progress")["done"])

    def test_foreign_origin_refused(self):
        req = urllib.request.Request(f"http://localhost:{self.port}/api/run", b'{"code":"print(1)"}',
                                     {"Content-Type": "application/json", "Origin": "https://evil.example"})
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(req, timeout=5)
        self.assertEqual(e.exception.code, 403)


class QuitWhenClosed(unittest.TestCase):
    def test_quits_after_window_closes(self):
        port = free_port()
        p = subprocess.Popen([sys.executable, "-m", "pythonlab.server", "--port", str(port), "--no-browser"], cwd=ROOT,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                try:
                    s = socket.create_connection(("127.0.0.1", port), timeout=1)
                    break
                except OSError:
                    time.sleep(0.1)
            s.sendall(f"GET /api/window HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n".encode())
            time.sleep(1.0)
            self.assertIsNone(p.poll())
            s.close()
            p.wait(timeout=15)
        finally:
            if p.poll() is None:
                p.kill()

    def test_quits_when_launcher_gone(self):
        port = free_port()
        parent = subprocess.Popen(["sleep", "30"])
        p = subprocess.Popen([sys.executable, "-m", "pythonlab.server", "--port", str(port), "--no-browser"], cwd=ROOT,
                             env=dict(os.environ, PL_PARENT_PID=str(parent.pid)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(1.5)
            self.assertIsNone(p.poll())
            parent.kill()
            parent.wait()
            p.wait(timeout=5)
        finally:
            if p.poll() is None:
                p.kill()

    def test_sigterm_stops_running_learner_program(self):
        import signal
        import threading
        port = free_port()
        p = subprocess.Popen([sys.executable, "-m", "pythonlab.server", "--port", str(port), "--no-browser"], cwd=ROOT,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        runners = lambda: set(subprocess.run(["pgrep", "-f", str(ROOT / "pythonlab" / "runner.py")],  # noqa: E731
                                             capture_output=True, text=True).stdout.split())
        before = runners()
        try:
            for _ in range(50):
                try:
                    socket.create_connection(("127.0.0.1", port), timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.1)
            body = json.dumps({"code": "while True:\n    pass", "mode": "playground"}).encode()
            req = urllib.request.Request(f"http://localhost:{port}/api/run", body, {"Content-Type": "application/json"})
            threading.Thread(target=lambda: urllib.request.urlopen(req, timeout=60), daemon=True).start()
            for _ in range(50):
                new = runners() - before
                if new:
                    break
                time.sleep(0.1)
            self.assertTrue(new, "the learner program never started")
            p.send_signal(signal.SIGTERM)
            p.wait(timeout=5)
            time.sleep(0.5)
            self.assertFalse(runners() & new, "the learner program outlived the server")
        finally:
            if p.poll() is None:
                p.kill()


if __name__ == "__main__":
    unittest.main()
