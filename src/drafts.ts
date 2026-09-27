export type LocalDraft<T> = { key: string; entry: T; savedAt: number };

/** Each page owns its draft keys: an acknowledgement in one tab must never
 * remove another tab's unsaved work. Old page keys remain recoverable. */
export function draftStore<T extends { id: string }>(
  storage: Storage,
  owner: string,
  previousOwner = "",
) {
  const prefix = "yejian-draft-v1:";
  const key = (id: string, source = owner) => `${prefix}${source}:${id}`;
  const write = (entry: T) =>
    storage.setItem(
      key(entry.id),
      JSON.stringify({ entry, savedAt: Date.now() }),
    );
  return {
    key,
    write,
    read(id: string): T | null {
      const own = storage.getItem(key(id));
      if (own) return JSON.parse(own).entry;
      const old = previousOwner && storage.getItem(key(id, previousOwner));
      if (!old) return null;
      const entry = JSON.parse(old).entry as T;
      write(entry);
      storage.removeItem(key(id, previousOwner));
      return entry;
    },
    remove(id: string) {
      storage.removeItem(key(id));
    },
    removeKey(source: string) {
      if (source.startsWith(prefix)) storage.removeItem(source);
    },
    list(): LocalDraft<T>[] {
      const result: LocalDraft<T>[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix))
          try {
            const data = JSON.parse(storage.getItem(k) || "");
            if (data.entry?.id) result.push({ key: k, ...data });
          } catch {
            /* A damaged draft must not hide other recoverable records. */
          }
      }
      return result.sort((a, b) => b.savedAt - a.savedAt);
    },
  };
}
