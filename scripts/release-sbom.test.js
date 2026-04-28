import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReleaseSbom } from "./release-sbom.js";

const generateSbomScript = fileURLToPath(new URL("./generate-release-sbom.js", import.meta.url));

test("release SBOM includes root package, workspaces, and model manifest references", async () => {
  const root = createSbomFixture({
    "packages/example/package.json": JSON.stringify({
      name: "@sancho-ai-ime/example",
      version: "0.1.0",
      type: "module",
      license: "Apache-2.0"
    }, null, 2),
    "packages/model-orchestrator/examples/qwen.manifest.json": JSON.stringify({
      schemaVersion: 1,
      id: "qwen-fixture",
      name: "Qwen Fixture",
      source: {
        type: "huggingface",
        repository: "Qwen/Qwen-Fixture",
        url: "https://huggingface.co/Qwen/Qwen-Fixture",
        license: "Apache-2.0"
      },
      storage: {
        directory: "qwen-fixture"
      },
      artifacts: [
        {
          path: "model.gguf",
          url: "https://example.invalid/model.gguf",
          sha256: "a".repeat(64)
        }
      ]
    }, null, 2)
  });

  const sbom = await buildReleaseSbom({
    rootDir: root,
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.equal(sbom.name, "SanchoAiIME Release SBOM");
  assert.deepEqual(sbom.creationInfo.creators, ["Tool: SanchoAiIME release-sbom"]);

  const packagesByName = new Map(sbom.packages.map((pkg) => [pkg.name, pkg]));
  assert.equal(packagesByName.get("sancho-ai-ime-fixture").licenseDeclared, "Apache-2.0");
  assert.equal(packagesByName.get("@sancho-ai-ime/example").licenseDeclared, "Apache-2.0");
  assert.equal(packagesByName.get("model:qwen-fixture").downloadLocation, "https://huggingface.co/Qwen/Qwen-Fixture");
  assert.equal(packagesByName.get("model:qwen-fixture").licenseDeclared, "Apache-2.0");
  assert.equal(packagesByName.has("model.gguf"), false);
});

test("release SBOM rejects model manifests without source license metadata", async () => {
  const root = createSbomFixture({
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

  await assert.rejects(
    () => buildReleaseSbom({ rootDir: root }),
    /Model manifest missing-license must declare source\.license for SBOM generation/
  );
});

test("release SBOM CLI writes JSON to the requested ignored output path", () => {
  const root = createSbomFixture({
    "packages/example/package.json": JSON.stringify({
      name: "@sancho-ai-ime/example",
      version: "0.1.0",
      type: "module",
      license: "Apache-2.0"
    }, null, 2)
  });
  const outputPath = join(root, "data", "release-sbom.spdx.json");

  const result = spawnSync("node", [
    generateSbomScript,
    "--output",
    outputPath,
    "--created-at",
    "2026-04-28T00:00:00.000Z"
  ], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const sbom = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.match(result.stdout, /Wrote release SBOM/);
});

function createSbomFixture(extraFiles) {
  const root = mkdtempSync(join(tmpdir(), "sancho-sbom-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "sancho-ai-ime-fixture",
    version: "0.1.0",
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

  return root;
}
