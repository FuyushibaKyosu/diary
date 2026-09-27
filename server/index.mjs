import http from "node:http";
import { DatabaseSync, backup } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { resolve, join, extname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const dateString = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
function validateDoc(doc, depth = 0, count = { n: 0 }) {
  if (!doc || typeof doc !== "object" || depth > 30 || ++count.n > 15000)
    fail(400, "正文格式不正确或过长");
  if (
    ![
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "taskList",
      "taskItem",
      "blockquote",
      "codeBlock",
      "hardBreak",
      "horizontalRule",
      "image",
    ].includes(doc.type)
  )
    fail(400, "不支持的正文格式");
  if (doc.text !== undefined && typeof doc.text !== "string")
    fail(400, "正文格式不正确");
  if (
    doc.type === "image" &&
    !/^\/api\/attachments\/[a-f0-9-]+\.(png|jpg|gif|webp)$/.test(
      doc.attrs?.src || "",
    )
  )
    fail(400, "图片必须先上传");
  if (doc.content !== undefined) {
    if (!Array.isArray(doc.content)) fail(400, "正文格式不正确");
    doc.content.forEach((n) => validateDoc(n, depth + 1, count));
  }
  for (const mark of doc.marks || []) {
    if (
      !["bold", "italic", "strike", "code", "underline", "link"].includes(
        mark.type,
      )
    )
      fail(400, "不支持的文字格式");
    if (
      mark.type === "link" &&
      !/^(https?:|mailto:)/i.test(mark.attrs?.href || "")
    )
      fail(400, "链接格式不正确");
  }
}
function plain(doc) {
  return (
    doc.text ||
    (doc.content || [])
      .map(plain)
      .join(
        ["doc", "bulletList", "orderedList", "taskList"].includes(doc.type)
          ? "\n"
          : "",
      )
  );
}
function markdown(n) {
  const inner = (n.content || []).map(markdown).join("");
  if (n.type === "text") {
    let t = n.text || "";
    for (const m of n.marks || []) {
      if (m.type === "bold") t = `**${t}**`;
      if (m.type === "italic") t = `*${t}*`;
      if (m.type === "code") t = `\`${t}\``;
      if (m.type === "link") t = `[${t}](${m.attrs.href})`;
    }
    return t;
  }
  if (n.type === "heading")
    return "#".repeat(Math.min(6, n.attrs?.level || 2)) + " " + inner + "\n\n";
  if (n.type === "paragraph") return inner + "\n\n";
  if (n.type === "image")
    return `![${n.attrs?.alt || "图片"}](attachments/${basename(n.attrs.src)})\n\n`;
  if (n.type === "hardBreak") return "\n";
  if (n.type === "horizontalRule") return "\n---\n\n";
  if (n.type === "blockquote")
    return (
      inner
        .trim()
        .split("\n")
        .map((l) => "> " + l)
        .join("\n") + "\n\n"
    );
  if (n.type === "codeBlock") return "```\n" + inner + "\n```\n\n";
  if (n.type === "listItem" || n.type === "taskItem")
    return (
      (n.type === "taskItem" ? `- [${n.attrs?.checked ? "x" : " "}] ` : "- ") +
      inner.trim() +
      "\n"
    );
  return inner;
}
export function createApp(options = {}) {
  const dataDir = resolve(
    options.dataDir || process.env.DATA_DIR || join(root, "data"),
  );
  mkdirSync(join(dataDir, "attachments"), { recursive: true });
  mkdirSync(join(dataDir, "backups"), { recursive: true });
  const db = new DatabaseSync(join(dataDir, "diary.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,plain TEXT NOT NULL,date TEXT NOT NULL,tags TEXT NOT NULL,mood TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,entry_id TEXT NOT NULL REFERENCES entries(id),snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS revisions_entry ON revisions(entry_id,created_at);
    CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,mime TEXT NOT NULL,created_at TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const configured = () =>
    !!db.prepare("SELECT value FROM settings WHERE key='password'").get();
  const decode = (row) =>
    row
      ? {
          ...row,
          body: JSON.parse(row.body),
          tags: JSON.parse(row.tags),
          favorite: !!row.favorite,
        }
      : null;
  const get = (id) =>
    decode(db.prepare("SELECT * FROM entries WHERE id=?").get(id));
  const attempts = new Map();
  function passwordSet(password) {
    const salt = randomBytes(16).toString("hex");
    db.prepare("INSERT OR REPLACE INTO settings VALUES('password',?)").run(
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
    );
  }
  if (!configured() && process.env.DIARY_PASSWORD) {
    if (process.env.DIARY_PASSWORD.length < 8)
      throw new Error("DIARY_PASSWORD must contain at least 8 characters");
    passwordSet(process.env.DIARY_PASSWORD);
  }
  const add = (input) => {
    const stamp = now(),
      id = randomUUID();
    const body = input.body || emptyDoc;
    validateDoc(body);
    db.prepare("INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      input.title || "",
      JSON.stringify(body),
      plain(body),
      input.date,
      JSON.stringify(input.tags || []),
      input.mood || "",
      0,
      1,
      stamp,
      stamp,
      null,
    );
    return get(id);
  };
  function json(res, status, payload) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
  }
  async function body(req, limit = 2 * 1024 * 1024, raw = false) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > limit) fail(413, "文件或正文太大");
      chunks.push(chunk);
    }
    const value = Buffer.concat(chunks);
    if (raw) return value;
    try {
      return JSON.parse(value.toString() || "{}");
    } catch {
      fail(400, "请求格式不正确");
    }
  }
  function session(req) {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("diary_session="))
      ?.slice(14);
    return (
      token &&
      db
        .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
        .get(hash(token), Date.now())
    );
  }
  function login(res) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?)").run(
      hash(token),
      Date.now() + 7 * 86400000,
    );
    res.setHeader(
      "Set-Cookie",
      `diary_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
    );
  }
  let backupInFlight;
  async function makeBackup() {
    if (backupInFlight) return backupInFlight;
    backupInFlight = (async () => {
      const target = join(
        dataDir,
        "backups",
        `diary-${now().slice(0, 10)}.sqlite`,
      );
      await backup(db, target);
      const backups = readdirSync(join(dataDir, "backups"))
        .filter((n) => /^diary-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n))
        .sort()
        .reverse();
      backups.slice(14).forEach((n) => unlinkSync(join(dataDir, "backups", n)));
      return target;
    })();
    try {
      return await backupInFlight;
    } finally {
      backupInFlight = null;
    }
  }
  const backupTimer = options.noBackup
    ? null
    : setInterval(() => {
        makeBackup().catch(console.error);
      }, 6 * 3600000);
  backupTimer?.unref();
  if (!options.noBackup) makeBackup().catch(console.error);
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const method = req.method;
      if (path.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(method) && req.headers.origin) {
          const allowed =
            process.env.APP_ORIGIN || `http://${req.headers.host}`;
          const origin = new URL(req.headers.origin);
          if (
            origin.origin !== allowed &&
            !(origin.host === req.headers.host && !process.env.APP_ORIGIN)
          )
            fail(403, "请求来源不受信任");
        }
        if (path === "/api/health") return json(res, 200, { ok: true });
        if (path === "/api/auth" && method === "GET")
          return json(res, 200, {
            configured: configured(),
            authenticated: !!session(req),
          });
        if (["/api/setup", "/api/login"].includes(path) && method === "POST") {
          const ip = req.socket.remoteAddress;
          const entry = attempts.get(ip);
          const attempt =
            entry && entry.until > Date.now()
              ? entry
              : { count: 0, until: Date.now() + 600000 };
          if (attempt.count >= 10) fail(429, "尝试次数过多，请十分钟后再试");
          const data = await body(req, 4096);
          if (
            typeof data.password !== "string" ||
            data.password.length < 8 ||
            data.password.length > 200
          )
            fail(400, "密码需要 8–200 个字符");
          if (path === "/api/setup") {
            if (configured()) fail(409, "日记空间已设置，请登录");
            db.exec("BEGIN IMMEDIATE");
            try {
              passwordSet(data.password);
              add({
                title: "从这一页开始",
                date: dateString(data.date) ? data.date : now().slice(0, 10),
                tags: ["使用指南"],
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 2 },
                      content: [{ type: "text", text: "欢迎来到页间" }],
                    },
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "这里是属于你的私人日记空间。这是一篇使用指南，你可以修改它，也可以把它移到回收站。",
                        },
                      ],
                    },
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "点击「写日记」，记录今天值得留下的片刻。文字会自动保存，右上角会显示保存状态。",
                        },
                      ],
                    },
                    {
                      type: "blockquote",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "不必每天都有特别的事，平常的一天也值得记下来。",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "heading",
                      attrs: { level: 2 },
                      content: [{ type: "text", text: "让记录简单一点" }],
                    },
                    {
                      type: "bulletList",
                      content: [
                        "用上方工具栏添加标题、列表和图片，也可以直接粘贴图片。",
                        "给日记加上标签，或收藏想常常回看的篇章。",
                        "在「设置与备份」中导出日记，留下一份自己的副本。",
                      ].map((text) => ({
                        type: "listItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text }],
                          },
                        ],
                      })),
                    },
                  ],
                },
              });
              db.exec("COMMIT");
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
          } else {
            const stored = db
              .prepare("SELECT value FROM settings WHERE key='password'")
              .get()?.value;
            if (!stored) fail(400, "请先设置日记空间");
            const [salt, expected] = stored.split(":");
            if (
              !timingSafeEqual(
                scryptSync(data.password, salt, 64),
                Buffer.from(expected, "hex"),
              )
            ) {
              attempt.count++;
              attempts.set(ip, attempt);
              fail(401, "密码不正确");
            }
          }
          attempts.delete(ip);
          login(res);
          return json(res, 200, { ok: true });
        }
        if (!session(req)) fail(401, "请先登录");
        if (path === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(
            session(req).token,
          );
          res.setHeader(
            "Set-Cookie",
            "diary_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/entries" && method === "GET") {
          const rows = db
            .prepare("SELECT * FROM entries ORDER BY date DESC,created_at DESC")
            .all()
            .map(decode);
          return json(res, 200, rows);
        }
        if (path === "/api/entries" && method === "POST") {
          const data = await body(req);
          if (!dateString(data.date)) fail(400, "请选择有效日期");
          return json(res, 201, add({ date: data.date }));
        }
        const match = path.match(
          /^\/api\/entries\/([a-f0-9-]+)(?:\/(history))?$/,
        );
        if (match) {
          const current = get(match[1]);
          if (!current) fail(404, "日记不存在");
          if (match[2] === "history" && method === "GET")
            return json(
              res,
              200,
              db
                .prepare(
                  "SELECT * FROM revisions WHERE entry_id=? ORDER BY created_at DESC",
                )
                .all(current.id)
                .map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })),
            );
          if (!match[2] && method === "PUT") {
            const data = await body(req);
            if (data.revision !== current.revision)
              return json(res, 409, {
                error:
                  "这篇日记已在另一处修改。你的草稿已保留，请另存为新日记或重新载入。",
                current,
              });
            if (
              typeof data.title !== "string" ||
              data.title.length > 300 ||
              !dateString(data.date) ||
              !Array.isArray(data.tags) ||
              data.tags.length > 20 ||
              data.tags.some((t) => typeof t !== "string" || t.length > 40) ||
              !["", "愉快", "平静", "充实", "低落", "疲惫"].includes(
                data.mood,
              ) ||
              typeof data.favorite !== "boolean" ||
              ![null, true].includes(data.deleted_at)
            )
              fail(400, "日记信息格式不正确");
            validateDoc(data.body);
            const stamp = now();
            db.exec("BEGIN IMMEDIATE");
            try {
              db.prepare("INSERT INTO revisions VALUES(?,?,?,?)").run(
                randomUUID(),
                current.id,
                JSON.stringify(current),
                stamp,
              );
              db.prepare(
                "UPDATE entries SET title=?,body=?,plain=?,date=?,tags=?,mood=?,favorite=?,revision=revision+1,updated_at=?,deleted_at=? WHERE id=?",
              ).run(
                data.title,
                JSON.stringify(data.body),
                plain(data.body),
                data.date,
                JSON.stringify([...new Set(data.tags)]),
                data.mood,
                data.favorite ? 1 : 0,
                stamp,
                data.deleted_at ? current.deleted_at || stamp : null,
                current.id,
              );
              db.exec("COMMIT");
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
            return json(res, 200, get(current.id));
          }
        }
        if (path === "/api/attachments" && method === "POST") {
          const bytes = await body(req, 10 * 1024 * 1024, true);
          let type;
          if (
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            type = ["png", "image/png"];
          else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
            type = ["jpg", "image/jpeg"];
          else if (
            ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())
          )
            type = ["gif", "image/gif"];
          else if (
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          )
            type = ["webp", "image/webp"];
          if (!type) fail(400, "支持 JPG、PNG、GIF 和 WebP 图片，最大 10 MB");
          const id = randomUUID() + "." + type[0];
          writeFileSync(join(dataDir, "attachments", id), bytes);
          db.prepare("INSERT INTO attachments VALUES(?,?,?)").run(
            id,
            type[1],
            now(),
          );
          return json(res, 201, { src: "/api/attachments/" + id });
        }
        const attachment = path.match(
          /^\/api\/attachments\/([a-f0-9-]+\.(?:png|jpg|gif|webp))$/,
        );
        if (attachment && method === "GET") {
          const row = db
            .prepare("SELECT * FROM attachments WHERE id=?")
            .get(attachment[1]);
          if (!row) fail(404, "图片不存在");
          res.writeHead(200, {
            "Content-Type": row.mime,
            "Cache-Control": "private, max-age=86400",
          });
          return res.end(readFileSync(join(dataDir, "attachments", row.id)));
        }
        if (path === "/api/export" && method === "GET") {
          // Capture the database before collecting immutable attachments so a
          // concurrent image upload cannot create a missing file in the archive.
          const backupBytes =
            url.searchParams.get("backup") === "1"
              ? readFileSync(await makeBackup())
              : null;
          const entries = db
            .prepare("SELECT * FROM entries ORDER BY date")
            .all()
            .map(decode);
          const files = {
            "journal.json": strToU8(
              JSON.stringify(
                { format: 1, exported_at: now(), entries },
                null,
                2,
              ),
            ),
          };
          for (const e of entries)
            files[
              `${e.deleted_at ? "trash/" : ""}${e.date}-${e.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 70) || "无标题"}-${e.id}.md`
            ] = strToU8(
              `# ${e.title || "无标题"}\n\n日期：${e.date}\n标签：${e.tags.join("、")}\n\n${markdown(e.body).replaceAll("](attachments/", e.deleted_at ? "](../attachments/" : "](attachments/")}`,
            );
          for (const a of readdirSync(join(dataDir, "attachments")))
            files["attachments/" + a] = readFileSync(
              join(dataDir, "attachments", a),
            );
          if (backupBytes) files["diary.sqlite"] = backupBytes;
          const zipped = zipSync(files, { level: 6 });
          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="yejian-${now().slice(0, 10)}.zip"`,
            "Cache-Control": "no-store",
          });
          return res.end(zipped);
        }
        fail(404, "接口不存在");
      }
      if (!["GET", "HEAD"].includes(method)) fail(405, "不支持此操作");
      const dist = join(root, "dist");
      const decoded = decodeURIComponent(path);
      let target = resolve(dist, "." + decoded);
      if (target !== dist && !target.startsWith(dist + sep))
        fail(403, "路径不可访问");
      if (!existsSync(target) || !statSync(target).isFile())
        target = join(dist, "index.html");
      if (!existsSync(target))
        return json(res, 503, {
          error: "请先运行 pnpm build，或启动前端开发服务",
        });
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
        }[extname(target)] || "application/octet-stream";
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control":
          extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(method === "HEAD" ? undefined : readFileSync(target));
    } catch (e) {
      if (!res.headersSent)
        json(res, e.status || 500, {
          error: e.status ? e.message : "服务暂时不可用，请稍后重试",
        });
      else res.end();
      if (!e.status) console.error(e);
    }
  });
  return {
    server,
    db,
    close: async () => {
      if (backupTimer) clearInterval(backupTimer);
      await new Promise((r) => server.close(r));
      if (backupInFlight) await backupInFlight;
      db.close();
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "127.0.0.1";
  app.server.listen(port, host, () =>
    console.log(`页间正在运行：http://${host}:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
