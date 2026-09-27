# 页间 · 私人日记

一个为 NAS 局域网使用设计的日记网站。界面参考 Notion 的侧栏与文档编辑方式，使用 React、TypeScript、Tiptap、Node.js 24 和 SQLite。无需第三方云服务，运行时不依赖 CDN、在线字体或外部 API。

## 已有功能

- 首次设置空间密码、登录和退出登录。
- 所见即所得编辑：标题、加粗、斜体、列表、待办、引用、图片粘贴与拖入。
- 800ms 防抖自动保存；浏览器临时草稿恢复；多标签页乐观锁冲突检测和另存草稿。
- 日历、日期、标签、心情、收藏、标题与正文搜索。
- 回收站、恢复日记、历史版本恢复。
- Markdown / JSON / 图片 ZIP 导出，以及包含 SQLite 的完整备份。
- 启动时及每 6 小时进行 SQLite 在线备份，同一天更新同一个快照，保留最近 14 个备份日期。

浏览器不是完整的离线客户端：首次打开、登录、新建日记和查看未加载的图片需要连接服务器。本地草稿仅作意外断线兜底；服务器确认成功后才显示“已保存”。清理浏览器数据会删除尚未提交的草稿。

## GitHub 自动构建 → NAS 拉取

目标仓库：`https://github.com/FuyushibaKyosu/diary`。构建方式沿用本地 Kikoeru 项目的 GitHub Actions → GHCR → NAS 流程。默认构建 `linux/amd64`，适合现有 x86_64 NAS；NAS 无须安装 Node.js、pnpm 或复制整个源码。

`.github/workflows/docker-build.yml` 的执行流程：

1. 推送到 `main` / `master`、推送 `v*` 标签、提交 PR 或在 Actions 页面手动运行。
2. 先安装锁定依赖并运行数据保存、冲突和恢复测试。
3. 构建生产 Docker 镜像并实际启动临时容器，验证网页、认证、可写数据库与完整备份。
4. 测试通过后，默认分支与 `v*` 标签才发布镜像。PR 只检查，不登录镜像仓库、不发布。

发布地址为 `ghcr.io/fuyushibakyosu/diary`，自动从仓库全名生成并转为小写：

| 标签              | 用途                                                     |
| ----------------- | -------------------------------------------------------- |
| `latest`          | 默认分支最新通过测试的版本                               |
| `sha-完整提交SHA` | 按具体提交固定版本，便于回退                             |
| `v0.1.0` 等       | 推送对应 Git 标签时生成；不会意外覆盖默认分支的 `latest` |
| `@sha256:…`       | 每次构建摘要中提供的不可变镜像引用                       |

GHCR 使用 Actions 自带的 `GITHUB_TOKEN`，工作流已声明 `packages: write`。不需要把日记密码或 NAS 账号提交到 GitHub。若组织策略禁用了写包权限，需要管理员允许工作流发布包。

**可选 Docker Hub：**像 Kikoeru 一样，在仓库 Actions Secrets 中配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 后同时推送；只有两个密钥均存在才启用。默认镜像名跟随仓库名 `diary`，可以用仓库变量 `DOCKERHUB_IMAGE_NAME` 修改。日常只用 GHCR 时无需配置。

**可选 ARM64：**把仓库 Actions 变量 `IMAGE_PLATFORMS` 设为 `linux/amd64,linux/arm64`。当前容器启动检查在 amd64 上执行，arm64 版本仍应在对应设备上验收。

### 首次部署到 NAS

先确认 GitHub Actions 构建成功。把 `compose.yaml` 和 `.env.example` 放到 NAS 的应用目录，将 `.env.example` 复制为 `.env`。编辑 `.env`，将 `DIARY_DATA_DIR` 改为 NAS 上日记专用数据目录的绝对路径（不要与 Kikoeru 共用数据目录）。以下是使用相对路径的命令行示例：

```sh
cp .env.example .env
mkdir -p data
sudo chown -R 1000:1000 data
docker compose pull
docker compose up -d
```

如 NAS 图形界面不支持 `.env` 替换，可直接在 Compose 中填写实际镜像地址、端口与数据路径。

新建的 GHCR 包可能是私有的。私有镜像需要先在 NAS 上 `docker login ghcr.io -u FuyushibaKyosu`，交互输入有 `read:packages` 权限的凭据；不要把 token 写进 Compose 或提交到仓库。也可自行把镜像包改为公开以免登录拉取，源码仓库与镜像包的公开状态分别管理。

容器以非 root 的 `node` 用户（UID 1000）运行。数据目录需要该用户可写；也可以在 Compose 中设置适合自己 NAS 的 `user: "UID:GID"`，并确保目录权限匹配。只对本项目新建的 `data` 目录调整权限。

