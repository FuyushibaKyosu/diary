export type View = "all" | "calendar" | "favorites" | "trash" | "tag";
export type Route = {
  view: View;
  entryId?: string;
  tag?: string;
  month?: string;
};

export function routeUrl(route: Route): string {
  if (route.view === "calendar") return `/calendar/${route.month}`;
  if (route.view === "all")
    return route.entryId
      ? `/entries/${encodeURIComponent(route.entryId)}`
      : "/entries";
  const path =
    route.view === "tag"
      ? `/tags/${encodeURIComponent(route.tag || "")}`
      : `/${route.view}`;
  return (
    path + (route.entryId ? `?entry=${encodeURIComponent(route.entryId)}` : "")
  );
}

export function parseRoute(href: string): Route | null {
  try {
    const url = new URL(href, "http://diary.local");
    const parts = url.pathname
      .replace(/\/$/, "")
      .split("/")
      .slice(1)
      .map(decodeURIComponent);
    const entryId = url.searchParams.get("entry") || undefined;
    if (parts.length === 0 || (parts[0] === "entries" && parts.length <= 2))
      return { view: "all", entryId: parts[1] || undefined };
    if (
      (parts[0] === "favorites" || parts[0] === "trash") &&
      parts.length === 1
    )
      return { view: parts[0], entryId };
    if (parts[0] === "tags" && parts.length === 2 && parts[1])
      return { view: "tag", tag: parts[1], entryId };
    if (
      parts[0] === "calendar" &&
      parts.length <= 2 &&
      (!parts[1] || /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(parts[1]))
    )
      return { view: "calendar", month: parts[1] };
    return null;
  } catch {
    return null;
  }
}

type EntrySummary = {
  id: string;
  date: string;
  created_at: string;
  deleted_at: string | null;
  favorite: boolean;
  tags: string[];
};
export function entriesForRoute<T extends EntrySummary>(
  entries: T[],
  route: Route,
): T[] {
  return entries
    .filter((entry) =>
      route.view === "trash"
        ? !!entry.deleted_at
        : !entry.deleted_at &&
          (route.view !== "favorites" || entry.favorite) &&
          (route.view !== "tag" || entry.tags.includes(route.tag || "")),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    );
}

export function resolveRoute<T extends EntrySummary>(
  href: string,
  entries: T[],
  month: string,
) {
  let route = parseRoute(href);
  if (!route)
    return {
      route: { view: "all" } as Route,
      entry: undefined,
      url: href,
      error: "这个页面不存在",
    };
  if (route.view === "calendar") {
    route = { ...route, month: route.month || month };
    return { route, entry: undefined, url: routeUrl(route), error: "" };
  }
  const entryId = route.entryId;
  const entry = entryId
    ? entries.find((e) => e.id === entryId)
    : entriesForRoute(entries, route)[0];
  if (route.entryId && !entry)
    return {
      route,
      entry: undefined,
      url: href,
      error: "找不到这篇日记，可能已被移除或链接有误",
    };
  if (entry) {
    // Old bookmarks to a deleted/restored entry still lead to that exact entry.
    if (entry.deleted_at) route = { view: "trash", entryId: entry.id };
    else if (!entriesForRoute([entry], route).length)
      route = { view: "all", entryId: entry.id };
    else route = { ...route, entryId: entry.id };
  }
  return { route, entry, url: routeUrl(route), error: "" };
}
