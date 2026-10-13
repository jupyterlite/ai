#!/usr/bin/env python3
"""Install all Python packages in the monorepo in editable mode.

Usage:
    python scripts/dev_install.py           # install all packages
    python scripts/dev_install.py test      # install all packages with [test] extras
    python scripts/dev_install.py --no-lite # skip the packages that only load in JupyterLite
"""

import subprocess
import sys
from pathlib import Path

# Packages that include a JupyterLab extension (require jupyter-builder develop)
EXTENSION_PACKAGES = [
    "python/jupyternaut-persona",
    "python/jupyternaut-pi",
]

# Meta-packages with no labextension
META_PACKAGES = [
    "python/jupyterlite-ai",
]

# JupyterLab cannot load these: they need modules that only JupyterLite provides.
LITE_PACKAGES = [
    "python/jupyternaut-terminal",
]


def main() -> None:
    args = [arg for arg in sys.argv[1:] if arg != "--no-lite"]
    extras = args[0] if args else ""
    extensions = EXTENSION_PACKAGES + ([] if "--no-lite" in sys.argv else LITE_PACKAGES)
    root = Path(__file__).resolve().parent.parent

    for package in extensions + META_PACKAGES:
        pkg_path = root / package
        spec = str(pkg_path)
        if extras:
            spec = f"{spec}[{extras}]"
        print(f"Installing {spec} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", spec])

    for package in extensions:
        pkg_path = root / package
        print(f"Linking labextension for {package} ...")
        subprocess.check_call(
            ["jupyter-builder", "develop", str(pkg_path), "--overwrite"]
        )


if __name__ == "__main__":
    main()
