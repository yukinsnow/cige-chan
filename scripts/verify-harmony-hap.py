"""Check that an unsigned HAP contains the compiled ArkTS host and local editor."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path("src-harmony/entry/build/default/outputs/default")
packages = list(root.glob("*unsigned.hap"))
if len(packages) != 1:
    raise ValueError(f"Expected one unsigned HAP, found {len(packages)}")
hap = packages[0]
with zipfile.ZipFile(hap) as archive:
    if archive.testzip() is not None:
        raise ValueError("Corrupt HAP archive")
    names = archive.namelist()
    for filename in ["module.json", "ets/modules.abc", "resources/rawfile/web/index.html",
                     "resources/rawfile/web/ai.js", "resources/rawfile/web/i18n.js",
                     "resources/rawfile/web/harmony-bridge.js"]:
        if filename not in names:
            raise ValueError("Missing packaged asset: " + filename)
    module = json.loads(archive.read("module.json"))
    if module["app"]["bundleName"] != "com.yukinsnow.cigechan":
        raise ValueError("Unexpected bundle name")
print(json.dumps({"file": hap.name, "sha256": hashlib.sha256(hap.read_bytes()).hexdigest(),
                  "format": "HarmonyOS HAP", "signed": False}, indent=2))
