import {
  bootstrapModel,
  defaultModelsDir,
  planModelBootstrap
} from "./bootstrap.js";
import {
  loadModelManifest,
  QWEN35_08B_MODEL_ID
} from "./manifest.js";
import {
  formatBenchmarkResult,
  runModelBenchmark
} from "./benchmark.js";
import {
  auditModelRuntime,
  createModelSnapshot,
  diffModelSnapshot,
  rollbackModelSnapshot
} from "./maintenance.js";

const HELP = `Usage:
  sancho-model-orchestrator models plan [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path]
  sancho-model-orchestrator models bootstrap [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path] [--dry-run] [--allow-network] [--allow-unverified]
  sancho-model-orchestrator benchmark run [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path] [--runner command] [--iterations n] [--warmup n] [--timeout-ms n] [--prompt text] [-- <runner args>]
  sancho-model-orchestrator maintenance audit [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path]
  sancho-model-orchestrator maintenance snapshot [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path] [--snapshot-id id] [--snapshot-dir path]
  sancho-model-orchestrator maintenance diff [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path] --snapshot-id id [--snapshot-dir path]
  sancho-model-orchestrator maintenance rollback [--model qwen3.5-0.8b | --manifest manifest.json] [--models-dir path] --snapshot-id id [--snapshot-dir path] [--dry-run]

Model files are stored under SANCHO_MODEL_DIR, SANCHO_RUNTIME_DIR/models, or
the platform default runtime model directory. They are never written into
tracked source paths by default.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  if (command === "models") {
    return await runModelsCommand(subcommand, rest, { stdout });
  }

  if (command === "benchmark") {
    return await runBenchmarkCommand(subcommand, rest, { stdout });
  }

  if (command === "maintenance") {
    return await runMaintenanceCommand(subcommand, rest, { stdout });
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function runModelsCommand(subcommand, args, streams) {
  const { options } = parseOptions(args);
  const manifest = await loadManifestFromOptions(options);
  const modelsDir = options["models-dir"] ?? defaultModelsDir();

  if (subcommand === "plan") {
    const plan = await planModelBootstrap(manifest, { modelsDir });
    streams.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "bootstrap") {
    const result = await bootstrapModel(manifest, {
      modelsDir,
      dryRun: Boolean(options["dry-run"]),
      allowNetwork: Boolean(options["allow-network"]),
      allowUnverified: Boolean(options["allow-unverified"])
    });
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown models command: ${subcommand}\n\n${HELP}`);
}

async function runBenchmarkCommand(subcommand, args, streams) {
  const { options, passthrough } = parseOptions(args, { allowPassthrough: true });
  const manifest = await loadManifestFromOptions(options);
  const modelsDir = options["models-dir"] ?? defaultModelsDir();

  if (subcommand !== "run") {
    throw new Error(`Unknown benchmark command: ${subcommand}\n\n${HELP}`);
  }

  const runner = options.runner
    ? { command: options.runner, args: passthrough, env: {} }
    : undefined;

  const result = await runModelBenchmark(manifest, {
    modelsDir,
    runner,
    iterations: options.iterations,
    warmup: options.warmup,
    timeoutMs: options["timeout-ms"],
    prompt: options.prompt
  });
  streams.stdout.write(formatBenchmarkResult(result));
  return 0;
}

async function runMaintenanceCommand(subcommand, args, streams) {
  const { options } = parseOptions(args);
  const manifest = await loadManifestFromOptions(options);
  const sharedOptions = {
    modelsDir: options["models-dir"] ?? defaultModelsDir(),
    snapshotId: options["snapshot-id"],
    snapshotDir: options["snapshot-dir"]
  };

  if (subcommand === "audit") {
    const result = await auditModelRuntime(manifest, sharedOptions);
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "snapshot") {
    const result = await createModelSnapshot(manifest, sharedOptions);
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "diff") {
    const result = await diffModelSnapshot(manifest, sharedOptions);
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "rollback") {
    const result = await rollbackModelSnapshot(manifest, {
      ...sharedOptions,
      dryRun: Boolean(options["dry-run"])
    });
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown maintenance command: ${subcommand}\n\n${HELP}`);
}

async function loadManifestFromOptions(options) {
  if (options.model && options.manifest) {
    throw new Error("Use either --model or --manifest, not both.");
  }
  return await loadModelManifest(options.manifest ?? options.model ?? QWEN35_08B_MODEL_ID);
}

function parseOptions(args, settings = {}) {
  const options = {};
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--" && settings.allowPassthrough) {
      passthrough.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (["dry-run", "allow-network", "allow-unverified"].includes(name)) {
      options[name] = true;
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }

  return { options, passthrough };
}
