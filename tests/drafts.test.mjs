import test from "node:test";
import assert from "node:assert/strict";
import { draftStore } from "../src/drafts.ts";
function storage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] || null,
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
test("acknowledging one tab never deletes another tab draft", () => {
  const local = storage(),
    a = draftStore(local, "tab-a"),
    b = draftStore(local, "tab-b");
  a.write({ id: "entry", title: "A" });
  b.write({ id: "entry", title: "B" });
  a.remove("entry");
  assert.equal(b.read("entry").title, "B");
  assert.equal(a.list().length, 1);
});
test("reload adopts its own previous draft, closed-tab drafts remain discoverable", () => {
  const local = storage(),
    a = draftStore(local, "previous");
  a.write({ id: "entry", title: "recover me" });
  const reloaded = draftStore(local, "new-page", "previous");
  assert.equal(reloaded.read("entry").title, "recover me");
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.list()[0].key, reloaded.key("entry"));
  const fresh = draftStore(local, "other-tab");
  assert.equal(fresh.read("entry"), null);
  assert.equal(fresh.list()[0].entry.title, "recover me");
});
