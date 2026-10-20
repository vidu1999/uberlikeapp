#!/usr/bin/env python3
# Patch Flutter-generated Android project per User / Shop / Rider APK.
import pathlib
import re
import shutil
import sys

ROLE = sys.argv[1]
IDS = {
    "user": ("com.uberlike.customer", "QuickBite User"),
    "shop": ("com.uberlike.shop", "QuickBite Shop"),
    "rider": ("com.uberlike.rider", "QuickBite Rider"),
}
app_id, label = IDS[ROLE]
shutil.rmtree("android", ignore_errors=True)
shutil.copytree("android.bak", "android")

gp = pathlib.Path("android/gradle.properties")
extra = "\norg.gradle.jvmargs=-Xmx4G\nandroid.useAndroidX=true\n"
gp.write_text((gp.read_text(encoding="utf-8") if gp.exists() else "") + extra, encoding="utf-8")


def patch_app_gradle(text: str, kts: bool) -> str:
    n = text
    n = re.sub(r'applicationId\s*=\s*"[^"]+"', f'applicationId = "{app_id}"', n)
    n = re.sub(r'applicationId\s+"[^"]+"', f'applicationId "{app_id}"', n)
    n = re.sub(r'namespace\s*=\s*"[^"]+"', f'namespace = "{app_id}"', n)
    n = re.sub(r'namespace\s+"[^"]+"', f'namespace "{app_id}"', n)
    n = re.sub(r"minSdk\s*=\s*flutter\.minSdkVersion", "minSdk = 24", n)
    n = re.sub(r"minSdkVersion\s+flutter\.minSdkVersion", "minSdkVersion 24", n)
    n = re.sub(r"minSdk\s*=\s*\d+", "minSdk = 24", n)
    n = re.sub(r"minSdkVersion\s+\d+", "minSdkVersion 24", n)
    n = re.sub(r"compileSdk\s*=\s*flutter\.compileSdkVersion", "compileSdk = 35", n)
    n = re.sub(r"compileSdk\s+flutter\.compileSdkVersion", "compileSdk 35", n)
    n = re.sub(r"targetSdk\s*=\s*flutter\.targetSdkVersion", "targetSdk = 35", n)
    n = re.sub(r"targetSdkVersion\s+flutter\.targetSdkVersion", "targetSdkVersion 35", n)
    n = re.sub(r"\n[ \t]*ndkVersion\s*=\s*[^\n]+", "", n)
    n = re.sub(r"\n[ \t]*ndkVersion\s+[^\n]+", "", n)
    if "coreLibraryDesugaringEnabled" not in n and "isCoreLibraryDesugaringEnabled" not in n:
        flag = "isCoreLibraryDesugaringEnabled = true" if kts else "coreLibraryDesugaringEnabled true"
        if "compileOptions {" in n:
            n = n.replace("compileOptions {", "compileOptions {\n        " + flag, 1)
    if "desugar_jdk_libs" not in n:
        dep = (
            '\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n'
            if kts
            else "\ndependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'\n}\n"
        )
        n = n.rstrip() + dep
    return n


for p in (pathlib.Path("android/app/build.gradle.kts"), pathlib.Path("android/app/build.gradle")):
    if not p.exists():
        continue
    p.write_text(patch_app_gradle(p.read_text(encoding="utf-8"), p.name.endswith(".kts")), encoding="utf-8")

for p in pathlib.Path("android").rglob("AndroidManifest.xml"):
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = t.replace('android:label="uberlikeapp"', f'android:label="{label}"')
    n = n.replace('android:label="@string/app_name"', f'android:label="{label}"')
    if "usesCleartextTraffic" not in n:
        n = re.sub(r"<application\b", '<application android:usesCleartextTraffic="true"', n, count=1)
    if "ACCESS_FINE_LOCATION" not in n:
        n = re.sub(
            r"(<manifest[^>]*>)",
            r'\1\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>',
            n,
            count=1,
        )
    if n != t:
        p.write_text(n, encoding="utf-8")

print("patched", ROLE, app_id, label)
