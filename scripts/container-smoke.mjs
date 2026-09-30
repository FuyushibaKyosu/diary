import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.SMOKE_URL || "http://127.0.0.1:8787";
for (let i = 0; i < 30; i++) {
  try {
    if ((await fetch(base + "/api/health")).ok) break;
  } catch {}
  if (i === 29) throw new Error("Container did not become ready");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
const page = await fetch(base);
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /页间/);
const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
assert.ok(asset, "Production frontend bundle must be served");
assert.equal((await fetch(base + asset)).status, 200);
for (const path of [
  "/entries/deep-link",
  "/calendar/2026-09",
  "/favorites",
  "/tags/%E6%97%A5%E5%B8%B8",
]) {
  const deepLink = await fetch(base + path);
  assert.equal(deepLink.status, 200);
  assert.equal(
    await deepLink.text(),
    html,
    "Deep links must serve the app shell on refresh",
  );
}
assert.equal((await fetch(base + "/api/entries")).status, 401);
// Run only against the disposable CI container, never an existing diary space.
const auth = await (await fetch(base + "/api/auth")).json();
assert.equal(
  auth.configured,
  false,
  "Refusing to initialize an existing diary space",
);
const setup = await fetch(base + "/api/setup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: randomUUID(), date: "2026-09-26" }),
});
assert.equal(setup.status, 200);
const cookie = setup.headers.get("set-cookie").split(";")[0];
const entries = await fetch(base + "/api/entries", {
  headers: { Cookie: cookie },
});
assert.equal(entries.status, 200);
assert.ok((await entries.json()).length > 0);
const backup = await fetch(base + "/api/export?backup=1", {
  headers: { Cookie: cookie },
});
assert.equal(backup.status, 200);
assert.equal(backup.headers.get("content-type"), "application/zip");
assert.ok((await backup.arrayBuffer()).byteLength > 100);
console.log(
  "Container smoke check passed: frontend, authentication, writable database and backup.",
);
