#!/usr/bin/env python3
"""Rebuild everything from raw/, in one command:

    python3 pipeline/build.py

  1. pipeline/import_sources.py   raw/ -> sources/   (checks raw/ against sources/sources.lock.json first;
                                                       run pipeline/fetch.py if anything is missing)
  2. pipeline/compile.py          sources/ -> dist/  (+ dist/validation.json, dist/versification.txt;
                                                       fails, leaving dist/ untouched, on any error)

Python >= 3.11, standard library only. Deterministic: two runs give byte-identical sources/ and dist/.
See docs/v2-plan.md.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def run(*cmd):
    print(f"\n$ {' '.join(os.path.relpath(c, ROOT) if os.path.isabs(c) else c for c in cmd)}", flush=True)
    r = subprocess.run([sys.executable, *cmd], cwd=ROOT)
    if r.returncode:
        sys.exit(f"build failed at {os.path.basename(cmd[0])} (exit {r.returncode})")


def main():
    run(os.path.join(HERE, "import_sources.py"))
    run(os.path.join(HERE, "compile.py"))


if __name__ == "__main__":
    main()
