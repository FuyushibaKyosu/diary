import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  ImagePlus,
} from "lucide-react";
import {
  blocks,
  filterBlocks,
  slashQuery,
  type BlockId,
} from "./slash-commands";

const icons = [
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Minus,
  ImagePlus,
];
type Match = { from: number; to: number; query: string };

function matchAtCursor(editor: Editor): Match | null {
  const { selection } = editor.state;
  if (
    !editor.isEditable ||
    !selection.empty ||
    !selection.$from.parent.isTextblock ||
    selection.$from.parent.type.spec.code
  )
    return null;
  const { $from } = selection;
  const query = slashQuery(
    $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc"),
  );
  return query === null
    ? null
    : { from: $from.start(), to: selection.from, query };
}

export function useSlashMenu(editor: Editor | null, onImage: () => void) {
  const [match, setMatch] = useState<Match | null>(null);
  const [selected, setSelected] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, height: 340 });
  const matchRef = useRef<Match | null>(null);
  const selectedRef = useRef(0);
  const dismissed = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = filterBlocks(match?.query ?? "");

  const close = () => {
    dismissed.current = matchRef.current?.from ?? null;
    matchRef.current = null;
    setMatch(null);
  };
  const choose = (index: number) => {
    selectedRef.current = index;
    setSelected(index);
  };

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const next = editor.isFocused ? matchAtCursor(editor) : null;
      if (!next) dismissed.current = null;
      if (!next || dismissed.current === next.from) {
        matchRef.current = null;
        setMatch(null);
        return;
      }
      if (
        next.from !== matchRef.current?.from ||
        next.query !== matchRef.current?.query
      )
        choose(0);
      matchRef.current = next;
      setMatch(next);
    };
    const blur = () => {
      matchRef.current = null;
      setMatch(null);
    };
    editor.on("transaction", sync);
    editor.on("focus", sync);
    editor.on("blur", blur);
    return () => {
      editor.off("transaction", sync);
      editor.off("focus", sync);
      editor.off("blur", blur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !match) return;
    const positionMenu = () => {
      const coords = editor.view.coordsAtPos(match.to);
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - coords.bottom - 16;
      const above = coords.top - 16;
      const desiredHeight = Math.min(
        340,
        Math.max(1, filterBlocks(match.query).length) * 54 + 76,
      );
      const up = below < desiredHeight && above > below;
      const height = Math.min(desiredHeight, Math.max(100, up ? above : below));
      setPosition({
        left: Math.max(8, Math.min(coords.left, window.innerWidth - 296)),
        top: up ? Math.max(8, coords.top - height - 8) : coords.bottom + 8,
        height,
      });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [editor, match]);

  useEffect(() => {
    menuRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
    if (!editor) return;
    const dom = editor.view.dom;
    if (match) {
      dom.setAttribute("aria-controls", id);
      dom.setAttribute("aria-autocomplete", "list");
      if (items[selected])
        dom.setAttribute(
          "aria-activedescendant",
          `${id}-${items[selected].id}`,
        );
      else dom.removeAttribute("aria-activedescendant");
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-autocomplete");
      dom.removeAttribute("aria-activedescendant");
    }
  }, [editor, match, selected, id]);

  const run = (block: BlockId) => {
    if (!editor) return;
    const current = matchAtCursor(editor);
    if (
      !current ||
      current.from !== matchRef.current?.from ||
      current.to !== matchRef.current?.to
    )
      return close();
    close();
    const chain = editor
      .chain()
      .focus()
      .deleteRange({ from: current.from, to: current.to })
      .clearNodes();
    switch (block) {
      case "h1":
        chain.setHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.setHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.setHeading({ level: 3 }).run();
        break;
      case "bullet":
        chain.toggleBulletList().run();
        break;
      case "ordered":
        chain.toggleOrderedList().run();
        break;
      case "task":
        chain.toggleTaskList().run();
        break;
      case "quote":
        chain.setBlockquote().run();
        break;
      case "code":
        chain.setCodeBlock().run();
        break;
      case "divider":
        chain.setHorizontalRule().run();
        break;
      case "image":
        chain.setParagraph().run();
        onImage();
        break;
      default:
        chain.setParagraph().run();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      !matchRef.current ||
      !editor ||
      event.isComposing ||
      editor.view.composing ||
      event.keyCode === 229
    )
      return false;
    const available = filterBlocks(matchRef.current.query);
    if (event.key === "Escape" || event.key === "Tab") {
      close();
      return event.key === "Escape";
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (available.length)
        choose(
          (selectedRef.current +
            (event.key === "ArrowDown" ? 1 : -1) +
            available.length) %
            available.length,
        );
      return true;
    }
    if (event.key === "Enter") {
      const item = available[selectedRef.current];
      if (!item) {
        close();
        return false;
      }
      run(item.id);
      return true;
    }
    return false;
  };

  const menu =
    match &&
    createPortal(
      <div
        ref={menuRef}
        className="slash-menu"
        style={{
          left: position.left,
          top: position.top,
          maxHeight: position.height,
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="slash-menu-heading">
          {match.query ? "搜索区块" : "添加区块"}
          <span>输入名称筛选</span>
        </div>
        <div
          className="slash-options"
          id={id}
          role="listbox"
          aria-label="区块类型"
        >
          {items.map((item, index) => {
            const Icon =
              icons[blocks.findIndex((block) => block.id === item.id)];
            return (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selected === index}
                id={`${id}-${item.id}`}
                key={item.id}
                className="slash-option"
                onMouseMove={() => choose(index)}
                onClick={() => run(item.id)}
              >
                <span className="slash-icon">
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
          {!items.length && (
            <p className="slash-empty" role="status">
              没有匹配的区块，试试「标题」或「列表」
            </p>
          )}
        </div>
        <div className="slash-menu-foot">
          ↑ ↓ 选择 <span>Enter 确认 · Esc 关闭</span>
        </div>
      </div>,
      document.body,
    );
  return { menu, handleKeyDown };
}