打开 `http://NAS的IP:8787`，第一次访问会要求创建密码。完成初始化后其他设备访问需要同一个密码。请先在自己的可信局域网完成初始化。Compose 的端口只应开放在所需的局域网范围，避免路由器转发到公网。

### 更新与回退

代码推送触发 GitHub 构建。NAS 更新前先下载完整备份，然后执行：

```sh
docker compose pull
docker compose up -d
```

数据目录保持不变。需要回退时，将 `.env` 中的 `DIARY_IMAGE` 改为上一个 `sha-…` 标签或镜像摘要，再执行上述命令。自动构建镜像不等于自动更新 NAS；本项目不添加无人值守更新器。

### 本地 Docker 构建（可选）

如果希望跳过 GitHub，在有 Docker 的开发机上执行 `docker compose -f compose.build.yaml up -d --build`。该配置与 NAS 拉取配置分开，避免 NAS 意外进行源码构建。

### HTTPS 与反向代理

可使用 NAS 已有的反向代理终止 HTTPS。设置 Compose 中的 `APP_ORIGIN` 为浏览器实际访问的完整源地址（如 `https://diary.example.com`，不带尾斜线），并设置 `COOKIE_SECURE: "true"`。如果仍用局域网 HTTP，请勿启用 Secure Cookie，否则浏览器不会发送登录凭据。反向代理必须转发相同路径和 Cookie，上传限制至少为 10 MB。

### 环境变量

| 变量             | 默认值                           | 用途                                                    |
| ---------------- | -------------------------------- | ------------------------------------------------------- |
| `PORT`           | `8787`                           | 服务监听端口                                            |
| `HOST`           | 本地 `127.0.0.1`；容器 `0.0.0.0` | 监听地址                                                |
| `DATA_DIR`       | 本地 `./data`；容器 `/data`      | 数据目录                                                |
| `APP_ORIGIN`     | 请求的 Host                      | 反向代理场景的请求来源校验                              |
| `COOKIE_SECURE`  | 关闭                             | HTTPS 场景设为 `true`                                   |
| `DIARY_PASSWORD` | 未设置                           | 可选：首次启动预设密码（至少 8 字符）；已有密码时不覆盖 |

## 数据与恢复

```text
data/
  diary.sqlite           # 日记、历史版本、账户和登录会话
  diary.sqlite-wal       # SQLite 运行时事务文件，不要单独删除
  diary.sqlite-shm
  attachments/           # 原始图片
  backups/               # 自动生成的一致性数据库快照
```

自动快照只包含数据库，附件仍在 `attachments` 目录中，当前版本不会自动删除附件。自动快照与原数据在同一硬盘上，不能防止硬盘损坏。请在“设置与备份”下载完整备份，或对整个持久化目录做 NAS 备份并另存。

**完整备份恢复步骤：**

1. 停止容器：`docker compose stop`。
2. 将原来的整个 `data` 目录改名保存，创建一个全新的空 `data` 目录。不要直接覆盖正在运行的数据库，也不要混入旧的 WAL / SHM 文件。
3. 把完整备份 ZIP 中的 `diary.sqlite` 与 `attachments/` 解压到新 `data` 目录，调整为容器用户可读写。
4. `docker compose up -d`。使用备份时的密码登录。

完整备份包含日记、历史、密码哈希及登录会话，应按私人文件保管。普通导出提供 Markdown、JSON 和附件，不含登录信息，但当前版本没有导入界面；灾难恢复请使用完整备份。

### 忘记密码

先停止服务并备份数据库。NAS 使用 `docker compose run --rm diary node server/reset-password.mjs`，本地源码使用 `node server/reset-password.mjs`，根据提示设置新密码，随后重启服务。这是需要服务器文件访问权限的管理员操作，不通过网页开放。

## 本地开发

需要 Node.js **24.14 或更新的 24.x** 与 pnpm **11.25.0**。Node 24 的内置 SQLite 可能显示实验性警告；项目固定容器运行时并通过集成测试验证所使用的 API。

```sh
pnpm install
pnpm server
# 另一个终端
pnpm dev
```

开发前端通常运行在 `http://127.0.0.1:5173`，API 代理到 `127.0.0.1:8787`。生产方式本地预览：

```sh
pnpm build
pnpm start
```

打开 `http://127.0.0.1:8787`。

```sh
pnpm test
```

测试使用独立临时目录，覆盖认证、越权访问、来源校验、自动保存 API、版本冲突、删除恢复、历史版本、图片、备份完整性、重启持久化与备份恢复。

## 当前边界

- 单用户空间，尚无多人权限、端到端加密或离线同步。
- 列表及搜索当前加载全部正文，适用于个人日记的小规模使用；大量图片导出暂时在内存中生成 ZIP。
- 历史版本当前全部保留；长时间使用后可按需求增加历史保留策略。
- 容器配置已提供，是否能在具体 NAS 的 Docker / 架构上运行仍需现场部署验证。
