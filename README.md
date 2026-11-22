# Python Lab

An interactive course that teaches Python from the very first line up to writing your own lab
tools. Every example comes from the bench: dilutions, DNA sequences, plate readers, qPCR,
growth curves, FASTA/FASTQ files and expression tables. The code you write runs for real on
this Mac (Python 3 with numpy, pandas and matplotlib), and each exercise checks itself.

**Download for Mac:** https://paul-h-kim.com/software/python-lab (free, 0.5 MB; install steps on that page).

## Use

Double-click **Python Lab.app** (a copy is in `~/Desktop/Toolbox`). The first start creates a
private Python environment in `~/Library/Application Support/Python Lab/venv` (needs internet
once, about a minute). Closing the window quits the program.

- **Learn**: the course map. Eleven chapters plus seven projects, from `print()` to classes, command-line tools,
  testing and how a local web tool like the ones in the Toolbox works.
- **Lesson**: the explanation and a runnable example on the left; an editor on the right.
  **Run** (⌘↵) shows the output, your variables and any plots; **Check** (⇧⌘↵) tests your
  solution. Errors highlight the line and explain in plain words. Hints, the solution and a
  walk-through are there when you need them.
- **Projects**: bigger capstones (ORF finder, primer checker, restriction digest, qPCR report,
  growth-curve analyzer, codon usage with alternative genetic codes, FASTQ filter).
- **Playground**: free coding, with snippets, an Input box for `input()`, and the workspace
  folder of example data files. Drop your own files in to analyse them.
- **Cheat sheet**: one page of everyday Python; *Try it* opens a snippet in the Playground.
- **✦ Ask tutor** (optional): asks Claude about your code, its output and the error. It uses
  Claude Code signed in with your own Claude plan (no API key), runs with no tools, and is told
  to give hints rather than the answer. The drawer offers to install / sign in if needed.

Your progress and code are saved in `~/Library/Application Support/Python Lab/progress.json`;
the workspace (example files and anything your programs write) is in `.../Python Lab/workspace`.
Example files you change can be restored to the original from the Files list (↺).

## For others

Anyone with a Mac can use it: copy `Python Lab.app` to them. It needs Python 3.9+ from
python.org (or Anaconda) and internet on the first start.

## Develop

```
launch.sh                 # terminal mode (MODE=terminal); PL_PORT changes the port (default 8786)
pythonlab/server.py       # local server (standard library), JSON API, quit-when-closed
pythonlab/runner.py       # runs learner code in its own process; captures output, variables, figures, checks
pythonlab/execute.py      # starts the runner with a time limit; the workspace
pythonlab/lessons.py      # parses the chapter files (format documented at the top)
pythonlab/content/*.txt   # the course: one file per chapter; reference.md is the cheat sheet
pythonlab/data/           # example data files copied into the workspace
pythonlab/tutor.py        # optional Claude Code tutor
pythonlab/web/            # the page (CodeMirror 5 vendored in web/vendor)
macos/build_app.sh        # builds "Python Lab.app" (code is copied into the app)
```

Tests: `venv/bin/python -m unittest discover tests`, and
`venv/bin/python tests/validate_course.py` checks that every lesson's solution passes its check,
every starter does not, and every example runs. Rebuild the app after changing anything.

## Publishing a new download

1. Bump `__version__` in `pythonlab/__init__.py`, run the tests and the course validator, `macos/build_app.sh`.
2. Make the zip: a folder `Python Lab/` holding `Python Lab.app` (no `__pycache__`) and
   `macos/HOW-TO-OPEN.txt` saved as `How to open.txt`, then
   `ditto -c -k --keepParent --norsrc "Python Lab" PythonLab-<version>-mac.zip`.
3. In the website repo put it in `public/downloads/`, and update `download` (href, size) for
   `python-lab` in `lib/site-content.ts`, the `download` link on the homepage card in `app/page.tsx`
   and `softwareVersion` in `app/software/[slug]/page.tsx`.

## Licence

MIT (see `LICENSE`). CodeMirror 5 in `pythonlab/web/vendor` is MIT, © Marijn Haverbeke and others.
The example data files in `pythonlab/data` are synthetic.
