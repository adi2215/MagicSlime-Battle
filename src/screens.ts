// Menu screens: title, map, team, shop, ranking, settings.
import { ELEMENTS, ENEMIES, ITEMS, MAX_LEVEL, SLIMES, STAGES, STAGES_PER_ZONE, STRONG_VS, TEAM_SIZE, ZONES, enemyGold, slimeDef, statsAt, trainCost, xpToNext } from "./data";
import { bar, btn, coin, elChip, h, itemImg, modal, setWrap, spriteEl, stars, toast } from "./dom";
import { t, tl } from "./i18n";
import { playMusic, refreshMusic, sfx, unlockAudio } from "./audio";
import { idos } from "./idos";
import { owned, persist, resetSave, save, syncFromCloud, totalStars } from "./save";
import { shortAddr } from "./solana";
import { buyItem, buySlime, isUnlocked, makeLeader, recruitLevel, toggleTeam, trainSlime } from "./game";
import { openBattle } from "./battleView";
import type { ItemId } from "./engine";

type Tab = "map" | "team" | "shop" | "top";

let wrap: HTMLElement;
let tab: Tab = "map";
let zoneView = 0;
let shopTab: "slimes" | "items" = "slimes";

export function mountApp(root: HTMLElement) {
  wrap = h("div", { class: "stage-wrap" });
  root.append(wrap);
  setWrap(wrap);
  zoneView = currentZone();
  idos.onChange(() => refreshCloudChip());
  showTitle();
}

function currentZone() {
  return Math.min(ZONES.length - 1, Math.floor(Math.min(STAGES.length - 1, save.cleared + 1) / STAGES_PER_ZONE));
}

// ---------------------------------------------------------------- title
export function showTitle() {
  wrap.innerHTML = "";
  playMusic("map");
  const slimes = h("div", { class: "title-slimes" }, ...["p_fire", "p_water", "p_nature"].map((s, i) => spriteEl(s, i === 1 ? 3 : 2.2)));
  const screen = h("div", { class: "title-screen" },
    h("div", { style: "flex:1" }),
    slimes,
    h("div", { class: "logo" }, "Magic Slime", h("small", null, t("subtitle"))),
    h("div", { class: "title-row" },
      btn(`▶ ${save.cleared >= 0 ? t("continue") : t("play")}`, () => {
        unlockAudio();
        if (!save.seenIntro) showIntro();
        else showMain("map");
      }, "gold big"),
    ),
    idos.status !== "wallet" ? h("div", { class: "title-row" }, solButton("sol")) : null,
    h("div", { class: "title-row" }, cloudChip(), langButton(), btn("⚙", () => { unlockAudio(); openSettings(); }, "dark icon-btn small", { title: t("settings") })),
  );
  wrap.append(screen);
}

function showIntro() {
  showMain("map");
  modal((close) => {
    const lines = [t("intro1"), t("intro2"), t("intro3")];
    return h("div", { class: "col" },
      h("div", { class: "dialog" }, h("div", { class: "hero-portrait" }), h("div", null, ...lines.map((l) => h("p", null, l)))),
      btn(t("letsGo"), () => { save.seenIntro = true; persist(); close(); }, "gold wide"),
    );
  }, { closable: false });
}

// ---------------------------------------------------------------- shell
function cloudChip() {
  const st = idos.status;
  if (st === "wallet" && idos.solAddress)
    return h("span", { class: `pill cloud wallet`, "data-cloud": "1", title: t("solVerified") }, h("span", { class: "dot" }), `◎ ${shortAddr(idos.solAddress)}`);
  const key = (`cloud_${st}`) as "cloud_connecting" | "cloud_offline" | "cloud_guest" | "cloud_account" | "cloud_wallet";
  return h("span", { class: `pill cloud ${st}`, "data-cloud": "1" }, h("span", { class: "dot" }), t(key));
}

function langButton() {
  const next = save.lang === "ru" ? "en" : "ru";
  return btn(`🌐 ${next.toUpperCase()}`, () => {
    save.lang = next;
    document.documentElement.lang = next;
    persist();
    rerenderAll();
  }, "dark small", { title: next === "en" ? "Switch to English" : "Переключить на русский", style: "min-width:64px" });
}

