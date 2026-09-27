import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const path = resolve(process.env.DATA_DIR || "data", "diary.sqlite");
if (!existsSync(path)) throw new Error("没有找到数据库，请检查 DATA_DIR");
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("请先停止日记服务并备份数据库。本地终端会显示输入的密码。");
const password = await rl.question("新密码（8–200 个字符）：");
const again = await rl.question("再次输入新密码：");
rl.close();
if (password.length < 8 || password.length > 200 || password !== again)
  throw new Error("密码长度不正确或两次输入不一致，未作修改");
const db = new DatabaseSync(path),
  salt = randomBytes(16).toString("hex");
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT OR REPLACE INTO settings VALUES('password',?)").run(
    salt + ":" + scryptSync(password, salt, 64).toString("hex"),
  );
  db.exec("DELETE FROM sessions; COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
console.log("密码已更新，所有旧登录会话已失效。");
