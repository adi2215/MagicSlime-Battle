// Turn-based battle engine. Pure logic: no DOM. The UI plays the returned events.
import {
  ENEMIES,
  HEAL_COST,
  MANA_MAX,
  MANA_REGEN,
  MANA_START,
  SPECIAL_COST,
  slimeDef,
  statsAt,
  typeMult,
  type Element,
  type ItemDef,
  type L10n,
  type StageDef,
} from "./data";

export type Side = "p" | "e";

export interface Fighter {
  uid: string;
  defId: string;
  name: L10n;
  sprite: string;
  el: Element;
  lvl: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  mana: number;
  boss: boolean;
  healer: boolean;
  defending: boolean;
  burn: number;
  wet: number;
  stun: boolean;
  charging: boolean;
  turnsOut: number;
}

export type ItemId = ItemDef["id"];

export type Action =
  | { k: "attack" }
  | { k: "special" }
  | { k: "defend" }
  | { k: "heal" }
  | { k: "item"; item: ItemId; target?: number }
  | { k: "switch"; to: number };

export type BEvent =
  | { t: "act"; side: Side; kind: "attack" | "special" | "defend" | "heal" | "charge" | "release" | "item" }
  | { t: "hit"; side: Side; dmg: number; crit: boolean; eff: number; blocked: boolean; special: boolean; el?: Element }
  | { t: "heal"; side: Side; amt: number; team?: boolean }
  | { t: "mana"; side: Side }
  | { t: "status"; side: Side; s: "burn" | "wet" | "stun" | "burnTick" | "stunned" | "drain"; amt?: number }
  | { t: "faint"; side: Side }
  | { t: "switchIn"; side: Side; idx: number }
  | { t: "revive"; idx: number }
  | { t: "msg"; key: string; p?: Record<string, string | number> }
  | { t: "end"; result: "win" | "lose" };

export interface OwnedSlime {
  id: string;
  lvl: number;
  xp: number;
}

export interface Battle {
  stage: StageDef;
  team: Fighter[];
  active: number;
  enemies: Fighter[];
  eIdx: number;
  turn: number;
  items: Record<ItemId, number>;
  itemsUsed: Record<ItemId, number>;
  result?: "win" | "lose";
  needSwitch: boolean;
  rng: () => number;
}

let uidSeq = 0;

export function makeSlimeFighter(o: OwnedSlime): Fighter {
  const d = slimeDef(o.id);
  const s = statsAt(d.base, o.lvl);
  return {
    uid: `p${uidSeq++}`, defId: d.id, name: d.name, sprite: d.sprite, el: d.el, lvl: o.lvl,
    maxHp: s.hp, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, mana: MANA_START,
    boss: false, healer: true, defending: false, burn: 0, wet: 0, stun: false, charging: false, turnsOut: 0,
  };
}

export function makeEnemy(id: string, lvl: number): Fighter {
  const d = ENEMIES[id];
  const s = statsAt(d.base, lvl, !!d.boss);
  return {
    uid: `e${uidSeq++}`, defId: d.id, name: d.name, sprite: d.sprite, el: d.el, lvl,
    maxHp: s.hp, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, mana: MANA_START,
    boss: !!d.boss, healer: !!d.healer, defending: false, burn: 0, wet: 0, stun: false, charging: false, turnsOut: 0,
  };
}

export function createBattle(stage: StageDef, team: OwnedSlime[], items: Record<ItemId, number>, rng: () => number = Math.random): Battle {
  return {
    stage,
    team: team.map(makeSlimeFighter),
    active: 0,
    enemies: stage.enemies.map((e) => makeEnemy(e.id, e.lvl)),
    eIdx: 0,
    turn: 0,
    items: { ...items },
    itemsUsed: { potion: 0, elixir: 0, apple: 0 },
    needSwitch: false,
    rng,
  };
}

export const activeP = (b: Battle) => b.team[b.active];
export const activeE = (b: Battle) => b.enemies[b.eIdx];

