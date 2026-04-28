import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const releaseGateScript = fileURLToPath(new URL("./check-release-gate.js", import.meta.url));

test("release gate rejects workspace packages without an explicit Apache-2.0 license", () => {
  const root = createFixtureRepo({
    "packages/missing-license/package.json": JSON.stringify({
      name: "@sancho-ai-ime/missing-license",
      version: "0.1.0",
      type: "module"
    }, null, 2)
  });

  const result = runReleaseGate(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Workspace package @sancho-ai-ime\/missing-license must declare license Apache-2\.0/);
});

test("release gate reports tracked secret findings with file and line", () => {
  const fakeSecret = ["sk", "1234567890abcdefghijklmnop"].join("-");
  const root = createFixtureRepo({
    "docs/secrets.md": [
      "# Fixture",
      `Token: ${fakeSecret}`,
      ""
    ].join("\n")
  });

  const result = runReleaseGate(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Potential OpenAI-style secret found in tracked file: docs\/secrets\.md:2/);
  assert.equal(result.stderr.includes(fakeSecret), false);
});

test("release gate rejects workspace packages that would publish tests", () => {
  const root = createFixtureRepo({
    "packages/leaky-package/package.json": JSON.stringify({
      name: "@sancho-ai-ime/leaky-package",
      version: "0.1.0",
      type: "module",
      license: "Apache-2.0"
    }, null, 2),
    "packages/leaky-package/test/leaky.test.js": "export {};\n"
  });

  const result = runReleaseGate(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Package @sancho-ai-ime\/leaky-package dry-run includes forbidden test file: test\/leaky\.test\.js/);
});

test("release gate accepts workspace packages with Apache-2.0 metadata", () => {
  const root = createFixtureRepo({
    "packages/licensed/package.json": JSON.stringify({
      name: "@sancho-ai-ime/licensed",
      version: "0.1.0",
      type: "module",
      license: "Apache-2.0"
    }, null, 2)
  });

  const result = runReleaseGate(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release gate passed/);
});

test("release gate fails closed when release SBOM metadata is incomplete", () => {
  const root = createFixtureRepo({
    "packages/model-orchestrator/examples/missing-license.manifest.json": JSON.stringify({
      schemaVersion: 1,
      id: "missing-license",
      name: "Missing License Model",
      source: {
        url: "https://example.invalid/model"
      },
      storage: {
        directory: "missing-license"
      },
      artifacts: []
    }, null, 2)
  });

  const result = runReleaseGate(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release SBOM generation failed/);
  assert.match(result.stderr, /Model manifest missing-license must declare source\.license/);
});

function createFixtureRepo(extraFiles) {
  const root = mkdtempSync(join(tmpdir(), "sancho-release-gate-"));
  writeFileSync(join(root, "LICENSE"), "Apache License\n");
  writeFileSync(join(root, "NOTICE"), "SanchoAiIME\n");
  writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "# Third-Party Notices\n");
  writeFileSync(join(root, "MODEL_LICENSES.md"), "# Model Licenses\n");
  writeFileSync(join(root, ".gitignore"), [
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
    "*.jsonl",
    ""
  ].join("\n"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "sancho-ai-ime-fixture",
    private: true,
    type: "module",
    license: "Apache-2.0",
    workspaces: [
      "packages/*"
    ]
  }, null, 2));

  for (const [file, content] of Object.entries(extraFiles)) {
    const absolutePath = join(root, file);
    mkdirSync(absolutePath.split("/").slice(0, -1).join("/"), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  return root;
}

function runReleaseGate(root) {
  return spawnSync("node", [releaseGateScript], {
    cwd: root,
    encoding: "utf8"
  });
}
