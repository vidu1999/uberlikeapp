#!/usr/bin/env python3
import pathlib
import shutil
import sys

ROLE = sys.argv[1]
IDS = {
    "user": ("com.uberlike.customer", "SwiftDrop User"),
    "shop": ("com.uberlike.shop", "SwiftDrop Shop"),
    "rider": ("com.uberlike.rider", "SwiftDrop Rider"),
}
app_id, label = IDS[ROLE]
shutil.rmtree("android", ignore_errors=True)
shutil.copytree("android.bak", "android")
gp = pathlib.Path("android/gradle.properties")
extra = "\norg.gradle.jvmargs=-Xmx4G\n"
gp.write_text((gp.read_text(encoding="utf-8") if gp.exists() else "") + extra, encoding="utf-8")
for p in pathlib.Path("android").rglob("*"):
    if not p.is_file() or p.suffix not in {".gradle", ".kts", ".xml", ".properties"}:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = t.replace("com.example.uberlikeapp", app_id).replace("com.uberlike.uberlikeapp", app_id)
    n = n.replace('android:label="uberlikeapp"', f'android:label="{label}"')
    if p.name == "AndroidManifest.xml" and "usesCleartextTraffic" not in n:
        n = n.replace("<application", '<application android:usesCleartextTraffic="true"', 1)
    if n != t:
        p.write_text(n, encoding="utf-8")
print("patched", ROLE, app_id, label)
