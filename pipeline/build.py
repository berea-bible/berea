#!/usr/bin/env python3
"""Regenerate data/ from the raw sources, in one command.

    python3 pipeline/build.py [--pipeline ../pipeline] [--keep-stage]

Steps (each must succeed; data/ is only replaced at the end, so a failure leaves it untouched):
  1. ../pipeline/build_data.py         66-book canon from build/raw/ (translations, Greek NT, Hebrew OT,
                                        lexicon, church fathers), written to ../pipeline/build/data
  2. copy that output into a staging directory (pipeline/.stage/data)
  3. pipeline/remap_hebrew.py          OT Hebrew from Hebrew (BHS) to KJV verse numbering (TVTMS)
  4. ../pipeline/build_deuterocanonical.py   the 14 deuterocanonical books + Daniel/Esther fathers
  5. pipeline/build_dra.py             DRA from eBible, re-keyed to KJV numbering (Copenhagen mappings)
  6. pipeline/finalize.py              data fixes, fathers-reference check, split fathers/lexicon format
  7. replace data/ with the staged result

Needs Python >= 3.11 (stdlib only) and network access the first time, to fetch eBible / TVTMS /
Copenhagen mappings into pipeline/.cache/.
"""
import os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def run(cmd, cwd):
    print(f'\n$ {" ".join(cmd)}   (in {os.path.relpath(cwd, ROOT)})', flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode:
        sys.exit(f'build failed at: {" ".join(cmd)} (exit {r.returncode}); data/ was not changed')


def main(args):
    pipeline = os.path.abspath(args[args.index('--pipeline') + 1] if '--pipeline' in args else os.path.join(ROOT, '..', 'pipeline'))
    stage = os.path.join(HERE, '.stage', 'data')
    py = sys.executable

    run([py, 'build_data.py'], pipeline)
    shutil.rmtree(stage, ignore_errors=True)
    shutil.copytree(os.path.join(pipeline, 'build', 'data'), stage)
    run([py, os.path.join(HERE, 'remap_hebrew.py'), '--data', stage], ROOT)
    run([py, 'build_deuterocanonical.py', '--out', stage], pipeline)
    run([py, os.path.join(HERE, 'build_dra.py'), '--data', stage], ROOT)
    run([py, os.path.join(HERE, 'finalize.py'), '--data', stage], ROOT)

    data = os.path.join(ROOT, 'data')
    shutil.rmtree(data)
    shutil.copytree(stage, data)
    if '--keep-stage' not in args:
        shutil.rmtree(os.path.dirname(stage))
    print(f'\ndata/ regenerated ({sum(len(fs) for _, _, fs in os.walk(data))} files)')


if __name__ == '__main__':
    main(sys.argv[1:])
