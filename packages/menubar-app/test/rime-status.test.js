import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDefaultActionRegistry
} from "../src/dashboard-state.js";
import { createMenubarTranslator } from "../src/i18n.js";
import {
  formatRimeIntegrationStatus,
  getRimeIntegrationStatus
} from "../src/rime-status.js";

test("detects Wanxiang compatibility mode with Sancho managed phrases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-rime-status-"));
  const rimeDirectory = join(directory, "Rime");
  const buildDirectory = join(rimeDirectory, "build");
  const translator = createMenubarTranslator({ SANCHO_LOCALE: "zh-CN" });
  const actionRegistry = createDefaultActionRegistry(translator);

  try {
    await mkdir(buildDirectory, { recursive: true });
    await writeFile(join(rimeDirectory, "default.yaml"), "schema_list:\n  - schema: wanxiang\n");
    await writeFile(join(rimeDirectory, "installation.yaml"), "distribution_name: \"鼠鬚管\"\nrime_version: 1.16.0\n");
    await writeFile(join(rimeDirectory, "custom_phrase.txt"), [
      "# >>> SanchoAiIME managed: quick-dictionary",
      "Qwen 本地预测\tqwp\t90",
      "DeepSeek V4 Flash 分析\tdsf\t99",
      "打开 Sancho 面板\tsdb\t80",
      "# <<< SanchoAiIME managed: quick-dictionary",
      ""
    ].join("\n"));
    await writeFile(join(buildDirectory, "default.yaml"), "schema_list:\n  - schema: wanxiang\n");
    await writeFile(join(buildDirectory, "wanxiang.schema.yaml"), [
      "schema:",
      "  schema_id: wanxiang",
      "  name: 万象拼音",
      "engine:",
      "  translators:",
      "    - script_translator",
      "    - table_translator@custom_phrase",
      "custom_phrase:",
      "  dictionary: \"\"",
      "  user_dict: custom_phrase",
      ""
    ].join("\n"));

    const status = await getRimeIntegrationStatus({
      rimeDirectory,
      customPhrasePath: join(rimeDirectory, "custom_phrase.txt"),
      actionRegistry
    });

    assert.equal(status.status, "ready");
    assert.equal(status.schema.id, "wanxiang");
    assert.equal(status.schema.name, "万象拼音");
    assert.equal(status.customPhrase.managedEntryCount, 3);
    assert.equal(status.integration.hasCustomPhraseTranslator, true);
    assert.match(formatRimeIntegrationStatus(status, translator), /输入 qwp/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("falls back to bundled Squirrel schemas on a clean Rime install", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-rime-status-clean-"));
  const rimeDirectory = join(directory, "Rime");
  const sharedSupportDirectory = join(directory, "SharedSupport");
  const sharedBuildDirectory = join(sharedSupportDirectory, "build");
  const translator = createMenubarTranslator({ SANCHO_LOCALE: "zh-CN" });
  const actionRegistry = createDefaultActionRegistry(translator);

  try {
    await mkdir(rimeDirectory, { recursive: true });
    await mkdir(sharedBuildDirectory, { recursive: true });
    await writeFile(join(rimeDirectory, "installation.yaml"), "distribution_name: \"鼠鬚管\"\nrime_version: 1.13.0\n");
    await writeFile(join(rimeDirectory, "custom_phrase.txt"), [
      "# >>> SanchoAiIME managed: quick-dictionary",
      "Qwen 本地预测\tqwp\t90",
      "DeepSeek V4 Flash 分析\tdsf\t99",
      "打开 Sancho 面板\tsdb\t80",
      "# <<< SanchoAiIME managed: quick-dictionary",
      ""
    ].join("\n"));
    await writeFile(join(sharedBuildDirectory, "default.yaml"), "schema_list:\n  - schema: luna_pinyin\n");
    await writeFile(join(sharedBuildDirectory, "luna_pinyin.schema.yaml"), [
      "schema:",
      "  schema_id: luna_pinyin",
      "  name: 朙月拼音",
      "engine:",
      "  translators:",
      "    - punct_translator",
      "    - table_translator@custom_phrase",
      "    - script_translator",
      "custom_phrase:",
      "  dictionary: \"\"",
      "  user_dict: custom_phrase",
      ""
    ].join("\n"));

    const status = await getRimeIntegrationStatus({
      rimeDirectory,
      sharedSupportDirectory,
      customPhrasePath: join(rimeDirectory, "custom_phrase.txt"),
      actionRegistry
    });

    assert.equal(status.status, "ready");
    assert.equal(status.schema.id, "luna_pinyin");
    assert.equal(status.schema.name, "朙月拼音");
    assert.equal(status.integration.hasCustomPhraseTranslator, true);
    assert.match(formatRimeIntegrationStatus(status, translator), /鼠须管\/Rime/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
