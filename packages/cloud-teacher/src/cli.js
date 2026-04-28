import {
  buildDeepSeekDryRun,
  callDeepSeekChat,
  DEEPSEEK_API_KEY_ENV,
  DEEPSEEK_KEYCHAIN_SERVICE,
  DEEPSEEK_V4_FLASH_MODEL,
  describeDeepSeekCredential,
  resolveDeepSeekCredential
} from "./deepseek.js";

const HELP = `Usage:
  sancho-cloud-teacher deepseek status
  sancho-cloud-teacher deepseek dry-run --message <text> [--system <text>] [--max-tokens n] [--temperature n] [--budget-input-chars n] [--budget-output-tokens n]
  sancho-cloud-teacher deepseek chat --message <text> [--system <text>] [--allow-network] [--max-tokens n] [--temperature n] [--budget-input-chars n] [--budget-output-tokens n] [--audit-log path]

Credentials are read only from DEEPSEEK_API_KEY or macOS Keychain service
"SanchoAiIME DeepSeek API Key". CLI output never prints credential values.
`;

export async function runCli(argv, runtime = {}) {
  const stdout = runtime.stdout ?? process.stdout;
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  if (command === "deepseek") {
    return await runDeepSeekCommand(rest, { ...runtime, stdout });
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function runDeepSeekCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  const { options } = parseOptions(rest);
  const credentialOptions = {
    env: runtime.env,
    platform: runtime.platform,
    execFile: runtime.execFile
  };

  if (subcommand === "status") {
    const credential = await resolveDeepSeekCredential(credentialOptions);
    runtime.stdout.write(`${JSON.stringify({
      provider: "deepseek",
      model: DEEPSEEK_V4_FLASH_MODEL,
      envName: DEEPSEEK_API_KEY_ENV,
      keychainService: DEEPSEEK_KEYCHAIN_SERVICE,
      credential: describeDeepSeekCredential(credential)
    }, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "dry-run") {
    const dryRun = await buildDeepSeekDryRun(
      buildChatInput(options),
      {
        ...credentialOptions,
        budget: buildBudget(options)
      }
    );
    runtime.stdout.write(`${JSON.stringify(dryRun, null, 2)}\n`);
    return 0;
  }

  if (subcommand === "chat") {
    const result = await callDeepSeekChat(
      buildChatInput(options),
      {
        ...credentialOptions,
        allowNetwork: Boolean(options["allow-network"]),
        auditLogPath: options["audit-log"],
        budget: buildBudget(options),
        fetchImpl: runtime.fetchImpl,
        timeoutMs: options["timeout-ms"]
      }
    );
    runtime.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown deepseek command: ${subcommand}\n\n${HELP}`);
}

function buildChatInput(options) {
  const messages = [];
  if (options.system) {
    messages.push({
      role: "system",
      content: options.system
    });
  }
  messages.push({
    role: "user",
    content: requireOption(options, "message")
  });

  return {
    messages,
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...(options["max-tokens"] === undefined
      ? {}
      : { maxTokens: options["max-tokens"] })
  };
}

function buildBudget(options) {
  return {
    ...(options["budget-input-chars"] === undefined
      ? {}
      : { maxInputChars: options["budget-input-chars"] }),
    ...(options["budget-output-tokens"] === undefined
      ? {}
      : { maxOutputTokens: options["budget-output-tokens"] })
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
    if (name === "allow-network") {
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

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}
