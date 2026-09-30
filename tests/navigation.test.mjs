import test from "node:test";
import assert from "node:assert/strict";
import { createNavigation } from "../src/navigation.ts";
import { parseRoute, routeUrl, resolveRoute } from "../src/routes.ts";

function memoryHistory(url = "/entries/a") {
  const stack = [{ url, state: null }];
  let index = 0,
    listener = () => {};
  return {
    stack,
    read: () => stack[index],
    push: (url, state) => {
      stack.splice(index + 1);
      stack.push({ url, state });
      index++;
    },
    replace: (url, state) => {
      stack[index] = { url, state };
    },
    go: (delta) => {
      const next = index + delta;
      if (next < 0 || next >= stack.length) return;
      index = next;
      listener();
    },
    listen: (handler) => {
      listener = handler;
      return () => {
        listener = () => {};
      };
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("routes preserve selected entry, Chinese tags, calendar months and encoded special characters", () => {
  for (const route of [
    { view: "all", entryId: "abc-123" },
    { view: "favorites", entryId: "abc-123" },
    { view: "trash", entryId: "abc-123" },
    { view: "tag", tag: "日常 / 随想?#", entryId: "abc-123" },
    { view: "calendar", month: "2026-09" },
  ])
    assert.deepEqual(parseRoute(routeUrl(route)), route);
  for (const path of ["/no-such-page", "/calendar/2026-13", "/tags/%E0%A4%A"])
    assert.equal(parseRoute(path), null);
});

const entries = [
  {
    id: "a",
    date: "2026-09-01",
    created_at: "1",
    deleted_at: null,
    favorite: false,
    tags: ["日常"],
  },
  {
    id: "b",
    date: "2026-09-02",
    created_at: "2",
    deleted_at: null,
    favorite: true,
    tags: [],
  },
  {
    id: "deleted",
    date: "2026-09-03",
    created_at: "3",
    deleted_at: "yes",
    favorite: false,
    tags: [],
  },
];
test("initial routes resolve deterministically without substituting a missing diary", () => {
  assert.equal(resolveRoute("/", entries, "2026-09").url, "/entries/b");
  assert.equal(
    resolveRoute("/tags/日常", entries, "2026-09").url,
    "/tags/%E6%97%A5%E5%B8%B8?entry=a",
  );
  assert.equal(
    resolveRoute("/entries/deleted", entries, "2026-09").url,
    "/trash?entry=deleted",
  );
  assert.equal(
    resolveRoute("/trash?entry=a", entries, "2026-09").url,
    "/entries/a",
  );
  const missing = resolveRoute("/entries/missing", entries, "2026-09");
  assert.equal(missing.entry, undefined);
  assert.ok(missing.error);
});

test("back, forward and reload retain history without adding duplicate entries", async () => {
  const port = memoryHistory();
  let shown;
  let nav = createNavigation(
    port,
    async () => true,
    (url) => (shown = url),
  );
  await nav.navigate("/entries/b");
  await nav.navigate("/calendar/2026-09");
  await nav.navigate("/calendar/2026-09");
  assert.equal(port.stack.length, 3);
  port.go(-1);
  await tick();
  assert.equal(shown, "/entries/b");
  nav.dispose();
  nav = createNavigation(
    port,
    async () => true,
    (url) => (shown = url),
  );
  port.go(-1);
  await tick();
  assert.equal(shown, "/entries/a");
  port.go(1);
  await tick();
  assert.equal(shown, "/entries/b");
  assert.equal(port.stack.length, 3);
  nav.dispose();
});

test("failed save blocks app navigation and restores a browser traversal without losing its forward stack", async () => {
  const port = memoryHistory();
  let shown;
  let allowed = true;
  const nav = createNavigation(
    port,
    async () => allowed,
    (url) => (shown = url),
  );
  await nav.navigate("/entries/b");
  allowed = false;
  assert.equal(await nav.navigate("/entries/c"), false);
  port.go(-1);
  await tick();
  assert.equal(port.read().url, "/entries/b");
  assert.equal(shown, "/entries/b");
  assert.equal(port.stack.length, 2);
  allowed = true;
  port.go(-1);
  await tick();
  assert.equal(shown, "/entries/a");
  port.go(1);
  await tick();
  assert.equal(shown, "/entries/b");
  nav.dispose();
});

test("rapid browser traversals and navigation ignore stale saves", async () => {
  const port = memoryHistory();
  let shown;
  let wait;
  const nav = createNavigation(
    port,
    () => wait?.promise ?? Promise.resolve(true),
    (url) => (shown = url),
  );
  await nav.navigate("/entries/b");
  await nav.navigate("/entries/c");
  wait = deferred();
  port.go(-1);
  port.go(-1);
  wait.resolve(true);
  await tick();
  assert.equal(shown, "/entries/a");
  wait = deferred();
  const older = nav.navigate("/entries/b"),
    newer = nav.navigate("/entries/c");
  wait.resolve(true);
  assert.equal(await older, false);
  assert.equal(await newer, true);
  assert.equal(shown, "/entries/c");
  nav.dispose();
});
