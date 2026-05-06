import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { runCli } from "../src/index.js";

test("renders a dashboard file from sample state without leaking sample secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-dashboard-"));
  const outputPath = join(directory, "dashboard.html");
  let stdout = "";

  try {
    const code = await runCli(["render", "--output", outputPath], {
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      }
    });
    const html = await readFile(outputPath, "utf8");

    assert.equal(code, 0);
    assert.match(stdout, /dashboard\.html/);
    assert.match(html, /SanchoAiIME 控制台/);
    assert.equal(html.includes("sample-secret-value-that-will-be-redacted"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("can render the dashboard in English when explicitly requested", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-dashboard-en-"));
  const outputPath = join(directory, "dashboard.html");

  try {
    const code = await runCli(["render", "--output", outputPath, "--locale", "en-US"], {
      stdout: { write() {} }
    });
    const html = await readFile(outputPath, "utf8");

    assert.equal(code, 0);
    assert.match(html, /SanchoAiIME Dashboard/);
    assert.match(html, /Dictionary/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
