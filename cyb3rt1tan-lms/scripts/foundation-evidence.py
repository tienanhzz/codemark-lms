"""BUILD-002 reproducible dependency inventory/SBOM and source-asset checks.

Reads only public manifests, installed distribution metadata and source assets.
No environment variables, .env files, database records or private backups are read.
"""

import base64
import hashlib
import json
import re
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path
from urllib.parse import quote

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/master-kit"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name: str, value: object) -> None:
    (OUTPUT / name).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8"
    )


def python_components() -> tuple[list[dict], list[dict], list[dict]]:
    lock = ROOT / "api/requirements.lock"
    blocks = re.split(r"\n(?=[a-zA-Z0-9_.-]+==)", "\n" + lock.read_text("utf-8"))
    installed = {
        canonicalize_name(item.metadata["Name"]): item
        for item in metadata.distributions()
    }
    records = {}
    for block in blocks:
        match = re.match(r"([a-zA-Z0-9_.-]+)==([^\s;\\]+)", block)
        if not match:
            continue
        name, version = canonicalize_name(match[1]), match[2]
        hashes = re.findall(r"--hash=sha256:([a-f0-9]{64})", block)
        if not hashes:
            raise SystemExit("Unhashed Python dependency: " + name)
        package = installed.get(name)
        # This lock includes Windows-only entries; record absence rather than claim installation.
        if package is not None and package.version != version:
            raise SystemExit("Installed Python version differs from lock: " + name)
        records[name] = {
            "name": name,
            "version": version,
            "hashCount": len(hashes),
            "installed": package is not None,
            "scope": "development",
        }
    roots = [
        Requirement(line)
        for line in (ROOT / "api/requirements.in").read_text("utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    runtime_roots = {
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "alembic",
        "psycopg",
        "argon2-cffi",
        "cryptography",
        "python-dotenv",
        "tzdata",
        "pyotp",
    }
    active = [
        (item.name, item.extras)
        for item in roots
        if canonicalize_name(item.name) in runtime_roots
    ]
    visited = set()
    edges = {}
    while active:
        raw_name, extras = active.pop()
        name = canonicalize_name(raw_name)
        marker_key = (name, tuple(sorted(extras)))
        if marker_key in visited:
            continue
        visited.add(marker_key)
        if name in records:
            records[name]["scope"] = "runtime"
        package = installed.get(name)
        if not package:
            continue
        for raw in package.requires or []:
            dependency = Requirement(raw)
            if dependency.marker and not any(
                dependency.marker.evaluate({"extra": extra})
                for extra in (extras or {""})
            ):
                continue
            child = canonicalize_name(dependency.name)
            if child not in records:
                raise SystemExit(
                    "Runtime dependency missing from Python lock: " + child
                )
            edges.setdefault(name, set()).add(child)
            active.append((child, dependency.extras))
    components, licenses, graph = [], [], []
    for name, record in sorted(records.items()):
        package = installed.get(name)
        license_name = (
            (
                package.metadata.get("License-Expression")
                or package.metadata.get("License")
                or ""
            ).strip()
            if package
            else ""
        )
        classifiers = (
            [
                v.removeprefix("License :: ")
                for v in (package.metadata.get_all("Classifier") or [])
                if v.startswith("License :: ")
            ]
            if package
            else []
        )
        # Older PyPI packages often publish a license classifier without the
        # newer License-Expression/License metadata fields.
        if not license_name and len(classifiers) == 1:
            license_name = classifiers[0]
        # Metadata may contain a full license; retain a concise inventory, not arbitrary package text.
        license_name = (
            license_name
            if len(license_name) <= 240
            else "See installed distribution license files"
        )
        licenses.append(
            {
                **record,
                "declaredLicense": license_name or "NOASSERTION",
                "licenseClassifiers": classifiers,
                "registry": "https://pypi.org",
                "review": "Metadata inventory only; not a legal or security approval",
            }
        )
        ref = "pkg:pypi/" + name + "@" + quote(record["version"])
        component = {
            "type": "library",
            "bom-ref": ref,
            "name": name,
            "version": record["version"],
            "purl": ref,
            "scope": "required" if record["scope"] == "runtime" else "optional",
            "properties": [
                {"name": "codemark:scope", "value": record["scope"]},
                {"name": "codemark:lockfile", "value": "api/requirements.lock"},
                {
                    "name": "codemark:installedOnGeneratorHost",
                    "value": str(record["installed"]).lower(),
                },
            ],
        }
        if license_name:
            component["licenses"] = [{"license": {"name": license_name}}]
        components.append(component)
        if package:
            all_edges = set()
            for raw in package.requires or []:
                dep = Requirement(raw)
                child = canonicalize_name(dep.name)
                if child in records and (
                    not dep.marker
                    or dep.marker.evaluate(
                        {"extra": "binary" if name == "psycopg" else ""}
                    )
                ):
                    all_edges.add(child)
            graph.append(
                {
                    "ref": ref,
                    "dependsOn": [
                        "pkg:pypi/" + child + "@" + quote(records[child]["version"])
                        for child in sorted(all_edges)
                    ],
                }
            )
        else:
            graph.append({"ref": ref, "dependsOn": []})
    return components, licenses, graph


def node_components() -> tuple[list[dict], list[dict], list[dict]]:
    manifest = json.loads((ROOT / "web/package.json").read_text("utf-8"))
    lock = json.loads((ROOT / "web/package-lock.json").read_text("utf-8"))
    packages = lock["packages"]
    for field in ["dependencies", "devDependencies"]:
        for name, version in manifest.get(field, {}).items():
            if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[\w.-]+)?", version):
                raise SystemExit("Node dependency is not pinned: " + name)
            if (
                packages[""].get(field, {}).get(name) != version
                or packages.get("node_modules/" + name, {}).get("version") != version
            ):
                raise SystemExit("Node manifest/lock mismatch: " + name)
    components, licenses, graph = {}, [], {}
    path_refs = {}
    for path, entry in packages.items():
        if not path:
            continue
        if entry.get("link") or not entry.get("version") or not entry.get("integrity"):
            raise SystemExit("Unpinned/unhashed Node package: " + path)
        name = entry.get("name") or path.rsplit("node_modules/", 1)[-1]
        ref = "pkg:npm/" + quote(name, safe="/") + "@" + entry["version"]
        path_refs[path] = ref
        if ref in components:
            continue
        resolved = entry.get("resolved", "")
        if not resolved.startswith("https://registry.npmjs.org/"):
            raise SystemExit("Unreviewed Node registry source: " + name)
        package_license = entry.get("license")
        if not package_license:
            legacy_licenses = entry.get("licenses", [])
            if isinstance(legacy_licenses, list) and len(legacy_licenses) == 1:
                package_license = legacy_licenses[0].get("type")
        if not package_license:
            installed_manifest = ROOT / "web" / path / "package.json"
            try:
                installed_data = json.loads(installed_manifest.read_text("utf-8"))
            except (OSError, json.JSONDecodeError):
                installed_data = {}
            if installed_data.get("version") == entry["version"]:
                package_license = installed_data.get("license")
                if not package_license:
                    legacy_licenses = installed_data.get("licenses", [])
                    if isinstance(legacy_licenses, list) and len(legacy_licenses) == 1:
                        package_license = legacy_licenses[0].get("type")
        licenses.append(
            {
                "name": name,
                "version": entry["version"],
                "scope": "development" if entry.get("dev") else "runtime",
                "declaredLicense": package_license or "NOASSERTION",
                "registry": "https://registry.npmjs.org",
                "optional": entry.get("optional", False),
                "review": "Locked metadata inventory; optional platform packages may be absent",
            }
        )
        component = {
            "type": "library",
            "bom-ref": ref,
            "name": name,
            "version": entry["version"],
            "purl": ref,
            "scope": "optional"
            if entry.get("dev") or entry.get("optional")
            else "required",
            "externalReferences": [{"type": "distribution", "url": resolved}],
            "properties": [
                {
                    "name": "codemark:scope",
                    "value": "development" if entry.get("dev") else "runtime",
                },
                {"name": "codemark:lockfile", "value": "web/package-lock.json"},
            ],
        }
        if package_license:
            component["licenses"] = [{"license": {"name": package_license}}]
        algorithm, encoded = entry["integrity"].split(" ", 1)[0].split("-", 1)
        if algorithm in {"sha256", "sha384", "sha512"}:
            component["hashes"] = [
                {
                    "alg": {
                        "sha256": "SHA-256",
                        "sha384": "SHA-384",
                        "sha512": "SHA-512",
                    }[algorithm],
                    "content": base64.b64decode(encoded, validate=True).hex(),
                }
            ]
        components[ref] = component
    for path, entry in packages.items():
        if not path:
            continue
        parent = path_refs[path]
        graph.setdefault(parent, set())
        for dep in {
            **entry.get("dependencies", {}),
            **entry.get("optionalDependencies", {}),
        }:
            prefix = path
            while True:
                candidate = (prefix + "/" if prefix else "") + "node_modules/" + dep
                if candidate in path_refs:
                    graph[parent].add(path_refs[candidate])
                    break
                if not prefix:
                    if dep not in entry.get("optionalDependencies", {}):
                        raise SystemExit(
                            "Node lock has an unresolved dependency: " + dep
                        )
                    break
                prefix = (
                    prefix.rsplit("/node_modules/", 1)[0]
                    if "/node_modules/" in prefix
                    else ""
                )
    return (
        list(components.values()),
        licenses,
        [
            {"ref": key, "dependsOn": sorted(value)}
            for key, value in sorted(graph.items())
        ],
    )


