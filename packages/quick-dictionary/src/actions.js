import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const ACTION_KINDS = new Set([
  "insert_text",
  "copy_text",
  "run_command",
  "profile_switch",
  "open_url",
  "skill_invoke"
]);

const RISK_LEVELS = new Set(["normal", "confirm", "dangerous"]);
const DEFAULT_ACTION_WEIGHT = 90;
const MAX_WEIGHT = 999999;

const SENSITIVE_ENV_NAME = /(?:api[_-]?key|token|secret|password|credential|auth|bearer)/i;
const SENSITIVE_VALUE = /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/;

export function normalizeActionRegistry(input) {
  const source = Array.isArray(input) ? { actions: input } : expectPlainObject(
    input,
    "Action registry"
  );
  const profiles = normalizeProfiles(source.profiles ?? []);
  const actionList = source.actions ?? source.registry ?? [];
  const actions = normalizeActions(actionList, { profiles });

  return { actions, profiles };
}

export async function loadActionRegistryFromJsonFile(path) {
  const raw = await readFile(path, "utf8");
  return normalizeActionRegistry(JSON.parse(raw));
}

export function normalizeActions(actions, context = {}) {
  if (!Array.isArray(actions)) {
    throw new TypeError("Action registry actions must be an array.");
  }

  const profileIds = context.profileIds
    ?? (context.profiles
      ? new Set(context.profiles.map((profile) => profile.id))
      : undefined);
  const byId = new Map();
  const codes = new Map();

  for (const rawAction of actions) {
    const action = normalizeAction(rawAction, { profileIds });
    if (codes.has(action.code) && codes.get(action.code) !== action.id) {
      throw new Error(
        `Action code "${action.code}" is used by both "${codes.get(action.code)}" and "${action.id}".`
      );
    }
    byId.set(action.id, action);
    codes.set(action.code, action.id);
  }

  return Array.from(byId.values());
}

export function normalizeAction(input, context = {}) {
  const raw = expectPlainObject(input, "Action");
  const id = cleanIdentifier(raw.id, "Action id");
  const code = cleanRimeField(raw.code ?? raw.reading, "Action code");
  const label = cleanRimeField(raw.label ?? raw.name, "Action label");
  const kind = cleanEnum(raw.kind, ACTION_KINDS, "Action kind");
  const insertPreview = cleanOptionalRimeField(
    raw.insertPreview ?? raw.insert_preview ?? raw.preview,
    "Action insert preview"
  );
  const risk = cleanEnum(
    raw.risk ?? defaultRiskForKind(kind),
    RISK_LEVELS,
    "Action risk"
  );
  const weight = normalizeWeight(raw.weight ?? DEFAULT_ACTION_WEIGHT);

  const action = {
    id,
    code,
    label,
    kind,
    insertPreview: insertPreview ?? label,
    risk,
    weight
  };

  if (kind === "profile_switch") {
    action.profile = cleanIdentifier(raw.profile, "Action profile");
    if (context.profileIds && !context.profileIds.has(action.profile)) {
      throw new Error(
        `Action "${id}" references unknown profile "${action.profile}".`
      );
    }
  }

  if (kind === "insert_text" || kind === "copy_text") {
    action.text = cleanRequiredString(raw.text ?? raw.value, "Action text");
  }

  if (kind === "run_command") {
    action.command = normalizeCommand(raw.command);
    action.args = normalizeArgs(raw.args ?? []);
  }

  if (kind === "open_url") {
    action.url = normalizeUrl(raw.url);
  }

  if (kind === "skill_invoke") {
    action.skill = cleanIdentifier(raw.skill, "Action skill");
  }

  return action;
}

export function normalizeProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    throw new TypeError("Action registry profiles must be an array.");
  }

  const byId = new Map();
  for (const rawProfile of profiles) {
    const profile = normalizeProfile(rawProfile);
    byId.set(profile.id, profile);
  }
  return Array.from(byId.values());
}

export function normalizeProfile(input) {
  const raw = expectPlainObject(input, "Profile");
  const id = cleanIdentifier(raw.id, "Profile id");
  const label = cleanRimeField(raw.label ?? raw.name ?? id, "Profile label");
  const command = normalizeCommand(raw.command);
  const args = normalizeArgs(raw.args ?? []);
  const env = normalizeEnv(raw.env ?? {});
  const cwd = raw.cwd === undefined
    ? undefined
    : cleanRequiredString(raw.cwd, "Profile cwd");
  const inheritEnv = raw.inheritEnv ?? raw.inherit_env ?? true;

  if (typeof inheritEnv !== "boolean") {
    throw new TypeError("Profile inheritEnv must be a boolean.");
  }

  return {
    id,
    label,
    command,
    args,
    env,
    ...(cwd === undefined ? {} : { cwd }),
    inheritEnv
  };
}

export function actionsToQuickDictionaryEntries(actions) {
  const normalizedActions = Array.isArray(actions)
    ? normalizeActions(actions)
    : normalizeActionRegistry(actions).actions;

  return normalizedActions.map((action) => ({
    surface: action.insertPreview,
    code: action.code,
    weight: action.weight
  }));
}

export function findProfile(registry, profileId) {
  const normalized = normalizeActionRegistry(registry);
  const profile = normalized.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  return profile;
}

