#!/usr/bin/env python3
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
extra = "\norg.gradle.jvmargs=-Xmx4G\nandroid.useAndroidX=true\nandroid.enableJetifier=true\n"
gp.write_text((gp.read_text(encoding="utf-8") if gp.exists() else "") + extra, encoding="utf-8")

DESUGAR_KTS = """
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
"""
DESUGAR_GROOVY = """
dependencies {
    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'
}
"""


def patch_gradle(text: str, kts: bool) -> str:
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
    n = re.sub(r"\n[ \t]*ndkVersion\s*=\s*flutter\.ndkVersion", "", n)
    n = re.sub(r"\n[ \t]*ndkVersion\s+flutter\.ndkVersion", "", n)
    if "coreLibraryDesugaringEnabled" not in n and "isCoreLibraryDesugaringEnabled" not in n:
        flag = "isCoreLibraryDesugaringEnabled = true" if kts else "coreLibraryDesugaringEnabled true"
        if "compileOptions {" in n:
            n = n.replace("compileOptions {", "compileOptions {\n        " + flag, 1)
        else:
            n = n.replace(
                "android {",
                "android {\n    compileOptions {\n        " + flag + "\n        sourceCompatibility = JavaVersion.VERSION_1_8\n        targetCompatibility = JavaVersion.VERSION_1_8\n    }",
                1,
            )
    if "desugar_jdk_libs" not in n:
        n = n.rstrip() + "\n" + (DESUGAR_KTS if kts else DESUGAR_GROOVY)
    return n


for p in pathlib.Path("android").rglob("*"):
    if not p.is_file():
        continue
    if p.suffix not in {".gradle", ".kts", ".xml"}:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = t
    if p.suffix in {".gradle", ".kts"}:
        n = patch_gradle(n, p.suffix == ".kts" or p.name.endswith(".kts"))
    if p.name == "AndroidManifest.xml":
        n = n.replace('android:label="uberlikeapp"', f'android:label="{label}"')
        n = n.replace('android:label="@string/app_name"', f'android:label="{label}"')
        if "usesCleartextTraffic" not in n:
            n = re.sub(r"<application\b", '<application android:usesCleartextTraffic="true"', n, count=1)
        if "ACCESS_FINE_LOCATION" not in n:
            n = re.sub(
                r"(<manifest[^>]*>)",
                r'\1\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <uses-permission android:name="android.permission.INTERNET"/>',
                n,
                count=1,
            )
        if 'android:exported="true"' not in n and "<activity" in n:
            n = re.sub(r"<activity\b", '<activity android:exported="true"', n, count=1)
    if n != t:
        p.write_text(n, encoding="utf-8")
print("patched", ROLE, app_id, label)