def check_assets() -> dict:
    violations = []
    for folder in ["web/app", "web/components", "web/lib"]:
        for file in (ROOT / folder).rglob("*"):
            if file.suffix not in {".css", ".tsx", ".ts"}:
                continue
            content = file.read_text("utf-8")
            checks = [
                r"""(?:src|href)\s*=\s*["'](?:https?:)?//""",
                r"""@import\s+(?:url\()?\s*["']?(?:https?:)?//""",
                r"""url\(\s*["']?(?:https?:)?//""",
                r"""fetch\(\s*["'](?:https?:)?//""",
            ]
            if any(re.search(pattern, content) for pattern in checks):
                violations.append(file.relative_to(ROOT).as_posix())
    wrapper = (ROOT / "scripts/next.mjs").read_text("utf-8")
    if "NEXT_TELEMETRY_DISABLED: '1'" not in wrapper:
        violations.append("scripts/next.mjs: telemetry boundary missing")
    for file in [
        "web/public/branding/font.css",
        "web/public/branding/NotoSans-Regular.ttf",
        "web/public/branding/OFL.txt",
    ]:
        if not (ROOT / file).is_file():
            violations.append(file + ": missing local asset/license")
    if violations:
        raise SystemExit("Source asset policy failures: " + ", ".join(violations))
    return {
        "sourceChecks": "pass",
        "remoteLiteralAssetOrFetchReferences": 0,
        "runtimeFirewallVerification": False,
        "dynamicThirdPartyRequestVerification": False,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    python, python_licenses, python_graph = python_components()
    node, node_licenses, node_graph = node_components()
    components = sorted(python + node, key=lambda component: component["bom-ref"])
    known = {component["bom-ref"] for component in components}
    for dependency in python_graph + node_graph:
        if dependency["ref"] not in known or any(
            ref not in known for ref in dependency["dependsOn"]
        ):
            raise SystemExit("Dangling dependency in SBOM")
    timestamp = datetime.now(UTC).isoformat()
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "version": 1,
        "metadata": {
            "timestamp": timestamp,
            "component": {
                "type": "application",
                "bom-ref": "codemark-local",
                "name": "CodeMark local master-kit rebuild",
                "version": "0.1.0",
            },
        },
        "components": components,
        "dependencies": python_graph + node_graph,
    }
    write("dependency-sbom.cdx.json", sbom)
    write(
        "dependency-licenses.json",
        {
            "generatedAt": timestamp,
            "python": python_licenses,
            "node": node_licenses,
            "notes": [
                "Declared license metadata is not a legal review.",
                "Node includes optional platform/build dependencies from the lockfile.",
                "Python graph evaluates installed-host markers; this is not an image SBOM.",
                "Noto Sans OFL notice is web/public/branding/OFL.txt; Font Awesome has font/icon/code licenses.",
            ],
        },
    )
    unknown = [
        item["name"]
        for item in python_licenses + node_licenses
        if item["declaredLicense"] == "NOASSERTION"
    ]
    write(
        "BUILD-002-foundation.json",
        {
            "buildId": "BUILD-002",
            "checkedAt": timestamp,
            "dependencyInventory": "pass",
            "pythonPackages": len(python),
            "nodePackages": len(node),
            "lockfiles": {
                "api/requirements.lock": sha(ROOT / "api/requirements.lock"),
                "web/package-lock.json": sha(ROOT / "web/package-lock.json"),
            },
            "sourceAssets": check_assets(),
            "unknownLicenseMetadata": unknown,
            "vulnerabilityScan": "Separate timestamped audit reports required",
            "browserVisualQA": "pending",
            "productionAcceptance": "pending",
        },
    )
    print(
        f"PASS: locked inventory, dependency graph and SBOM for {len(python)} Python / {len(node)} Node components; local source-asset checks pass."
    )
    print(
        f"{len(unknown)} packages have no declared license metadata; legal/release review remains pending."
    )


if __name__ == "__main__":
    main()
