# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import json
from pathlib import Path

import click
from jupyter_releaser.util import get_version, run
from packaging.version import parse

VERSION_SPEC = ["major", "minor", "release", "next", "patch"]


def increment_version(current, spec):
    curr = parse(current)

    if spec == "major":
        spec = f"{curr.major + 1}.0.0.a0"

    elif spec == "minor":
        spec = f"{curr.major}.{curr.minor + 1}.0.a0"

    elif spec == "release":
        p, x = curr.pre
        if p == "a":
            p = "b"
        elif p == "b":
            p = "rc"
        elif p == "rc":
            p = None
        suffix = f"{p}0" if p else ""
        spec = f"{curr.major}.{curr.minor}.{curr.micro}{suffix}"

    elif spec == "next":
        spec = f"{curr.major}.{curr.minor}."
        if curr.pre:
            p, x = curr.pre
            spec += f"{curr.micro}{p}{x + 1}"
        else:
            spec += f"{curr.micro + 1}"

    elif spec == "patch":
        spec = f"{curr.major}.{curr.minor}."
        if curr.pre:
            spec += f"{curr.micro}"
        else:
            spec += f"{curr.micro + 1}"
    else:
        raise ValueError("Unknown version spec")

    return spec


@click.command()
@click.option("--skip-if-dirty", default=False, is_flag=True)
@click.argument("spec", nargs=1)
def bump(skip_if_dirty, spec):
    status = run("git status --porcelain").strip()
    if len(status) > 0:
        if skip_if_dirty:
            return
        raise Exception("Must be in a clean git state with no untracked files")

    current = get_version()

    if spec in VERSION_SPEC:
        version = parse(increment_version(current, spec))
    else:
        version = parse(spec)

    # convert the Python version
    js_version = f"{version.major}.{version.minor}.{version.micro}"
    if version.pre:
        p, x = version.pre
        p = p.replace("a", "alpha").replace("b", "beta")
        js_version += f"-{p}.{x}"

    HERE = Path(__file__).parent.parent.resolve()

    # bump the JS workspace packages
    workspace_files = list(HERE.glob("packages/*/package.json"))
    local_packages = set()
    for pkg_file in workspace_files:
        data = json.loads(pkg_file.read_text())
        if "name" in data:
            local_packages.add(data["name"])
    for pkg_file in workspace_files:
        data = json.loads(pkg_file.read_text())
        data["version"] = js_version
        for dep_field in ("dependencies", "devDependencies", "peerDependencies"):
            if dep_field in data:
                for dep_name in list(data[dep_field]):
                    if dep_name in local_packages:
                        data[dep_field][dep_name] = f"^{js_version}"
        with pkg_file.open(mode="w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

    # bump the local package.json file
    path = HERE.joinpath("package.json")
    if path.exists():
        with path.open(mode="r") as f:
            data = json.load(f)

        data["version"] = js_version

        with path.open(mode="w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

    # bump the Python packages
    for version_file in HERE.glob("python/**/_version.py"):
        content = version_file.read_text().splitlines()
        variable, current = content[0].split(" = ")
        if variable != "__version__":
            raise ValueError(
                f"Version file {version_file} has unexpected content;"
                f" expected __version__ assignment in the first line, found {variable}"
            )
        current = current.strip("'\"")
        if spec in VERSION_SPEC:
            version_spec = increment_version(current, spec)
        else:
            version_spec = spec
        version_file.write_text(f'__version__ = "{version_spec}"\n')

    else:
        raise FileNotFoundError(f"Could not find package.json under dir {path!s}")


if __name__ == "__main__":
    bump()
