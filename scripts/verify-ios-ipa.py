"""Verify that a packaged IPA targets physical iOS devices, not the simulator."""
import hashlib
import json
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile


def verify(ipa_path):
    config = json.loads(Path("src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(ipa_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Corrupt IPA archive")
        infos = [name for name in archive.namelist()
                 if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)]
        if len(infos) != 1:
            raise ValueError("IPA must contain exactly one main app under Payload/")
        info = plistlib.loads(archive.read(infos[0]))
        if info.get("CFBundleSupportedPlatforms") != ["iPhoneOS"]:
            raise ValueError("App does not target physical iOS devices")
        if info.get("CFBundleIdentifier") != config["identifier"]:
            raise ValueError("Unexpected bundle identifier")
        if info.get("CFBundleShortVersionString") != config["version"]:
            raise ValueError("Unexpected app version")
        executable = info["CFBundleExecutable"]
        if not isinstance(executable, str) or "/" in executable or executable in ("", ".", ".."):
            raise ValueError("Invalid executable name")
        binary = archive.read(infos[0].removesuffix("Info.plist") + executable)
    with tempfile.TemporaryDirectory(prefix="cige-ipa-") as folder:
        binary_path = Path(folder) / executable
        binary_path.write_bytes(binary)
        archs = subprocess.check_output(["xcrun", "lipo", "-archs", str(binary_path)], text=True).strip()
        if archs != "arm64":
            raise ValueError(f"Unexpected architectures: {archs}")
        build = subprocess.check_output(["xcrun", "vtool", "-show-build", str(binary_path)], text=True)
        if not re.search(r"^\s*platform IOS\s*$", build, re.MULTILINE):
            raise ValueError("Executable is not built for the iOS device platform")
    return {
        "file": ipa_path.name,
        "sha256": hashlib.sha256(ipa_path.read_bytes()).hexdigest(),
        "bundleIdentifier": info["CFBundleIdentifier"],
        "version": info["CFBundleShortVersionString"],
        "minimumIOSVersion": info.get("MinimumOSVersion"),
        "architecture": archs,
        "platform": "iPhoneOS",
        "signing": "unsigned; must be signed before installation",
    }


if __name__ == "__main__":
    report = verify(Path(sys.argv[1]))
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    print(text, end="")
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(text, encoding="utf-8")
