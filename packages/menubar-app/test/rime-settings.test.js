import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureSharedBuildArtifacts,
  readRimeSettings,
  SANCHO_SKIN_PRESETS,
  writeRimeSettings
} from "../src/rime-settings.js";

test("writes Squirrel appearance and Luna output patches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-rime-settings-"));
  const rimeDirectory = join(directory, "Rime");

  try {
    const result = await writeRimeSettings({
      outputScript: "simplified",
      candidateLayout: "linear",
      textOrientation: "horizontal",
      colorScheme: "sancho_graphite",
      pageSize: 7,
      fontPoint: 18,
      cornerRadius: 8,
      inlinePreedit: false,
      predictor: {
        enabled: true,
        runner: {
          provider: "ollama",
          ollamaModel: "sancho-qwen"
        }
      },
      customSkin: {
        name: "My Skin",
        backColor: "#101820",
        borderColor: "#223344",
        textColor: "#F2F7FA",
        candidateTextColor: "#D5DEE6",
        commentTextColor: "#93A4B2",
        labelColor: "#A8B3BD",
        highlightedBackColor: "#277864",
        highlightedTextColor: "#FFFFFF",
        highlightedLabelColor: "#D8FFF2",
        highlightedCommentColor: "#B7E8DA"
      }
    }, { rimeDirectory });

    assert.equal(result.settings.outputScript, "simplified");
    const squirrelConfig = await readFile(join(rimeDirectory, "squirrel.custom.yaml"), "utf8");
    assert.match(squirrelConfig, /style\/candidate_list_layout: "linear"/);
    assert.match(squirrelConfig, /style\/color_scheme: "sancho_graphite"/);
    assert.match(squirrelConfig, /preset_color_schemes\/sancho_mist\/name: "Sancho Mist"/);
    assert.match(squirrelConfig, /preset_color_schemes\/sancho_custom\/back_color: 0x201810/);
    assert.match(squirrelConfig, /preset_color_schemes\/sancho_custom\/hilited_candidate_back_color: 0x647827/);
    assert.match(
      await readFile(join(rimeDirectory, "default.custom.yaml"), "utf8"),
      /menu\/page_size: 7/
    );
    assert.match(
      await readFile(join(rimeDirectory, "luna_pinyin.custom.yaml"), "utf8"),
      /switches\/@2\/reset: 1/
    );
    assert.match(
      await readFile(join(rimeDirectory, "luna_pinyin.custom.yaml"), "utf8"),
      /engine\/filters\/@before 0: "lua_filter@sancho_predictor_filter"/
    );
    assert.match(
      await readFile(join(rimeDirectory, "lua", "sancho_predictor.lua"), "utf8"),
      /return sancho_predictor_filter/
    );
    assert.match(
      await readFile(join(rimeDirectory, "lua", "sancho_predictor.lua"), "utf8"),
      /parsed\.mode ~= "lexicon"/
    );
    assert.match(
      await readFile(join(rimeDirectory, "lua", "sancho_predictor.lua"), "utf8"),
      /cand\.text, rank\.comment/
    );
    assert.match(
      await readFile(join(rimeDirectory, "lua", "sancho_predictor.lua"), "utf8"),
      /suggestion\.position/
    );
    assert.match(
      await readFile(join(rimeDirectory, "rime.lua"), "utf8"),
      /sancho_predictor_filter = predictor/
    );
    assert.equal(
      JSON.parse(await readFile(join(rimeDirectory, "sancho_predictor.json"), "utf8")).runner.ollamaModel,
      "sancho-qwen"
    );

    const settings = await readRimeSettings({ rimeDirectory });
    assert.deepEqual(settings, result.settings);
    assert.equal(SANCHO_SKIN_PRESETS.sancho_graphite.name, "Sancho Graphite");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves unrelated user patch keys when updating settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-rime-settings-preserve-"));
  const rimeDirectory = join(directory, "Rime");

  try {
    await mkdir(rimeDirectory, { recursive: true });
    await writeFile(join(rimeDirectory, "squirrel.custom.yaml"), [
      "patch:",
      "  app_options/com.apple.Terminal/ascii_mode: true",
      "  style/color_scheme: \"aqua\"",
      ""
    ].join("\n"));

    await writeRimeSettings({
      outputScript: "traditional",
      candidateLayout: "stacked",
      textOrientation: "horizontal",
      colorScheme: "native",
      pageSize: 5,
      fontPoint: 16,
      cornerRadius: 7,
      inlinePreedit: true
    }, { rimeDirectory });

    const content = await readFile(join(rimeDirectory, "squirrel.custom.yaml"), "utf8");
    assert.match(content, /app_options\/com\.apple\.Terminal\/ascii_mode: true/);
    assert.match(content, /style\/color_scheme: "native"/);
    assert.doesNotMatch(content, /style\/color_scheme: "aqua"/);
    assert.equal((await readRimeSettings({ rimeDirectory })).outputScript, "traditional");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repairs missing shared Squirrel build artifacts before reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-rime-build-repair-"));
  const rimeDirectory = join(directory, "Rime");
  const sharedBuildDirectory = join(directory, "SharedSupport", "build");

  try {
    await mkdir(sharedBuildDirectory, { recursive: true });
    await writeFile(join(sharedBuildDirectory, "luna_pinyin.table.bin"), "stock-table", "utf8");
    await writeFile(join(sharedBuildDirectory, "luna_pinyin.reverse.bin"), "stock-reverse", "utf8");

    const result = await ensureSharedBuildArtifacts({
      rimeDirectory,
      sharedBuildDirectory,
      artifacts: ["luna_pinyin.table.bin", "luna_pinyin.reverse.bin"]
    });

    assert.equal(result.copied.length, 2);
    assert.equal(
      await readFile(join(rimeDirectory, "build", "luna_pinyin.table.bin"), "utf8"),
      "stock-table"
    );
    assert.equal(
      await readFile(join(rimeDirectory, "build", "luna_pinyin.reverse.bin"), "utf8"),
      "stock-reverse"
    );

    const second = await ensureSharedBuildArtifacts({
      rimeDirectory,
      sharedBuildDirectory,
      artifacts: ["luna_pinyin.table.bin", "luna_pinyin.reverse.bin"]
    });
    assert.deepEqual(second.copied, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
