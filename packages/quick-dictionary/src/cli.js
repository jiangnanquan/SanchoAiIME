import {
  defaultCustomPhrasePath,
  loadEntriesFromJsonFile,
  renderManagedRegion,
  syncCustomPhraseFile
} from "./custom-phrase.js";

const HELP = `Usage:
  sancho-quick-dictionary render --entries <entries.json>
  sancho-quick-dictionary sync --entries <entries.json> [--custom-phrase <path>] [--dry-run]

Entries may be a JSON array or an object with an "entries", "phrases", or
"quickDictionary" array. Each entry needs surface/text/phrase, code/reading,
and an optional integer weight.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  const options = parseOptions(rest);

  if (command === "render") {
    const entriesPath = requireOption(options, "entries");
    const entries = await loadEntriesFromJsonFile(entriesPath);
    stdout.write(renderManagedRegion(entries));
    return 0;
  }

  if (command === "sync") {
    const entriesPath = requireOption(options, "entries");
    const entries = await loadEntriesFromJsonFile(entriesPath);
    const customPhrasePath =
      options["custom-phrase"] ?? defaultCustomPhrasePath();
    const result = await syncCustomPhraseFile({
      customPhrasePath,
      dryRun: Boolean(options["dry-run"]),
      entries
    });

    if (result.content) {
      stdout.write(result.content);
      return 0;
    }

    const verb = result.changed ? "Updated" : "No changes for";
    stderr.write(`${verb} ${result.path} (${result.entries.length} entries).\n`);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
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
  return options;
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}
