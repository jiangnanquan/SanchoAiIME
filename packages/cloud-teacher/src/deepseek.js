import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";
export const DEEPSEEK_KEYCHAIN_SERVICE = "SanchoAiIME DeepSeek API Key";
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";

const DEFAULT_TIMEOUT_MS = 30000;
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);
const AUDIT_SCHEMA = "sancho.deepseek.audit.v1";

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
  const budget = evaluateDeepSeekBudget(request.body, options.budget);
  return {
    provider: request.provider,
    model: request.body.model,
    endpoint: request.endpoint,
    credential: describeDeepSeekCredential(credential),
    networkRequired: true,
    budget,
    requestBody: request.body
  };
}

export async function callDeepSeekChat(input = {}, options = {}) {
  if (!options.allowNetwork) {
    throw new Error(
      "DeepSeek network calls are disabled; pass allowNetwork to call the API."
    );
  }

  const request = buildDeepSeekChatRequest(input, options);
  const budget = evaluateDeepSeekBudget(request.body, options.budget);
  if (!budget.allowed) {
    throw new Error(`DeepSeek budget exceeded: ${budget.violations.join("; ")}`);
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
  const result = {
    provider: request.provider,
    model: request.body.model,
    credential: describeDeepSeekCredential(credential),
    budget,
    responseId: payload.id,
    outputText: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason,
    usage: payload.usage ?? null
  };

  if (options.auditLogPath) {
    await appendDeepSeekAuditLog(
      options.auditLogPath,
      buildDeepSeekAuditRecord({
        request: {
          provider: request.provider,
          model: request.body.model,
          endpoint: request.endpoint,
          credential: describeDeepSeekCredential(credential),
          networkRequired: true,
          budget,
          requestBody: request.body
        },
        result,
        status: "success"
      })
    );
  }

  return result;
}

export function evaluateDeepSeekBudget(requestBody, budget = {}) {
  const body = expectPlainObject(requestBody, "DeepSeek request body");
  const limits = normalizeDeepSeekBudget(budget);
  const messages = normalizeDeepSeekMessages(body.messages);
  const usage = {
    inputChars: messages.reduce((total, message) => total + message.content.length, 0),
    maxOutputTokens: body.max_tokens ?? null
  };
  const violations = [];

  if (limits.maxInputChars !== undefined && usage.inputChars > limits.maxInputChars) {
    violations.push(
      `input chars ${usage.inputChars} exceed limit ${limits.maxInputChars}`
    );
  }
  if (limits.maxOutputTokens !== undefined) {
    if (usage.maxOutputTokens === null) {
      violations.push("max_tokens must be set when maxOutputTokens budget is configured");
    } else if (usage.maxOutputTokens > limits.maxOutputTokens) {
      violations.push(
        `max output tokens ${usage.maxOutputTokens} exceed limit ${limits.maxOutputTokens}`
      );
    }
  }

  return {
    limits,
    usage,
    allowed: violations.length === 0,
    violations
  };
}

export function buildDeepSeekAuditRecord(input = {}) {
  const raw = expectPlainObject(input, "DeepSeek audit input");
  const request = expectPlainObject(raw.request, "DeepSeek audit request");
  const requestBody = expectPlainObject(
    request.requestBody ?? request.body,
    "DeepSeek audit request body"
  );
  const messages = normalizeDeepSeekMessages(requestBody.messages);
  const result = raw.result === undefined || raw.result === null
    ? undefined
    : expectPlainObject(raw.result, "DeepSeek audit result");

  return {
    schema: AUDIT_SCHEMA,
    generatedAt: cleanOptionalString(raw.generatedAt, "DeepSeek audit generatedAt")
      ?? new Date().toISOString(),
    provider: cleanOptionalString(request.provider, "DeepSeek audit provider") ?? "deepseek",
    model: cleanOptionalString(request.model ?? requestBody.model, "DeepSeek audit model")
      ?? DEEPSEEK_V4_FLASH_MODEL,
    endpoint: cleanOptionalString(request.endpoint, "DeepSeek audit endpoint"),
    status: cleanOptionalString(raw.status, "DeepSeek audit status")
      ?? (raw.error ? "error" : "success"),
    credential: sanitizeCredentialDescription(request.credential ?? raw.credential),
    request: {
      messageCount: messages.length,
      inputChars: messages.reduce((total, message) => total + message.content.length, 0),
      promptSha256: hashPromptMessages(messages),
      maxOutputTokens: requestBody.max_tokens ?? null,
      ...(requestBody.temperature === undefined
        ? {}
        : { temperature: requestBody.temperature })
    },
    budget: request.budget ?? evaluateDeepSeekBudget(requestBody, raw.budget),
    ...(result === undefined
      ? {}
      : {
          response: {
            responseId: cleanOptionalString(result.responseId, "DeepSeek response id"),
            finishReason: cleanOptionalString(result.finishReason, "DeepSeek finish reason"),
            usage: result.usage ?? null
          }
        }),
    ...(raw.error === undefined
      ? {}
      : { error: { message: safeErrorMessage(raw.error) } })
  };
}

export async function appendDeepSeekAuditLog(auditLogPath, record) {
  const path = cleanRequiredString(auditLogPath, "DeepSeek audit log path");
  const line = `${JSON.stringify(expectPlainObject(record, "DeepSeek audit record"))}\n`;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, line, "utf8");
  return {
    path,
    bytesWritten: Buffer.byteLength(line)
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

function normalizeDeepSeekBudget(value) {
  if (value === undefined || value === null) {
    return {};
  }
  const raw = expectPlainObject(value, "DeepSeek budget");
  return {
    ...(raw.maxInputChars === undefined
      ? {}
      : {
          maxInputChars: normalizePositiveInteger(
            raw.maxInputChars,
            "DeepSeek budget maxInputChars"
          )
        }),
    ...(raw.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: normalizePositiveInteger(
            raw.maxOutputTokens,
            "DeepSeek budget maxOutputTokens"
          )
        })
  };
}

function sanitizeCredentialDescription(credential) {
  if (!credential) {
    return describeDeepSeekCredential(null);
  }
  if (credential.apiKey !== undefined) {
    return describeDeepSeekCredential(credential);
  }
  if (credential.available === false) {
    return describeDeepSeekCredential(null);
  }
  if (credential.source === "env") {
    return {
      available: true,
      source: "env",
      envName: DEEPSEEK_API_KEY_ENV
    };
  }
  if (credential.source === "keychain") {
    return {
      available: true,
      source: "keychain",
      service: DEEPSEEK_KEYCHAIN_SERVICE
    };
  }
  return {
    available: Boolean(credential.available),
    ...(credential.source === undefined ? {} : { source: String(credential.source) })
  };
}

function hashPromptMessages(messages) {
  return createHash("sha256")
    .update(JSON.stringify(messages.map((message) => ({
      role: message.role,
      content: message.content
    }))))
    .digest("hex");
}

function safeErrorMessage(error) {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error.message === "string") {
    return error.message;
  }
  return "Unknown DeepSeek error.";
}

function expectPlainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}
