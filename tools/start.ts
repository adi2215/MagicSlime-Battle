// Starting state shared by the balance simulators (mirrors freshSave() in src/save.ts).
import type { ItemId, OwnedSlime } from "../src/engine";

export function freshStart(): { gold: number; owned: OwnedSlime[]; items: Record<ItemId, number> } {
  return {
    gold: 100,
    owned: [{ id: "drop", lvl: 2, xp: 0 }, { id: "ember", lvl: 2, xp: 0 }],
    items: { potion: 3, elixir: 1, apple: 0 },
  };
}
