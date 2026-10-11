// Balance simulator: plays the whole campaign with a simple strategy.
import { SLIMES, STAGES, TEAM_SIZE, ITEMS, enemyGold, enemyXp, xpToNext, MAX_LEVEL, trainCost } from "../src/data";
import { autoAction, createBattle, playTurn, type OwnedSlime, type ItemId } from "../src/engine";

function run(seed: number, verbose: boolean) {
  let s = seed;
  const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const owned: OwnedSlime[] = [{ id: "drop", lvl: 2, xp: 0 }];
  let gold = 100;
  const items: Record<ItemId, number> = { potion: 3, elixir: 0, apple: 0 };
  let cleared = -1;
  let battles = 0;
  const attempts: number[] = [];
  const perStage: number[] = [];
  for (let target = 0; target < STAGES.length; target++) {
    let tries = 0;
    const b0 = battles;
    while (cleared < target) {
      // shop
      for (const d of SLIMES) {
        if (!d.walletOnly && !owned.find((o) => o.id === d.id) && d.unlockAfter <= cleared && gold >= d.price) {
          gold -= d.price;
          const avg = Math.max(1, Math.round(owned.reduce((a, o) => a + o.lvl, 0) / owned.length) - 1);
          owned.push({ id: d.id, lvl: avg, xp: 0 });
        }
      }
      while (items.potion < 3 && gold >= ITEMS[0].price + 40) { gold -= ITEMS[0].price; items.potion++; }
      while (items.apple < 1 && gold >= ITEMS[2].price + 60) { gold -= ITEMS[2].price; items.apple++; }
      const team = [...owned].sort((a, b) => b.lvl - a.lvl).slice(0, TEAM_SIZE);
      // train weakest team member when rich
      const weakest = [...team].sort((a, b) => a.lvl - b.lvl)[0];
      while (gold > trainCost(weakest.lvl) + 300 && weakest.lvl < MAX_LEVEL) { gold -= trainCost(weakest.lvl); weakest.lvl++; }

      const stageIdx = tries >= 2 ? Math.max(0, target - 1) : target; // grind previous stage after 2 losses
      const st = STAGES[stageIdx];
      const b = createBattle(st, team, items, rng);
      let guard = 0;
      while (!b.result && guard++ < 400) playTurn(b, autoAction(b));
      battles++;
      for (const k of Object.keys(items) as ItemId[]) items[k] = b.items[k];
      if (b.result === "win") {
        const replay = stageIdx <= cleared;
        let g = 0, xp = 0;
        for (const e of b.enemies) { g += enemyGold(e.lvl, e.boss); xp += enemyXp(e.lvl, e.boss); }
        gold += Math.round(g * (replay ? 0.6 : 1.3));
        for (const t of team) {
          t.xp += xp;
          while (t.lvl < MAX_LEVEL && t.xp >= xpToNext(t.lvl)) { t.xp -= xpToNext(t.lvl); t.lvl++; }
        }
        if (stageIdx > cleared) cleared = stageIdx;
        if (stageIdx === target) { attempts.push(tries + 1); tries = 0; }
        else tries = 1;
      } else {
        tries++;
      }
      if (battles > 600) break;
    }
    perStage.push(battles - b0);
    if (verbose) {
      const st = STAGES[target];
      console.log(`stage ${target + 1} (enemies ${st.enemies.map((e) => e.id + e.lvl).join(",")}) battles=${perStage[target]} team=${[...owned].sort((a, b) => b.lvl - a.lvl).map((o) => o.id + o.lvl).join(" ")} gold=${gold}`);
    }
  }
  return { battles, attempts: perStage, owned };
}

const r = run(42, true);
console.log("battles:", r.battles);
let tot = 0;
const runs = 40;
const per = new Array(STAGES.length).fill(0);
for (let i = 0; i < runs; i++) {
  const x = run(1000 + i * 7, false);
  tot += x.battles;
  x.attempts.forEach((a, j) => (per[j] += a));
}
console.log("avg battles:", (tot / runs).toFixed(1));
console.log("avg battles per stage:", per.map((p) => (p / runs).toFixed(1)).join(" "));
