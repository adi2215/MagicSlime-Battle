// Player progress: local storage + iDos cloud (user custom data).
import { MAX_LEVEL, STAGES, TEAM_SIZE, xpToNext } from "./data";
import type { ItemId, OwnedSlime } from "./engine";
import { idos } from "./idos";

export type Lang = "ru" | "en";

export interface Save {
  v: 1;
  gold: number;
  owned: OwnedSlime[];
  team: string[];
  items: Record<ItemId, number>;
  cleared: number;
  stars: number[];
  battles: number;
  wins: number;
  music: boolean;
  sfx: boolean;
  lang: Lang;
  seenIntro: boolean;
  updatedAt: number;
}

const LS_KEY = "magic-slime-battle-save";

function detectLang(): Lang {
  return (navigator.language || "en").toLowerCase().startsWith("ru") ||
    ["kk", "uk", "be", "ky", "uz"].some((l) => (navigator.language || "").toLowerCase().startsWith(l))
    ? "ru"
    : "en";
}

export function freshSave(): Save {
  return {
    v: 1,
    gold: 100,
    owned: [{ id: "drop", lvl: 2, xp: 0 }, { id: "ember", lvl: 2, xp: 0 }],
    team: ["drop", "ember"],
    items: { potion: 3, elixir: 1, apple: 0 },
    cleared: -1,
    stars: new Array(STAGES.length).fill(0),
    battles: 0,
    wins: 0,
    music: true,
    sfx: true,
    lang: detectLang(),
    seenIntro: false,
    updatedAt: Date.now(),
  };
}

function sanitize(raw: unknown): Save | null {
  if (!raw || typeof raw !== "object") return null;
  const s = { ...freshSave(), ...(raw as Partial<Save>) } as Save;
  if (!Array.isArray(s.owned) || s.owned.length === 0) return null;
  s.owned = s.owned.filter((o) => o && typeof o.id === "string").map((o) => ({ id: o.id, lvl: Math.min(MAX_LEVEL, Math.max(1, o.lvl | 0)), xp: Math.max(0, o.xp | 0) }));
  // Ember became a free starter: older saves get it at the level of their best slime
  if (!s.owned.some((o) => o.id === "ember")) {
    const best = Math.max(...s.owned.map((o) => o.lvl));
    s.owned.push({ id: "ember", lvl: best, xp: 0 });
    if (Array.isArray(s.team) && s.team.length < TEAM_SIZE) s.team = [...s.team, "ember"];
  }
  s.team = (s.team || []).filter((id) => s.owned.some((o) => o.id === id)).slice(0, TEAM_SIZE);
  if (s.team.length === 0) s.team = [s.owned[0].id];
  s.stars = STAGES.map((_, i) => Math.max(0, Math.min(3, (s.stars?.[i] ?? 0) | 0)));
  s.items = { potion: s.items?.potion | 0, elixir: s.items?.elixir | 0, apple: s.items?.apple | 0 };
  s.gold = Math.max(0, s.gold | 0);
  s.cleared = Math.min(STAGES.length - 1, Math.max(-1, s.cleared | 0));
  return s;
}

/** Higher progress wins; ties go to the most recent. */
function better(a: Save, b: Save): Save {
  const score = (s: Save) => s.cleared * 1e6 + s.stars.reduce((x, y) => x + y, 0) * 1e4 + s.owned.reduce((x, o) => x + o.lvl, 0);
  const sa = score(a), sb = score(b);
  if (sa !== sb) return sa > sb ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export let save: Save = loadLocal() ?? freshSave();

function loadLocal(): Save | null {
  try {
    const t = localStorage.getItem(LS_KEY);
    return t ? sanitize(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

export function persist() {
  save.updatedAt = Date.now();
  const json = JSON.stringify(save);
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* storage may be blocked in iframes */
  }
  idos.saveCloud(json);
}

/** After login: merge the cloud copy with the local one. */
export async function syncFromCloud(): Promise<boolean> {
  const json = await idos.loadCloud();
  if (json) {
    try {
      const cloud = sanitize(JSON.parse(json));
      if (cloud) {
        const pick = better(cloud, save);
        const changed = pick !== save;
        // keep device-local preferences
        pick.music = save.music;
        pick.sfx = save.sfx;
        save = pick;
        persist();
        return changed;
      }
    } catch {
      /* corrupt cloud save — keep local */
    }
  }
  if (idos.status !== "offline") persist();
  return false;
}

export function resetSave() {
  const keep = { lang: save.lang, music: save.music, sfx: save.sfx };
  save = { ...freshSave(), ...keep };
  persist();
}

export function owned(id: string) {
  return save.owned.find((o) => o.id === id);
}

export function totalStars() {
  return save.stars.reduce((a, b) => a + b, 0);
}

export function progressScore() {
  return (save.cleared + 1) * 100 + totalStars();
}

/** Adds XP, returns how many levels were gained. */
export function addXp(o: OwnedSlime, xp: number): number {
  let gained = 0;
  if (o.lvl >= MAX_LEVEL) return 0;
  o.xp += xp;
  while (o.lvl < MAX_LEVEL && o.xp >= xpToNext(o.lvl)) {
    o.xp -= xpToNext(o.lvl);
    o.lvl++;
    gained++;
  }
  if (o.lvl >= MAX_LEVEL) o.xp = 0;
  return gained;
}
