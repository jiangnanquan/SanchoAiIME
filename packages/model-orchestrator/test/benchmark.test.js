import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatBenchmarkResult,
  normalizeModelManifest,
  runModelBenchmark
} from "../src/index.js";
import { runCli } from "../src/cli.js";

test("runs benchmark samples through an external child process runner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-benchmark-"));

  try {
    const manifest = normalizeModelManifest({
      id: "fixture-qwen",
      storage: {
        directory: "fixture-qwen"
      },
      benchmark: {
        prompt: "predict next word",
        iterations: 2,
        warmup: 1,
        timeoutMs: 5000,
        runner: {
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write(`${process.env.SANCHO_MODEL_DIR}|${process.argv[1]}`)",
            "{prompt}"
          ],
          env: {
            SANCHO_MODEL_DIR: "{modelDir}"
          }
        }
      }
    });

    const result = await runModelBenchmark(manifest, {
      modelsDir: directory,
      baseEnv: {}
    });

    assert.equal(result.samples.length, 2);
    assert.match(result.samples[0].stdout, /fixture-qwen\|predict next word/);
    assert.equal(result.summary.minMs > 0, true);
    assert.match(formatBenchmarkResult(result), /"iterations": 2/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("surfaces benchmark runner failures", async () => {
  const manifest = normalizeModelManifest({
    id: "broken-runner",
    benchmark: {
      runner: {
        command: process.execPath,
        args: ["-e", "process.stderr.write('failed'); process.exit(7)"]
      }
    }
  });

  await assert.rejects(
    () => runModelBenchmark(manifest, { modelsDir: tmpdir(), baseEnv: {} }),
    /code 7: failed/
  );
});

test("CLI can run a benchmark with a passthrough runner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-benchmark-cli-"));
  const stdout = { text: "", write(chunk) { this.text += chunk; } };

  try {
    assert.equal(
      await runCli([
        "benchmark",
        "run",
        "--model",
        "qwen3.5-0.8b",
        "--models-dir",
        directory,
        "--runner",
        process.execPath,
        "--iterations",
        "1",
        "--warmup",
        "0",
        "--prompt",
        "OK",
        "--",
        "-e",
        "process.stdout.write(process.argv[1])",
        "{prompt}"
      ], { stdout }),
      0
    );
    const result = JSON.parse(stdout.text);
    assert.equal(result.samples.length, 1);
    assert.equal(result.samples[0].stdout, "OK");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
