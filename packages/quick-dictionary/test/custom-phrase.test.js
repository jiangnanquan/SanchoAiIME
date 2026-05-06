import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BEGIN_MARKER,
  END_MARKER,
  normalizeEntries,
  parseCustomPhraseText,
  renderManagedRegion,
  syncCustomPhraseFile,
  syncUserCustomPhraseEntries,
  updateUserEntries,
  updateManagedRegion
} from "../src/custom-phrase.js";

test("appends a managed region without changing existing user phrases", () => {
  const existing = "# user phrases\nDuckDB\tdu\t50\n";
  const updated = updateManagedRegion(existing, [
    { surface: "Qwen local prediction", code: "qwp", weight: 99 }
  ]);

  assert.equal(
    updated,
    [
      "# user phrases",
      "DuckDB\tdu\t50",
      BEGIN_MARKER,
      "Qwen local prediction\tqwp\t99",
      END_MARKER,
      ""
    ].join("\n")
  );
});

test("replaces only the existing Sancho managed region", () => {
  const existing = [
    "# before",
    "Playwright\tpl\t50",
    BEGIN_MARKER,
    "old phrase\top\t1",
    END_MARKER,
    "# after",
    "Codex\tcd\t50",
    ""
  ].join("\n");

  const updated = updateManagedRegion(existing, [
    { surface: "DeepSeek V4 Flash analysis", code: "dsf", weight: 99 }
  ]);

  assert.equal(
    updated,
    [
      "# before",
      "Playwright\tpl\t50",
      BEGIN_MARKER,
      "DeepSeek V4 Flash analysis\tdsf\t99",
      END_MARKER,
      "# after",
      "Codex\tcd\t50",
      ""
    ].join("\n")
  );
});

test("replaces user custom phrases while preserving managed entries", () => {
  const existing = [
    "# before",
    "Old user phrase\toup\t50",
    BEGIN_MARKER,
    "Qwen 本地预测\tqwp\t90",
    END_MARKER,
    "# after",
    ""
  ].join("\n");

  const updated = updateUserEntries(existing, [
    { surface: "New user phrase", code: "nup", weight: 88 }
  ]);

  assert.equal(
    updated,
    [
      "New user phrase\tnup\t88",
      BEGIN_MARKER,
      "Qwen 本地预测\tqwp\t90",
      END_MARKER,
      "# after",
      ""
    ].join("\n")
  );
});

test("renders and parses optional candidate positions for user phrases", () => {
  const existing = [
    BEGIN_MARKER,
    "Qwen 本地预测\tqwp\t90",
    END_MARKER,
    ""
  ].join("\n");

  const updated = updateUserEntries(existing, [
    { surface: "固定第二候选", code: "gd", weight: 88, candidatePosition: 2 }
  ]);

  assert.equal(
    updated,
    [
      "# @sancho candidate_position=2",
      "固定第二候选\tgd\t88",
      BEGIN_MARKER,
      "Qwen 本地预测\tqwp\t90",
      END_MARKER,
      ""
    ].join("\n")
  );

  const parsed = parseCustomPhraseText(updated);
  assert.equal(parsed.userEntries[0].candidatePosition, 2);
});

test("preserves CRLF line endings when replacing a managed region", () => {
  const existing = [
    "# before",
    BEGIN_MARKER,
    "old phrase\top\t1",
    END_MARKER,
    "# after",
    ""
  ].join("\r\n");

  const updated = updateManagedRegion(existing, [
    { surface: "Sancho profile", code: "sp", weight: 88 }
  ]);

  assert.equal(
    updated,
    [
      "# before",
      BEGIN_MARKER,
      "Sancho profile\tsp\t88",
      END_MARKER,
      "# after",
      ""
    ].join("\r\n")
  );
});

test("rejects malformed managed markers", () => {
  assert.throws(
    () => updateManagedRegion(`${BEGIN_MARKER}\nmissing end\n`, []),
    /marker count differs/
  );
  assert.throws(
    () => updateManagedRegion(`${END_MARKER}\n${BEGIN_MARKER}\n`, []),
    /end marker appears before begin marker/
  );
});

test("deduplicates entries by surface and code with the last value winning", () => {
  assert.deepEqual(
    normalizeEntries([
      { surface: "DuckDB", code: "du", weight: 10 },
      { text: "DuckDB", reading: "du", weight: 60, candidatePosition: 2 },
      { phrase: "Playwright", code: "pl" }
    ]),
    [
      { surface: "DuckDB", code: "du", weight: 60, candidatePosition: 2 },
      { surface: "Playwright", code: "pl", weight: 99 }
    ]
  );
});

test("rejects tab or line break content before rendering Rime rows", () => {
  assert.throws(
    () => renderManagedRegion([{ surface: "bad\tfield", code: "bf" }]),
    /must not contain tabs or line breaks/
  );
});

test("parses user and managed custom_phrase entries for display", () => {
  const parsed = parseCustomPhraseText([
    "# comment",
    "静夜思\\n\\s\\s李白\tjys\t50",
    "DuckDB\tdu\t50",
    BEGIN_MARKER,
    "Qwen 本地预测\tqwp\t90",
    END_MARKER,
    ""
  ].join("\n"));

  assert.equal(parsed.summary.userEntryCount, 2);
  assert.equal(parsed.summary.managedEntryCount, 1);
  assert.equal(parsed.summary.commentRowCount, 1);
  assert.equal(parsed.userEntries[0].preview, "静夜思\n  李白");
  assert.equal(parsed.managedEntries[0].code, "qwp");
});

test("syncCustomPhraseFile writes the managed region atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-quick-dictionary-"));
  const path = join(directory, "custom_phrase.txt");

  try {
    await writeFile(path, "# user\nUser phrase\tup\t50\n", "utf8");

    const result = await syncCustomPhraseFile({
      customPhrasePath: path,
      entries: [{ surface: "Sancho quick dictionary", code: "sqd", weight: 99 }]
    });

    const content = await readFile(path, "utf8");
    assert.equal(result.changed, true);
    assert.equal(
      content,
      [
        "# user",
        "User phrase\tup\t50",
        BEGIN_MARKER,
        "Sancho quick dictionary\tsqd\t99",
        END_MARKER,
        ""
      ].join("\n")
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("syncUserCustomPhraseEntries writes editable user phrases atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-user-phrases-"));
  const path = join(directory, "custom_phrase.txt");

  try {
    await writeFile(path, [
      "Old user\tou\t20",
      BEGIN_MARKER,
      "Sancho quick dictionary\tsqd\t99",
      END_MARKER,
      ""
    ].join("\n"), "utf8");

    const result = await syncUserCustomPhraseEntries({
      customPhrasePath: path,
      entries: [{ surface: "Control panel edit", code: "cpe", weight: 70 }]
    });

    const content = await readFile(path, "utf8");
    assert.equal(result.changed, true);
    assert.equal(
      content,
      [
        "Control panel edit\tcpe\t70",
        BEGIN_MARKER,
        "Sancho quick dictionary\tsqd\t99",
        END_MARKER,
        ""
      ].join("\n")
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
