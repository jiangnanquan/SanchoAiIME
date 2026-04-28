import { execFile as execFileCallback } from "node:child_process";

export const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";
export const DEEPSEEK_KEYCHAIN_SERVICE = "SanchoAiIME DeepSeek API Key";
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";

const DEFAULT_TIMEOUT_MS = 30000;
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);

export async function resolveDeepSeekCredential(options = {}) {
  const env = options.env ?? process.env;
  const apiKey = cleanOptionalSecret(env[DEEPSEEK_API_KEY_ENV]);
  if (apiKey) {
    return {
      source: "env",
      envName: DEEPSEEK_API_KEY_ENV,
      apiKey
    };
  }

  if ((options.platform ?? process.platform) !== "darwin") {
    return null;
  }

  return await readCredentialFromMacOSKeychain(options);
}

export function describeDeepSeekCredential(credential) {
  if (!credential) {
    return {
      available: false,
      acceptedSources: [
        DEEPSEEK_API_KEY_ENV,
        `macOS Keychain service: ${DEEPSEEK_KEYCHAIN_SERVICE}`
      ]
    };
  }

  if (credential.source === "env") {
    return {
      available: true,
      source: "env",
      envName: DEEPSEEK_API_KEY_ENV
    };
  }

  return {
    available: true,
    source: "keychain",
    service: DEEPSEEK_KEYCHAIN_SERVICE
  };
}

export function normalizeDeepSeekMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError("DeepSeek messages must be a non-empty array.");
  }

  return messages.map((message, index) => {
    const raw = expectPlainObject(message, `DeepSeek message ${index}`);
    const role = cleanRequiredString(raw.role, `DeepSeek message ${index} role`);
    if (!MESSAGE_ROLES.has(role)) {
      throw new Error(
        `DeepSeek message ${index} role must be system, user, or assistant.`
      );
    }

    return {
      role,
      content: cleanRequiredString(
        raw.content,
        `DeepSeek message ${index} content`
      )
    };
  });
}

export function buildDeepSeekChatRequest(input = {}, options = {}) {
  const raw = expectPlainObject(input, "DeepSeek chat input");
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL);
  const requestBody = {
    model: cleanOptionalString(raw.model, "DeepSeek model")
      ?? DEEPSEEK_V4_FLASH_MODEL,
    messages: normalizeDeepSeekMessages(raw.messages),
    ...(raw.temperature === undefined
      ? {}
      : { temperature: normalizeNumber(raw.temperature, "DeepSeek temperature") }),
    ...(raw.maxTokens === undefined && raw.max_tokens === undefined
      ? {}
      : {
          max_tokens: normalizePositiveInteger(
            raw.maxTokens ?? raw.max_tokens,
            "DeepSeek max tokens"
          )
        })
  };

  return {
    provider: "deepseek",
    endpoint: `${baseUrl}${CHAT_COMPLETIONS_PATH}`,
    body: requestBody
  };
}

export async function buildDeepSeekDryRun(input = {}, options = {}) {
  const credential = await resolveDeepSeekCredential(options);
  const request = buildDeepSeekChatRequest(input, options);
  return {
    provider: request.provider,
    model: request.body.model,
    endpoint: request.endpoint,
    credential: describeDeepSeekCredential(credential),
    networkRequired: true,
    requestBody: request.body
  };
}

export async function callDeepSeekChat(input = {}, options = {}) {
  if (!options.allowNetwork) {
    throw new Error(
      "DeepSeek network calls are disabled; pass allowNetwork to call the API."
    );
  }

  const credential = await resolveDeepSeekCredential(options);
  if (!credential) {
    throw new Error(
      `Missing DeepSeek API key. Set ${DEEPSEEK_API_KEY_ENV} or store it in macOS Keychain service "${DEEPSEEK_KEYCHAIN_SERVICE}".`
    );
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available for DeepSeek requests.");
  }

  const request = buildDeepSeekChatRequest(input, options);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizePositiveInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "DeepSeek timeoutMs"
    )
  );

  let response;
  try {
    response = await fetchImpl(request.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${credential.apiKey}`
      },
      body: JSON.stringify(request.body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  return {
    provider: request.provider,
    model: request.body.model,
    credential: describeDeepSeekCredential(credential),
    responseId: payload.id,
    outputText: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason,
    usage: payload.usage ?? null
  };
}

async function readCredentialFromMacOSKeychain(options) {
  const execFile = options.execFile ?? execFileCallback;
  try {
    const stdout = await execFileText(
      execFile,
      "security",
      [
        "find-generic-password",
        "-s",
        DEEPSEEK_KEYCHAIN_SERVICE,
        "-w"
      ],
      {
        encoding: "utf8",
        timeout: options.keychainTimeoutMs ?? 5000
      }
    );
    const apiKey = cleanOptionalSecret(stdout);
    if (!apiKey) {
      return null;
    }
    return {
      source: "keychain",
      service: DEEPSEEK_KEYCHAIN_SERVICE,
      apiKey
    };
  } catch (error) {
    if (isKeychainMissing(error)) {
      return null;
    }
    throw new Error(
      `Unable to read DeepSeek API key from macOS Keychain service "${DEEPSEEK_KEYCHAIN_SERVICE}": ${error.message}`
    );
  }
}

function execFileText(execFile, command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = error.stderr ?? stderr;
        reject(error);
        return;
      }
      resolve(String(stdout ?? ""));
    });
  });
}

function isKeychainMissing(error) {
  const text = `${error.message ?? ""}\n${error.stderr ?? ""}`;
  return error.code === 44
    || (error.code === 1 && /could not be found|specified item/i.test(text));
}

function normalizeBaseUrl(value) {
  const text = cleanRequiredString(value, "DeepSeek base URL").replace(/\/+$/, "");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("DeepSeek base URL must be a valid URL.");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("DeepSeek base URL must use https: or http:.");
  }
  return url.href.replace(/\/+$/, "");
}

function cleanOptionalSecret(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${DEEPSEEK_API_KEY_ENV} must be a string.`);
  }
  const text = value.trim();
  return text.length === 0 ? undefined : text;
}

function cleanOptionalString(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return cleanRequiredString(value, name);
}

function cleanRequiredString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  if (text.includes("\0")) {
    throw new Error(`${name} must not contain null bytes.`);
  }
  return text;
}

function normalizeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return number;
}

function normalizePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function expectPlainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}