function solButton(cls = "sol small") {
  return btn(t("solLogin"), () => solLogin(), cls, { "data-sol": "1" });
}

function refreshCloudChip() {
  wrap.querySelectorAll("[data-cloud]").forEach((el) => el.replaceWith(cloudChip()));
  if (idos.status === "wallet") wrap.querySelectorAll("[data-sol]").forEach((el) => el.remove());
}

let solBusy = false;
async function solLogin() {
  if (solBusy) return;
  unlockAudio();
  solBusy = true;
  toast(t("solSigning"));
  try {
    const r = await idos.loginSolana();
    if (!r.ok) {
      sfx.error();
      toast(r.noWallet ? t("solNoWallet") : t("solFailed", { e: r.error.slice(0, 80) }));
      return;
    }
    await syncFromCloud();
    document.documentElement.lang = save.lang;
    sfx.levelUp();
    toast(t("solOk"));
    rerenderAll();
  } finally {
    solBusy = false;
  }
}

export function refreshTopbar() {
  const g = wrap.querySelector("[data-gold]");
  if (g) g.textContent = String(save.gold);
  const s = wrap.querySelector("[data-stars]");
  if (s) s.textContent = String(totalStars());
}

export function showMain(which: Tab = tab) {
  tab = which;
  playMusic("map");
  wrap.innerHTML = "";
  const top = h("div", { class: "topbar" },
    h("span", { class: "pill" }, coin(), h("span", { "data-gold": "1" }, String(save.gold))),
    h("span", { class: "pill" }, "⭐", h("span", { "data-stars": "1" }, String(totalStars())), h("span", { class: "muted", style: "font-size:13px" }, `/${STAGES.length * 3}`)),
    h("div", { class: "grow" }),
    langButton(),
    btn("⚙", openSettings, "dark icon-btn small", { title: t("settings") }),
  );
  const body = h("div", { class: "screen" });
  const nav = h("div", { class: "nav" },
    ...([["map", "🗺", t("map")], ["team", "🫧", t("team")], ["shop", "🛒", t("shop")], ["top", "🏆", t("top")]] as const).map(([id, icon, label]) =>
      btn([h("span", { class: "ni" }, icon), h("span", null, label)], () => showMain(id), `dark ${tab === id ? "active" : ""}`)),
  );
  if (tab === "map") {
    // map draws its own full-bleed background behind the top bar
    const m = renderMap();
    wrap.append(m);
    m.prepend(top);
    m.append(nav);
    return;
  }
  wrap.append(top, body, nav);
  if (tab === "team") renderTeam(body);
  if (tab === "shop") renderShop(body);
  if (tab === "top") renderTop(body);
}

// ---------------------------------------------------------------- map
const NODE_POS: [number, number][] = [[18, 80], [42, 64], [70, 74], [80, 44], [48, 26]];

