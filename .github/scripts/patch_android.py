#!/usr/bin/env python3
import pathlib
import re
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
    if not p.is_file():
        continue
    if p.suffix not in {".gradle", ".kts", ".xml"}:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = t
    if p.suffix in {".gradle", ".kts"}:
        n = re.sub(r'applicationId\s*=\s*"[^"]+"', f'applicationId = "{app_id}"', n)
        n = re.sub(r'applicationId\s+"[^"]+"', f'applicationId "{app_id}"', n)
    if p.name == "AndroidManifest.xml":
        n = n.replace('android:label="uberlikeapp"', f'android:label="{label}"')
        if "usesCleartextTraffic" not in n:
            n = re.sub(r"<application\b", '<application android:usesCleartextTraffic="true"', n, count=1)
    if n != t:
        p.write_text(n, encoding="utf-8")
print("patched", ROLE, app_id, label)
