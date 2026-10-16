// High score tables: top 10 per table in this browser, and worldwide through a Val Town val. A game
// describes its entries and tables; createScores gives it the functions to load, rank and send them.
import { load, save } from './storage';

/** What every entry has; a game adds its own fields (level, lines, kills, ...). */
export interface BaseEntry {
  name: string;
  score: number;
}

export interface ScoreConfig<T extends string, E extends BaseEntry> {
  /** Storage keys are `${game}.scores` and `${game}.pending`. */
  game: string;
  /** The table ids, e.g. one per mode. */
  tables: readonly T[];
  /** Fills in the game's own fields of an entry read back from storage or the server. */
  normalize(e: E): E;
  /** Negative when a ranks above b in table t; by default the higher score. */
  compare?(t: T, a: E, b: E): number;
  /** The world scores val; leave out for local tables only. */
  url?: string;
  /** Overrides `${game}.scores`, e.g. after the format changed. */
  key?: string;
}

/** A game waiting to reach the world table; the uid lets the server ignore resends. */
interface Pending<T, E> {
  mode: T;
  entry: E;
  uid: string;
}

type Sent<E> = { rank: number; top: E[] };

export const MAX_SCORES = 10;
const NAME_LEN = 6;
/** A hanging server counts as offline after this long. */
const TIMEOUT = 5000;
const MAX_PENDING = 20;

const newUid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function createScores<T extends string, E extends BaseEntry>(cfg: ScoreConfig<T, E>) {
  type Tables = Record<T, E[]>;
  const KEY = cfg.key ?? `${cfg.game}.scores`;
  const PENDING_KEY = `${cfg.game}.pending`;
  const compare = cfg.compare ?? ((_t: T, a: E, b: E) => b.score - a.score);

  const isEntry = (e: unknown): e is E =>
    !!e && typeof (e as E).name === 'string' && Number.isFinite((e as E).score);
  const normalize = (e: E): E => cfg.normalize({ ...e, name: e.name.slice(0, NAME_LEN) });
  const cleanList = (list: unknown) =>
    Array.isArray(list) ? list.filter(isEntry).map(normalize).slice(0, MAX_SCORES) : [];
  const empty = () => Object.fromEntries(cfg.tables.map((t) => [t, [] as E[]])) as Tables;

  function loadTables(): Tables {
    const tables = empty();
    try {
      const raw = JSON.parse(load(KEY) ?? '{}');
      for (const t of cfg.tables) {
        const list: E[] = Array.isArray(raw[t]) ? raw[t].filter(isEntry).map(normalize) : [];
        tables[t] = list.sort((a, b) => compare(t, a, b)).slice(0, MAX_SCORES);
      }
    } catch {}
    return tables;
  }

  const saveTables = (t: Tables) => save(KEY, JSON.stringify(t));

  /** Index the entry would take in the list, or -1 if it doesn't make it. */
  function rankFor(list: E[], e: E, table?: T) {
    const i = table === undefined ? list.findIndex((x) => e.score > x.score) : list.findIndex((x) => compare(table, e, x) < 0);
    const at = i >= 0 ? i : list.length;
    return at < MAX_SCORES ? at : -1;
  }

  function loadPending(): Pending<T, E>[] {
    try {
      const raw = JSON.parse(load(PENDING_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((p) => p && typeof p.uid === 'string' && isEntry(p.entry)) : [];
    } catch {
      return [];
    }
  }

  const savePending = (list: Pending<T, E>[]) => save(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));

  /** The world top 10 of every table, or null when offline. */
  async function fetchGlobal(): Promise<Tables | null> {
    if (!cfg.url) return null;
    try {
      const res = await fetch(cfg.url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) return null;
      const raw = await res.json();
      return Object.fromEntries(cfg.tables.map((t) => [t, cleanList(raw[t])])) as Tables;
    } catch {
      return null;
    }
  }

  /** One attempt; 'retry' when the server can't take it now, 'drop' when it never will. */
  async function post(p: Pending<T, E>): Promise<Sent<E> | 'retry' | 'drop'> {
    if (!cfg.url) return 'retry';
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: p.mode, ...p.entry, uid: p.uid }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (res.status === 400) return 'drop';
      if (!res.ok) return 'retry';
      const raw = await res.json();
      return { rank: Number.isInteger(raw.rank) ? raw.rank : -1, top: cleanList(raw.top) };
    } catch {
      return 'retry';
    }
  }

  /** Sends a finished game; returns its world rank (-1 outside the top 10) and the new top 10, or null if it was queued. */
  async function submitGlobal(mode: T, entry: E): Promise<Sent<E> | null> {
    const p: Pending<T, E> = { mode, entry: { ...entry }, uid: newUid() };
    const res = await post(p);
    if (res === 'retry') savePending([...loadPending(), p]);
    return typeof res === 'object' ? res : null;
  }

  let flushing = false;

  /** Resends games that didn't get through earlier. */
  async function flushPending() {
    if (flushing) return;
    flushing = true;
    try {
      for (const p of loadPending()) {
        const res = await post(p);
        if (res === 'retry') break;
        savePending(loadPending().filter((q) => q.uid !== p.uid));
      }
    } finally {
      flushing = false;
    }
  }

  return { MAX_SCORES, isEntry, normalize, loadTables, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending };
}