function renderMap() {
  const z = ZONES[zoneView];
  const m = h("div", { class: "map" });
  const bg = h("div", { class: "map-bg" });
  bg.style.backgroundImage = `url(game/bg/${z.bg}.png)`;
  m.append(bg);
  const tabs = h("div", { class: "zone-tabs" });
  ZONES.forEach((zz, i) => {
    const open = i * STAGES_PER_ZONE <= save.cleared + 1;
    const zoneStars = save.stars.slice(i * STAGES_PER_ZONE, (i + 1) * STAGES_PER_ZONE).reduce((a, b) => a + b, 0);
    tabs.append(btn(`${open ? "" : "🔒 "}${i + 1}. ${tl(zz.name)}${open ? ` ★${zoneStars}` : ""}`, () => {
      if (!open) { sfx.error(); toast(t("locked")); return; }
      zoneView = i;
      showMain("map");
    }, `${i === zoneView ? "gold" : "dark"}`, open ? {} : { style: "opacity:.7" }));
  });
  m.append(tabs);
  m.append(h("div", { class: "zone-title" }, tl(z.name)));
  const nodes = h("div", { class: "nodes" });
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const path = document.createElementNS(svgNS, "polyline");
  path.setAttribute("points", NODE_POS.map(([x, y]) => `${x},${y}`).join(" "));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(255,240,200,.85)");
  path.setAttribute("stroke-width", "1.4");
  path.setAttribute("stroke-dasharray", "2 2");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  path.style.strokeWidth = "5px";
  svg.append(path);
  nodes.append(svg);
  for (let s = 0; s < STAGES_PER_ZONE; s++) {
    const idx = zoneView * STAGES_PER_ZONE + s;
    const st = STAGES[idx];
    const unlocked = idx <= save.cleared + 1;
    const current = idx === save.cleared + 1;
    const [x, y] = NODE_POS[s];
    const n = h("button", { class: `node ${st.boss ? "boss" : ""} ${unlocked ? "" : "locked"} ${current ? "current" : ""}`, style: `left:${x}%;top:${y}%;--zc:${z.color}` },
      h("div", { class: "disc" }, unlocked ? (st.boss ? "👑" : String(idx + 1)) : "🔒"),
      unlocked && idx <= save.cleared ? stars(save.stars[idx]) : h("span", { class: "lbl" }, st.boss ? t("boss") : `${t("stage")} ${idx + 1}`),
    );
    n.addEventListener("click", () => {
      if (!unlocked) { sfx.error(); toast(t("locked")); return; }
      sfx.click();
      openStage(idx);
    });
    nodes.append(n);
  }
  m.append(nodes);
  return m;
}

function openStage(idx: number) {
  const st = STAGES[idx];
  const first = idx > save.cleared;
  let gold = 0;
  for (const e of st.enemies) gold += enemyGold(e.lvl, !!ENEMIES[e.id].boss);
  gold = Math.round(gold * (first ? 1.3 : 0.6));
  modal((close) => {
    const list = h("div", { class: "enemy-list" });
    for (const e of st.enemies) {
      const d = ENEMIES[e.id];
      list.append(h("div", { class: `enemy-card ${d.boss ? "boss" : ""}` }, spriteEl(d.sprite, 2, { flip: true }), h("b", { class: "pixel", style: "font-size:13px" }, tl(d.name)), elChip(d.el), h("span", { class: "muted" }, `${t("lvl")} ${e.lvl}${d.boss ? ` • ${t("boss")}` : ""}`)));
    }
    const team = h("div", { class: "row", style: "justify-content:center;gap:4px" });
    for (const id of save.team) {
      const o = owned(id)!;
      team.append(h("div", { class: "col", style: "align-items:center;gap:0" }, spriteEl(slimeDef(id).sprite, 1.8), h("span", { style: "font-size:12px" }, `${t("lvl")} ${o.lvl}`)));
    }
    // hint: which of the player's elements are strong here
    const els = Array.from(new Set(st.enemies.map((e) => ENEMIES[e.id].el)));
    const good = Object.entries(STRONG_VS).filter(([, v]) => v.some((x) => els.includes(x))).map(([k]) => ELEMENTS[k as keyof typeof ELEMENTS].icon);
    return h("div", { class: "col", style: "gap:12px" },
      h("h2", null, `${t("stage")} ${idx + 1}${st.boss ? ` — ${t("boss")}` : ""}`),
      h("div", { class: "center muted", style: "margin-top:-8px" }, tl(ZONES[st.zone].name), idx <= save.cleared ? h("span", null, " • ", stars(save.stars[idx])) : null),
      h("div", { class: "section-h", style: "margin:0" }, t("enemies")),
      list,
      good.length ? h("div", { class: "center", style: "font-size:13px" }, `${t("strongHere")}: ${good.join(" ")}`) : null,
      h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "section-h", style: "margin:0" }, t("team")), btn(`✎ ${t("team")}`, () => { close(); showMain("team"); }, "small dark")),
      team,
      h("div", { class: "center pixel", style: "font-size:18px" }, `${t("reward")}: `, coin(), ` ${gold}`),
      h("div", { class: "row" }, btn(t("close"), close, "dark grow"), btn(`⚔ ${t("fight")}`, () => { close(); startStage(idx); }, "gold grow big")),
    );
  });
}

