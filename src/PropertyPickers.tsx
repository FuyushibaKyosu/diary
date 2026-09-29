import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Smile,
  Sun,
  Leaf,
  Sparkles,
  CloudRain,
  Moon,
  Minus,
} from "lucide-react";
import { dateKey, monthDays, parseDate, shiftMonth } from "./date-utils";

function PropertyPopover({
  label,
  disabled,
  trigger,
  children,
  compact = false,
}: {
  label: string;
  disabled: boolean;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const below = window.innerHeight - anchor.bottom - 8;
      setPosition({
        left: Math.max(
          8,
          Math.min(anchor.left, window.innerWidth - panel.width - 8),
        ),
        top:
          below >= panel.height || anchor.top < panel.height + 8
            ? Math.max(
                8,
                Math.min(
                  anchor.bottom + 8,
                  window.innerHeight - panel.height - 8,
                ),
              )
            : anchor.top - panel.height - 8,
      });
    };
    place();
    panelRef.current
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === "Tab") {
      const elements = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)',
        ) || [],
      );
      if (
        (event.shiftKey && document.activeElement === elements[0]) ||
        (!event.shiftKey && document.activeElement === elements.at(-1))
      ) {
        // Return to the trigger before the browser advances to the next field.
        close();
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="property-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {trigger}
        <ChevronDown size={13} className="property-chevron" />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={label}
            className={"property-popover" + (compact ? " mood-popover" : "")}
            style={position}
            onKeyDown={onKeyDown}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

function DateCalendar({
  value,
  onChange,
  close,
}: {
  value: string;
  onChange: (value: string) => void;
  close: () => void;
}) {
  const [focused, setFocused] = useState(() => parseDate(value) || new Date());
  const [typed, setTyped] = useState(value);
  const [error, setError] = useState("");
  const calendarRef = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  const errorId = useId();
  const active = dateKey(focused);
  const today = dateKey(new Date());
  const days = monthDays(focused);
  useEffect(() => {
    if (focusAfterMove.current) {
      calendarRef.current
        ?.querySelector<HTMLElement>('[tabindex="0"]')
        ?.focus({ preventScroll: true });
      focusAfterMove.current = false;
    }
  }, [active]);
  const select = (date: string) => {
    if (parseDate(date)) {
      onChange(date);
      close();
    }
  };
  const move = (date: Date, focus = true) => {
    if (!parseDate(dateKey(date))) return;
    focusAfterMove.current = focus;
    setFocused(date);
  };
  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = new Date(focused);
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in offsets) next.setDate(next.getDate() + offsets[event.key]);
    else if (event.key === "Home")
      next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
    else if (event.key === "End")
      next.setDate(next.getDate() + 6 - ((next.getDay() + 6) % 7));
    else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      move(
        shiftMonth(
          focused,
          (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
        ),
      );
      return;
    } else return;
    event.preventDefault();
    move(next);
  };
  return (
    <>
      <div className="picker-heading">
        <span>日记日期</span>
        <span className="picker-hint">选择记录的日子</span>
      </div>
      <div className="date-month-nav">
        <strong aria-live="polite">
          {focused.getFullYear()} 年 {focused.getMonth() + 1} 月
        </strong>
        <div>
          <button
            type="button"
            aria-label="上个月"
            onClick={() => move(shiftMonth(focused, -1), false)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => move(shiftMonth(focused, 1), false)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="date-weekdays" aria-hidden="true">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        className="date-days"
        ref={calendarRef}
        role="group"
        aria-label="选择日期，方向键移动，翻页键切换月份"
      >
        {days.map((day) => {
          const key = dateKey(day);
          return (
            <button
              key={key}
              type="button"
              className={
                "date-day" +
                (day.getMonth() !== focused.getMonth() ? " outside" : "") +
                (key === value ? " selected" : "") +
                (key === today ? " today" : "")
              }
              aria-label={day.toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
              aria-pressed={key === value}
              aria-current={key === today ? "date" : undefined}
              tabIndex={key === active ? 0 : -1}
              data-autofocus={key === active ? "true" : undefined}
              disabled={!parseDate(key)}
              onKeyDown={onDayKey}
              onClick={() => select(key)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="date-picker-footer">
        <button
          type="button"
          className="picker-today"
          onClick={() => select(today)}
        >
          今天
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (parseDate(typed)) select(typed);
            else setError("请输入有效日期，如 2026-09-28");
          }}
        >
          <input
            type="text"
            aria-label="直接输入日期"
            value={typed}
            placeholder="YYYY-MM-DD"
            maxLength={10}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setTyped(event.target.value);
              setError("");
            }}
          />
          <button type="submit" aria-label="确认输入日期">
            <Check size={15} />
          </button>
        </form>
      </div>
      {error && (
        <p className="picker-error" role="alert" id={errorId}>
          {error}
        </p>
      )}
    </>
  );
}

export function DatePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <PropertyPopover
      label="日记日期"
      disabled={disabled}
      trigger={<span>{value.replaceAll("-", " / ")}</span>}
    >
      {(close) => (
        <DateCalendar value={value} onChange={onChange} close={close} />
      )}
    </PropertyPopover>
  );
}

const moods = [
  { value: "愉快", icon: Sun, color: "sun", hint: "有让人开心的小事" },
  { value: "平静", icon: Leaf, color: "leaf", hint: "享受平常的一天" },
  { value: "充实", icon: Sparkles, color: "spark", hint: "今天收获了不少" },
  { value: "低落", icon: CloudRain, color: "rain", hint: "也给自己一点空间" },
  { value: "疲惫", icon: Moon, color: "moon", hint: "记得好好休息" },
  { value: "", icon: Minus, color: "none", hint: "留白也没关系" },
];

function MoodOptions({
  value,
  onChange,
  close,
}: {
  value: string;
  onChange: (value: string) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(
    Math.max(
      0,
      moods.findIndex((mood) => mood.value === value),
    ),
  );
  const move = (event: KeyboardEvent) => {
    let next = active;
    if (event.key === "ArrowDown") next = (active + 1) % moods.length;
    else if (event.key === "ArrowUp")
      next = (active + moods.length - 1) % moods.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = moods.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    ref.current
      ?.querySelectorAll<HTMLButtonElement>('[role="option"]')
      [next]?.focus();
  };
  return (
    <>
      <div className="picker-heading">
        <span>今天的心情</span>
        <Smile size={16} />
      </div>
      <div
        ref={ref}
        className="mood-options"
        role="listbox"
        aria-label="选择心情"
        onKeyDown={move}
      >
        {moods.map((mood, index) => (
          <button
            type="button"
            role="option"
            key={mood.value}
            aria-selected={value === mood.value}
            tabIndex={active === index ? 0 : -1}
            data-autofocus={active === index ? "true" : undefined}
            className="mood-option"
            onClick={() => {
              onChange(mood.value);
              close();
            }}
          >
            <span className={`mood-icon ${mood.color}`}>
              <mood.icon size={18} />
            </span>
            <span className="mood-copy">
              <strong>{mood.value || "不设置"}</strong>
              <small>{mood.hint}</small>
            </span>
            {value === mood.value && <Check size={15} className="mood-check" />}
          </button>
        ))}
      </div>
    </>
  );
}

export function MoodPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const current = moods.find((mood) => mood.value === value);
  return (
    <PropertyPopover
      label="今天的心情"
      disabled={disabled}
      compact
      trigger={
        <>
          {value && current && <current.icon size={14} />}
          <span>{value || "选择心情"}</span>
        </>
      }
    >
      {(close) => (
        <MoodOptions value={value} onChange={onChange} close={close} />
      )}
    </PropertyPopover>
  );
}