export function canUse(b: Battle, a: Action): boolean {
  const p = activeP(b);
  if (b.result) return false;
  if (b.needSwitch) return a.k === "switch" && b.team[a.to]?.hp > 0 && a.to !== b.active;
  switch (a.k) {
    case "attack":
    case "defend":
      return true;
    case "special":
      return p.mana >= SPECIAL_COST;
    case "heal":
      return p.mana >= HEAL_COST && p.hp < p.maxHp;
    case "switch":
      return a.to !== b.active && b.team[a.to]?.hp > 0;
    case "item": {
      if ((b.items[a.item] ?? 0) <= 0) return false;
      if (a.item === "potion") return p.hp < p.maxHp;
      if (a.item === "elixir") return p.mana < MANA_MAX;
      if (a.item === "apple") return a.target !== undefined ? b.team[a.target]?.hp <= 0 : b.team.some((f) => f.hp <= 0);
      return false;
    }
  }
}

function priority(a: Action): number {
  if (a.k === "switch" || a.k === "item" || a.k === "defend") return 2;
  return 0;
}

type EnemyAction = { k: "attack" } | { k: "special" } | { k: "defend" } | { k: "heal" } | { k: "charge" } | { k: "release" };

export function enemyPlan(b: Battle): EnemyAction {
  const e = activeE(b);
  const r = b.rng();
  if (e.charging) return { k: "release" };
  if (e.boss && e.turnsOut > 0 && e.turnsOut % 4 === 2) return { k: "charge" };
  if (e.healer && e.hp < e.maxHp * 0.35 && e.mana >= HEAL_COST && r < 0.55) return { k: "heal" };
  if (e.mana >= SPECIAL_COST && r < 0.5) return { k: "special" };
  if (r > 0.92) return { k: "defend" };
  return { k: "attack" };
}

function dealDamage(b: Battle, side: Side, att: Fighter, def: Fighter, pow: number, el: Element | undefined, ev: BEvent[], opts: { pierce?: boolean } = {}): number {
  const atk = att.atk * (att.wet > 0 ? 0.75 : 1);
  const armour = opts.pierce ? def.def * 0.5 : def.def;
  const eff = el ? typeMult(el, def.el) : 1;
  const crit = b.rng() < 0.1;
  const blocked = def.defending && !opts.pierce;
  let dmg = atk * pow * (100 / (100 + armour * 4)) * eff * (crit ? 1.5 : 1) * (0.9 + b.rng() * 0.2);
  if (blocked) dmg *= 0.35;
  dmg = Math.max(1, Math.round(dmg));
  def.hp = Math.max(0, def.hp - dmg);
  ev.push({ t: "hit", side: side === "p" ? "e" : "p", dmg, crit, eff, blocked, special: pow > 1, el });
  return dmg;
}

function applySpecial(b: Battle, side: Side, att: Fighter, def: Fighter, ev: BEvent[]) {
  const pow = slimeDefPow(att);
  const pierce = att.el === "shadow";
  const dmg = dealDamage(b, side, att, def, pow, att.el, ev, { pierce });
  const target: Side = side === "p" ? "e" : "p";
  if (def.hp <= 0) {
    if (att.el === "nature") drain(att, dmg, side, ev);
    if (att.el === "light") teamHeal(b, side, ev);
    return;
  }
  switch (att.el) {
    case "water":
      if (b.rng() < 0.35) {
        def.wet = 2;
        ev.push({ t: "status", side: target, s: "wet" });
      }
      break;
    case "fire":
      if (b.rng() < 0.4) {
        def.burn = 3;
        ev.push({ t: "status", side: target, s: "burn" });
      }
      break;
    case "storm":
      if (b.rng() < 0.3) {
        def.stun = true;
        ev.push({ t: "status", side: target, s: "stun" });
      }
      break;
    case "nature":
      drain(att, dmg, side, ev);
      break;
    case "light":
      teamHeal(b, side, ev);
      break;
  }
}

