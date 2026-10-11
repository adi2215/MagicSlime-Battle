// Meta-game rules: rewards, shop, team management.
import { ITEMS, MAX_LEVEL, SLIMES, STAGES, TEAM_SIZE, enemyGold, enemyXp, slimeDef, trainCost, type SlimeDef } from "./data";
import type { Battle, ItemId } from "./engine";
import { idos } from "./idos";
import { addXp, owned, persist, progressScore, save } from "./save";

export interface BattleOutcome {
  win: boolean;
  gold: number;
  xp: number;
  stars: number;
  starFlags: [boolean, boolean, boolean];
  firstClear: boolean;
  levelUps: { id: string; lvl: number }[];
  xpRows: { id: string; lvl: number; xp: number; gained: number }[];
  unlocked: SlimeDef[];
  zoneCleared: number | null;
  gameCleared: boolean;
}

export function finishBattle(b: Battle): BattleOutcome {
  const win = b.result === "win";
  const idx = b.stage.idx;
  const firstClear = win && idx > save.cleared;
  const defeated = win ? b.enemies : b.enemies.slice(0, b.eIdx);
  let gold = 0;
  let xp = 0;
  for (const e of defeated) {
    gold += enemyGold(e.lvl, e.boss);
    xp += enemyXp(e.lvl, e.boss);
  }
  if (win) gold = Math.round(gold * (firstClear ? 1.3 : 0.6));
  else {
    gold = Math.round(gold * 0.25);
    xp = Math.round(xp * 0.5);
  }
  const noFaint = win && b.team.every((f) => f.hp > 0);
  const noItems = win && Object.values(b.itemsUsed).every((n) => n === 0);
  const starFlags: [boolean, boolean, boolean] = [win, noFaint, noItems];
  const stars = starFlags.filter(Boolean).length;

  // apply
  save.gold += gold;
  save.battles++;
  for (const k of Object.keys(b.items) as ItemId[]) save.items[k] = b.items[k];
  const levelUps: { id: string; lvl: number }[] = [];
  const xpRows: BattleOutcome["xpRows"] = [];
  for (const f of b.team) {
    const o = owned(f.defId);
    if (!o) continue;
    const gained = addXp(o, xp);
    if (gained) levelUps.push({ id: o.id, lvl: o.lvl });
    xpRows.push({ id: o.id, lvl: o.lvl, xp: o.xp, gained });
  }
  let unlocked: SlimeDef[] = [];
  let zoneCleared: number | null = null;
  let gameCleared = false;
  if (win) {
    save.wins++;
    save.stars[idx] = Math.max(save.stars[idx], stars);
    if (firstClear) {
      save.cleared = idx;
      unlocked = SLIMES.filter((s) => s.unlockAfter === idx && !owned(s.id));
      if (b.stage.boss) zoneCleared = b.stage.zone;
      if (idx === STAGES.length - 1) gameCleared = true;
    }
  }
  persist();
  if (win) idos.submitScore(progressScore());
  return { win, gold, xp, stars, starFlags, firstClear, levelUps, xpRows, unlocked, zoneCleared, gameCleared };
}

export function recruitLevel(): number {
  const lv = save.owned.map((o) => o.lvl).sort((a, b) => b - a).slice(0, TEAM_SIZE);
  return Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / lv.length) - 2);
}

export function isUnlocked(d: SlimeDef) {
  if (d.walletOnly) return !!idos.solAddress;
  return d.unlockAfter <= save.cleared;
}

export function buySlime(id: string): boolean {
  const d = slimeDef(id);
  if (owned(id) || !isUnlocked(d) || save.gold < d.price) return false;
  save.gold -= d.price;
  save.owned.push({ id, lvl: recruitLevel(), xp: 0 });
  if (save.team.length < TEAM_SIZE) save.team.push(id);
  persist();
  return true;
}

export function buyItem(id: ItemId, n = 1): boolean {
  const it = ITEMS.find((i) => i.id === id)!;
  if (save.gold < it.price * n) return false;
  save.gold -= it.price * n;
  save.items[id] += n;
  persist();
  return true;
}

export function trainSlime(id: string): boolean {
  const o = owned(id);
  if (!o || o.lvl >= MAX_LEVEL) return false;
  const cost = trainCost(o.lvl);
  if (save.gold < cost) return false;
  save.gold -= cost;
  o.lvl++;
  o.xp = 0;
  persist();
  return true;
}

export function toggleTeam(id: string): "added" | "removed" | "full" | "last" {
  const i = save.team.indexOf(id);
  if (i >= 0) {
    if (save.team.length <= 1) return "last";
    save.team.splice(i, 1);
    persist();
    return "removed";
  }
  if (save.team.length >= TEAM_SIZE) return "full";
  save.team.push(id);
  persist();
  return "added";
}

export function makeLeader(id: string) {
  const i = save.team.indexOf(id);
  if (i > 0) {
    save.team.splice(i, 1);
    save.team.unshift(id);
    persist();
  }
}

export function teamOwned() {
  return save.team.map((id) => owned(id)!).filter(Boolean);
}
