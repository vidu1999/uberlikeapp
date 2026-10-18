#!/usr/bin/env python3
"""Replace flutter.compileSdkVersion in plugin Android Gradle files (AGP 8)."""
import os
import pathlib

roots = []
for key in ("PUB_CACHE", "FLUTTER_ROOT"):
    v = os.environ.get(key)
    if v:
        roots.append(pathlib.Path(v))
roots.append(pathlib.Path.home() / ".pub-cache")
seen = set()
changed = 0
for root in roots:
    if not root.exists():
        continue
    for p in root.rglob("build.gradle*"):
        rp = str(p.resolve())
        if rp in seen:
            continue
        seen.add(rp)
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "flutter.compileSdkVersion" not in t:
            continue
        p.write_text(t.replace("flutter.compileSdkVersion", "35"), encoding="utf-8")
        print("patched", p)
        changed += 1
print("plugin sdk patches", changed)
