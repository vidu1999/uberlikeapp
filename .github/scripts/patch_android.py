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
PAGES = {
    "user": "https://quickbite-2ao.pages.dev/user.html",
    "shop": "https://quickbite-2ao.pages.dev/shop.html",
    "rider": "https://quickbite-2ao.pages.dev/rider.html",
}
BG = {
    "user": "0xFFFFFFFFL",
    "shop": "0xFF0B1220L",
    "rider": "0xFF0B1220L",
}
CLIENT = "118084532686-6qb8plju6ed79pt32t9m9av0f4f6nad4.apps.googleusercontent.com"
app_id, label = IDS[ROLE]
shutil.rmtree("android", ignore_errors=True)
shutil.copytree("android.bak", "android")

gp = pathlib.Path("android/gradle.properties")
extra = (
    "\norg.gradle.jvmargs=-Xmx4G\n"
    "android.useAndroidX=true\n"
    "android.enableJetifier=true\n"
    "io.flutter.embedding.android.EnableImpeller=false\n"
)
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
            "\ndependencies {\n"
            '    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n'
            '    implementation("com.google.android.gms:play-services-auth:20.7.0")\n'
            "}\n"
            if kts
            else (
                "\ndependencies {\n"
                "    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.4'\n"
                "    implementation 'com.google.android.gms:play-services-auth:20.7.0'\n"
                "}\n"
            )
        )
        n = n.rstrip() + dep
    elif "play-services-auth" not in n:
        needle = "coreLibraryDesugaring"
        idx = n.find(needle)
        if idx >= 0:
            line_end = n.find("\n", idx)
            insert = (
                '\n    implementation("com.google.android.gms:play-services-auth:20.7.0")'
                if kts
                else "\n    implementation 'com.google.android.gms:play-services-auth:20.7.0'"
            )
            n = n[:line_end] + insert + n[line_end:]
    return n


for p in (pathlib.Path("android/app/build.gradle.kts"), pathlib.Path("android/app/build.gradle")):
    if not p.exists():
        continue
    p.write_text(patch_app_gradle(p.read_text(encoding="utf-8"), p.name.endswith(".kts")), encoding="utf-8")

mains = list(pathlib.Path("android").rglob("MainActivity.kt")) + list(pathlib.Path("android").rglob("MainActivity.java"))
if not mains:
    dest = pathlib.Path("android/app/src/main/kotlin/com/uberlike/uberlikeapp/MainActivity.kt")
    dest.parent.mkdir(parents=True, exist_ok=True)
    mains = [dest]

pkg = "com.uberlike.uberlikeapp"
src0 = mains[0]
text0 = src0.read_text(encoding="utf-8") if src0.exists() else ""
m = re.search(r"^package\s+([\w.]+)", text0, re.M)
if m:
    pkg = m.group(1)
else:
    s = str(src0).replace("\\", "/")
    if "/kotlin/" in s:
        pkg = s.split("/kotlin/", 1)[1].rsplit("/", 1)[0].replace("/", ".")
    elif "/java/" in s:
        pkg = s.split("/java/", 1)[1].rsplit("/", 1)[0].replace("/", ".")

kt = pathlib.Path(__file__).with_name("NativeMainActivity.kt").read_text(encoding="utf-8")
kt = (
    kt.replace("__PKG__", pkg)
    .replace("__URL__", PAGES[ROLE])
    .replace("__BG__", BG[ROLE])
    .replace("__CLIENT__", CLIENT)
)
for p in mains:
    out = p.with_suffix(".kt")
    out.write_text(kt, encoding="utf-8")
    if out != p and p.suffix == ".java":
        p.unlink()
    print("wrote", out, "package", pkg)

for p in pathlib.Path("android").rglob("AndroidManifest.xml"):
    t = p.read_text(encoding="utf-8", errors="ignore")
    n = t.replace('android:label="uberlikeapp"', f'android:label="{label}"')
    n = n.replace('android:label="@string/app_name"', f'android:label="{label}"')
    n = n.replace('android:name="${applicationName}"', 'android:name="android.app.Application"')
    n = n.replace('android:name=".MainActivity"', f'android:name="{pkg}.MainActivity"')
    n = n.replace('android:theme="@style/LaunchTheme"', 'android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar"')
    if "usesCleartextTraffic" not in n:
        n = re.sub(
            r"<application\b",
            '<application android:usesCleartextTraffic="true" android:hardwareAccelerated="true" android:extractNativeLibs="true"',
            n,
            count=1,
        )
    else:
        if "extractNativeLibs" not in n:
            n = n.replace("<application", '<application android:extractNativeLibs="true"', 1)
        if "hardwareAccelerated" not in n:
            n = n.replace("<application", '<application android:hardwareAccelerated="true"', 1)
    if "EnableImpeller" not in n:
        n = n.replace(
            "</application>",
            '        <meta-data android:name="io.flutter.embedding.android.EnableImpeller" android:value="false" />\n    </application>',
            1,
        )
    if "ACCESS_FINE_LOCATION" not in n:
        n = re.sub(
            r"(<manifest[^>]*>)",
            r'\1\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>\n    <uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>\n    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>',
            n,
            count=1,
        )
    if "android.intent.action.VIEW" not in n:
        if "</queries>" in n:
            n = n.replace(
                "</queries>",
                """        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="tel" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="whatsapp" />
        </intent>
        <package android:name="com.whatsapp" />
        <package android:name="com.google.android.gms" />
    </queries>""",
                1,
            )
        else:
            n = n.replace(
                "</manifest>",
                """    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="tel" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="whatsapp" />
        </intent>
        <package android:name="com.whatsapp" />
        <package android:name="com.google.android.gms" />
    </queries>
</manifest>""",
                1,
            )
    if n != t:
        p.write_text(n, encoding="utf-8")

pr = pathlib.Path("android/app/proguard-rules.pro")
pr.write_text(
    "\n".join(
        [
            "-keep class io.flutter.plugins.** { *; }",
            "-keep class io.flutter.plugin.** { *; }",
            "-keep class android.webkit.** { *; }",
            "-keep class com.google.android.gms.** { *; }",
            "-keep class **.MainActivity { *; }",
            "-keep class **.MainActivity$* { *; }",
            "-keepclassmembers class * {",
            "    @android.webkit.JavascriptInterface <methods>;",
            "}",
            "-dontwarn android.webkit.**",
            "",
        ]
    ),
    encoding="utf-8",
)

print("patched", ROLE, app_id, label, pkg)
