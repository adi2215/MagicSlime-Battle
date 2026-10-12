// Battle screen: renders a Battle and plays engine events as animations.
import { ELEMENTS, HEAL_COST, ITEMS, MANA_MAX, SLIMES, SPECIAL_COST, STRONG_VS, ZONES, slimeDef, xpToNext, type Element, type StageDef } from "./data";
import { activeE, activeP, canUse, createBattle, playTurn, type Action, type BEvent, type Fighter, type Side } from "./engine";
import { bar, btn, coin, elChip, h, hpColor, itemImg, modal, sleep, spriteEl, stars } from "./dom";
import { t, tl, type SKey } from "./i18n";
import { playMusic, sfx } from "./audio";
import { finishBattle, teamOwned, type BattleOutcome } from "./game";
import { save } from "./save";

interface Ctx {
  onExit: (o: BattleOutcome | null, next?: "retry" | "next" | "map") => void;
}

let fast = false;
const D = (ms: number) => sleep(fast ? ms * 0.45 : ms);

export function openBattle(wrap: HTMLElement, stage: StageDef, ctx: Ctx) {
  const b = createBattle(stage, teamOwned(), save.items);
  playMusic("battle");
  wrap.innerHTML = "";
  const zone = ZONES[stage.zone];

  const field = h("div", { class: "field" });
  field.style.backgroundImage = `url(game/bg/${zone.bg}.png)`;
  const slotE = h("div", { class: "slot e" });
  const slotP = h("div", { class: "slot p" });
  const cardE = h("div", { class: "card e panel" });
  const cardP = h("div", { class: "card p panel" });
  const logEl = h("div", { class: "log panel" });
  const actionsEl = h("div", { class: "actions" });
  const controls = h("div", { class: "controls" }, logEl, actionsEl);
  const speedBtn = btn(fast ? "⏩×2" : "⏩", () => {
    fast = !fast;
    speedBtn.textContent = fast ? "⏩×2" : "⏩";
  }, "small dark", { style: "position:absolute;right:10px;top:10px;z-index:4", title: "Speed" });
  const fleeBtn = btn(`🏳 ${t("a_flee")}`, () => confirmFlee(), "small dark flee");
  field.append(slotE, slotP, cardE, cardP, speedBtn);
  field.append(fleeBtn);
  wrap.append(h("div", { class: "battle" }, field, controls));

  let spriteE: HTMLElement;
  let spriteP: HTMLElement;
  // fighters/HP as currently shown (lag behind the engine while a turn is being animated)
  let showP: Fighter = activeP(b);
  let showE: Fighter = activeE(b);
  const dispHp = new Map<string, number>();
  const hpOf = (f: Fighter) => dispHp.get(f.uid) ?? f.hp;
  let busy = false;
  let sub: "items" | "switch" | "revive" | null = null;

  const scale = () => {
    const fh = field.clientHeight || 300;
    const fw = field.clientWidth || 360;
    return Math.max(1.6, Math.min(5, Math.min(fh / 105, fw / 100)));
  };

  function mountSprite(side: Side, f: Fighter, enter = true) {
    const slot = side === "p" ? slotP : slotE;
    slot.innerHTML = "";
    const s = scale() * (f.boss ? 1.3 : 1);
    const sp = spriteEl(f.sprite, s, { flip: side === "e", speed: f.boss ? 1.2 : 0.9 });
    if (enter) sp.classList.add("enter");
    sp.append(h("div", { class: "status-icons" }));
    slot.append(sp);
    if (side === "p") spriteP = sp;
    else spriteE = sp;
    refreshStatus(side);
  }

  function refreshStatus(side: Side) {
    const f = side === "p" ? showP : showE;
    const sp = side === "p" ? spriteP : spriteE;
    if (!sp) return;
    const icons = sp.querySelector(".status-icons")!;
    icons.textContent = `${f.burn > 0 ? "🔥" : ""}${f.wet > 0 ? "💧" : ""}${f.stun ? "💫" : ""}`;
    sp.classList.toggle("charging", f.charging);
    const shield = sp.querySelector(".shield");
    if (f.defending && !shield) sp.append(h("div", { class: "shield" }));
    if (!f.defending && shield) shield.remove();
  }

  function renderCards() {
    const e = showE;
    const p = showP;
    cardE.innerHTML = "";
    cardE.append(
      h("div", { class: "nm" }, h("span", null, tl(e.name), e.boss ? h("span", { class: "tag", style: "margin-left:6px;background:#c33b48;color:#fff" }, t("boss")) : null), h("span", { class: "lv" }, `${t("lvl")} ${e.lvl}`)),
      h("div", { class: "row", style: "margin-top:4px;justify-content:space-between" }, elChip(e.el), queueDots()),
      hpBar(e),
    );
    cardP.innerHTML = "";
    cardP.append(
      h("div", { class: "nm" }, h("span", null, tl(p.name)), h("span", { class: "lv" }, `${t("lvl")} ${p.lvl}`)),
      hpBar(p),
      h("div", { class: "hp-num", "data-hp": "p" }, `${hpOf(p)} / ${p.maxHp}`),
      manaBar(p),
      h("div", { class: "row", style: "justify-content:space-between;margin-top:4px" }, elChip(p.el), teamDots()),
    );
  }

  function hpBar(f: Fighter) {
    const b0 = bar(hpOf(f) / f.maxHp);
    b0.dataset.uid = f.uid;
    b0.dataset.kind = "hp";
    return b0;
  }
  function manaBar(f: Fighter) {
    const b0 = bar(f.mana / MANA_MAX, "mana");
    b0.dataset.uid = f.uid;
    b0.dataset.kind = "mana";
    return b0;
  }
  function queueDots() {
    const q = h("div", { class: "queue" });
    b.enemies.forEach((en, i) => q.append(h("span", { class: `${en.boss ? "boss" : ""} ${i < b.enemies.indexOf(showE) || hpOf(en) <= 0 ? "dead" : ""}` })));
    return q;
  }
  function teamDots() {
    const q = h("div", { class: "team-dots" });
    b.team.forEach((f) => {
      const d = h("span");
      d.style.background = f.hp > 0 ? ELEMENTS[f.el].color : "#333";
      q.append(d);
    });
    return q;
  }

  function updateBars() {
    for (const f of [showP, showE]) {
      const hp = field.querySelector<HTMLElement>(`.bar[data-uid="${f.uid}"][data-kind="hp"] > i`);
      if (hp) {
        hp.style.width = `${(hpOf(f) / f.maxHp) * 100}%`;
        hp.style.background = hpColor(hpOf(f) / f.maxHp);
      }
      const mp = field.querySelector<HTMLElement>(`.bar[data-uid="${f.uid}"][data-kind="mana"] > i`);
      if (mp) mp.style.width = `${(f.mana / MANA_MAX) * 100}%`;
    }
    const num = field.querySelector('[data-hp="p"]');
    if (num) num.textContent = `${hpOf(showP)} / ${showP.maxHp}`;
  }

  function log(key: SKey, p?: Record<string, string | number>) {
    logEl.innerHTML = "";
    const txt = t(key, p);
    logEl.append(h("span", { html: txt.replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }));
  }

  function floatText(side: Side, text: string, cls: string) {
    const sp = side === "p" ? spriteP : spriteE;
    const fr = field.getBoundingClientRect();
    const r = sp.getBoundingClientRect();
    const el = h("div", { class: `float ${cls}` }, text);
    el.style.left = `${r.left - fr.left + r.width / 2 + (Math.random() * 30 - 15)}px`;
    el.style.top = `${r.top - fr.top + r.height * 0.25}px`;
    field.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  function center(side: Side) {
    const sp = side === "p" ? spriteP : spriteE;
    const fr = field.getBoundingClientRect();
    const r = sp.getBoundingClientRect();
    return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height * 0.6 };
  }

  async function orb(from: Side, el: Element | "dark") {
    const a = center(from);
    const z = center(from === "p" ? "e" : "p");
    const color = el === "dark" ? "#ff3b3b" : ELEMENTS[el].color;
    const o = h("div", { class: "orb" });
    o.style.background = `radial-gradient(circle, #fff 0 25%, ${color} 45%, transparent 72%)`;
    o.style.boxShadow = `0 0 18px 6px ${color}`;
    o.style.left = `${a.x}px`;
    o.style.top = `${a.y}px`;
    field.append(o);
    const dur = fast ? 200 : 380;
    await o.animate([{ left: `${a.x}px`, top: `${a.y}px`, transform: "translate(-50%,-50%) scale(.6)" }, { left: `${z.x}px`, top: `${z.y - 30}px`, transform: "translate(-50%,-50%) scale(1.3)", offset: 0.5 }, { left: `${z.x}px`, top: `${z.y}px`, transform: "translate(-50%,-50%) scale(1)" }], { duration: dur, easing: "ease-in" }).finished.catch(() => {});
    o.remove();
    burst(z.x, z.y, color, 12);
  }

  function burst(x: number, y: number, color: string, n = 10) {
    for (let i = 0; i < n; i++) {
      const p = h("div", { class: "burst" });
      p.style.background = i % 3 === 0 ? "#fff" : color;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      field.append(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 50;
      p.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist - 6}px, ${Math.sin(ang) * dist - 6}px) scale(.3)`, opacity: 0 }], { duration: 500 + Math.random() * 200, easing: "ease-out" }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  function sparkles(side: Side, color = "#7dff8a") {
    const c = center(side);
    for (let i = 0; i < 10; i++) {
      const p = h("div", { class: "burst" });
      p.style.background = color;
      p.style.left = `${c.x + (Math.random() * 80 - 40)}px`;
      p.style.top = `${c.y + 10}px`;
      field.append(p);
      p.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(-${50 + Math.random() * 40}px)`, opacity: 0 }], { duration: 700, delay: i * 30, easing: "ease-out" }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  const nameOf = (side: Side) => tl((side === "p" ? showP : showE).name);
  const moveName = (side: Side) => {
    const f = side === "p" ? showP : showE;
    return SLIMES.some((d) => d.id === f.defId) ? tl(slimeDef(f.defId).special.name) : tl(specialNameFor(f.el));
  };

  async function play(events: BEvent[]) {
    for (const ev of events) {
      switch (ev.t) {
        case "act": {
          const sp = ev.side === "p" ? spriteP : spriteE;
          const n = nameOf(ev.side);
          if (ev.kind === "attack") {
            log("attacks", { name: `**${n}**` });
            sp.classList.add(ev.side === "p" ? "lunge-p" : "lunge-e");
            await D(170);
            sp.classList.remove("lunge-p", "lunge-e");
          } else if (ev.kind === "special") {
            log("uses", { name: `**${n}**`, move: moveName(ev.side) });
            sfx.special();
            const f = ev.side === "p" ? showP : showE;
            await orb(ev.side, f.el);
          } else if (ev.kind === "defend") {
            log("defends", { name: `**${n}**` });
            sfx.defend();
            refreshStatus(ev.side);
            await D(500);
          } else if (ev.kind === "heal") {
            log("heals", { name: `**${n}**` });
          } else if (ev.kind === "charge") {
            log("charges", { name: `**${n}**` });
            sfx.charge();
            refreshStatus(ev.side);
            showBanner("⚠", "#ff5a5a");
            await D(1100);
          } else if (ev.kind === "release") {
            log("releases", { name: `**${n}**` });
            refreshStatus(ev.side);
            await orb(ev.side, "dark");
            field.append(Object.assign(h("div", { class: "flash" }), {}));
            wrap.classList.add("shake");
            setTimeout(() => wrap.classList.remove("shake"), 400);
          }
          break;
        }
        case "hit": {
          const tf = ev.side === "p" ? showP : showE;
          dispHp.set(tf.uid, Math.max(0, hpOf(tf) - ev.dmg));
          const sp = ev.side === "p" ? spriteP : spriteE;
          sp.classList.remove("hurt");
          void sp.offsetWidth;
          sp.classList.add("hurt");
          if (ev.crit) sfx.crit();
          else sfx.hit();
          floatText(ev.side, `-${ev.dmg}`, ev.crit ? "crit" : ev.eff > 1 ? "eff" : "dmg");
          updateBars();
          await D(380);
          if (ev.blocked) {
            floatText(ev.side, t("blocked"), "info");
            log("blocked");
            await D(550);
          }
          if (ev.eff > 1) {
            log("superEff");
            await D(650);
          } else if (ev.eff < 1) {
            log("notEff");
            await D(650);
          }
          if (ev.crit) {
            log("crit");
            await D(550);
          }
          break;
        }
        case "heal": {
          if (ev.team) (ev.side === "p" ? b.team : [showE]).forEach((f) => dispHp.delete(f.uid));
          else {
            const tf = ev.side === "p" ? showP : showE;
            dispHp.set(tf.uid, Math.min(tf.maxHp, hpOf(tf) + ev.amt));
          }
          if (ev.amt > 0) {
            sfx.heal();
            floatText(ev.side, `+${ev.amt}`, "heal");
            sparkles(ev.side);
          }
          if (ev.team) log("teamHeal");
          updateBars();
          await D(600);
          break;
        }
        case "mana":
          updateBars();
          break;
        case "status": {
          const n = `**${nameOf(ev.side)}**`;
          const map = { burn: "burned", wet: "soaked", stun: "stunned", burnTick: "burnTick", stunned: "cantMove", drain: "heals" } as const;
          log(map[ev.s], { name: n });
          if (ev.s === "burnTick") {
            const tf = ev.side === "p" ? showP : showE;
            dispHp.set(tf.uid, Math.max(0, hpOf(tf) - (ev.amt ?? 0)));
            const sp = ev.side === "p" ? spriteP : spriteE;
            sp.classList.remove("hurt");
            void sp.offsetWidth;
            sp.classList.add("hurt");
            floatText(ev.side, `-${ev.amt}`, "eff");
            updateBars();
          }
          refreshStatus(ev.side);
          await D(650);
          break;
        }
        case "faint": {
          const sp = ev.side === "p" ? spriteP : spriteE;
          log("fainted", { name: `**${nameOf(ev.side)}**` });
          sfx.faint();
          sp.classList.add("faint");
          await D(800);
          break;
        }
        case "switchIn": {
          if (ev.side === "p") {
            showP = b.team[ev.idx];
            mountSprite("p", showP);
            log("go", { name: `**${tl(showP.name)}**` });
          } else {
            showE = b.enemies[ev.idx];
            mountSprite("e", showE);
            log("appears", { name: `**${tl(showE.name)}**` });
            if (showE.boss) showBanner(t("boss"), "#ff5a6e");
          }
          renderCards();
          await D(750);
          break;
        }
        case "revive":
          dispHp.delete(b.team[ev.idx].uid);
          sfx.heal();
          log("revived", { name: `**${tl(b.team[ev.idx].name)}**` });
          renderCards();
          await D(700);
          break;
        case "msg":
          await D(500);
          break;
        case "end":
          break;
      }
    }
    // turn fully shown: from now on display the real engine state
    dispHp.clear();
    showP = activeP(b);
    showE = activeE(b);
    updateBars();
    // clear defend shields at end of turn display
    refreshStatus("p");
    refreshStatus("e");
  }

  function showBanner(text: string, color: string) {
    const el = h("div", { class: "banner" }, text);
    el.style.color = color;
    field.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  async function act(a: Action) {
    if (busy || !canUse(b, a)) {
      sfx.error();
      return;
    }
    busy = true;
    sub = null;
    renderActions();
    const items0 = a.k === "item" ? ITEMS.find((i) => i.id === a.item) : null;
    if (items0) {
      log("usesItem", { item: tl(items0.name) });
      await D(400);
    }
    for (const f of [...b.team, ...b.enemies]) dispHp.set(f.uid, f.hp);
    const ev = playTurn(b, a);
    await play(ev);
    busy = false;
    if (b.result) {
      await D(300);
      return end();
    }
    if (b.needSwitch) sub = "switch";
    renderActions();
    if (b.needSwitch) log("choose_next");
    else promptLine();
  }

  function promptLine() {
    const p = showP;
    const e = showE;
    if (e.charging) log("charges", { name: `**${tl(e.name)}**` });
    else logEl.innerHTML = `<span>${save.lang === "ru" ? "Что сделает" : "What will"} <b>${tl(p.name)}</b>${save.lang === "ru" ? "?" : " do?"}</span>`;
  }

  function renderActions() {
    actionsEl.innerHTML = "";
    actionsEl.className = busy ? "actions busy" : "actions";
    const p = showP;
    if (sub === "switch" || sub === "revive") {
      actionsEl.className = "sub";
      b.team.forEach((f, i) => {
        const isActive = i === b.active;
        const a: Action = sub === "revive" ? { k: "item", item: "apple", target: i } : { k: "switch", to: i };
        const ok = canUse(b, a) && !busy;
        const bt = btn(
          [spriteEl(f.sprite, 0.9, { still: f.hp <= 0, shadow: false }), h("div", { class: "meta" }, h("span", { class: "pixel" }, `${tl(f.name)} ${t("lvl")}${f.lvl}`), bar(f.hp / f.maxHp), h("span", { style: "font-size:11px;opacity:.8" }, `${f.hp}/${f.maxHp}${isActive ? " • ⚔" : ""}`))],
          () => act(a), "dark", ok ? {} : { disabled: true },
        );
        actionsEl.append(bt);
      });
      if (!b.needSwitch) actionsEl.append(btn(`↩ ${t("back")}`, () => { sub = null; renderActions(); promptLine(); }, "dark"));
      else log("choose_next");
      return;
    }
    if (sub === "items") {
      actionsEl.className = "sub";
      for (const it of ITEMS) {
        const n = b.items[it.id];
        const a: Action = { k: "item", item: it.id };
        const ok = canUse(b, a) && !busy;
        actionsEl.append(
          btn([itemImg(it.icon, 32), h("div", { class: "meta" }, h("span", { class: "pixel" }, `${tl(it.name)} ×${n}`), h("span", { style: "font-size:11px;opacity:.8;white-space:normal;text-align:left" }, tl(it.desc)))], () => {
            if (it.id === "apple") {
              const dead = b.team.filter((f) => f.hp <= 0);
              if (dead.length > 1) {
                sub = "revive";
                renderActions();
                log("revive_who");
                return;
              }
            }
            act(a);
          }, "dark", ok ? {} : { disabled: true }),
        );
      }
      actionsEl.append(btn(`↩ ${t("back")}`, () => { sub = null; renderActions(); }, "dark"));
      return;
    }
    const mk = (icon: string, key: SKey, a: Action | null, cls: string, cost?: string, onClick?: () => void) => {
      const ok = !busy && (a ? canUse(b, a) : true);
      return btn([h("span", { class: "ai" }, icon), h("span", null, t(key)), cost ? h("span", { class: "cost" }, cost) : null], onClick ?? (() => act(a!)), cls, ok ? {} : { disabled: true });
    };
    const anyItem = ITEMS.some((it) => b.items[it.id] > 0);
    const canSwitch = b.team.some((f, i) => i !== b.active && f.hp > 0);
    actionsEl.append(
      mk("⚔", "a_attack", { k: "attack" }, "red"),
      mk(ELEMENTS[p.el].icon, "a_special", { k: "special" }, "purple", `${SPECIAL_COST} ${t("mana")}`),
      mk("🛡", "a_defend", { k: "defend" }, "", "+25 " + t("mana")),
      mk("💚", "a_heal", { k: "heal" }, "green", `${HEAL_COST} ${t("mana")}`),
      mk("🎒", "a_items", null, "gold", undefined, () => { if (!anyItem) return sfx.error(); sub = "items"; renderActions(); }),
      mk("🔁", "a_switch", null, "dark", undefined, () => { if (!canSwitch) return sfx.error(); sub = "switch"; renderActions(); log("choose_slime"); }),
    );
    const items = actionsEl.children[4] as HTMLButtonElement;
    if (!anyItem || busy) items.disabled = true;
    const sw = actionsEl.children[5] as HTMLButtonElement;
    if (!canSwitch || busy) sw.disabled = true;
    (actionsEl.children[1] as HTMLElement).title = `${moveName("p")} — ${tl(slimeDef(p.defId).special.desc)}`;
  }

  function defeatTips(): string[] {
    const tips: string[] = [];
    const foeEls = Array.from(new Set(b.enemies.map((e) => e.el)));
    const good = (Object.keys(STRONG_VS) as Element[]).filter((el) => STRONG_VS[el].some((x) => foeEls.includes(x)));
    if (good.length) tips.push("💡 " + t("tipStrong", { els: good.map((el) => `${ELEMENTS[el].icon} ${tl(ELEMENTS[el].name)}`).join(", ") }));
    const teamEls = new Set(b.team.map((f) => f.el));
    if (!good.some((el) => teamEls.has(el))) {
      const benched = save.owned.filter((o) => !save.team.includes(o.id) && good.includes(slimeDef(o.id).el));
      const buyable = SLIMES.filter((d) => good.includes(d.el) && !save.owned.some((o) => o.id === d.id) && !d.walletOnly && d.unlockAfter <= save.cleared);
      if (benched.length) tips.push("🫧 " + t("tipTeam", { names: benched.map((o) => tl(slimeDef(o.id).name)).join(", ") }));
      else if (buyable.length) tips.push("🛒 " + t("tipBuy", { names: buyable.map((d) => tl(d.name)).join(", ") }));
    }
    if (b.stage.boss) tips.push("🛡 " + t("tipDefend"));
    return tips;
  }

  function confirmFlee() {
    if (busy) return;
    modal((close) => h("div", { class: "col" },
      h("h2", null, `${t("a_flee")}?`),
      h("p", { class: "center muted", style: "margin:0" }, save.lang === "ru" ? "Награды не будет." : "You won't get any reward."),
      h("div", { class: "row" }, btn(t("no"), close, "dark grow"), btn(t("yes"), () => { close(); ctx.onExit(null, "map"); }, "red grow")),
    ));
  }

  async function end() {
    const o = finishBattle(b);
    if (o.win) sfx.win();
    else sfx.lose();
    showBanner(o.win ? t("victory") : t("defeat"), o.win ? "#ffd23f" : "#ff5a5a");
    await D(1200);
    showResults(o);
  }

  function showResults(o: BattleOutcome) {
    modal((close) => {
      const box = h("div", { class: "col", style: "gap:12px" });
      box.append(h("h2", { style: `color:${o.win ? "var(--gold)" : "var(--red)"}` }, o.win ? t("victory") : t("defeat")));
      if (o.win) {
        const st = h("div", { class: "result-stars" });
        o.starFlags.forEach((f, i) => {
          const s = h("span", { class: f ? "" : "off", style: `animation-delay:${0.15 + i * 0.2}s` }, "⭐");
          st.append(s);
        });
        box.append(st, h("div", { class: "star-reasons" }, h("span", null, t("star_win")), h("span", null, t("star_nofaint")), h("span", null, t("star_noitems"))));
      } else {
        box.append(h("p", { class: "center muted", style: "margin:0" }, t("defeatHint")));
        const tips = defeatTips();
        if (tips.length) box.append(h("div", { class: "panel", style: "padding:10px 12px;background:var(--panel-2);font-size:14px;line-height:1.45" }, ...tips.map((x) => h("div", null, x))));
      }
      box.append(h("div", { class: "reward-row" }, h("span", null, coin(), ` +${o.gold}`), h("span", { style: "color:#9fd6ff" }, `✦ +${o.xp} ${t("xp")}`)));
      if (o.win) box.append(h("div", { class: "center muted", style: "font-size:12px;margin-top:-6px" }, o.firstClear ? t("firstClear") : t("replay")));
      const xl = h("div", { class: "xp-list" });
      for (const r of o.xpRows) {
        const d = slimeDef(r.id);
        const need = xpToNext(r.lvl);
        xl.append(h("div", { class: "xp-row" }, spriteEl(d.sprite, 0.9, { shadow: false }), h("div", null,
          h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "pixel" }, `${tl(d.name)} ${t("lvl")} ${r.lvl}`), r.gained ? h("span", { class: "lvlup" }, `LEVEL UP! +${r.gained}`) : null),
          bar(r.xp / need, "xp"),
        )));
      }
      box.append(xl);
      if (o.levelUps.length) setTimeout(() => sfx.levelUp(), 500);
      if (o.gold > 0) setTimeout(() => sfx.coin(), 300);
      const row = h("div", { class: "row" });
      const next = o.win && o.firstClear && !o.gameCleared && b.stage.idx < 19;
      row.append(btn(`🗺 ${t("toMap")}`, () => { close(); ctx.onExit(o, "map"); }, "dark grow"));
      row.append(btn(`↻ ${t("retry")}`, () => { close(); ctx.onExit(o, "retry"); }, `${o.win ? "dark" : "gold"} grow`));
      if (next) row.append(btn(`${t("next")} ▶`, () => { close(); ctx.onExit(o, "next"); }, "gold grow"));
      box.append(row);
      return box;
    }, { closable: false });
  }

  // initial render (after layout so the sprite scale matches the field)
  requestAnimationFrame(() => {
    mountSprite("p", showP);
    mountSprite("e", showE);
    renderCards();
    renderActions();
    log("appears", { name: `**${tl(showE.name)}**` });
    if (showE.boss) showBanner(t("boss"), "#ff5a6e");
    setTimeout(() => { if (!busy) promptLine(); }, 1100);
  });

  const onResize = () => {
    if (!spriteP?.isConnected) return window.removeEventListener("resize", onResize);
    const s = scale();
    spriteP.style.setProperty("--s", String(s));
    spriteE.style.setProperty("--s", String(s * (showE.boss ? 1.3 : 1)));
  };
  window.addEventListener("resize", onResize);
}

function specialNameFor(el: Element) {
  const n: Record<Element, { ru: string; en: string }> = {
    water: { ru: "Водяной залп", en: "Water Burst" },
    fire: { ru: "Пламя", en: "Flame" },
    nature: { ru: "Шипы", en: "Thorns" },
    storm: { ru: "Разряд", en: "Shock" },
    shadow: { ru: "Тьма", en: "Darkness" },
    light: { ru: "Свет", en: "Light" },
  };
  return n[el];
}

export { stars };
