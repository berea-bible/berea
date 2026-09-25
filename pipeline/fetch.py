#!/usr/bin/env python3
"""Fill raw/ from sources/sources.lock.json: download each input that is missing, and refuse anything
whose sha256 differs from the lock.

    python3 pipeline/fetch.py                 # fetch what's missing into raw/
    python3 pipeline/fetch.py --root DIR      # fetch into DIR/raw/... instead (e.g. to test the lock)

Files come from their pinned URLs; directories from the GitHub tarball of their locked commit (only the
files matching the entry's `include` globs are checked). Standard library only.
"""
import io, os, shutil, sys, tarfile, tempfile, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lock  # noqa: E402

UA = {"User-Agent": "berea-pipeline/1.0 (+https://github.com/berea-bible/reader)"}   # eBible answers 403 to urllib's default


def download(url):
    print("  downloading", url, flush=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def fetch_file(dest, entry):
    body = download(entry["url"])
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        fh.write(body)
    if lock.file_sha(tmp) != entry["sha256"]:
        os.remove(tmp)
        sys.exit(f"{dest}: download doesn't match the lock's sha256 (upstream changed?); nothing written")
    os.replace(tmp, dest)


def fetch_archive(dest, entry):
    body = download(entry["archive"])
    tmp = tempfile.mkdtemp(dir=os.path.dirname(dest))
    with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tf:
        tf.extractall(tmp, filter="data")
    (top,) = os.listdir(tmp)                     # GitHub tarballs hold one <repo>-<commit>/ folder
    got, n = lock.tree_sha(os.path.join(tmp, top), entry["include"])
    if got != entry["sha256"]:
        shutil.rmtree(tmp)
        sys.exit(f"{dest}: archive doesn't match the lock's sha256 ({n} files checked); nothing written")
    os.replace(os.path.join(tmp, top), dest)
    os.rmdir(tmp)


def main(args):
    root = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else lock.ROOT
    for rel, entry in lock.load()["inputs"].items():
        dest = os.path.join(root, rel)
        if os.path.exists(dest):
            continue
        print(rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        (fetch_archive if "archive" in entry else fetch_file)(dest, entry)
    if root == lock.ROOT:
        problems = lock.verify()
        if problems:
            sys.exit("raw/ doesn't match the lock:\n  " + "\n  ".join(problems))
    print("raw/ matches sources/sources.lock.json")


if __name__ == "__main__":
    main(sys.argv[1:])
