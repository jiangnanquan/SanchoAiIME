import assert from "node:assert/strict";
import test from "node:test";

import { parseTagVersion } from "../src/auto-updater.js";

test("parses semver tag names", () => {
  assert.deepEqual(parseTagVersion("v0.2.1"), { major: 0, minor: 2, patch: 1 });
  assert.deepEqual(parseTagVersion("v1.0.0"), { major: 1, minor: 0, patch: 0 });
  assert.deepEqual(parseTagVersion("v10.20.30"), { major: 10, minor: 20, patch: 30 });
});

test("returns null for invalid tag names", () => {
  assert.equal(parseTagVersion(""), null);
  assert.equal(parseTagVersion("abc"), null);
  assert.equal(parseTagVersion("v1.2"), null);
  assert.equal(parseTagVersion("1.2.3.4"), null);
});
