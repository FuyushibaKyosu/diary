type HistoryState = Record<string, unknown> | null;
export type HistoryPort = {
  read: () => { url: string; state: HistoryState };
  push: (url: string, state: HistoryState) => void;
  replace: (url: string, state: HistoryState) => void;
  go: (delta: number) => void;
  listen: (handler: () => void) => () => void;
};
const indexKey = "diaryHistoryIndex";
const indexOf = (state: HistoryState) =>
  Number.isSafeInteger(state?.[indexKey]) ? (state![indexKey] as number) : 0;

// Guard both application navigation and browser traversal before replacing the editor.
export function createNavigation(
  port: HistoryPort,
  guard: () => Promise<boolean>,
  apply: (url: string) => string,
) {
  let revision = 0;
  let disposed = false;
  let committed = { url: port.read().url, index: indexOf(port.read().state) };
  let restoring = false;
  const writeState = (index: number) => ({
    ...port.read().state,
    [indexKey]: index,
  });
  const commit = (url: string, index: number) => {
    const canonical = apply(url);
    committed = { url: canonical, index };
    port.replace(canonical, writeState(index));
  };
  const restore = () => {
    const actual = port.read();
    if (actual.url === committed.url) return;
    const delta = committed.index - indexOf(actual.state);
    if (delta) {
      restoring = true;
      port.go(delta);
    } else port.replace(committed.url, writeState(committed.index));
  };
  commit(committed.url, committed.index);
  const stop = port.listen(() => {
    const target = port.read();
    const index = indexOf(target.state);
    if (
      restoring &&
      index === committed.index &&
      target.url === committed.url
    ) {
      restoring = false;
      return;
    }
    restoring = false;
    const ticket = ++revision;
    void (async () => {
      const allowed = await guard();
      if (disposed || ticket !== revision) return;
      if (allowed) commit(target.url, index);
      else restore();
    })();
  });
  return {
    async navigate(url: string, replace = false) {
      const ticket = ++revision;
      const allowed = await guard();
      if (disposed || ticket !== revision) return false;
      if (!allowed) {
        restore();
        return false;
      }
      const actual = port.read();
      if (actual.url === url && committed.url === url) return true;
      const index = indexOf(actual.state) + (replace ? 0 : 1);
      if (replace) port.replace(url, writeState(index));
      else port.push(url, writeState(index));
      commit(url, index);
      return true;
    },
    dispose() {
      disposed = true;
      revision++;
      stop();
    },
  };
}

export function browserHistory(): HistoryPort {
  return {
    read: () => ({
      url: location.pathname + location.search + location.hash,
      state: history.state,
    }),
    push: (url, state) => history.pushState(state, "", url),
    replace: (url, state) => history.replaceState(state, "", url),
    go: (delta) => history.go(delta),
    listen: (handler) => {
      window.addEventListener("popstate", handler);
      return () => window.removeEventListener("popstate", handler);
    },
  };
}
