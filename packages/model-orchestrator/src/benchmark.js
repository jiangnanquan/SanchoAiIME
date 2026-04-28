import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

import { normalizeModelManifest, normalizeRunner } from "./manifest.js";
import { resolveModelLayout } from "./bootstrap.js";

export async function runModelBenchmark(manifestInput, options = {}) {
  const manifest = normalizeModelManifest(manifestInput);
  const layout = resolveModelLayout(manifest, options);
  const runner = normalizeRunner(options.runner ?? manifest.benchmark.runner);
  const prompt = options.prompt ?? manifest.benchmark.prompt;
  const iterations = normalizePositiveInteger(
    options.iterations ?? manifest.benchmark.iterations,
    "Benchmark iterations"
  );
  const warmup = normalizeNonNegativeInteger(
    options.warmup ?? manifest.benchmark.warmup,
    "Benchmark warmup"
  );
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs ?? manifest.benchmark.timeoutMs,
    "Benchmark timeoutMs"
  );

  const samples = [];
  for (let index = 0; index < warmup + iterations; index += 1) {
    const sample = await runSample(runner, {
      baseEnv: options.baseEnv ?? process.env,
      index,
      modelDir: layout.modelDir,
      modelId: manifest.id,
      prompt,
      timeoutMs
    });
    if (index >= warmup) {
      samples.push({
        iteration: index - warmup,
        elapsedMs: sample.elapsedMs,
        stdoutBytes: sample.stdout.length,
        stderrBytes: sample.stderr.length,
        stdout: sample.stdout,
        stderr: sample.stderr
      });
    }
  }

  const elapsed = samples.map((sample) => sample.elapsedMs);
  return {
    model: {
      id: manifest.id,
      name: manifest.name
    },
    modelDir: layout.modelDir,
    runner: {
      command: runner.command,
      args: runner.args
    },
    prompt,
    iterations,
    warmup,
    timeoutMs,
    samples,
    summary: summarize(elapsed)
  };
}

export function formatBenchmarkResult(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function runSample(runner, context) {
  const args = runner.args.map((arg) => interpolate(arg, context));
  const env = {
    ...context.baseEnv,
    ...Object.fromEntries(
      Object.entries(runner.env).map(([name, value]) => [
        name,
        interpolate(value, context)
      ])
    )
  };
  const cwd = runner.cwd === undefined ? undefined : interpolate(runner.cwd, context);
  const startedAt = performance.now();

  const child = spawn(runner.command, args, {
    cwd,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
  }, context.timeoutMs);

  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));

  const elapsedMs = performance.now() - startedAt;
  const stdoutText = Buffer.concat(stdout).toString("utf8");
  const stderrText = Buffer.concat(stderr).toString("utf8");

  if (exit.signal) {
    throw new Error(`Benchmark runner exited from signal ${exit.signal}.`);
  }
  if (exit.code !== 0) {
    throw new Error(
      `Benchmark runner exited with code ${exit.code}: ${stderrText.trim()}`
    );
  }

  return {
    elapsedMs,
    stdout: stdoutText,
    stderr: stderrText
  };
}

function summarize(values) {
  if (values.length === 0) {
    return {
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      medianMs: 0
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    minMs: round(sorted[0]),
    maxMs: round(sorted.at(-1)),
    meanMs: round(sum / sorted.length),
    medianMs: round(percentile(sorted, 0.5))
  };
}

function percentile(sortedValues, fraction) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * fraction))
  );
  return sortedValues[index];
}

function interpolate(value, context) {
  return value
    .replaceAll("{modelDir}", context.modelDir)
    .replaceAll("{modelId}", context.modelId)
    .replaceAll("{prompt}", context.prompt)
    .replaceAll("{iteration}", String(context.index));
}

function normalizePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return number;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
