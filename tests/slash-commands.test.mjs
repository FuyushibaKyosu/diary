import test from "node:test";
import assert from "node:assert/strict";
import { slashQuery, filterBlocks } from "../src/slash-commands.ts";

test("slash commands start at the beginning of a block, without capturing URLs or prose", () => {
  assert.equal(slashQuery("/"), "");
  assert.equal(slashQuery("/标题"), "标题");
  for (const text of [
    "今天 /todo",
    "https://example.com",
    "//",
    "普通文字",
    "/两行\n文字",
    "/" + "a".repeat(41),
  ]) {
    assert.equal(slashQuery(text), null, text);
  }
});

test("block search supports Chinese and keyboard-friendly aliases", () => {
  assert.deepEqual(
    filterBlocks("标题").map((b) => b.id),
    ["h1", "h2", "h3"],
  );
  assert.deepEqual(
    filterBlocks(" H2 ").map((b) => b.id),
    ["h2"],
  );
  assert.deepEqual(
    filterBlocks("todo").map((b) => b.id),
    ["task"],
  );
  assert.deepEqual(filterBlocks("没有这种区块"), []);
});