function drain(att: Fighter, dmg: number, side: Side, ev: BEvent[]) {
  const amt = Math.min(att.maxHp - att.hp, Math.round(dmg * 0.5));
  if (amt > 0) {
    att.hp += amt;
    ev.push({ t: "heal", side, amt });
  }
}

function teamHeal(b: Battle, side: Side, ev: BEvent[]) {
  const list = side === "p" ? b.team : [activeE(b)];
  let total = 0;
  for (const f of list) {
    if (f.hp <= 0) continue;
    const amt = Math.min(f.maxHp - f.hp, Math.round(f.maxHp * 0.12));
    f.hp += amt;
    total += amt;
  }
  ev.push({ t: "heal", side, amt: total, team: true });
}

function slimeDefPow(f: Fighter): number {
  const pows: Record<Element, number> = { water: 1.7, fire: 1.8, nature: 1.6, storm: 1.7, shadow: 1.9, light: 1.6 };
  return pows[f.el];
}

function doAction(b: Battle, side: Side, a: Action | EnemyAction, ev: BEvent[]) {
  const me = side === "p" ? activeP(b) : activeE(b);
  const foe = side === "p" ? activeE(b) : activeP(b);
  if (me.hp <= 0 && a.k !== "switch") return;
  if (me.stun && a.k !== "switch" && a.k !== "item") {
    me.stun = false;
    me.charging = false;
    ev.push({ t: "status", side, s: "stunned" });
    return;
  }
  switch (a.k) {
    case "attack":
      ev.push({ t: "act", side, kind: "attack" });
      dealDamage(b, side, me, foe, 1, undefined, ev);
      break;
    case "special":
      me.mana -= SPECIAL_COST;
      ev.push({ t: "act", side, kind: "special" });
      ev.push({ t: "mana", side });
      applySpecial(b, side, me, foe, ev);
      break;
    case "defend":
      me.defending = true;
      me.mana = Math.min(MANA_MAX, me.mana + 25);
      ev.push({ t: "act", side, kind: "defend" });
      ev.push({ t: "mana", side });
      break;
    case "heal": {
      me.mana -= HEAL_COST;
      const amt = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * 0.35));
      me.hp += amt;
      ev.push({ t: "act", side, kind: "heal" });
      ev.push({ t: "mana", side });
      ev.push({ t: "heal", side, amt });
      break;
    }
    case "charge":
      me.charging = true;
      ev.push({ t: "act", side, kind: "charge" });
      break;
    case "release":
      me.charging = false;
      ev.push({ t: "act", side, kind: "release" });
      dealDamage(b, side, me, foe, 2.6, me.el, ev);
      break;
    case "switch":
      b.active = a.to;
      b.team[a.to].defending = false;
      ev.push({ t: "switchIn", side: "p", idx: a.to });
      break;
    case "item": {
      b.items[a.item]--;
      b.itemsUsed[a.item]++;
      ev.push({ t: "act", side, kind: "item" });
      if (a.item === "potion") {
        const amt = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * 0.5));
        me.hp += amt;
        ev.push({ t: "heal", side, amt });
      } else if (a.item === "elixir") {
        me.mana = MANA_MAX;
        ev.push({ t: "mana", side });
      } else if (a.item === "apple") {
        const idx = a.target ?? b.team.findIndex((f) => f.hp <= 0);
        const f = b.team[idx];
        f.hp = Math.round(f.maxHp * 0.5);
        f.burn = 0;
        f.wet = 0;
        f.stun = false;
        ev.push({ t: "revive", idx });
      }
      break;
    }
  }
}