export function startStage(idx: number) {
  openBattle(wrap, STAGES[idx], {
    onExit: (o, next) => {
      if (o?.zoneCleared != null && !o.gameCleared) toast(t("zoneDone", { zone: tl(ZONES[o.zoneCleared].name) }));
      if (o?.unlocked.length) setTimeout(() => toast(t("newUnlock", { name: o.unlocked.map((u) => tl(u.name)).join(", ") })), o.zoneCleared != null ? 2400 : 0);
      if (o?.gameCleared) {
        zoneView = currentZone();
        showMain("map");
        return showEnding();
      }
      if (next === "retry") return startStage(idx);
      if (next === "next" && idx + 1 < STAGES.length) {
        zoneView = Math.floor((idx + 1) / STAGES_PER_ZONE);
        showMain("map");
        return openStage(idx + 1);
      }
      zoneView = Math.floor(Math.min(idx + (o?.firstClear ? 1 : 0), STAGES.length - 1) / STAGES_PER_ZONE);
      showMain("map");
    },
  });
}

function showEnding() {
  sfx.win();
  modal((close) => h("div", { class: "col" },
    h("h2", { style: "color:var(--gold)" }, "💎 " + t("victory") + " 💎"),
    h("div", { class: "dialog" }, h("div", { class: "hero-portrait" }), h("div", null, h("p", null, t("ending")), h("p", { class: "muted" }, t("endingHint")))),
    btn(t("close"), close, "gold wide"),
  ));
}

// ---------------------------------------------------------------- team
function slimeStats(id: string, lvl: number) {
  const s = statsAt(slimeDef(id).base, lvl);
  return h("div", { class: "stats" },
    h("div", null, h("b", null, s.hp), t("hp")),
    h("div", null, h("b", null, s.atk), t("atk")),
    h("div", null, h("b", null, s.def), t("def")),
    h("div", null, h("b", null, s.spd), t("spd")),
  );
}

function specialLine(id: string) {
  const d = slimeDef(id);
  return h("div", { class: "special-line" }, h("b", null, `${ELEMENTS[d.el].icon} ${tl(d.special.name)}: `), tl(d.special.desc),
    h("div", { style: "margin-top:2px" }, `${t("strongVs")}: ${STRONG_VS[d.el].map((e) => ELEMENTS[e].icon + " " + tl(ELEMENTS[e].name)).join(", ")}`));
}

function renderTeam(body: HTMLElement) {
  const list = h("div", { class: "list scroll grow" });
  list.append(h("div", { class: "hint hint-full", style: "padding:0 2px" }, t("teamHint")));
  const sorted = [...save.owned].sort((a, b) => {
    const ia = save.team.indexOf(a.id), ib = save.team.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.lvl - a.lvl;
  });
  for (const o of sorted) {
    const d = slimeDef(o.id);
    const ti = save.team.indexOf(o.id);
    const cost = trainCost(o.lvl);
    const maxed = o.lvl >= MAX_LEVEL;
    list.append(h("div", { class: "slime-card panel" },
      spriteEl(d.sprite, 1.8),
      h("div", null,
        h("div", { class: "nm" }, tl(d.name), h("span", { class: "lv", style: "color:var(--gold);font-size:15px" }, `${t("lvl")} ${o.lvl}`), elChip(d.el), ti >= 0 ? h("span", { class: `tag ${ti === 0 ? "" : "blue"}` }, ti === 0 ? `★ ${t("makeLeader")}` : t("inTeam")) : null),
        h("div", { class: "row", style: "font-size:11px;gap:6px;margin-top:4px" }, h("span", { class: "muted" }, t("xp")), h("div", { class: "grow" }, bar(maxed ? 1 : o.xp / xpToNext(o.lvl), "xp")), h("span", { class: "muted" }, maxed ? t("maxLvl") : `${o.xp}/${xpToNext(o.lvl)}`)),
        slimeStats(o.id, o.lvl),
        specialLine(o.id),
        h("div", { class: "card-actions" },
          btn(ti >= 0 ? t("remove") : t("add"), () => {
            const r = toggleTeam(o.id);
            if (r === "full") { sfx.error(); toast(t("teamFull")); }
            else if (r === "last") sfx.error();
            showMain("team");
          }, `small ${ti >= 0 ? "dark" : "green"}`),
          ti > 0 ? btn(`★ ${t("makeLeader")}`, () => { makeLeader(o.id); showMain("team"); }, "small dark") : null,
          maxed ? null : btn([`⬆ ${t("train")} `, coin(), ` ${cost}`], () => {
            if (trainSlime(o.id)) { sfx.levelUp(); toast(t("levelUp", { name: tl(d.name), lvl: o.lvl })); showMain("team"); }
            else { sfx.error(); toast(t("notEnough")); }
          }, "small gold", save.gold < cost ? { disabled: true } : {}),
        ),
      ),
    ));
  }
  body.append(list);
}

