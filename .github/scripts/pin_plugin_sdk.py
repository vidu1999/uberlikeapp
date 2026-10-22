#!/usr/bin/env python3
"""Replace Flutter extra properties in plugin Android Gradle files (AGP 8)."""
import os
import pathlib

roots = []
for key in ("PUB_CACHE", "FLUTTER_ROOT", "HOME"):
    v = os.environ.get(key)
    if v:
        roots.append(pathlib.Path(v))
roots.append(pathlib.Path.home() / ".pub-cache")
seen = set()
changed = 0
found = 0
for root in roots:
    if not root.exists():
        continue
    for p in root.rglob("build.gradle*"):
        rp = str(p.resolve())
        if rp in seen:
            continue
        seen.add(rp)
        path = rp.replace("\\", "/")
        if "geolocator" not in path and "shared_preferences" not in path and "/hosted/" not in path:
            continue
        if p.name not in {"build.gradle", "build.gradle.kts"}:
            continue
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if "flutter." not in t:
            continue
        found += 1
        n = (
            t.replace("flutter.compileSdkVersion", "35")
            .replace("flutter.minSdkVersion", "24")
            .replace("flutter.targetSdkVersion", "35")
            .replace("flutter.ndkVersion", '"26.1.10909125"')
        )
        if n != t:
            p.write_text(n, encoding="utf-8")
            print("patched", p)
            changed += 1
print("plugin gradle with flutter.*", found, "patched", changed)
