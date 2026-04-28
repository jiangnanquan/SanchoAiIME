import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const TOOL_NAME = "SanchoAiIME release-sbom";
const SPDX_VERSION = "SPDX-2.3";
const DATA_LICENSE = "CC0-1.0";

export async function buildReleaseSbom(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const createdAt = options.createdAt ?? new Date().toISOString();
  const rootPackage = await readJson(join(rootDir, "package.json"), "Root package.json");

  const packages = [
    packageToSpdxPackage({
      name: rootPackage.name ?? "sancho-ai-ime",
      version: rootPackage.version,
      license: rootPackage.license,
      supplier: "Organization: SanchoAiIME",
      label: "Root package"
    })
  ];

  packages.push(
    ...await discoverWorkspacePackages(rootDir, rootPackage.workspaces ?? [])
  );
  packages.push(...await discoverModelManifestPackages(rootDir));

  packages.sort((left, right) => left.name.localeCompare(right.name));
  assertUniqueSpdxIds(packages);

  return {
    spdxVersion: SPDX_VERSION,
    dataLicense: DATA_LICENSE,
    SPDXID: "SPDXRef-DOCUMENT",
    name: "SanchoAiIME Release SBOM",
    documentNamespace: buildDocumentNamespace(rootPackage.name ?? "sancho-ai-ime", createdAt),
    creationInfo: {
      created: createdAt,
      creators: [`Tool: ${TOOL_NAME}`]
    },
    packages,
    relationships: packages.map((pkg) => ({
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: pkg.SPDXID
    }))
  };
}

export async function writeReleaseSbom(outputPath, options = {}) {
  const sbom = await buildReleaseSbom(options);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
  return sbom;
}

async function discoverWorkspacePackages(rootDir, workspaces) {
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : Array.isArray(workspaces.packages)
      ? workspaces.packages
      : [];
  const workspaceDirs = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*") || pattern.includes("**")) {
      throw new Error(`Unsupported workspace pattern for SBOM generation: ${pattern}`);
    }
    const parentDir = join(rootDir, pattern.slice(0, -2));
    for (const entry of await readDirectoryIfExists(parentDir)) {
      if (entry.isDirectory()) {
        workspaceDirs.push(join(parentDir, entry.name));
      }
    }
  }

  const packages = [];
  for (const workspaceDir of workspaceDirs.sort()) {
    const packageJsonPath = join(workspaceDir, "package.json");
    const packageJson = await readJsonIfExists(packageJsonPath);
    if (!packageJson) {
      continue;
    }
    packages.push(packageToSpdxPackage({
      name: packageJson.name,
      version: packageJson.version,
      license: packageJson.license,
      supplier: "Organization: SanchoAiIME",
      label: `Workspace package ${packageJson.name ?? packageJsonPath}`
    }));
  }
  return packages;
}

async function discoverModelManifestPackages(rootDir) {
  const examplesDir = join(rootDir, "packages", "model-orchestrator", "examples");
  const manifests = [];
  for (const entry of await readDirectoryIfExists(examplesDir)) {
    if (entry.isFile() && entry.name.endsWith(".manifest.json")) {
      manifests.push(join(examplesDir, entry.name));
    }
  }

  const packages = [];
  for (const manifestPath of manifests.sort()) {
    const manifest = await readJson(manifestPath, manifestPath);
    const id = requireString(manifest.id, `Model manifest at ${manifestPath} must declare id`);
    const source = expectObject(manifest.source, `Model manifest ${id} must declare source`);
    const license = source.license;
    if (typeof license !== "string" || license.trim() === "") {
      throw new Error(`Model manifest ${id} must declare source.license for SBOM generation`);
    }

    packages.push(packageToSpdxPackage({
      name: `model:${id}`,
      version: source.revision,
      license,
      supplier: "Organization: SanchoAiIME",
      downloadLocation: source.url ?? "NOASSERTION",
      label: `Model manifest ${id}`,
      externalRefs: buildModelExternalRefs(source)
    }));
  }
  return packages;
}

function packageToSpdxPackage(input) {
  const name = requireString(input.name, `${input.label} must declare name`);
  const license = requireString(input.license, `${input.label} must declare license for SBOM generation`);

  return {
    name,
    SPDXID: toSpdxId(name),
    versionInfo: input.version ?? "NOASSERTION",
    downloadLocation: input.downloadLocation ?? "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: license,
    licenseDeclared: license,
    copyrightText: "NOASSERTION",
    supplier: input.supplier ?? "NOASSERTION",
    ...(input.externalRefs?.length > 0 ? { externalRefs: input.externalRefs } : {})
  };
}

function buildModelExternalRefs(source) {
  const refs = [];
  if (source.repository) {
    refs.push({
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: `pkg:huggingface/${source.repository}`
    });
  }
  return refs;
}

function toSpdxId(name) {
  const slug = name
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `SPDXRef-Package-${slug || "unnamed"}`;
}

function buildDocumentNamespace(packageName, createdAt) {
  const slug = packageName.replace(/[^A-Za-z0-9.-]+/g, "-");
  const timestamp = createdAt.replace(/[^0-9TZ]+/g, "-");
  return `https://sancho-ai-ime.local/sbom/${slug}/${timestamp}`;
}

function assertUniqueSpdxIds(packages) {
  const seen = new Set();
  for (const pkg of packages) {
    if (seen.has(pkg.SPDXID)) {
      throw new Error(`Duplicate SPDX package id generated: ${pkg.SPDXID}`);
    }
    seen.add(pkg.SPDXID);
  }
}

async function readDirectoryIfExists(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readJsonIfExists(path) {
  try {
    return await readJson(path, path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

function expectObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function requireString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
  return value;
}
