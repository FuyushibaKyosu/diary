import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/index.mjs";

test("private journal: auth, persistence, optimistic concurrency, trash, history, attachments and restorable backup", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "yejian-test-"));
  let app = createApp({ dataDir: dir, noBackup: true });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  let base = `http://127.0.0.1:${app.server.address().port}`,
    cookie = "";
  const request = (path, method = "GET", data, extra = {}) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        Cookie: cookie,
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  let entry, imageSrc, savedZip;
  try {
    await t.test(
      "authentication, one-time setup, protected data and origin validation",
      async () => {
        assert.equal((await request("/entries")).status, 401);
        assert.equal(
          (await request("/setup", "POST", { password: "short" })).status,
          400,
        );
        const setup = await request("/setup", "POST", {
          password: "test-password-2026",
          date: "2026-09-26",
        });
        assert.equal(setup.status, 200);
        cookie = setup.headers.get("set-cookie").split(";")[0];
        assert.match(
          setup.headers.get("set-cookie"),
          /HttpOnly; SameSite=Strict/,
        );
        assert.equal(
          (await request("/setup", "POST", { password: "another-password" }))
            .status,
          409,
        );
        assert.equal(
          (
            await request(
              "/entries",
              "POST",
              { date: "2026-09-26" },
              { Origin: "https://untrusted.test" },
            )
          ).status,
          403,
        );
        assert.equal(
          (await request("/entries", "POST", { date: "2026-02-31" })).status,
          400,
        );
        const list = await (await request("/entries")).json();
        assert.equal(list.length, 1);
        assert.equal(list[0].title, "从这一页开始");
      },
    );
    await t.test(
      "save and concurrent edits preserve the first committed version",
      async () => {
        entry = await (
          await request("/entries", "POST", { date: "2026-09-26" })
        ).json();
        const change = {
          ...entry,
          title: "真正保存的日记",
          body: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "今天的内容，刷新后仍然在。" }],
              },
            ],
          },
          tags: ["生活"],
          mood: "平静",
          favorite: true,
        };
        const save = await request("/entries/" + entry.id, "PUT", change);
        assert.equal(save.status, 200);
        const stale = await request("/entries/" + entry.id, "PUT", {
          ...change,
          title: "不应覆盖",
        });
        assert.equal(stale.status, 409);
        entry = await save.json();
        assert.equal(entry.revision, 2);
        assert.equal(
          (await (await request("/entries")).json()).find(
            (e) => e.id === entry.id,
          ).title,
          "真正保存的日记",
        );
        assert.equal(
          (
            await request("/entries/" + entry.id, "PUT", {
              ...entry,
              body: {
                type: "doc",
                content: [
                  {
                    type: "image",
                    attrs: { src: "https://tracker.invalid/x.png" },
                  },
                ],
              },
            })
          ).status,
          400,
        );
      },
    );
    await t.test("soft deletion, restore and version history", async () => {
      let response = await request("/entries/" + entry.id, "PUT", {
        ...entry,
        deleted_at: true,
      });
      entry = await response.json();
      assert.ok(entry.deleted_at);
      response = await request("/entries/" + entry.id, "PUT", {
        ...entry,
        deleted_at: null,
      });
      entry = await response.json();
      assert.equal(entry.deleted_at, null);
      const history = await (
        await request("/entries/" + entry.id + "/history")
      ).json();
      assert.equal(history.length, 3);
      assert.equal(history[0].snapshot.id, entry.id);
    });
    await t.test(
      "authenticated images and complete, consistent backup",
      async () => {
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7kAAAAASUVORK5CYII=",
          "base64",
        );
        const upload = await fetch(base + "/api/attachments", {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "image/png" },
          body: png,
        });
        assert.equal(upload.status, 201);
        imageSrc = (await upload.json()).src;
        assert.equal((await fetch(base + imageSrc)).status, 401);
        assert.deepEqual(
          Buffer.from(
            await (
              await fetch(base + imageSrc, { headers: { Cookie: cookie } })
            ).arrayBuffer(),
          ),
          png,
        );
        assert.equal(
          (
            await fetch(base + "/api/attachments", {
              method: "POST",
              headers: { Cookie: cookie },
              body: '<svg onload="alert(1)"/>',
            })
          ).status,
          400,
        );
        const res = await request("/export?backup=1");
        assert.equal(res.status, 200);
        savedZip = unzipSync(new Uint8Array(await res.arrayBuffer()));
        assert.ok(savedZip["diary.sqlite"]);
        assert.ok(savedZip[imageSrc.replace("/api/", "")]);
        const exported = JSON.parse(strFromU8(savedZip["journal.json"]));
        assert.ok(exported.entries.find((e) => e.title === "真正保存的日记"));
        const copy = join(dir, "backup-check.sqlite");
        writeFileSync(copy, savedZip["diary.sqlite"]);
        const db = new DatabaseSync(copy);
        assert.equal(
          db.prepare("PRAGMA integrity_check").get().integrity_check,
          "ok",
        );
        assert.equal(
          db.prepare("SELECT title FROM entries WHERE id=?").get(entry.id)
            .title,
          entry.title,
        );
        db.close();
      },
    );
    await t.test("restart preserves content and sessions", async () => {
      await app.close();
      app = createApp({ dataDir: dir, noBackup: true });
      await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${app.server.address().port}`;
      const list = await request("/entries");
      assert.equal(list.status, 200);
      assert.equal(
        (await list.json()).find((e) => e.id === entry.id).title,
        entry.title,
      );
      assert.equal((await request("/logout", "POST")).status, 200);
      assert.equal((await request("/entries")).status, 401);
      assert.equal(
        (await request("/login", "POST", { password: "incorrect-password" }))
          .status,
        401,
      );
      assert.equal(
        (await request("/login", "POST", { password: "test-password-2026" }))
          .status,
        200,
      );
    });
    await t.test("archive restores into a new data directory", async () => {
      const restored = join(dir, "restored");
      mkdirSync(join(restored, "attachments"), { recursive: true });
      writeFileSync(join(restored, "diary.sqlite"), savedZip["diary.sqlite"]);
      for (const [name, bytes] of Object.entries(savedZip))
        if (name.startsWith("attachments/"))
          writeFileSync(join(restored, name), bytes);
      const restoredApp = createApp({ dataDir: restored, noBackup: true });
      assert.equal(
        restoredApp.db
          .prepare("SELECT title FROM entries WHERE id=?")
          .get(entry.id).title,
        entry.title,
      );
      assert.ok(existsSync(join(restored, imageSrc.replace("/api/", ""))));
      await restoredApp.close();
    });
  } finally {
    await app.close();
    const verified = resolve(dir);
    if (
      verified.startsWith(resolve(tmpdir()) + "\\") ||
      verified.startsWith(resolve(tmpdir()) + "/")
    )
      rmSync(verified, { recursive: true, force: true });
  }
});
