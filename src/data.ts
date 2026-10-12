// Game content: elements, slimes, enemies, zones, items.

export type Element = "water" | "fire" | "nature" | "storm" | "shadow" | "light";
export type L10n = { ru: string; en: string };

export const ELEMENTS: Record<Element, { icon: string; color: string; name: L10n }> = {
  water: { icon: "💧", color: "#4ea8e6", name: { ru: "Вода", en: "Water" } },
  fire: { icon: "🔥", color: "#ef6a3a", name: { ru: "Огонь", en: "Fire" } },
  nature: { icon: "🌿", color: "#6cc04f", name: { ru: "Природа", en: "Nature" } },
  storm: { icon: "⚡", color: "#efcb3c", name: { ru: "Гроза", en: "Storm" } },
  shadow: { icon: "🌑", color: "#9a6ad8", name: { ru: "Тьма", en: "Shadow" } },
  light: { icon: "✨", color: "#f4dfa0", name: { ru: "Свет", en: "Light" } },
};

/** attacker element -> elements it hits for x1.5 */
export const STRONG_VS: Record<Element, Element[]> = {
  water: ["fire"],
  fire: ["nature"],
  nature: ["water", "storm"],
  storm: ["water"],
  shadow: ["light"],
  light: ["shadow"],
};

export function typeMult(att: Element, def: Element): number {
  if (STRONG_VS[att].includes(def)) return 1.5;
  if (STRONG_VS[def].includes(att) && !(att === "shadow" || att === "light")) return 0.67;
  return 1;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface SpecialMove {
  name: L10n;
  desc: L10n;
  pow: number;
}

export interface SlimeDef {
  id: string;
  sprite: string;
  el: Element;
  name: L10n;
  base: BaseStats;
  special: SpecialMove;
  price: number;
  /** stage index (0-based) that must be cleared to unlock in the shop; -1 = always */
  unlockAfter: number;
  /** only for players who proved a Solana wallet (wallet sign-in through iDos) */
  walletOnly?: boolean;
}

export const SPECIALS: Record<Element, SpecialMove> = {
  water: { name: { ru: "Приливная волна", en: "Tidal Wave" }, desc: { ru: "Мощный удар водой. 35% шанс промочить врага (−25% атаки на 2 хода).", en: "Strong water blast. 35% to soak the foe (−25% ATK for 2 turns)." }, pow: 1.7 },
  fire: { name: { ru: "Огненный шар", en: "Fireball" }, desc: { ru: "Сильный огненный удар. 40% шанс поджечь (урон 3 хода).", en: "Strong fire hit. 40% to burn (damage for 3 turns)." }, pow: 1.8 },
  nature: { name: { ru: "Вампир-лиана", en: "Leech Vine" }, desc: { ru: "Удар лианой. Восстанавливает 50% нанесённого урона.", en: "Vine strike. Heals 50% of the damage dealt." }, pow: 1.6 },
  storm: { name: { ru: "Шаровая молния", en: "Ball Lightning" }, desc: { ru: "Электрический удар. 30% шанс оглушить врага на ход.", en: "Electric strike. 30% to stun the foe for a turn." }, pow: 1.7 },
  shadow: { name: { ru: "Теневой клинок", en: "Shadow Blade" }, desc: { ru: "Пробивает защиту: игнорирует блок и половину брони.", en: "Pierces guard: ignores blocking and half of the armour." }, pow: 1.9 },
  light: { name: { ru: "Сияние", en: "Radiance" }, desc: { ru: "Удар светом и лечение всей команды на 12% здоровья.", en: "Light strike that heals the whole team by 12% HP." }, pow: 1.6 },
};

export const SLIMES: SlimeDef[] = [
  { id: "drop", sprite: "p_water", el: "water", name: { ru: "Капля", en: "Droplet" }, base: { hp: 62, atk: 16, def: 9, spd: 10 }, special: SPECIALS.water, price: 0, unlockAfter: -1 },
  { id: "ember", sprite: "p_fire", el: "fire", name: { ru: "Огонёк", en: "Ember" }, base: { hp: 54, atk: 20, def: 7, spd: 12 }, special: SPECIALS.fire, price: 0, unlockAfter: -1 },
  { id: "sprout", sprite: "p_nature", el: "nature", name: { ru: "Росток", en: "Sprout" }, base: { hp: 72, atk: 14, def: 11, spd: 8 }, special: SPECIALS.nature, price: 80, unlockAfter: 0 },
  { id: "zap", sprite: "p_storm", el: "storm", name: { ru: "Искрик", en: "Zappy" }, base: { hp: 56, atk: 18, def: 8, spd: 16 }, special: SPECIALS.storm, price: 380, unlockAfter: 4 },
  { id: "umbra", sprite: "p_shadow", el: "shadow", name: { ru: "Тень", en: "Umbra" }, base: { hp: 60, atk: 23, def: 8, spd: 14 }, special: SPECIALS.shadow, price: 900, unlockAfter: 9 },
  { id: "sol", sprite: "p_sol", el: "storm", name: { ru: "Сол", en: "Sol" }, base: { hp: 66, atk: 21, def: 10, spd: 18 }, special: { name: { ru: "Солана-импульс", en: "Solana Surge" }, desc: { ru: "Молниеносный удар со скоростью Solana. 30% шанс оглушить. Только для владельцев Solana-кошелька.", en: "A strike at Solana speed. 30% to stun. Solana wallet holders only." }, pow: 1.7 }, price: 0, unlockAfter: -1, walletOnly: true },
  { id: "lumi", sprite: "p_light", el: "light", name: { ru: "Люми", en: "Lumi" }, base: { hp: 78, atk: 20, def: 12, spd: 11 }, special: SPECIALS.light, price: 1700, unlockAfter: 14 },
];

export const slimeDef = (id: string) => SLIMES.find((s) => s.id === id)!;

export interface EnemyDef {
  id: string;
  sprite: string;
  el: Element;
  name: L10n;
  base: BaseStats;
  boss?: boolean;
  healer?: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  moss: { id: "moss", sprite: "e_moss", el: "nature", name: { ru: "Мшистый слайм", en: "Moss Slime" }, base: { hp: 50, atk: 14, def: 8, spd: 8 }, healer: true },
  puddle: { id: "puddle", sprite: "e_puddle", el: "water", name: { ru: "Злая лужа", en: "Angry Puddle" }, base: { hp: 46, atk: 15, def: 7, spd: 10 } },
  ice: { id: "ice", sprite: "e_ice", el: "water", name: { ru: "Ледяной слайм", en: "Frost Slime" }, base: { hp: 58, atk: 14, def: 11, spd: 7 } },
  spark: { id: "spark", sprite: "e_spark", el: "storm", name: { ru: "Искрун", en: "Sparkler" }, base: { hp: 44, atk: 17, def: 6, spd: 15 } },
  emberE: { id: "emberE", sprite: "e_ember", el: "fire", name: { ru: "Жгучий слайм", en: "Scorch Slime" }, base: { hp: 48, atk: 18, def: 7, spd: 11 } },
  magma: { id: "magma", sprite: "e_magma", el: "fire", name: { ru: "Магмовый рогач", en: "Magma Horn" }, base: { hp: 62, atk: 17, def: 11, spd: 7 } },
  horned: { id: "horned", sprite: "e_horned", el: "shadow", name: { ru: "Тёмный рогач", en: "Dark Horn" }, base: { hp: 54, atk: 19, def: 8, spd: 12 }, healer: true },
  // bosses
  mossking: { id: "mossking", sprite: "b_mossking", el: "nature", name: { ru: "Король Мха", en: "Moss King" }, base: { hp: 50, atk: 15, def: 9, spd: 8 }, boss: true, healer: true },
  deeplord: { id: "deeplord", sprite: "b_deeplord", el: "water", name: { ru: "Владыка Глубин", en: "Lord of the Deep" }, base: { hp: 52, atk: 16, def: 10, spd: 10 }, boss: true, healer: true },
  lavatitan: { id: "lavatitan", sprite: "b_lavatitan", el: "fire", name: { ru: "Лавовый Титан", en: "Lava Titan" }, base: { hp: 56, atk: 18, def: 10, spd: 9 }, boss: true },
  darkking: { id: "darkking", sprite: "b_darkking", el: "shadow", name: { ru: "Тёмный Король", en: "Shadow King" }, base: { hp: 50, atk: 18, def: 10, spd: 11 }, boss: true, healer: true },
};

export interface StageDef {
  idx: number;
  zone: number;
  enemies: { id: string; lvl: number }[];
  boss: boolean;
}

export interface ZoneDef {
  id: string;
  bg: string;
  name: L10n;
  pool: string[];
  boss: string;
  color: string;
}

export const ZONES: ZoneDef[] = [
  { id: "forest", bg: "forest", name: { ru: "Зелёный лес", en: "Green Forest" }, pool: ["moss", "puddle", "moss"], boss: "mossking", color: "#5fb04a" },
  { id: "lake", bg: "lake", name: { ru: "Хрустальное озеро", en: "Crystal Lake" }, pool: ["puddle", "ice", "spark"], boss: "deeplord", color: "#4b8fd8" },
  { id: "volcano", bg: "volcano", name: { ru: "Огненный вулкан", en: "Fire Volcano" }, pool: ["emberE", "magma", "spark"], boss: "lavatitan", color: "#e0602e" },
  { id: "castle", bg: "castle", name: { ru: "Тёмная крепость", en: "Dark Fortress" }, pool: ["horned", "magma", "ice", "spark"], boss: "darkking", color: "#8a5ac8" },
];

export const STAGES_PER_ZONE = 5;

export function stageLevel(idx: number): number {
  return 1 + Math.round(idx * 1.3);
}

function buildStages(): StageDef[] {
  const out: StageDef[] = [];
  ZONES.forEach((z, zi) => {
    for (let s = 0; s < STAGES_PER_ZONE; s++) {
      const idx = zi * STAGES_PER_ZONE + s;
      const lvl = stageLevel(idx);
      const boss = s === STAGES_PER_ZONE - 1;
      const enemies: { id: string; lvl: number }[] = [];
      if (boss) {
        enemies.push({ id: z.pool[idx % z.pool.length], lvl: Math.max(1, lvl - 1) });
        enemies.push({ id: z.boss, lvl });
      } else {
        const count = s === 0 ? (idx === 0 ? 1 : 2) : s < 3 ? 2 : 3;
        for (let k = 0; k < count; k++) {
          enemies.push({ id: z.pool[(idx + k) % z.pool.length], lvl: Math.max(1, lvl - (count - 1 - k)) });
        }
      }
      out.push({ idx, zone: zi, enemies, boss });
    }
  });
  return out;
}

export const STAGES = buildStages();

export interface ItemDef {
  id: "potion" | "elixir" | "apple";
  icon: string;
  name: L10n;
  desc: L10n;
  price: number;
}

export const ITEMS: ItemDef[] = [
  { id: "potion", icon: "potion", name: { ru: "Зелье лечения", en: "Healing Potion" }, desc: { ru: "Восстанавливает 50% здоровья активному слайму.", en: "Restores 50% HP of the active slime." }, price: 20 },
  { id: "elixir", icon: "elixir", name: { ru: "Эликсир маны", en: "Mana Elixir" }, desc: { ru: "Полностью восстанавливает ману.", en: "Fully restores mana." }, price: 25 },
  { id: "apple", icon: "apple", name: { ru: "Яблоко жизни", en: "Apple of Life" }, desc: { ru: "Воскрешает павшего слайма с 50% здоровья.", en: "Revives a fainted slime with 50% HP." }, price: 50 },
];

// ---- progression formulas
export const MAX_LEVEL = 40;
export const TEAM_SIZE = 3;
export const MANA_MAX = 100;
export const MANA_START = 40;
export const MANA_REGEN = 12;
export const SPECIAL_COST = 40;
export const HEAL_COST = 35;

export function statsAt(base: BaseStats, lvl: number, boss = false): BaseStats {
  const g = lvl - 1;
  const hpMul = boss ? 2.2 : 1;
  return {
    hp: Math.round(base.hp * (1 + 0.11 * g) * hpMul),
    atk: Math.round(base.atk * (1 + 0.1 * g)),
    def: Math.round(base.def * (1 + 0.1 * g)),
    spd: Math.round(base.spd * (1 + 0.03 * g)),
  };
}

export function xpToNext(lvl: number): number {
  return Math.round(20 + lvl * 12 + lvl * lvl);
}

export function enemyXp(lvl: number, boss: boolean): number {
  return Math.round((10 + lvl * 7 + lvl * lvl * 0.2) * (boss ? 3 : 1));
}

export function enemyGold(lvl: number, boss: boolean): number {
  return Math.round((8 + lvl * 3.5) * (boss ? 4 : 1));
}

export function trainCost(lvl: number): number {
  return Math.round(25 * Math.pow(lvl, 1.35));
}
