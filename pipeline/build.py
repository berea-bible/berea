#!/usr/bin/env python3
"""Rebuild everything from raw/, in one command:

    python3 pipeline/build.py

  1. pipeline/import_sources.py   raw/ -> sources/   (checks raw/ against sources/sources.lock.json first;
                                                       run pipeline/fetch.py if anything is missing)
  2. pipeline/compile.py          sources/ -> dist/  (+ dist/validation.json, dist/versification.txt;
                                                       fails, leaving dist/ untouched, on any error)
  3. pipeline/compat.py           dist/ -> data/     (today's format, until the app reads dist/; staged
                                                       and swapped in only when it succeeds)

Python >= 3.11, standard library only. Deterministic: two runs give byte-identical sources/, dist/, data/.
See docs/v2-plan.md. (The pre-v2 scripts build_dra.py, remap_hebrew.py, finalize.py and versification.py
are no longer used; they are removed in phase 6.)
"""
import os, shutil, subprocess, sys

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
    stage = os.path.join(ROOT, "data.tmp")
    shutil.rmtree(stage, ignore_errors=True)
    run(os.path.join(HERE, "compat.py"), "--out", stage)
    data = os.path.join(ROOT, "data")
    shutil.rmtree(data, ignore_errors=True)
    os.replace(stage, data)
    print(f"\ndata/ regenerated ({sum(len(fs) for _, _, fs in os.walk(data))} files)")


if __name__ == "__main__":
    main()
