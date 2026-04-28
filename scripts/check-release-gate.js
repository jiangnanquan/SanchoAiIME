import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

import { buildReleaseSbom } from "./release-sbom.js";

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "MODEL_LICENSES.md"
];

const requiredGitignoreEntries = [
  ".env",
  ".env.*",
  "data/",
  "logs/",
  "models/",
  "*.bin",
  "*.gguf",
  "*.mlmodel",
  "*.onnx",
  "*.pt",
  "*.pth",
  "*.safetensors",
  "*.duckdb",
  "*.jsonl"
];

const forbiddenTrackedPatterns = [
  /\.duckdb(?:\.wal)?$/,
  /\.jsonl$/,
  /\.(?:bin|gguf|mlmodel|onnx|pt|pth|safetensors)$/
];

const forbiddenPackagedPatterns = [
  {
    label: "test file",
    pattern: /(?:^|\/)test\/|\.test\.[cm]?js$/
  },
  {
    label: "environment file",
    pattern: /(?:^|\/)\.env(?:\.|$)/
  },
  {
    label: "runtime or model artifact",
    pattern: /\.(?:duckdb(?:\.wal)?|jsonl|bin|gguf|mlmodel|onnx|pt|pth|safetensors)$/
  }
];

const secretValuePatterns = [
  {
    label: "OpenAI-style secret",
    pattern: /sk-[A-Za-z0-9_-]{20,}/
  },
  {
    label: "GitHub token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/
  },
  {
    label: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/
  }
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`Missing release file: ${file}`);
    continue;
  }
  if (statSync(file).size === 0) {
    failures.push(`Release file is empty: ${file}`);
  }
}

const gitignore = readFileSync(".gitignore", "utf8");
for (const entry of requiredGitignoreEntries) {
  if (!gitignore.split(/\r?\n/).includes(entry)) {
    failures.push(`.gitignore must include ${entry}`);
  }
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);

for (const file of trackedFiles) {
  if (isForbiddenEnvFile(file)
    || forbiddenTrackedPatterns.some((pattern) => pattern.test(file))) {
    failures.push(`Forbidden runtime or model artifact is tracked: ${file}`);
  }
}

for (const file of trackedFiles.filter((path) => /^packages\/[^/]+\/package\.json$/.test(path))) {
  const packageJson = JSON.parse(readFileSync(file, "utf8"));
  if (packageJson.license !== "Apache-2.0") {
    failures.push(`Workspace package ${packageJson.name ?? file} must declare license Apache-2.0`);
  }
}

for (const file of trackedFiles) {
  if (!isLikelyTextFile(file)) {
    continue;
  }
  const content = readFileSync(file, "utf8");
  for (const finding of findSecretFindings(content)) {
    failures.push(`Potential ${finding.label} found in tracked file: ${file}:${finding.line}`);
  }
}

try {
  await buildReleaseSbom({ rootDir: process.cwd() });
} catch (error) {
  failures.push(`Release SBOM generation failed: ${error.message}`);
}

for (const failure of checkPackageDryRun()) {
  failures.push(failure);
}

if (failures.length > 0) {
  console.error("Release gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Release gate passed.");

function isLikelyTextFile(file) {
  return /\.(?:js|json|md|txt|yaml|yml|toml|lock|mjs|cjs)$/.test(file)
    || !file.includes(".");
}

function isForbiddenEnvFile(file) {
  const name = file.split("/").at(-1);
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

function findSecretFindings(content) {
  const findings = [];
  const lines = content.split(/\r\n|\r|\n/);
  for (const [index, line] of lines.entries()) {
    for (const { label, pattern } of secretValuePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push({
          label,
          line: index + 1
        });
      }
    }
  }
  return findings;
}

function checkPackageDryRun() {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--workspaces"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const packageFailures = [];

  if (result.status !== 0) {
    packageFailures.push(`Package dry-run failed: ${summarizeCommandFailure(result)}`);
    return packageFailures;
  }

  let packs;
  try {
    packs = JSON.parse(result.stdout);
  } catch {
    packageFailures.push("Package dry-run did not return JSON metadata");
    return packageFailures;
  }

  if (!Array.isArray(packs) || packs.length === 0) {
    packageFailures.push("Package dry-run returned no workspace package metadata");
    return packageFailures;
  }

  for (const pack of packs) {
    const packageName = pack.name ?? pack.id ?? "workspace package";
    const files = Array.isArray(pack.files) ? pack.files : [];
    if (files.length === 0) {
      packageFailures.push(`Package ${packageName} dry-run returned no files`);
      continue;
    }

    for (const file of files) {
      const path = typeof file === "string" ? file : file.path;
      if (!path) {
        continue;
      }
      for (const { label, pattern } of forbiddenPackagedPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(path)) {
          packageFailures.push(`Package ${packageName} dry-run includes forbidden ${label}: ${path}`);
        }
      }
    }
  }

  return packageFailures;
}

function summarizeCommandFailure(result) {
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return output[0] ?? `exit ${result.status}`;
}
