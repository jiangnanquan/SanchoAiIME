import {
  SUPPORTED_FORMATS,
  importExternalLexiconFile,
  importLexiconFile,
  previewExternalLexiconFile,
  previewLexiconFile,
  rollbackImport
} from "./importer.js";

const HELP_ZH = `用法：
  sancho-lexicon-importer preview --format <format> --input <path> [--source <id>] [--default-weight n]
  sancho-lexicon-importer import --format <format> --input <path> --output <path> [--source <id>] [--rollback-dir <path>] [--dry-run]
  sancho-lexicon-importer external-preview --adapter imewlconverter --source-format <format> --converted-format <format> --input <path> [--tool <path>] -- <adapter args>
  sancho-lexicon-importer external-import --adapter imewlconverter --source-format <format> --converted-format <format> --input <path> --output <path> [--tool <path>] [--rollback-dir <path>] [--dry-run] -- <adapter args>
  sancho-lexicon-importer rollback --output <path> --rollback-id <id> [--rollback-dir <path>] [--dry-run]

格式：${SUPPORTED_FORMATS.join(", ")}

导入结果和回滚快照属于用户数据，请放在 data/lexicons 或 SANCHO_RUNTIME_DIR
管理的本地运行目录中。
`;

const HELP_EN = `Usage:
  sancho-lexicon-importer preview --format <format> --input <path> [--source <id>] [--default-weight n]
  sancho-lexicon-importer import --format <format> --input <path> --output <path> [--source <id>] [--rollback-dir <path>] [--dry-run]
  sancho-lexicon-importer external-preview --adapter imewlconverter --source-format <format> --converted-format <format> --input <path> [--tool <path>] -- <adapter args>
  sancho-lexicon-importer external-import --adapter imewlconverter --source-format <format> --converted-format <format> --input <path> --output <path> [--tool <path>] [--rollback-dir <path>] [--dry-run] -- <adapter args>
  sancho-lexicon-importer rollback --output <path> --rollback-id <id> [--rollback-dir <path>] [--dry-run]

Formats: ${SUPPORTED_FORMATS.join(", ")}

Import outputs and rollback snapshots are user data. Keep them under ignored
runtime paths such as data/lexicons or SANCHO_RUNTIME_DIR-managed storage.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const locale = localeFromEnv(streams.env);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(helpText(locale));
    return 0;
  }

  const { options, passthroughArgs } = parseOptions(rest);

  if (command === "preview") {
    rejectPassthroughArgs(command, passthroughArgs);
    const result = await previewLexiconFile(optionsFromCli(options, {
      requireInput: true,
      requireFormat: true
    }));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (command === "import") {
    rejectPassthroughArgs(command, passthroughArgs);
    const result = await importLexiconFile(optionsFromCli(options, {
      requireInput: true,
      requireFormat: true,
      requireOutput: true
    }));
    stdout.write(`${JSON.stringify(summarizeImportResult(result), null, 2)}\n`);
    return 0;
  }

  if (command === "external-preview") {
    const result = await previewExternalLexiconFile(externalOptionsFromCli(options, passthroughArgs, {
      requireInput: true
    }, streams));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (command === "external-import") {
    const result = await importExternalLexiconFile(externalOptionsFromCli(options, passthroughArgs, {
      requireInput: true,
      requireOutput: true
    }, streams));
    stdout.write(`${JSON.stringify(summarizeImportResult(result), null, 2)}\n`);
    return 0;
  }

  if (command === "rollback") {
    rejectPassthroughArgs(command, passthroughArgs);
    const result = await rollbackImport(optionsFromCli(options, {
      requireOutput: true,
      requireRollbackId: true
    }));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText(locale)}`);
}

function optionsFromCli(options, requirements) {
  if (requirements.requireFormat && !options.format) {
    throw new Error("Missing required option --format.");
  }
  if (requirements.requireInput && !options.input) {
    throw new Error("Missing required option --input.");
  }
  if (requirements.requireOutput && !options.output) {
    throw new Error("Missing required option --output.");
  }
  if (requirements.requireRollbackId && !options["rollback-id"]) {
    throw new Error("Missing required option --rollback-id.");
  }

  return {
    format: options.format,
    inputPath: options.input,
    outputPath: options.output,
    rollbackId: options["rollback-id"],
    rollbackDir: options["rollback-dir"],
    sourceId: options.source,
    defaultWeight: options["default-weight"],
    dryRun: Boolean(options["dry-run"])
  };
}

function externalOptionsFromCli(options, passthroughArgs, requirements, streams) {
  if (!options.adapter) {
    throw new Error("Missing required option --adapter.");
  }
  if (!options["source-format"]) {
    throw new Error("Missing required option --source-format.");
  }
  if (!options["converted-format"] && !options.format) {
    throw new Error("Missing required option --converted-format.");
  }
  if (requirements.requireInput && !options.input) {
    throw new Error("Missing required option --input.");
  }
  if (requirements.requireOutput && !options.output) {
    throw new Error("Missing required option --output.");
  }

  return {
    adapter: options.adapter,
    sourceFormat: options["source-format"],
    convertedFormat: options["converted-format"] ?? options.format,
    inputPath: options.input,
    outputPath: options.output,
    rollbackDir: options["rollback-dir"],
    sourceId: options.source,
    defaultWeight: options["default-weight"],
    toolPath: options.tool,
    adapterArgs: passthroughArgs,
    execFileImpl: streams.execFileImpl,
    dryRun: Boolean(options["dry-run"])
  };
}

function summarizeImportResult(result) {
  return {
    changed: result.changed,
    dryRun: result.dryRun,
    outputPath: result.outputPath,
    rollback: result.rollback,
    source: result.preview.source,
    format: result.preview.format,
    adapter: result.preview.adapter,
    summary: result.preview.summary
  };
}

function parseOptions(args) {
  const options = {};
  const separatorIndex = args.indexOf("--");
  const optionArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const passthroughArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (name === "dry-run") {
      options[name] = true;
      continue;
    }

    const value = optionArgs[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }
  return { options, passthroughArgs };
}

function rejectPassthroughArgs(command, passthroughArgs) {
  if (passthroughArgs.length > 0) {
    throw new Error(`Command ${command} does not accept adapter args after --.`);
  }
}

function localeFromEnv(env = process.env) {
  const raw = String(env?.SANCHO_LOCALE ?? "zh-CN").replace("_", "-").toLowerCase();
  return raw.startsWith("en") ? "en-US" : "zh-CN";
}

function helpText(locale) {
  return locale === "en-US" ? HELP_EN : HELP_ZH;
}
