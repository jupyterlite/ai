#!/usr/bin/env python3
"""Install all Python packages in the monorepo in editable mode.

Usage:
    python scripts/dev_install.py           # install all packages
    python scripts/dev_install.py test      # install all packages with [test] extras
"""

import subprocess
import sys
from pathlib import Path

# Packages that include a JupyterLab extension (require jupyter-builder develop)
EXTENSION_PACKAGES = [
    "python/jupyternaut-persona",
]

# Meta-packages with no labextension
META_PACKAGES = [
    "python/jupyterlite-ai",
]


def main() -> None:
    extras = sys.argv[1] if len(sys.argv) > 1 else ""
    root = Path(__file__).resolve().parent.parent

    for package in EXTENSION_PACKAGES + META_PACKAGES:
        pkg_path = root / package
        spec = str(pkg_path)
        if extras:
            spec = f"{spec}[{extras}]"
        print(f"Installing {spec} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", spec])

    for package in EXTENSION_PACKAGES:
        pkg_path = root / package
        print(f"Linking labextension for {package} ...")
        subprocess.check_call(
            ["jupyter-builder", "develop", str(pkg_path), "--overwrite"]
        )


if __name__ == "__main__":
    main()
