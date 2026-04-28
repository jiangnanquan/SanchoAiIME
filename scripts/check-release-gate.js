import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

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

const secretValuePatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/
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
  if (secretValuePatterns.some((pattern) => pattern.test(content))) {
    failures.push(`Potential secret value found in tracked file: ${file}`);
  }
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
