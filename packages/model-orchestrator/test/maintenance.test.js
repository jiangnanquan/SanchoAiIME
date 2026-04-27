import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  auditModelRuntime,
  bootstrapModel,
  createModelSnapshot,
  diffModelSnapshot,
  normalizeModelManifest,
  rollbackModelSnapshot
} from "../src/index.js";
import { runCli } from "../src/cli.js";

test("audits model artifacts, locks, and unmanaged runtime files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-audit-"));
  const source = join(directory, "source-tokenizer.json");
  const content = Buffer.from(JSON.stringify({ tokenizer: "fixture" }));
  const sha256 = createHash("sha256").update(content).digest("hex");

  try {
    await writeFile(source, content);
    const manifest = normalizeModelManifest({
      id: "audit-qwen",
      artifacts: [
        {
          path: "config/tokenizer.json",
          url: pathToFileURL(source).href,
          sha256,
          sizeBytes: content.length
        }
      ]
    });
    const modelsDir = join(directory, "models");

    const missing = await auditModelRuntime(manifest, { modelsDir });
    assert.equal(missing.summary.status, "attention");
    assert.equal(missing.artifacts[0].status, "missing");
    assert.equal(missing.lock.status, "missing");

    const bootstrapped = await bootstrapModel(manifest, { modelsDir });
    await writeFile(join(bootstrapped.modelDir, "notes.txt"), "operator note");

    const clean = await auditModelRuntime(manifest, { modelsDir });
    assert.equal(clean.summary.status, "ok");
    assert.equal(clean.artifacts[0].status, "ok");
    assert.equal(clean.lock.status, "ok");
    assert.deepEqual(
      clean.unexpectedFiles.map((file) => file.path),
      ["notes.txt"]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("snapshots, diffs, and rolls back model runtime artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-rollback-"));
  const source = join(directory, "source-model.gguf");
  const content = Buffer.from("original model bytes");
  const sha256 = createHash("sha256").update(content).digest("hex");

  try {
    await writeFile(source, content);
    const manifest = normalizeModelManifest({
      id: "rollback-qwen",
      artifacts: [
        {
          path: "model.gguf",
          url: pathToFileURL(source).href,
          sha256,
          sizeBytes: content.length
        }
      ]
    });
    const modelsDir = join(directory, "models");
    const bootstrapped = await bootstrapModel(manifest, { modelsDir });

    const snapshot = await createModelSnapshot(manifest, {
      modelsDir,
      snapshotId: "before-maintenance"
    });
    assert.equal(snapshot.snapshotId, "before-maintenance");
    assert.equal(snapshot.artifacts[0].existed, true);

    await writeFile(bootstrapped.artifacts[0].targetPath, "mutated model bytes");
    const diff = await diffModelSnapshot(manifest, {
      modelsDir,
      snapshotId: "before-maintenance"
    });
    assert.equal(diff.summary.status, "changed");
    assert.equal(diff.artifacts[0].status, "modified");

    const dryRun = await rollbackModelSnapshot(manifest, {
      modelsDir,
      snapshotId: "before-maintenance",
      dryRun: true
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.actions[0].action, "restore");
    assert.equal(await readFile(bootstrapped.artifacts[0].targetPath, "utf8"), "mutated model bytes");

    const rolledBack = await rollbackModelSnapshot(manifest, {
      modelsDir,
      snapshotId: "before-maintenance"
    });
    assert.equal(rolledBack.summary.status, "rolled-back");
    assert.equal(await readFile(bootstrapped.artifacts[0].targetPath, "utf8"), "original model bytes");

    const cleanDiff = await diffModelSnapshot(manifest, {
      modelsDir,
      snapshotId: "before-maintenance"
    });
    assert.equal(cleanDiff.summary.status, "unchanged");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI runs maintenance audit as JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-maintenance-cli-"));
  const manifestPath = join(directory, "manifest.json");
  const stdout = { text: "", write(chunk) { this.text += chunk; } };

  try {
    await writeFile(manifestPath, JSON.stringify({
      id: "cli-audit-qwen",
      artifacts: []
    }));

    assert.equal(
      await runCli([
        "maintenance",
        "audit",
        "--manifest",
        manifestPath,
        "--models-dir",
        join(directory, "models")
      ], { stdout }),
      0
    );
    const audit = JSON.parse(stdout.text);
    assert.equal(audit.model.id, "cli-audit-qwen");
    assert.equal(audit.summary.artifactCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