// ---------------------------------------------------------------- shop
function renderShop(body: HTMLElement) {
  const tabs = h("div", { class: "tabs" },
    btn(`🫧 ${t("slimes")}`, () => { shopTab = "slimes"; showMain("shop"); }, shopTab === "slimes" ? "gold" : "dark"),
    btn(`🧪 ${t("items")}`, () => { shopTab = "items"; showMain("shop"); }, shopTab === "items" ? "gold" : "dark"),
  );
  const list = h("div", { class: "list scroll grow" });
  if (shopTab === "slimes") {
    for (const d of SLIMES) {
      const have = owned(d.id);
      const unlocked = isUnlocked(d);
      const lvl = have ? have.lvl : recruitLevel();
      let action: HTMLElement;
      if (have) action = h("span", { class: "tag blue" }, `✓ ${t("owned")}`);
      else if (d.walletOnly && !unlocked) action = h("div", { class: "col", style: "gap:6px" }, h("span", { class: "tag sol" }, `◎ ${t("solOnly")}`), h("span", { class: "special-line" }, t("solPitch")), solButton());
      else if (d.walletOnly) action = btn(`◎ ${t("claimFree")}`, () => {
        if (buySlime(d.id)) { sfx.levelUp(); toast(t("newSlime")); showMain("shop"); } else sfx.error();
      }, "sol small");
      else if (!unlocked) action = h("span", { class: "muted", style: "font-size:13px" }, `🔒 ${t("unlockAt", { n: d.unlockAfter + 1 })}`);
      else action = btn([`${t("buy")} `, coin(), ` ${d.price}`], () => {
        if (buySlime(d.id)) {
          sfx.buy();
          toast(t("newSlime"));
          showMain("shop");
        } else { sfx.error(); toast(t("notEnough")); }
      }, "gold small", save.gold < d.price ? { disabled: true } : {});
      list.append(h("div", { class: `slime-card panel ${!have && !unlocked && !d.walletOnly ? "locked-card" : ""}` },
        spriteEl(d.sprite, 1.8),
        h("div", null,
          h("div", { class: "nm" }, tl(d.name), elChip(d.el), h("span", { class: "muted", style: "font-size:13px;font-family:var(--body)" }, `${t("lvl")} ${lvl}`)),
          slimeStats(d.id, lvl),
          specialLine(d.id),
          h("div", { class: "card-actions" }, action),
        ),
      ));
    }
  } else {
    for (const it of ITEMS) {
      const id = it.id as ItemId;
      list.append(h("div", { class: "item-card panel" },
        itemImg(it.icon, 48),
        h("div", null, h("div", { class: "pixel", style: "font-size:17px" }, tl(it.name)), h("div", { class: "special-line" }, tl(it.desc)), h("div", { style: "font-size:13px;margin-top:4px" }, t("youHave", { n: save.items[id] }))),
        h("div", { class: "col", style: "gap:6px" },
          btn([coin(), ` ${it.price}`], () => { if (buyItem(id)) { sfx.buy(); showMain("shop"); } else { sfx.error(); toast(t("notEnough")); } }, "gold small", save.gold < it.price ? { disabled: true } : {}),
          btn([`×5 `, coin(), ` ${it.price * 5}`], () => { if (buyItem(id, 5)) { sfx.buy(); showMain("shop"); } else { sfx.error(); toast(t("notEnough")); } }, "dark small", save.gold < it.price * 5 ? { disabled: true } : {}),
        ),
      ));
    }
  }
  body.append(tabs, list);
}

