import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  BookOpen,
  Search,
  Plus,
  CalendarDays,
  Star,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Hash,
  FileText,
  MoreHorizontal,
  Check,
  Cloud,
  ArrowUpRight,
  PanelLeftClose,
  Menu,
  X,
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Quote,
  ImagePlus,
  Undo2,
  Redo2,
  History,
  Download,
  LogOut,
  LockKeyhole,
  ArrowRight,
  LoaderCircle,
  AlertCircle,
  RotateCcw,
  Minus,
  NotebookPen,
  Smile,
  FolderOpen,
} from "lucide-react";
import "./styles.css";
import { draftStore, type LocalDraft } from "./drafts";
import { useSlashMenu } from "./SlashMenu";
import { DatePicker, MoodPicker } from "./PropertyPickers";

type Entry = {
  id: string;
  title: string;
  body: JSONContent;
  plain: string;
  date: string;
  tags: string[];
  mood: string;
  favorite: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type View = "all" | "calendar" | "favorites" | "trash" | "tag";
type HistoryItem = { id: string; created_at: string; snapshot: Entry };
const localDrafts = (() => {
  try {
    const owner = Array.from(crypto.getRandomValues(new Uint32Array(4))).join(
      "-",
    );
    const previous = sessionStorage.getItem("yejian-page-owner") || "";
    sessionStorage.setItem("yejian-page-owner", owner);
    return draftStore<Entry>(localStorage, owner, previous);
  } catch {
    return null;
  }
})();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateLabel = (
  s: string,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    weekday: "long",
  },
) => new Date(s + "T12:00:00").toLocaleDateString("zh-CN", options);
const textOf = (node: JSONContent): string =>
  node.text ||
  (node.content || []).map(textOf).join(node.type === "doc" ? "\n" : "");
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "网络连接失败" }));
    throw Object.assign(new Error(data.error), { status: res.status });
  }
  return res.json();
}
function IconButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={"icon-button" + (active ? " active" : "")}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal" + (wide ? " wide" : "")}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton label="关闭" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Auth({
  configured,
  onLogin,
}: {
  configured: boolean;
  onLogin: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <BookOpen size={24} />
        <span>页间</span>
        <small>YEJIAN</small>
      </div>
      <main className="auth-card">
        <div className="auth-symbol">
          <NotebookPen size={38} strokeWidth={1.3} />
        </div>
        <p className="eyebrow">YOUR PERSONAL JOURNAL</p>
        <h1>{configured ? "回到你的日常" : "为日常，留一页"}</h1>
        <p className="auth-description">
          {configured
            ? "那些写下的片刻，都在这里。"
            : "一个安静的地方，收好你的生活与想法。"}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(configured ? "/login" : "/setup", {
                method: "POST",
                body: JSON.stringify({ password, date: today() }),
              });
              onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="password">
            {configured ? "空间密码" : "设置空间密码"}
          </label>
          <div className="password-field">
            <LockKeyhole size={17} />
            <input
              id="password"
              type="password"
              minLength={8}
              maxLength={200}
              autoComplete={configured ? "current-password" : "new-password"}
              placeholder="至少 8 个字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          {!configured && (
            <p className="field-hint">
              这个密码用于登录你的私人日记空间，请妥善保存。
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : configured ? (
              "进入日记空间"
            ) : (
              "创建我的日记空间"
            )}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-note">
          <LockKeyhole size={13} /> 数据保存在你部署的服务器上
        </p>
      </main>
      <footer>页间 · 把平常的日子，好好收藏</footer>
    </div>
  );
}
function DiaryEditor({
  entry,
  onChange,
  onError,
  readOnly,
}: {
  entry: Entry;
  onChange: (body: JSONContent) => void;
  onError: (message: string) => void;
  readOnly: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    onChangeRef = useRef(onChange),
    errorRef = useRef(onError);
  onChangeRef.current = onChange;
  errorRef.current = onError;
  const [uploading, setUploading] = useState(false),
    [formatting, setFormatting] = useState(false),
    [, setTick] = useState(0);
  const slashKeyDown = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "写点什么，或输入 / 选择区块……" }),
    ],
    content: entry.body,
    editable: !readOnly,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
    onSelectionUpdate: () => setTick((t) => t + 1),
    editorProps: {
      handleKeyDown: (_view, event) => slashKeyDown.current(event),
      attributes: {
        "aria-label": "日记正文",
        role: "textbox",
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) {
          void upload(files);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) {
          event.preventDefault();
          void upload(files);
          return true;
        }
        return false;
      },
    },
  });
  const slash = useSlashMenu(editor, () => fileRef.current?.click());
  slashKeyDown.current = slash.handleKeyDown;
  async function upload(files: File[]) {
    if (readOnly) return;
    setUploading(true);
    try {
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024)
          throw new Error("单张图片不能超过 10 MB");
        const result = await api<{ src: string }>("/attachments", {
          method: "POST",
          body: f,
          headers: { "Content-Type": f.type },
        });
        editor
          ?.chain()
          .focus()
          .setImage({ src: result.src, alt: f.name })
          .run();
      }
    } catch (e) {
      errorRef.current((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  if (!editor) return null;
  return (
    <>
      {!readOnly && (
        <div className="editor-controls">
          <span>{uploading ? "正在上传图片…" : "输入 / 添加区块"}</span>
          <button
            type="button"
            aria-expanded={formatting}
            onClick={() => setFormatting(!formatting)}
          >
            Aa <span>文字格式</span>
          </button>
        </div>
      )}
      <div
        className={
          "editor-toolbar" + (readOnly || !formatting ? " readonly" : "")
        }
        aria-label="文本格式"
      >
        <IconButton
          label="加粗 (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </IconButton>
        <IconButton
          label="斜体 (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton
          label="二级标题"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={18} />
        </IconButton>
        <IconButton
          label="项目列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </IconButton>
        <IconButton
          label="待办清单"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks size={18} />
        </IconButton>
        <IconButton
          label="引用"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </IconButton>
        <IconButton
          label="分隔线"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={17} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton
          label="插入图片"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <ImagePlus size={17} />
          )}
        </IconButton>
        <span className="toolbar-spacer" />
        <IconButton
          label="撤销"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          label="重做"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
      <EditorContent className="editor-content" editor={editor} />
      {slash.menu}
      <div className="editor-foot">
        <span>
          {textOf(entry.body).replace(/\s/g, "").length.toLocaleString()} 字
        </span>
        <span>
          {readOnly ? "恢复后可以继续编辑" : "自动保存 · / 区块 · 支持粘贴图片"}
        </span>
      </div>
    </>
  );
}
function App() {
  useEffect(() => {
    // Text inputs can match :focus-visible after a click, so track Tab navigation.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        document.documentElement.dataset.focusMode = "keyboard";
      }
    };
    const onPointerDown = () => {
      document.documentElement.dataset.focusMode = "pointer";
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  const [auth, setAuth] = useState<{
      configured: boolean;
      authenticated: boolean;
    } | null>(null),
    [bootError, setBootError] = useState("");
  const [entries, setEntriesState] = useState<Entry[]>([]),
    [draft, setDraft] = useState<Entry | null>(null),
    [view, setView] = useState<View>("all"),
    [tag, setTag] = useState(""),
    [query, setQuery] = useState("");
  const [modal, setModal] = useState<
      "search" | "settings" | "history" | "drafts" | null
    >(null),
    [toast, setToast] = useState(""),
    [saveState, setSaveState] = useState("saved"),
    [saveError, setSaveError] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [menu, setMenu] = useState(false),
    [tagInput, setTagInput] = useState(""),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [historyLoading, setHistoryLoading] = useState(false),
    [editorKey, setEditorKey] = useState(0),
    [month, setMonth] = useState(today().slice(0, 7)),
    [backupBusy, setBackupBusy] = useState(false);
  const [recoverableDrafts, setRecoverableDrafts] = useState<
    LocalDraft<Entry>[]
  >([]);
  const entriesRef = useRef<Entry[]>([]);
  // Async navigation must use the latest acknowledged server versions, even
  // before React has rendered a state update from an in-flight save.
  function setEntries(value: Entry[] | ((previous: Entry[]) => Entry[])) {
    const next =
      typeof value === "function" ? value(entriesRef.current) : value;
    entriesRef.current = next;
    setEntriesState(next);
  }
  const current = useRef<Entry | null>(null),
    dirty = useRef(false),
    version = useRef(0),
    inFlight = useRef<Promise<boolean> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    fatal = useRef(false),
    searchRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const loadAuth = useCallback(() => {
    setBootError("");
    setAuth(null);
    api<{ configured: boolean; authenticated: boolean }>("/auth")
      .then(setAuth)
      .catch((e) => setBootError(e.message));
  }, []);
  useEffect(loadAuth, [loadAuth]);
  function showEntry(entry: Entry) {
    entry = entriesRef.current.find((item) => item.id === entry.id) || entry;
    let value = entry;
    setSaveError("");
    fatal.current = false;
    dirty.current = false;
    try {
      const restored = localDrafts?.read(entry.id);
      if (restored) {
        if (
          restored.id === entry.id &&
          typeof restored.title === "string" &&
          restored.body?.type === "doc"
        ) {
          value = restored;
          dirty.current = true;
          notify("已恢复这台浏览器中尚未保存的草稿");
        }
      }
    } catch {
      notify("本地草稿无法读取，请检查浏览器存储设置");
    }
    current.current = value;
    version.current++;
    setDraft(value);
    setEditorKey((k) => k + 1);
    setSaveState(dirty.current ? "pending" : "saved");
    setTagInput("");
    setMenu(false);
    if (dirty.current) timer.current = setTimeout(() => void flush(), 900);
  }
  useEffect(() => {
    if (auth?.authenticated) {
      api<Entry[]>("/entries")
        .then((data) => {
          setEntries(data);
          const first = data.find((e) => !e.deleted_at);
          if (first) showEntry(first);
          if (localDrafts?.list().length)
            notify("此浏览器有未保存的草稿，可在「设置与备份」中恢复");
        })
        .catch((e) => setBootError(e.message));
    }
  }, [auth?.authenticated]);
  const remember = (e: Entry) => {
    try {
      if (!localDrafts) throw new Error("storage unavailable");
      localDrafts.write(e);
    } catch {
      notify("浏览器草稿存储不可用，请保持页面打开直到保存成功");
    }
  };
  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!dirty.current || !current.current) return true;
    if (fatal.current) return false;
    const promise = (async () => {
      while (dirty.current && current.current) {
        const snapshot = current.current,
          stamp = version.current;
        setSaveState("saving");
        try {
          const saved = await api<Entry>("/entries/" + snapshot.id, {
            method: "PUT",
            body: JSON.stringify({
              ...snapshot,
              deleted_at: snapshot.deleted_at ? true : null,
            }),
          });
          setEntries((all) => all.map((e) => (e.id === saved.id ? saved : e)));
          if (current.current?.id === snapshot.id) {
            const updated = {
              ...current.current,
              revision: saved.revision,
              updated_at: saved.updated_at,
            };
            current.current = updated;
            setDraft(updated);
            if (version.current === stamp) {
              dirty.current = false;
              try {
                localDrafts?.remove(snapshot.id);
              } catch {}
            } else remember(updated);
          }
          setSaveError("");
          setSaveState("saved");
        } catch (e) {
          const err = e as Error & { status?: number };
          if (err.status === 409) fatal.current = true;
          if (err.status === 401)
            setAuth({ configured: true, authenticated: false });
          setSaveState("error");
          setSaveError(err.message);
          return false;
        }
      }
      return true;
    })();
    inFlight.current = promise;
    try {
      return await promise;
    } finally {
      inFlight.current = null;
    }
  }
  function edit(patch: Partial<Entry>) {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setDraft(next);
    dirty.current = true;
    version.current++;
    remember(next);
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const online = () => {
      if (!fatal.current) void flush();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const select = async (e: Entry) => {
    if (view === "calendar" && e.id === current.current?.id) setView("all");
    if (e.id === current.current?.id) {
      setSidebar(false);
      return;
    }
    if (await flush()) {
      if (view === "calendar") setView("all");
      showEntry(e);
      setSidebar(false);
    }
  };
  const changeView = async (next: View, t = "") => {
    if (!(await flush())) return;
    setView(next);
    setTag(t);
    if (next === "calendar") setSidebar(false);
    setQuery("");
    if (next !== "calendar") {
      const first = entriesRef.current.find((e) =>
        next === "trash"
          ? !!e.deleted_at
          : !e.deleted_at &&
            (next !== "favorites" || e.favorite) &&
            (next !== "tag" || e.tags.includes(t)),
      );
      if (first) showEntry(first);
      else {
        current.current = null;
        setDraft(null);
      }
    }
  };
  async function create(date = today()) {
    if (!(await flush())) return;
    try {
      const e = await api<Entry>("/entries", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setEntries((all) => [e, ...all]);
      // An edit could happen while the create request was on the network.
      // Keep that edit acknowledged before switching to the new document.
      if (!(await flush())) return;
      setView("all");
      setSidebar(false);
      showEntry(e);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function trash(restore = false) {
    edit({ deleted_at: restore ? null : new Date().toISOString() });
    if (await flush()) {
      notify(restore ? "日记已恢复" : "已移到回收站，可以随时恢复");
      setMenu(false);
      if (!restore) {
        const other = entriesRef.current.find(
          (e) => e.id !== current.current?.id && !e.deleted_at,
        );
        if (other) showEntry(other);
        else {
          current.current = null;
          setDraft(null);
        }
      } else {
        setView("all");
      }
    }
  }
  async function saveCopy(source = current.current, sourceKey?: string) {
    if (!source) return;
    if (
      sourceKey &&
      sourceKey !== localDrafts?.key(current.current?.id || "") &&
      !(await flush())
    )
      return;
    try {
      const fresh = await api<Entry>("/entries", {
        method: "POST",
        body: JSON.stringify({ date: source.date }),
      });
      const copy = await api<Entry>("/entries/" + fresh.id, {
        method: "PUT",
        body: JSON.stringify({
          ...source,
          id: fresh.id,
          title: (source.title || "无标题") + "（恢复的草稿）",
          revision: fresh.revision,
          deleted_at: null,
        }),
      });
      try {
        if (sourceKey) localDrafts?.removeKey(sourceKey);
        else localDrafts?.remove(source.id);
      } catch {}
      dirty.current = false;
      fatal.current = false;
      const all = await api<Entry[]>("/entries");
      setEntries(all);
      showEntry(copy);
      setView("all");
      setModal(null);
      notify("草稿已另存为新日记，原日记保持不变");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function openHistory() {
    if (!draft || !(await flush())) return;
    setModal("history");
    setHistoryLoading(true);
    try {
      setHistory(await api<HistoryItem[]>("/entries/" + draft.id + "/history"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  async function download(backup = false) {
    setBackupBusy(true);
    try {
      if (!(await flush())) return;
      const response = await fetch("/api/export" + (backup ? "?backup=1" : ""));
      if (!response.ok) throw new Error("导出失败，请检查登录状态和网络");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `页间-${backup ? "完整备份" : "日记导出"}-${today()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("文件已导出");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }
  const activeEntries = entries.filter((e) => !e.deleted_at),
    tags = [...new Set(activeEntries.flatMap((e) => e.tags))].sort();
  const visible = entries
    .filter((e) =>
      view === "trash"
        ? !!e.deleted_at
        : !e.deleted_at &&
          (view !== "favorites" || e.favorite) &&
          (view !== "tag" || e.tags.includes(tag)),
    )
    .filter((e) =>
      (e.title + " " + e.plain + " " + e.tags.join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const title =
    view === "favorites"
      ? "我的收藏"
      : view === "trash"
        ? "回收站"
        : view === "calendar"
          ? "日历"
          : view === "tag"
            ? tag
            : "全部日记";
  const pending = saveState === "saving" || saveState === "pending";
  if (bootError)
    return (
      <div className="boot">
        <Cloud size={32} />
        <h2>暂时无法连接日记空间</h2>
        <p>{bootError}</p>
        <button className="primary" onClick={loadAuth}>
          重新连接
        </button>
      </div>
    );
  if (!auth)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <p>正在打开日记空间…</p>
      </div>
    );
  if (!auth.authenticated)
    return <Auth configured={auth.configured} onLogin={loadAuth} />;
  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="收起导航"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        id="diary-sidebar"
        aria-label="日记导航"
        className={
          "sidebar" +
          (sidebar ? " open" : "") +
          (sidebarCollapsed ? " collapsed" : "")
        }
      >
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={23} strokeWidth={1.6} />
          </div>
          <div>
            <strong>页间</strong>
            <span>我的私人空间</span>
          </div>
          <IconButton
            label="收起侧栏"
            onClick={() => {
              setSidebar(false);
              setSidebarCollapsed(true);
            }}
          >
            <PanelLeftClose size={17} />
          </IconButton>
        </div>
        <button
          className="search-trigger"
          onClick={() => {
            setQuery("");
            setModal("search");
          }}
        >
          <Search size={17} />
          <span>搜索日记</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="new-entry" onClick={() => void create()}>
          <Plus size={17} />
          写日记<span>＋</span>
        </button>
        <div className="sidebar-scroll">
          <nav>
            {(
              [
                {
                  key: "all",
                  label: "全部日记",
                  icon: BookOpen,
                  count: activeEntries.length,
                },
                { key: "calendar", label: "日历", icon: CalendarDays },
                {
                  key: "favorites",
                  label: "我的收藏",
                  icon: Star,
                  count: activeEntries.filter((e) => e.favorite).length,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                className={"nav-item" + (view === item.key ? " selected" : "")}
                onClick={() => void changeView(item.key)}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {"count" in item && <small>{item.count}</small>}
              </button>
            ))}
          </nav>
          <details className="tag-section">
            <summary className="nav-section-title tags-heading">
              我的标签 <ChevronRight size={13} />
            </summary>
            <div className="sidebar-tags">
              {tags.length ? (
                tags.map((t) => (
                  <button
                    key={t}
                    className={
                      "nav-item tag-nav" +
                      (view === "tag" && tag === t ? " selected" : "")
                    }
                    onClick={() => void changeView("tag", t)}
                  >
                    <span className="tag-dot" />
                    <span>{t}</span>
                    <small>
                      {activeEntries.filter((e) => e.tags.includes(t)).length}
                    </small>
                  </button>
                ))
              ) : (
                <p className="sidebar-hint">
                  给日记加一个标签
                  <br />
                  让回忆更容易找到
                </p>
              )}
            </div>
          </details>
          <section className="sidebar-entries" aria-label="日记列表">
            <div className="entry-panel-head">
              <div>
                <h2>{view === "calendar" ? "全部日记" : title}</h2>
                <span>{visible.length} 篇记录</span>
              </div>
              <IconButton label="新建日记" onClick={() => void create()}>
                <Plus size={19} />
              </IconButton>
            </div>
            <label className="list-search">
              <Search size={15} />
              <input
                aria-label="筛选日记"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="筛选日记…"
              />
            </label>
            <div className="entry-list">
              {visible.map((e, i) => (
                <React.Fragment key={e.id}>
                  {(i === 0 ||
                    e.date.slice(0, 7) !== visible[i - 1].date.slice(0, 7)) && (
                    <div className="month-label">
                      {dateLabel(e.date, { year: "numeric", month: "long" })}
                    </div>
                  )}
                  <button
                    className={
                      "entry-card" +
                      (draft?.id === e.id && view !== "calendar"
                        ? " selected"
                        : "")
                    }
                    aria-current={
                      draft?.id === e.id && view !== "calendar"
                        ? "page"
                        : undefined
                    }
                    title={e.title || "无标题日记"}
                    onClick={() => void select(e)}
                  >
                    <div className="entry-card-title">
                      <FileText size={15} />
                      <strong>
                        {e.id === draft?.id
                          ? draft.title || "无标题日记"
                          : e.title || "无标题日记"}
                      </strong>
                      {e.favorite && <Star size={12} fill="currentColor" />}
                    </div>
                    <time className="entry-date">
                      {dateLabel(e.date, { month: "numeric", day: "numeric" })}
                    </time>
                  </button>
                </React.Fragment>
              ))}
              {!visible.length && (
                <div className="list-empty">
                  <FolderOpen size={27} strokeWidth={1.3} />
                  <p>
                    {query
                      ? "没有匹配的日记"
                      : view === "trash"
                        ? "回收站是空的"
                        : "这里还没有日记"}
                  </p>
                  {!query && view === "all" && (
                    <button onClick={() => void create()}>
                      写下第一篇 <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="sidebar-bottom">
          <button
            className={"nav-item" + (view === "trash" ? " selected" : "")}
            onClick={() => void changeView("trash")}
          >
            <Trash2 size={17} />
            <span>回收站</span>
          </button>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings size={17} />
            <span>设置与备份</span>
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className={
                "mobile-menu icon-button" +
                (sidebarCollapsed ? " desktop-visible" : "")
              }
              aria-label="展开导航"
              aria-controls="diary-sidebar"
              onClick={() => {
                setSidebarCollapsed(false);
                setSidebar(true);
              }}
            >
              <Menu size={19} />
            </button>
            <span className="breadcrumb-home">私人空间</span>
            <ChevronRight size={13} />
            <button
              onClick={() => {
                setSidebarCollapsed(false);
                setSidebar(true);
              }}
            >
              {title}
            </button>
            {draft && view !== "calendar" && (
              <>
                <ChevronRight size={13} />
                <span className="breadcrumb-title">
                  {draft.title || "无标题日记"}
                </span>
              </>
            )}
          </div>
          <div className="top-actions">
            {draft && view !== "calendar" && (
              <>
                <span className={"save-status " + saveState} role="status">
                  {saveState === "saving" ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : saveState === "error" ? (
                    <AlertCircle size={13} />
                  ) : pending ? (
                    <Cloud size={13} />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>
                    {saveState === "saving"
                      ? "保存中…"
                      : saveState === "pending"
                        ? "等待保存"
                        : saveState === "error"
                          ? "尚未保存"
                          : "已保存"}
                  </span>
                </span>
                <IconButton
                  label={draft.favorite ? "取消收藏" : "收藏日记"}
                  active={draft.favorite}
                  disabled={!!draft.deleted_at}
                  onClick={() => edit({ favorite: !draft.favorite })}
                >
                  <Star
                    size={18}
                    fill={draft.favorite ? "currentColor" : "none"}
                  />
                </IconButton>
                <div className="menu-wrap">
                  <IconButton label="日记操作" onClick={() => setMenu(!menu)}>
                    <MoreHorizontal size={21} />
                  </IconButton>
                  {menu && (
                    <>
                      <button
                        className="menu-backdrop"
                        aria-label="关闭操作菜单"
                        onClick={() => setMenu(false)}
                      />
                      <div className="dropdown">
                        <button
                          onClick={() => {
                            setMenu(false);
                            void openHistory();
                          }}
                        >
                          <History size={16} />
                          历史版本
                        </button>
                        <button
                          onClick={() => {
                            setMenu(false);
                            void download();
                          }}
                        >
                          <Download size={16} />
                          导出全部日记
                        </button>
                        {!draft.deleted_at && (
                          <button
                            className="danger"
                            onClick={() => void trash()}
                          >
                            <Trash2 size={16} />
                            移到回收站
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </header>
        {view === "calendar" ? (
          <CalendarView
            month={month}
            setMonth={setMonth}
            entries={activeEntries}
            onSelect={async (e) => {
              if (await flush()) {
                setView("all");
                showEntry(e);
              }
            }}
            onCreate={create}
          />
        ) : (
          <div className="writing-workspace">
            <section className="document-panel">
              {draft ? (
                <>
                  <div className="document-scroll">
                    {saveError && (
                      <div className="save-error" role="alert">
                        <AlertCircle size={17} />
                        <div>
                          <strong>你的修改还没有保存到服务器</strong>
                          <p>{saveError}</p>
                          <div className="error-actions">
                            <button
                              onClick={() => {
                                fatal.current = false;
                                void flush();
                              }}
                            >
                              重试保存
                            </button>
                            <button onClick={() => void saveCopy()}>
                              另存为新日记
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {draft.deleted_at && (
                      <div className="trash-banner">
                        <Trash2 size={16} />
                        <span>这篇日记在回收站中</span>
                        <button onClick={() => void trash(true)}>
                          <RotateCcw size={14} />
                          恢复日记
                        </button>
                      </div>
                    )}
                    <article className="document">
                      <input
                        className="document-title"
                        aria-label="日记标题"
                        placeholder="无标题日记"
                        value={draft.title}
                        maxLength={300}
                        readOnly={!!draft.deleted_at}
                        onChange={(e) => edit({ title: e.target.value })}
                      />
                      <div className="properties">
                        <div className="property-row">
                          <span className="property-label">
                            <CalendarDays size={15} />
                            日期
                          </span>
                          <DatePicker
                            key={`date-${draft.id}`}
                            value={draft.date}
                            disabled={!!draft.deleted_at}
                            onChange={(date) => edit({ date })}
                          />
                        </div>
                        <div className="property-row">
                          <span className="property-label">
                            <Smile size={15} />
                            心情
                          </span>
                          <MoodPicker
                            key={`mood-${draft.id}`}
                            value={draft.mood}
                            disabled={!!draft.deleted_at}
                            onChange={(mood) => edit({ mood })}
                          />
                        </div>
                        <div className="property-row">
                          <span className="property-label">
                            <Hash size={15} />
                            标签
                          </span>
                          <div className="tags-input">
                            {draft.tags.map((t) => (
                              <span className="tag-chip" key={t}>
                                {t}
                                {!draft.deleted_at && (
                                  <button
                                    aria-label={"移除标签 " + t}
                                    onClick={() =>
                                      edit({
                                        tags: draft.tags.filter((x) => x !== t),
                                      })
                                    }
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </span>
                            ))}
                            {!draft.deleted_at && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const t = tagInput.trim();
                                  if (
                                    t &&
                                    !draft.tags.includes(t) &&
                                    draft.tags.length < 20
                                  )
                                    edit({ tags: [...draft.tags, t] });
                                  setTagInput("");
                                }}
                              >
                                <input
                                  aria-label="添加标签，按回车确认"
                                  placeholder="＋ 添加标签"
                                  value={tagInput}
                                  maxLength={40}
                                  onChange={(e) => setTagInput(e.target.value)}
                                />
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                      <DiaryEditor
                        key={`${draft.id}-${editorKey}`}
                        entry={draft}
                        readOnly={!!draft.deleted_at}
                        onChange={(body) => edit({ body, plain: textOf(body) })}
                        onError={notify}
                      />
                    </article>
                  </div>
                </>
              ) : (
                <div className="document-empty">
                  <div className="empty-book">
                    <BookOpen size={45} strokeWidth={1} />
                  </div>
                  <p className="eyebrow">A LITTLE SPACE FOR YOURSELF</p>
                  <h1>
                    {view === "trash" ? "让回忆慢慢归位" : "留一点时间，给自己"}
                  </h1>
                  <p>
                    {view === "trash"
                      ? "移到回收站的日记会保留在这里。"
                      : "一段想法、一件小事，或今天的心情。"}
                  </p>
                  {view !== "trash" && (
                    <button className="primary" onClick={() => void create()}>
                      <Plus size={17} />
                      写一篇日记
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      {modal === "search" && (
        <Dialog
          title="搜索日记"
          onClose={() => {
            setModal(null);
            setQuery("");
          }}
          wide
        >
          <label className="global-search">
            <Search size={20} />
            <input
              ref={searchRef}
              autoFocus
              placeholder="搜索标题、正文或标签…"
              aria-label="搜索全部日记"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>ESC</kbd>
          </label>
          <div className="search-results">
            {activeEntries
              .filter((e) =>
                (e.title + e.plain + e.tags.join(" "))
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((e) => (
                <button
                  key={e.id}
                  onClick={async () => {
                    if (await flush()) {
                      setModal(null);
                      setQuery("");
                      setView("all");
                      showEntry(e);
                    }
                  }}
                >
                  <FileText size={19} />
                  <div>
                    <strong>{e.title || "无标题日记"}</strong>
                    <p>{e.plain.slice(0, 85) || "暂无正文"}</p>
                  </div>
                  <time>{e.date}</time>
                </button>
              ))}
            {!activeEntries.some((e) =>
              (e.title + e.plain + e.tags.join(" "))
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <p className="modal-empty">没有找到相关日记，试试其他关键词。</p>
            )}
          </div>
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog title="设置与备份" onClose={() => setModal(null)}>
          <div className="settings-intro">
            <div className="brand-icon">
              <BookOpen size={24} />
            </div>
            <div>
              <h3>
                页间 <small>v0.1.0</small>
              </h3>
              <p>
                {activeEntries.length} 篇日记 ·{" "}
                {new Set(activeEntries.map((e) => e.date)).size} 个有记录的日子
              </p>
            </div>
          </div>
          <div className="settings-section">
            <h3>数据与备份</h3>
            <p>
              日记与图片保存在服务器的数据目录。自动数据库快照每 6
              小时生成一次，保留最近 14 个备份日期；图片保留在附件目录。
            </p>
            <button
              className="settings-action"
              disabled={backupBusy}
              onClick={() => void download()}
            >
              <Download size={19} />
              <span>
                <strong>导出日记</strong>
                <small>Markdown、原始数据和全部图片</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              className="settings-action"
              disabled={backupBusy}
              onClick={() => void download(true)}
            >
              <Cloud size={19} />
              <span>
                <strong>{backupBusy ? "正在准备文件…" : "下载完整备份"}</strong>
                <small>包含数据库、历史版本和附件</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <p className="field-hint">
              建议将完整备份另存到其他设备。备份包含私人内容和登录信息，请妥善保管。
            </p>
          </div>
          <div className="settings-section">
            <button
              className="settings-action"
              onClick={() => {
                try {
                  setRecoverableDrafts(localDrafts?.list() || []);
                  setModal("drafts");
                } catch {
                  notify("浏览器草稿存储不可用");
                }
              }}
            >
              <FileText size={19} />
              <span>
                <strong>恢复本地未保存草稿</strong>
                <small>找回断线或关闭页面前留下的内容</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="settings-section">
            <h3>编辑快捷键</h3>
            <div className="shortcut">
              <span>搜索日记</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </div>
            <div className="shortcut">
              <span>立即保存</span>
              <kbd>Ctrl / ⌘ S</kbd>
            </div>
            <div className="shortcut">
              <span>加粗 / 斜体</span>
              <kbd>Ctrl / ⌘ B / I</kbd>
            </div>
          </div>
          <button
            className="logout"
            onClick={async () => {
              if (!(await flush())) return;
              try {
                await api("/logout", { method: "POST" });
                setModal(null);
                setDraft(null);
                current.current = null;
                setEntries([]);
                loadAuth();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
            退出登录
          </button>
        </Dialog>
      )}
      {modal === "drafts" && (
        <Dialog title="本地未保存草稿" onClose={() => setModal(null)}>
          <p className="modal-description">
            恢复时会创建新日记，保留服务器上的原版本。
          </p>
          <div className="history-list">
            {recoverableDrafts.length ? (
              recoverableDrafts.map((d) => (
                <div key={d.key}>
                  <div>
                    <strong>{d.entry.title || "无标题日记"}</strong>
                    <p>{new Date(d.savedAt).toLocaleString("zh-CN")}</p>
                    <small>{textOf(d.entry.body).slice(0, 100)}</small>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => void saveCopy(d.entry, d.key)}
                  >
                    另存恢复
                  </button>
                </div>
              ))
            ) : (
              <p className="modal-empty">没有待恢复的草稿。</p>
            )}
          </div>
        </Dialog>
      )}
      {modal === "history" && (
        <Dialog title="历史版本" onClose={() => setModal(null)}>
          <p className="modal-description">
            每次保存前的版本都会保留，恢复操作也会留下记录。
          </p>
          <div className="history-list">
            {historyLoading ? (
              <p className="modal-empty">正在读取历史版本…</p>
            ) : history.length ? (
              history.map((h) => (
                <div key={h.id}>
                  <div>
                    <strong>{h.snapshot.title || "无标题日记"}</strong>
                    <p>
                      {new Date(h.created_at).toLocaleString("zh-CN")} · 版本{" "}
                      {h.snapshot.revision}
                    </p>
                    <small>
                      {textOf(h.snapshot.body).slice(0, 100) || "空白日记"}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    onClick={async () => {
                      edit({
                        title: h.snapshot.title,
                        body: h.snapshot.body,
                        plain: h.snapshot.plain,
                        date: h.snapshot.date,
                        tags: h.snapshot.tags,
                        mood: h.snapshot.mood,
                      });
                      setEditorKey((k) => k + 1);
                      if (await flush()) {
                        setModal(null);
                        notify("已恢复所选版本");
                      }
                    }}
                  >
                    恢复
                  </button>
                </div>
              ))
            ) : (
              <p className="modal-empty">这篇日记还没有历史版本。</p>
            )}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function CalendarView({
  month,
  setMonth,
  entries,
  onSelect,
  onCreate,
}: {
  month: string;
  setMonth: (m: string) => void;
  entries: Entry[];
  onSelect: (e: Entry) => void;
  onCreate: (d: string) => void;
}) {
  const [year, m] = month.split("-").map(Number),
    first = new Date(year, m - 1, 1),
    offset = (first.getDay() + 6) % 7,
    days = new Date(year, m, 0).getDate();
  const move = (delta: number) => {
    const d = new Date(year, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="calendar-page">
      <div className="calendar-heading">
        <div className="page-emblem">
          <CalendarDays size={30} strokeWidth={1.3} />
        </div>
        <h1>日子，一页一页</h1>
        <p>每一个有记录的日子，都有迹可循。</p>
      </div>
      <div className="calendar-controls">
        <h2>
          {year} 年 {m} 月
        </h2>
        <div>
          <button
            className="secondary"
            onClick={() => setMonth(today().slice(0, 7))}
          >
            今天
          </button>
          <IconButton label="上个月" onClick={() => move(-1)}>
            <ChevronLeft size={19} />
          </IconButton>
          <IconButton label="下个月" onClick={() => move(1)}>
            <ChevronRight size={19} />
          </IconButton>
        </div>
      </div>
      <div className="calendar-grid">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div className="weekday" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
          const day = i - offset + 1,
            date = `${month}-${String(day).padStart(2, "0")}`,
            inMonth = day > 0 && day <= days,
            items = entries.filter((e) => e.date === date);
          return (
            <div
              key={i}
              className={
                "calendar-cell" +
                (!inMonth ? " outside" : "") +
                (date === today() ? " today" : "")
              }
            >
              {inMonth && (
                <>
                  <div className="calendar-day">
                    <span>{day}</span>
                    <button
                      title={`${date} 写日记`}
                      aria-label={`${date} 写日记`}
                      onClick={() => onCreate(date)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  {items.slice(0, 3).map((e) => (
                    <button
                      className="calendar-entry"
                      key={e.id}
                      onClick={() => onSelect(e)}
                    >
                      <span />
                      {e.title || "无标题日记"}
                    </button>
                  ))}
                  {items.length > 3 && (
                    <button
                      className="calendar-more"
                      onClick={() => onSelect(items[3])}
                    >
                      还有 {items.length - 3} 篇
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="calendar-summary">
        这个月记录了{" "}
        {
          new Set(
            entries.filter((e) => e.date.startsWith(month)).map((e) => e.date),
          ).size
        }{" "}
        天，共 {entries.filter((e) => e.date.startsWith(month)).length} 篇日记。
      </p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
