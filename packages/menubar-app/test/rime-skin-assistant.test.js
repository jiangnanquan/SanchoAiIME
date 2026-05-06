import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSkinSuggestion,
  suggestRimeSkin
} from "../src/rime-skin-assistant.js";

test("parses Flash skin JSON into normalized custom skin colors", () => {
  const suggestion = parseSkinSuggestion(`Here is JSON:
{
  "name": "Quiet Code",
  "description": "低干扰的浅色编码皮肤。",
  "skin": {
    "backColor": "#f8fafc",
    "borderColor": "#d9e2ec",
    "textColor": "#1f2933",
    "candidateTextColor": "#243b53",
    "commentTextColor": "#829ab1",
    "labelColor": "#627d98",
    "highlightedBackColor": "#147d64",
    "highlightedTextColor": "#ffffff",
    "highlightedLabelColor": "#d8fff2",
    "highlightedCommentColor": "#c6f7e2"
  }
}`);

  assert.equal(suggestion.name, "Quiet Code");
  assert.equal(suggestion.skin.name, "Quiet Code");
  assert.equal(suggestion.skin.backColor, "#F8FAFC");
  assert.equal(suggestion.skin.highlightedBackColor, "#147D64");
  assert.match(suggestion.description, /低干扰/);
});

test("asks Flash for a skin using a bounded structured prompt", async () => {
  const calls = [];
  const result = await suggestRimeSkin(
    {
      prompt: "安静、浅色、适合长时间写作。",
      currentSettings: {
        colorScheme: "sancho_mist"
      }
    },
    {
      callChat: async (input, options) => {
        calls.push({ input, options });
        return {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          outputText: JSON.stringify({
            name: "Writer Mist",
            description: "柔和浅色方案。",
            skin: {
              backColor: "#FAFBFC",
              borderColor: "#DDE5EC",
              textColor: "#18212B",
              candidateTextColor: "#263746",
              commentTextColor: "#7B8B99",
              labelColor: "#607080",
              highlightedBackColor: "#236E63",
              highlightedTextColor: "#FFFFFF",
              highlightedLabelColor: "#DDF8F0",
              highlightedCommentColor: "#C7EAE1"
            }
          }),
          usage: { total_tokens: 100 }
        };
      }
    }
  );

  assert.equal(calls[0].options.allowNetwork, true);
  assert.equal(calls[0].input.temperature, 0.35);
  assert.match(calls[0].input.messages[0].content, /只返回 JSON/);
  assert.equal(result.skin.name, "Writer Mist");
  assert.equal(result.skin.backColor, "#FAFBFC");
});