// ---------------------------------------------------------------- ranking
function renderTop(body: HTMLElement) {
  const list = h("div", { class: "list scroll grow", style: "display:flex" });
  list.append(h("div", { class: "section-h center" }, `🏆 ${t("topTitle")}`));
  list.append(h("div", { class: "center muted", style: "font-size:13px" }, `${t("score")}: ${(save.cleared + 1) * 100 + totalStars()} (${save.lang === "ru" ? "уровни × 100 + звёзды" : "stages × 100 + stars"})`));
  const holder = h("div", { class: "col" }, h("div", { class: "center muted" }, "…"));
  list.append(holder);
  body.append(list);
  idos.topPlayers().then((rows) => {
    holder.innerHTML = "";
    if (!rows || rows.length === 0) {
      holder.append(h("div", { class: "center muted", style: "padding:20px" }, t("topEmpty")));
      return;
    }
    rows.slice(0, 50).forEach((r, i) => holder.append(h("div", { class: `lb-row ${r.me ? "me" : ""}` },
      h("span", { class: "rk" }, i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1)),
      h("span", { class: "pixel" }, r.name, r.me ? h("span", { class: "muted", style: "font-size:12px" }, ` (${t("you")})`) : null,
        r.sol ? h("div", { class: "sol-addr", title: t("solVerified") }, `◎ ${shortAddr(r.sol)}`) : null),
      h("span", { class: "pixel", style: "color:var(--gold)" }, String(r.score)),
    )));
  });
}

// ---------------------------------------------------------------- settings
function openSettings() {
  modal((close) => {
    const toggle = (label: string, on: boolean, fn: () => void) =>
      h("div", { class: "toggle" }, h("span", { class: "pixel" }, label), btn(on ? "ON" : "OFF", fn, `small ${on ? "green" : "dark"}`));
    const rerender = () => { close(); openSettings(); };
    return h("div", { class: "col" },
      h("h2", null, `⚙ ${t("settings")}`),
      toggle(t("music"), save.music, () => { save.music = !save.music; persist(); refreshMusic(); rerender(); }),
      toggle(t("sound"), save.sfx, () => { save.sfx = !save.sfx; persist(); rerender(); }),
      h("div", { class: "toggle" }, h("span", { class: "pixel" }, t("language")), h("div", { class: "row" },
        btn("RU", () => { save.lang = "ru"; document.documentElement.lang = "ru"; persist(); close(); rerenderAll(); openSettings(); }, `small ${save.lang === "ru" ? "gold" : "dark"}`),
        btn("EN", () => { save.lang = "en"; document.documentElement.lang = "en"; persist(); close(); rerenderAll(); openSettings(); }, `small ${save.lang === "en" ? "gold" : "dark"}`),
      )),
      h("div", { class: "toggle", style: "flex-wrap:wrap;gap:8px" }, h("span", { class: "pixel" }, t("account")), cloudChip(),
        idos.status !== "wallet" ? solButton("sol small wide") : null,
        idos.canLinkAccount() ? btn(t("linkAccount"), () => idos.linkAccount(), "small purple wide") : null),
      h("div", { class: "panel", style: "padding:10px 12px;font-size:13px;line-height:1.45;background:var(--panel-2)" },
        h("div", { class: "pixel", style: "font-size:15px;margin-bottom:4px" }, `❓ ${t("howTo")}`),
        h("div", null, t("howTo1")), h("div", null, t("howTo2")), h("div", null, t("howTo3")), h("div", { style: "margin-top:4px" }, t("intro3"))),
      h("div", { class: "row" },
        btn(t("reset"), () => {
          modal((c2) => h("div", { class: "col" }, h("h2", null, t("resetConfirm")), h("div", { class: "row" },
            btn(t("no"), c2, "dark grow"),
            btn(t("yes"), () => { resetSave(); c2(); close(); zoneView = 0; showTitle(); }, "red grow"))));
        }, "small red"),
        h("div", { class: "grow" }),
        btn(t("close"), () => close(), "dark"),
      ),
    );
  });
}

function rerenderAll() {
  if (wrap.querySelector(".title-screen")) showTitle();
  else if (!wrap.querySelector(".battle")) showMain(tab);
}

export { TEAM_SIZE };
