import {
  SUPPORTED_FORMATS,
  importLexiconFile,
  previewLexiconFile,
  rollbackImport
} from "./importer.js";

const HELP = `Usage:
  sancho-lexicon-importer preview --format <format> --input <path> [--source <id>] [--default-weight n]
  sancho-lexicon-importer import --format <format> --input <path> --output <path> [--source <id>] [--rollback-dir <path>] [--dry-run]
  sancho-lexicon-importer rollback --output <path> --rollback-id <id> [--rollback-dir <path>] [--dry-run]

Formats: ${SUPPORTED_FORMATS.join(", ")}

Import outputs and rollback snapshots are user data. Keep them under ignored
runtime paths such as data/lexicons or SANCHO_RUNTIME_DIR-managed storage.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  const { options } = parseOptions(rest);

  if (command === "preview") {
    const result = await previewLexiconFile(optionsFromCli(options, {
      requireInput: true,
      requireFormat: true
    }));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (command === "import") {
    const result = await importLexiconFile(optionsFromCli(options, {
      requireInput: true,
      requireFormat: true,
      requireOutput: true
    }));
    stdout.write(`${JSON.stringify(summarizeImportResult(result), null, 2)}\n`);
    return 0;
  }

  if (command === "rollback") {
    const result = await rollbackImport(optionsFromCli(options, {
      requireOutput: true,
      requireRollbackId: true
    }));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
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

function summarizeImportResult(result) {
  return {
    changed: result.changed,
    dryRun: result.dryRun,
    outputPath: result.outputPath,
    rollback: result.rollback,
    source: result.preview.source,
    format: result.preview.format,
    summary: result.preview.summary
  };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (name === "dry-run") {
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
  return { options };
}
