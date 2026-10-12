// Difficulty check for a CASUAL player: mostly attacks, uses specials when it can,
// heals only when low, rarely uses items, notices a boss charge half the time,
// never grinds on purpose (just retries the same stage after a loss) and never trains.
import { SLIMES, STAGES, TEAM_SIZE, enemyGold, enemyXp, xpToNext, MAX_LEVEL, HEAL_COST, SPECIAL_COST } from "../src/data";
import { activeE, activeP, canUse, createBattle, playTurn, type Action, type Battle, type ItemId, type OwnedSlime } from "../src/engine";
import { freshStart } from "./start";

function casualAction(b: Battle, rng: () => number): Action {
  const p = activeP(b);
  const e = activeE(b);
  if (b.needSwitch) return { k: "switch", to: b.team.findIndex((f) => f.hp > 0) };
  if (e.charging && rng() < 0.5) return { k: "defend" };
  if (p.hp < p.maxHp * 0.25 && b.items.potion > 0 && rng() < 0.5) return { k: "item", item: "potion" };
  if (p.hp < p.maxHp * 0.35 && p.mana >= HEAL_COST && p.hp < p.maxHp) return { k: "heal" };
  if (p.mana >= SPECIAL_COST && rng() < 0.7) return { k: "special" };
  const a: Action = { k: "attack" };
  return canUse(b, a) ? a : { k: "defend" };
}

export function runCasual(seed: number, buys = true) {
  let s = seed;
  const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const start = freshStart();
  const owned: OwnedSlime[] = start.owned.map((o) => ({ ...o }));
  let gold = start.gold;
  const items: Record<ItemId, number> = { ...start.items };
  let cleared = -1;
  const tries: number[] = [];
  for (let target = 0; target < STAGES.length; target++) {
    let n = 0;
    while (cleared < target && n < 60) {
      n++;
      for (const d of buys ? SLIMES : []) {
        if (!d.walletOnly && !owned.find((o) => o.id === d.id) && d.unlockAfter <= cleared && gold >= d.price) {
          gold -= d.price;
          const lv = owned.map((o) => o.lvl).sort((a, b) => b - a).slice(0, TEAM_SIZE);
          owned.push({ id: d.id, lvl: Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / lv.length) - 2), xp: 0 });
        }
      }
      const team = [...owned].sort((a, b) => b.lvl - a.lvl).slice(0, TEAM_SIZE);
      const b = createBattle(STAGES[target], team, items, rng);
      let guard = 0;
      while (!b.result && guard++ < 500) playTurn(b, casualAction(b, rng));
      for (const k of Object.keys(items) as ItemId[]) items[k] = b.items[k];
      const win = b.result === "win";
      const defeated = win ? b.enemies : b.enemies.slice(0, b.eIdx);
      let g = 0, xp = 0;
      for (const e of defeated) { g += enemyGold(e.lvl, e.boss); xp += enemyXp(e.lvl, e.boss); }
      if (win) g = Math.round(g * 1.3);
      else { g = Math.round(g * 0.25); xp = Math.round(xp * 0.5); }
      gold += g;
      for (const t of team) {
        t.xp += xp;
        while (t.lvl < MAX_LEVEL && t.xp >= xpToNext(t.lvl)) { t.xp -= xpToNext(t.lvl); t.lvl++; }
      }
      if (win) cleared = target;
    }
    tries.push(n);
    if (cleared < target) break;
  }
  return { tries, cleared, owned };
}

function report(label: string, buys: boolean) {
  const RUNS = 60;
  const sum = new Array(STAGES.length).fill(0);
  const worst = new Array(STAGES.length).fill(0);
  let finished = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = runCasual(7 + i * 13, buys);
    r.tries.forEach((t, j) => { sum[j] += t; worst[j] = Math.max(worst[j], t); });
    if (r.cleared === STAGES.length - 1) finished++;
  }
  console.log(`== ${label}`);
  console.log("avg tries:", sum.map((x) => (x / RUNS).toFixed(1)).join(" "));
  console.log("worst    :", worst.join(" "));
  console.log(`finished: ${finished}/${RUNS}`);
}
report("casual, buys slimes", true);
report("casual, never buys (starter team only)", false);
