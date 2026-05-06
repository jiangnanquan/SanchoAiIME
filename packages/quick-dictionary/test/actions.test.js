import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  actionsToQuickDictionaryEntries,
  buildChildEnvironment,
  describeProfileLaunch,
  normalizeActionRegistry,
  profileForAction,
  redactEnv,
  runProfile
} from "../src/actions.js";
import { runCli } from "../src/cli.js";

const registryFixture = {
  profiles: [
    {
      id: "sanchoexo-codex-deepseek",
      label: "SanchoExo / Codex / DeepSeek",
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write(`${process.env.SANCHO_PROFILE}:${process.env.OUTSIDE_ENV ?? \"\"}`)"
      ],
      env: {
        SANCHO_PROFILE: "deepseek-flash",
        OPENAI_BASE_URL: "https://api.deepseek.com",
        OPENAI_MODEL: "deepseek-v4-flash"
      },
      inheritEnv: false
    }
  ],
  actions: [
    {
      id: "sanchoexo.codex.deepseek",
      code: "cds",
      label: "SanchoExo + Codex + DeepSeek",
      kind: "profile_switch",
      profile: "sanchoexo-codex-deepseek",
      insertPreview: "SanchoExo Codex DeepSeek",
      weight: 98
    },
    {
      id: "insert.qwen",
      code: "qwp",
      label: "Qwen local prediction",
      kind: "insert_text",
      text: "Qwen local prediction"
    }
  ]
};

test("normalizes action registries and resolves profile switch actions", () => {
  const registry = normalizeActionRegistry(registryFixture);
  const action = registry.actions[0];
  const profile = profileForAction(registry, "cds");

  assert.equal(action.risk, "normal");
  assert.equal(action.profile, "sanchoexo-codex-deepseek");
  assert.equal(profile.command, process.execPath);
  assert.equal(profile.inheritEnv, false);
});

test("turns visible action previews into Rime quick dictionary rows", () => {
  assert.deepEqual(
    actionsToQuickDictionaryEntries(registryFixture.actions),
    [
      {
        surface: "SanchoExo Codex DeepSeek",
        code: "cds",
        weight: 98
      },
      {
        surface: "Qwen local prediction",
        code: "qwp",
        weight: 90
      }
    ]
  );
});

test("rejects duplicate action codes and unknown profile references", () => {
  assert.throws(
    () => normalizeActionRegistry({
      actions: [
        { id: "one", code: "dup", label: "One", kind: "insert_text", text: "one" },
        { id: "two", code: "dup", label: "Two", kind: "insert_text", text: "two" }
      ]
    }),
    /used by both/
  );

  assert.throws(
    () => normalizeActionRegistry({
      actions: [
        {
          id: "missing.profile",
          code: "mp",
          label: "Missing Profile",
          kind: "profile_switch",
          profile: "missing"
        }
      ],
      profiles: []
    }),
    /unknown profile/
  );
});

test("buildChildEnvironment injects profile env without mutating the base env", () => {
  const [profile] = normalizeActionRegistry(registryFixture).profiles;
  const baseEnv = { OUTSIDE_ENV: "base", PATH: "/usr/bin" };
  const childEnv = buildChildEnvironment(profile, baseEnv);

  assert.equal(childEnv.SANCHO_PROFILE, "deepseek-flash");
  assert.equal(childEnv.OUTSIDE_ENV, undefined);
  assert.equal(baseEnv.SANCHO_PROFILE, undefined);
  assert.deepEqual(baseEnv, { OUTSIDE_ENV: "base", PATH: "/usr/bin" });
});

test("runProfile uses child-process-only env injection", async () => {
  const [profile] = normalizeActionRegistry(registryFixture).profiles;
  const result = await runProfile(profile, {
    baseEnv: {
      OUTSIDE_ENV: "base"
    }
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "deepseek-flash:");
});

test("profile launch descriptions redact sensitive env names", () => {
  assert.deepEqual(
    redactEnv({
      DEEPSEEK_API_KEY: "stored-in-keychain",
      OPENAI_MODEL: "deepseek-v4-flash"
    }),
    {
      DEEPSEEK_API_KEY: "[redacted]",
      OPENAI_MODEL: "deepseek-v4-flash"
    }
  );

  const [profile] = normalizeActionRegistry({
    profiles: [
      {
        id: "with-key",
        command: "codex",
        env: {
          DEEPSEEK_API_KEY: "stored-in-keychain"
        }
      }
    ],
    actions: []
  }).profiles;

  assert.equal(describeProfileLaunch(profile).env.DEEPSEEK_API_KEY, "[redacted]");
});

test("CLI validates registries and renders action preview entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-actions-"));
  const registryPath = join(directory, "sancho-actions.json");
  const stdout = { text: "", write(chunk) { this.text += chunk; } };

  try {
    await writeFile(registryPath, JSON.stringify(registryFixture), "utf8");

    assert.equal(
      await runCli(["actions", "validate", "--registry", registryPath], { stdout }),
      0
    );
    assert.match(stdout.text, /已验证 2 个动作和 1 个环境/);

    stdout.text = "";
    assert.equal(
      await runCli(["actions", "validate", "--registry", registryPath], {
        stdout,
        env: { SANCHO_LOCALE: "en-US" }
      }),
      0
    );
    assert.match(stdout.text, /Validated 2 actions and 1 profiles/);

    stdout.text = "";
    assert.equal(
      await runCli(["actions", "entries", "--registry", registryPath], { stdout }),
      0
    );
    assert.match(stdout.text, /SanchoExo Codex DeepSeek\tcds\t98/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
