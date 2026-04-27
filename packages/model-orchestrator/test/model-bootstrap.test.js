import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  bootstrapModel,
  loadModelManifest,
  normalizeModelManifest,
  planModelBootstrap
} from "../src/index.js";
import { runCli } from "../src/cli.js";

test("loads the built-in Qwen baseline manifest without artifacts", async () => {
  const manifest = await loadModelManifest("qwen3.5-0.8b");

  assert.equal(manifest.id, "qwen3.5-0.8b");
  assert.equal(manifest.source.repository, "Qwen/Qwen3.5-0.8B");
  assert.deepEqual(manifest.artifacts, []);
});

test("rejects artifact paths that escape the model directory", () => {
  assert.throws(
    () => normalizeModelManifest({
      id: "bad-path",
      artifacts: [
        {
          path: "../outside.bin",
          url: "https://example.com/outside.bin",
          sha256: "a".repeat(64)
        }
      ]
    }),
    /stay inside/
  );
});

test("bootstraps file artifacts into a model directory and reuses cached files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-models-"));
  const source = join(directory, "source-config.json");
  const content = Buffer.from(JSON.stringify({ model: "fixture-qwen" }));
  const sha256 = createHash("sha256").update(content).digest("hex");

  try {
    await writeFile(source, content);
    const manifest = normalizeModelManifest({
      id: "fixture-qwen",
      name: "Fixture Qwen",
      source: {
        type: "fixture",
        license: "Apache-2.0"
      },
      storage: {
        directory: "fixture-qwen"
      },
      artifacts: [
        {
          path: "config/config.json",
          url: pathToFileURL(source).href,
          sha256,
          sizeBytes: content.length
        }
      ]
    });

    const first = await bootstrapModel(manifest, { modelsDir: join(directory, "models") });
    assert.equal(first.changed, true);
    assert.equal(first.artifacts[0].status, "downloaded");
    assert.equal(
      await readFile(first.artifacts[0].targetPath, "utf8"),
      content.toString("utf8")
    );

    const second = await bootstrapModel(manifest, { modelsDir: join(directory, "models") });
    assert.equal(second.changed, false);
    assert.equal(second.artifacts[0].status, "cached");

    const lock = JSON.parse(await readFile(second.lockPath, "utf8"));
    assert.equal(lock.model.id, "fixture-qwen");
    assert.equal(lock.artifacts[0].sha256, sha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocks remote model downloads unless network is explicitly allowed", async () => {
  const manifest = normalizeModelManifest({
    id: "remote-qwen",
    artifacts: [
      {
        path: "model.safetensors",
        url: "https://example.com/model.safetensors",
        sha256: "b".repeat(64)
      }
    ]
  });

  await assert.rejects(
    () => bootstrapModel(manifest, { modelsDir: tmpdir() }),
    /Network download disabled/
  );
});

test("downloads remote artifacts through an explicit fetch implementation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-remote-"));
  const content = Buffer.from("remote artifact");
  const sha256 = createHash("sha256").update(content).digest("hex");
  const requestedUrls = [];

  try {
    const manifest = normalizeModelManifest({
      id: "remote-qwen",
      artifacts: [
        {
          path: "model.gguf",
          url: "https://example.com/model.gguf",
          sha256,
          sizeBytes: content.length
        }
      ]
    });

    const result = await bootstrapModel(manifest, {
      modelsDir: directory,
      allowNetwork: true,
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return new Response(content);
      }
    });

    assert.deepEqual(requestedUrls, ["https://example.com/model.gguf"]);
    assert.equal(result.artifacts[0].status, "downloaded");
    assert.equal(await readFile(result.artifacts[0].targetPath, "utf8"), "remote artifact");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports and replaces stale cached artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-stale-"));
  const source = join(directory, "source-model.gguf");
  const content = Buffer.from("fresh artifact");
  const sha256 = createHash("sha256").update(content).digest("hex");

  try {
    await writeFile(source, content);
    const manifest = normalizeModelManifest({
      id: "stale-qwen",
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
    const first = await bootstrapModel(manifest, { modelsDir });

    await writeFile(first.artifacts[0].targetPath, "stale");
    const stalePlan = await planModelBootstrap(manifest, { modelsDir });
    assert.equal(stalePlan.artifacts[0].status, "stale");

    const repaired = await bootstrapModel(manifest, { modelsDir });
    assert.equal(repaired.artifacts[0].status, "replaced");
    assert.equal(await readFile(repaired.artifacts[0].targetPath, "utf8"), "fresh artifact");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI prints model bootstrap plans as JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-plan-"));
  const stdout = { text: "", write(chunk) { this.text += chunk; } };

  try {
    assert.equal(
      await runCli([
        "models",
        "plan",
        "--model",
        "qwen3.5-0.8b",
        "--models-dir",
        directory
      ], { stdout }),
      0
    );
    const plan = JSON.parse(stdout.text);
    assert.equal(plan.model.id, "qwen3.5-0.8b");
    assert.equal(plan.artifactCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dry-run bootstrap reports missing artifacts without writing them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-model-dry-run-"));
  const manifest = normalizeModelManifest({
    id: "dry-run-qwen",
    artifacts: [
      {
        path: "model.gguf",
        url: "https://example.com/model.gguf",
        sha256: "c".repeat(64)
      }
    ]
  });

  try {
    const result = await bootstrapModel(manifest, {
      modelsDir: directory,
      dryRun: true
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.artifacts[0].status, "missing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
