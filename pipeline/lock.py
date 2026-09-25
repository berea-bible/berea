"""sources/sources.lock.json: what every raw/ input must be, and where it comes from.

  file entry:       {"url": ..., "sha256": ...}
  directory entry:  {"archive": <tarball of a git commit>, "commit": ..., "include": [globs], "sha256": ...}
A directory's sha256 is taken over the files its `include` globs match (what the importers read), as
"<relative path>\\0<file sha256>\\n" lines in sorted order, so it doesn't depend on .git or stray files."""
import glob, hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK = os.path.join(ROOT, "sources", "sources.lock.json")


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tree_sha(path, include):
    files = sorted({os.path.relpath(p, path) for g in include for p in glob.glob(os.path.join(path, g), recursive=True)
                    if os.path.isfile(p)})
    h = hashlib.sha256()
    for rel in files:
        h.update(f"{rel}\0{file_sha(os.path.join(path, rel))}\n".encode())
    return h.hexdigest(), len(files)


def load():
    return json.load(open(LOCK, encoding="utf-8"))


def actual(rel, entry):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        return None
    return tree_sha(path, entry["include"])[0] if "include" in entry else file_sha(path)


def verify(lock=None):
    """[problem, ...] for raw inputs that are missing or differ from the lock."""
    lock = lock or load()
    out = []
    for rel, entry in lock["inputs"].items():
        got = actual(rel, entry)
        if got is None:
            out.append(f"{rel}: missing (run python3 pipeline/fetch.py)")
        elif got != entry.get("sha256"):
            out.append(f"{rel}: sha256 {got[:12]} differs from the lock's {entry.get('sha256', '')[:12]}")
    return out


def update():
    lock = load()
    for rel, entry in lock["inputs"].items():
        entry["sha256"] = actual(rel, entry)
    with open(LOCK, "w", encoding="utf-8") as fh:
        json.dump(lock, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
