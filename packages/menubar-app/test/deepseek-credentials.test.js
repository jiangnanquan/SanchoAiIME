import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteDeepSeekApiKey,
  getDeepSeekCredentialStatus,
  saveDeepSeekApiKey
} from "../src/deepseek-credentials.js";

test("reports missing DeepSeek credentials without exposing key values", async () => {
  const status = await getDeepSeekCredentialStatus({
    platform: "linux",
    env: {}
  });

  assert.equal(status.credential.available, false);
  assert.equal(status.model, "deepseek-v4-flash");
  assert.equal(JSON.stringify(status).includes("sk-unit-test"), false);
});

test("saves and deletes the DeepSeek API key through macOS Keychain", async () => {
  const calls = [];
  let storedKey = "";
  const execFile = (_command, args, _options, callback) => {
    calls.push(args);
    if (args[0] === "add-generic-password") {
      storedKey = args.at(-1);
      callback(null, "", "");
      return;
    }
    if (args[0] === "find-generic-password") {
      callback(null, storedKey, "");
      return;
    }
    if (args[0] === "delete-generic-password") {
      storedKey = "";
      callback(null, "", "");
      return;
    }
    callback(new Error("unexpected security command"), "", "");
  };

  const saved = await saveDeepSeekApiKey(" sk-unit-test ", {
    platform: "darwin",
    env: {},
    account: "unit-test",
    execFile
  });
  assert.equal(saved.credential.available, true);
  assert.equal(saved.credential.source, "keychain");
  assert.equal(JSON.stringify(saved).includes("sk-unit-test"), false);
  assert.equal(calls[0].includes("add-generic-password"), true);

  const deleted = await deleteDeepSeekApiKey({
    platform: "darwin",
    env: {},
    execFile
  });
  assert.equal(deleted.credential.available, false);
});
