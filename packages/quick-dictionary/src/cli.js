import {
  defaultCustomPhrasePath,
  loadEntriesFromJsonFile,
  renderManagedRegion,
  syncCustomPhraseFile
} from "./custom-phrase.js";
import {
  actionsToQuickDictionaryEntries,
  describeProfileLaunch,
  findProfile,
  loadActionRegistryFromJsonFile,
  profileForAction,
  spawnProfile
} from "./actions.js";

const HELP = `Usage:
  sancho-quick-dictionary render --entries <entries.json>
  sancho-quick-dictionary sync --entries <entries.json> [--custom-phrase <path>] [--dry-run]
  sancho-quick-dictionary actions validate --registry <registry.json>
  sancho-quick-dictionary actions entries --registry <registry.json>
  sancho-quick-dictionary profiles describe --registry <registry.json> --profile <profile-id>
  sancho-quick-dictionary profiles run --registry <registry.json> (--profile <profile-id> | --action <action-id-or-code>) [--dry-run] [-- <extra args>]

Entries may be a JSON array or an object with an "entries", "phrases", or
"quickDictionary" array. Each entry needs surface/text/phrase, code/reading,
and an optional integer weight.

Action registries are JSON objects with "actions" and optional "profiles"
arrays. Profile environment variables are injected only into child processes
started by the profiles command.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  if (command === "render") {
    const { options } = parseOptions(rest);
    const entriesPath = requireOption(options, "entries");
    const entries = await loadEntriesFromJsonFile(entriesPath);
    stdout.write(renderManagedRegion(entries));
    return 0;
  }

  if (command === "sync") {
    const { options } = parseOptions(rest);
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

  if (command === "actions") {
    return await runActionsCommand(rest, { stdout });
  }

  if (command === "profiles") {
    return await runProfilesCommand(rest, { stdout, stderr });
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function runActionsCommand(args, streams) {
  const [subcommand, ...rest] = args;
  const { options } = parseOptions(rest);
  const registryPath = requireOption(options, "registry");
  const registry = await loadActionRegistryFromJsonFile(registryPath);

  if (subcommand === "validate") {
    streams.stdout.write(
      `Validated ${registry.actions.length} actions and ${registry.profiles.length} profiles.\n`
    );
    return 0;
  }

  if (subcommand === "entries") {
    streams.stdout.write(
      renderManagedRegion(actionsToQuickDictionaryEntries(registry.actions))
    );
    return 0;
  }

  throw new Error(`Unknown actions command: ${subcommand}\n\n${HELP}`);
}

async function runProfilesCommand(args, streams) {
  const [subcommand, ...rest] = args;
  const { options, passthrough } = parseOptions(rest, { allowPassthrough: true });
  const registryPath = requireOption(options, "registry");
  const registry = await loadActionRegistryFromJsonFile(registryPath);

  if (subcommand === "describe") {
    const profile = findProfile(registry, requireOption(options, "profile"));
    streams.stdout.write(`${JSON.stringify(describeProfileLaunch(profile), null, 2)}\n`);
    return 0;
  }

  if (subcommand === "run") {
    const profile = selectProfile(registry, options);
    if (options["dry-run"]) {
      streams.stdout.write(
        `${JSON.stringify(
          describeProfileLaunch(profile, { extraArgs: passthrough }),
          null,
          2
        )}\n`
      );
      return 0;
    }

    const child = spawnProfile(profile, { extraArgs: passthrough });
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });

    if (result.signal) {
      streams.stderr.write(`Profile process exited from signal ${result.signal}.\n`);
      return 1;
    }
    return result.code ?? 1;
  }

  throw new Error(`Unknown profiles command: ${subcommand}\n\n${HELP}`);
}

function selectProfile(registry, options) {
  if (options.profile && options.action) {
    throw new Error("Use either --profile or --action, not both.");
  }
  if (options.profile) {
    return findProfile(registry, options.profile);
  }
  if (options.action) {
    return profileForAction(registry, options.action);
  }
  throw new Error("Missing required option --profile or --action.");
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
  return { options, passthrough };
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}