export function findAction(registry, actionIdOrCode) {
  const normalized = normalizeActionRegistry(registry);
  const action = normalized.actions.find((candidate) =>
    candidate.id === actionIdOrCode || candidate.code === actionIdOrCode
  );
  if (!action) {
    throw new Error(`Unknown action: ${actionIdOrCode}`);
  }
  return action;
}

export function profileForAction(registry, actionIdOrCode) {
  const normalized = normalizeActionRegistry(registry);
  const action = findAction(normalized, actionIdOrCode);
  if (action.kind !== "profile_switch") {
    throw new Error(`Action "${action.id}" is not a profile switch action.`);
  }
  return findProfile(normalized, action.profile);
}

export function buildChildEnvironment(profile, baseEnv = process.env) {
  const normalized = normalizeProfile(profile);
  const childEnv = normalized.inheritEnv ? { ...baseEnv } : {};
  for (const [name, value] of Object.entries(normalized.env)) {
    childEnv[name] = value;
  }
  return childEnv;
}

export function describeProfileLaunch(profile, options = {}) {
  const normalized = normalizeProfile(profile);
  const extraArgs = normalizeArgs(options.extraArgs ?? []);
  return {
    profile: normalized.id,
    command: normalized.command,
    args: [...normalized.args, ...extraArgs],
    ...(normalized.cwd === undefined ? {} : { cwd: normalized.cwd }),
    inheritEnv: normalized.inheritEnv,
    env: redactEnv(normalized.env)
  };
}

export function spawnProfile(profile, options = {}) {
  const normalized = normalizeProfile(profile);
  const extraArgs = normalizeArgs(options.extraArgs ?? []);
  const args = [...normalized.args, ...extraArgs];
  const baseEnv = options.baseEnv ?? process.env;
  const env = buildChildEnvironment(normalized, baseEnv);

  return spawn(normalized.command, args, {
    cwd: normalized.cwd,
    env,
    shell: false,
    stdio: options.stdio ?? "inherit",
    signal: options.signal
  });
}

export async function runProfile(profile, options = {}) {
  const child = spawnProfile(profile, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  return {
    ...exit,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

export function redactEnv(env) {
  const normalized = normalizeEnv(env);
  return Object.fromEntries(
    Object.entries(normalized).map(([name, value]) => [
      name,
      isSensitiveEnvEntry(name, value) ? "[redacted]" : value
    ])
  );
}

export function isSensitiveEnvEntry(name, value) {
  return SENSITIVE_ENV_NAME.test(name) || SENSITIVE_VALUE.test(value);
}

function defaultRiskForKind(kind) {
  if (kind === "run_command") {
    return "confirm";
  }
  return "normal";
}

function normalizeEnv(env) {
  const raw = expectPlainObject(env, "Profile env");
  const normalized = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid environment variable name: ${name}`);
    }
    if (value === null || value === undefined) {
      throw new Error(`Environment variable "${name}" must have a value.`);
    }
    if (typeof value === "object") {
      throw new TypeError(
        `Environment variable "${name}" must be a string, number, or boolean.`
      );
    }
    normalized[name] = String(value);
  }
  return normalized;
}

function normalizeCommand(command) {
  const normalized = cleanRequiredString(command, "Command");
  if (normalized.includes("\0") || /[\r\n]/.test(normalized)) {
    throw new Error("Command must not contain null bytes or line breaks.");
  }
  return normalized;
}

function normalizeArgs(args) {
  if (!Array.isArray(args)) {
    throw new TypeError("Command args must be an array.");
  }
  return args.map((arg) => {
    if (arg === null || arg === undefined || typeof arg === "object") {
      throw new TypeError("Command args must be strings, numbers, or booleans.");
    }
    const value = String(arg);
    if (value.includes("\0")) {
      throw new Error("Command args must not contain null bytes.");
    }
    return value;
  });
}

function normalizeUrl(value) {
  const raw = cleanRequiredString(value, "Action url");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid action url: ${raw}`);
  }

  if (!["http:", "https:", "file:"].includes(url.protocol)) {
    throw new Error(`Unsupported action url protocol: ${url.protocol}`);
  }
  return url.href;
}

function normalizeWeight(value) {
  const weight = Number(value);
  if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) {
    throw new Error(`Action weight must be an integer from 0 to ${MAX_WEIGHT}.`);
  }
  return weight;
}

function cleanIdentifier(value, name) {
  const text = cleanRequiredString(value, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
    throw new Error(`${name} must be a stable identifier.`);
  }
  return text;
}

function cleanEnum(value, allowed, name) {
  const text = cleanRequiredString(value, name);
  if (!allowed.has(text)) {
    throw new Error(`${name} must be one of: ${Array.from(allowed).join(", ")}.`);
  }
  return text;
}

function cleanOptionalRimeField(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return cleanRimeField(value, name);
}

function cleanRimeField(value, name) {
  const text = cleanRequiredString(value, name);
  if (text.includes("\t") || /[\r\n]/.test(text)) {
    throw new Error(`${name} must not contain tabs or line breaks.`);
  }
  return text;
}

function cleanRequiredString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  return text;
}

function expectPlainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}