function checkFaints(b: Battle, ev: BEvent[]): boolean {
  const e = activeE(b);
  const p = activeP(b);
  let changed = false;
  if (e.hp <= 0) {
    ev.push({ t: "faint", side: "e" });
    changed = true;
    if (b.eIdx < b.enemies.length - 1) {
      b.eIdx++;
      ev.push({ t: "switchIn", side: "e", idx: b.eIdx });
    } else {
      b.result = "win";
      ev.push({ t: "end", result: "win" });
      return true;
    }
  }
  if (p.hp <= 0 && !b.needSwitch) {
    ev.push({ t: "faint", side: "p" });
    changed = true;
    if (b.team.every((f) => f.hp <= 0)) {
      b.result = "lose";
      ev.push({ t: "end", result: "lose" });
      return true;
    }
    b.needSwitch = true;
  }
  return changed;
}

/** Resolve one full turn for the player's chosen action. */
export function playTurn(b: Battle, action: Action): BEvent[] {
  const ev: BEvent[] = [];
  if (!canUse(b, action)) return ev;

  // forced switch after a faint: free action, no enemy move
  if (b.needSwitch) {
    b.needSwitch = false;
    doAction(b, "p", action, ev);
    return ev;
  }

  b.turn++;
  const p = activeP(b);
  const e = activeE(b);
  p.defending = false;
  e.defending = false;
  const plan = enemyPlan(b);
  const enemyFirstish = plan.k === "defend" ? 2 : 0;

  const pPri = priority(action);
  let playerFirst: boolean;
  if (pPri !== enemyFirstish) playerFirst = pPri > enemyFirstish;
  else if (p.spd !== e.spd) playerFirst = p.spd > e.spd;
  else playerFirst = b.rng() < 0.5;

  const enemyAtStart = e;
  const order: Side[] = playerFirst ? ["p", "e"] : ["e", "p"];
  for (const side of order) {
    if (b.result) break;
    if (side === "p") {
      if (activeP(b).hp > 0) doAction(b, "p", action, ev);
    } else {
      // enemy only acts if it is still the same enemy and alive
      if (activeE(b) === enemyAtStart && enemyAtStart.hp > 0) doAction(b, "e", plan, ev);
    }
    if (checkFaints(b, ev)) {
      if (b.result) return ev;
      // a faint ends the exchange for the fainted side
      if (side === "p" && enemyAtStart.hp <= 0) break;
      if (b.needSwitch) break;
    }
  }

  // end of turn: burn, timers, mana
  for (const side of ["p", "e"] as Side[]) {
    if (b.result) break;
    const f = side === "p" ? activeP(b) : activeE(b);
    if (f.hp <= 0) continue;
    if (f.burn > 0) {
      const amt = Math.max(1, Math.round(f.maxHp * 0.07));
      f.hp = Math.max(0, f.hp - amt);
      f.burn--;
      ev.push({ t: "status", side, s: "burnTick", amt });
      if (checkFaints(b, ev) && b.result) return ev;
    }
    if (f.wet > 0) f.wet--;
    if (f.hp > 0) {
      f.mana = Math.min(MANA_MAX, f.mana + MANA_REGEN);
      f.turnsOut++;
    }
  }
  ev.push({ t: "mana", side: "p" });
  ev.push({ t: "mana", side: "e" });
  return ev;
}

/** A simple player AI, used by the balance simulator. */
export function autoAction(b: Battle): Action {
  const p = activeP(b);
  const e = activeE(b);
  if (b.needSwitch) return { k: "switch", to: b.team.findIndex((f) => f.hp > 0) };
  if (e.charging) return { k: "defend" };
  if (p.hp < p.maxHp * 0.3 && b.items.potion > 0) return { k: "item", item: "potion" };
  if (b.team.some((f) => f.hp <= 0) && b.items.apple > 0 && p.hp > p.maxHp * 0.5) return { k: "item", item: "apple" };
  if (p.hp < p.maxHp * 0.4 && p.mana >= HEAL_COST) return { k: "heal" };
  if (p.mana >= SPECIAL_COST) return { k: "special" };
  return { k: "attack" };
}
