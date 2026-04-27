import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeepSeekDryRun,
  callDeepSeekChat,
  DEEPSEEK_API_KEY_ENV,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_KEYCHAIN_SERVICE,
  describeDeepSeekCredential,
  resolveDeepSeekCredential
} from "../src/index.js";
import { runCli } from "../src/cli.js";

test("resolves DeepSeek credentials from env before keychain", async () => {
  let calledKeychain = false;
  const credential = await resolveDeepSeekCredential({
    env: {
      [DEEPSEEK_API_KEY_ENV]: " unit-test-env-key "
    },
    platform: "darwin",
    execFile() {
      calledKeychain = true;
    }
  });

  assert.equal(credential.source, "env");
  assert.equal(credential.apiKey, "unit-test-env-key");
  assert.equal(calledKeychain, false);
});

test("reads the exact SanchoAiIME DeepSeek Keychain service on macOS", async () => {
  const calls = [];
  const credential = await resolveDeepSeekCredential({
    env: {},
    platform: "darwin",
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, "unit-test-keychain-key\n", "");
    }
  });

  assert.equal(credential.source, "keychain");
  assert.equal(credential.service, DEEPSEEK_KEYCHAIN_SERVICE);
  assert.deepEqual(calls[0].args, [
    "find-generic-password",
    "-s",
    DEEPSEEK_KEYCHAIN_SERVICE,
    "-w"
  ]);
});

test("ignores non-approved credential sources", async () => {
  const credential = await resolveDeepSeekCredential({
    env: {
      OPENAI_API_KEY: "not-approved",
      DEEPSEEK_TOKEN: "not-approved"
    },
    platform: "linux"
  });

  assert.equal(credential, null);
});

test("credential descriptions never include secret values", () => {
  const described = describeDeepSeekCredential({
    source: "keychain",
    service: DEEPSEEK_KEYCHAIN_SERVICE,
    apiKey: "unit-test-secret-value"
  });

  assert.deepEqual(described, {
    available: true,
    source: "keychain",
    service: DEEPSEEK_KEYCHAIN_SERVICE
  });
  assert.equal(JSON.stringify(described).includes("unit-test-secret-value"), false);
});

test("blocks DeepSeek API calls unless network is explicitly allowed", async () => {
  await assert.rejects(
    () => callDeepSeekChat(
      {
        messages: [
          { role: "user", content: "Summarize this lexicon." }
        ]
      },
      {
        env: {
          [DEEPSEEK_API_KEY_ENV]: "unit-test-env-key"
        },
        fetchImpl() {
          throw new Error("fetch should not be called");
        }
      }
    ),
    /network calls are disabled/
  );
});

test("calls DeepSeek chat completions with env credentials and redacted result metadata", async () => {
  const requests = [];
  const result = await callDeepSeekChat(
    {
      messages: [
        { role: "system", content: "Return concise lexicon advice." },
        { role: "user", content: "DuckDB\tduck db\t80" }
      ],
      maxTokens: 128
    },
    {
      env: {
        [DEEPSEEK_API_KEY_ENV]: "unit-test-env-key"
      },
      allowNetwork: true,
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return new Response(JSON.stringify({
          id: "deepseek-response-fixture",
          choices: [
            {
              message: {
                content: "Keep DuckDB as a high-value technical phrase."
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            total_tokens: 42
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }
    }
  );

  assert.equal(requests[0].url, `${DEEPSEEK_DEFAULT_BASE_URL}/chat/completions`);
  assert.equal(requests[0].init.headers.authorization, "Bearer unit-test-env-key");
  assert.equal(JSON.parse(requests[0].init.body).model, "deepseek-v4-flash");
  assert.equal(
    result.outputText,
    "Keep DuckDB as a high-value technical phrase."
  );
  assert.equal(JSON.stringify(result).includes("unit-test-env-key"), false);
});

test("dry-run plans include request shape without credential values", async () => {
  const dryRun = await buildDeepSeekDryRun(
    {
      messages: [
        { role: "user", content: "Analyze one imported phrase." }
      ]
    },
    {
      env: {
        [DEEPSEEK_API_KEY_ENV]: "unit-test-env-key"
      }
    }
  );

  assert.equal(dryRun.credential.available, true);
  assert.equal(dryRun.credential.source, "env");
  assert.equal(dryRun.requestBody.model, "deepseek-v4-flash");
  assert.equal(JSON.stringify(dryRun).includes("unit-test-env-key"), false);
});

test("CLI reports DeepSeek status and dry-run output without secrets", async () => {
  const stdout = {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };

  assert.equal(
    await runCli(["deepseek", "status"], {
      stdout,
      env: {
        [DEEPSEEK_API_KEY_ENV]: "unit-test-env-key"
      }
    }),
    0
  );
  assert.match(stdout.text, /"available": true/);
  assert.equal(stdout.text.includes("unit-test-env-key"), false);

  stdout.text = "";
  assert.equal(
    await runCli([
      "deepseek",
      "dry-run",
      "--message",
      "Analyze imported Rime TSV rows.",
      "--max-tokens",
      "64"
    ], {
      stdout,
      env: {
        [DEEPSEEK_API_KEY_ENV]: "unit-test-env-key"
      }
    }),
    0
  );
  assert.match(stdout.text, /"networkRequired": true/);
  assert.equal(stdout.text.includes("unit-test-env-key"), false);
});
