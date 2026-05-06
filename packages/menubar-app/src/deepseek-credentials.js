import { execFile as execFileCallback } from "node:child_process";
import { userInfo } from "node:os";

import {
  DEEPSEEK_API_KEY_ENV,
  DEEPSEEK_KEYCHAIN_SERVICE,
  DEEPSEEK_V4_FLASH_MODEL,
  describeDeepSeekCredential,
  resolveDeepSeekCredential
} from "@sancho-ai-ime/cloud-teacher";

export async function getDeepSeekCredentialStatus(options = {}) {
  const credential = await resolveDeepSeekCredential({
    env: options.env,
    platform: options.platform,
    execFile: options.execFile,
    keychainTimeoutMs: options.keychainTimeoutMs
  });
  return {
    model: DEEPSEEK_V4_FLASH_MODEL,
    envName: DEEPSEEK_API_KEY_ENV,
    keychainService: DEEPSEEK_KEYCHAIN_SERVICE,
    canSaveToKeychain: (options.platform ?? process.platform) === "darwin",
    credential: describeDeepSeekCredential(credential)
  };
}

export async function saveDeepSeekApiKey(apiKey, options = {}) {
  if ((options.platform ?? process.platform) !== "darwin") {
    throw new Error("DeepSeek API Key 只能在 macOS 钥匙串中保存。");
  }
  const key = cleanApiKey(apiKey);
  const execFile = options.execFile ?? execFileCallback;
  await execFileText(
    execFile,
    "security",
    [
      "add-generic-password",
      "-U",
      "-a",
      options.account ?? currentAccount(),
      "-s",
      DEEPSEEK_KEYCHAIN_SERVICE,
      "-w",
      key
    ],
    {
      timeout: options.keychainTimeoutMs ?? 5000
    }
  );
  return await getDeepSeekCredentialStatus(options);
}

export async function deleteDeepSeekApiKey(options = {}) {
  if ((options.platform ?? process.platform) !== "darwin") {
    throw new Error("DeepSeek API Key 只能从 macOS 钥匙串中删除。");
  }
  const execFile = options.execFile ?? execFileCallback;
  try {
    await execFileText(
      execFile,
      "security",
      [
        "delete-generic-password",
        "-s",
        DEEPSEEK_KEYCHAIN_SERVICE
      ],
      {
        timeout: options.keychainTimeoutMs ?? 5000
      }
    );
  } catch (error) {
    if (!isMissingKeychainItem(error)) {
      throw error;
    }
  }
  return await getDeepSeekCredentialStatus(options);
}

function currentAccount() {
  return process.env.USER || userInfo().username || "SanchoAiIME";
}

function cleanApiKey(value) {
  const key = String(value ?? "").trim();
  if (!key) {
    throw new Error("请输入 DeepSeek API Key。");
  }
  if (/[\r\n\t]/.test(key)) {
    throw new Error("DeepSeek API Key 不能包含换行或制表符。");
  }
  return key;
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

function isMissingKeychainItem(error) {
  const text = `${error.message ?? ""}\n${error.stderr ?? ""}`;
  return error.code === 44
    || (error.code === 1 && /could not be found|specified item/i.test(text));
}
