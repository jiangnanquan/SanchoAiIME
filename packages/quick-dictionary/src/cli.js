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

const HELP_ZH = `用法：
  sancho-quick-dictionary render --entries <entries.json>
  sancho-quick-dictionary sync --entries <entries.json> [--custom-phrase <path>] [--dry-run]
  sancho-quick-dictionary actions validate --registry <registry.json>
  sancho-quick-dictionary actions entries --registry <registry.json>
  sancho-quick-dictionary profiles describe --registry <registry.json> --profile <profile-id>
  sancho-quick-dictionary profiles run --registry <registry.json> (--profile <profile-id> | --action <action-id-or-code>) [--dry-run] [-- <extra args>]

entries 文件可以是 JSON 数组，也可以是包含 entries、phrases 或 quickDictionary
数组的对象。每条记录需要 surface/text/phrase、code/reading，以及可选整数 weight。

action registry 是包含 actions 和可选 profiles 数组的 JSON 对象。profile 环境变量
只会注入到 Sancho 启动的子进程，不会写入全局 shell 环境。
`;

const HELP_EN = `Usage:
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
  const locale = localeFromEnv(streams.env);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(helpText(locale));
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

    const message = locale === "en-US"
      ? `${result.changed ? "Updated" : "No changes for"} ${result.path} (${result.entries.length} entries).`
      : `${result.changed ? "已更新" : "无需更新"} ${result.path}（${result.entries.length} 条）。`;
    stderr.write(`${message}\n`);
    return 0;
  }

  if (command === "actions") {
    return await runActionsCommand(rest, { stdout, env: streams.env });
  }

  if (command === "profiles") {
    return await runProfilesCommand(rest, { stdout, stderr, env: streams.env });
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText(locale)}`);
}

async function runActionsCommand(args, streams) {
  const [subcommand, ...rest] = args;
  const { options } = parseOptions(rest);
  const registryPath = requireOption(options, "registry");
  const registry = await loadActionRegistryFromJsonFile(registryPath);

  if (subcommand === "validate") {
    const locale = localeFromEnv(streams.env);
    streams.stdout.write(locale === "en-US"
      ? `Validated ${registry.actions.length} actions and ${registry.profiles.length} profiles.\n`
      : `已验证 ${registry.actions.length} 个动作和 ${registry.profiles.length} 个环境。\n`
    );
    return 0;
  }

  if (subcommand === "entries") {
    streams.stdout.write(
      renderManagedRegion(actionsToQuickDictionaryEntries(registry.actions))
    );
    return 0;
  }

  throw new Error(`Unknown actions command: ${subcommand}\n\n${helpText(localeFromEnv(streams.env))}`);
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
      streams.stderr.write(localeFromEnv(streams.env) === "en-US"
        ? `Profile process exited from signal ${result.signal}.\n`
        : `环境进程因信号 ${result.signal} 退出。\n`
      );
      return 1;
    }
    return result.code ?? 1;
  }

  throw new Error(`Unknown profiles command: ${subcommand}\n\n${helpText(localeFromEnv(streams.env))}`);
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

function localeFromEnv(env = process.env) {
  const raw = String(env?.SANCHO_LOCALE ?? "zh-CN")
    .replace("_", "-")
    .toLowerCase();
  return raw.startsWith("en") ? "en-US" : "zh-CN";
}

function helpText(locale) {
  return locale === "en-US" ? HELP_EN : HELP_ZH;
}
