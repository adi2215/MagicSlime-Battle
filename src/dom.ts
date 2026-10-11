// Tiny DOM helpers shared by all screens.
import { ELEMENTS, type Element } from "./data";
import { tl } from "./i18n";
import { sfx } from "./audio";

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "html") el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function btn(label: Child | Child[], onClick: () => void, cls = "", attrs: Attrs = {}) {
  return h("button", { class: `btn ${cls}`, ...attrs, onclick: (e: Event) => { e.stopPropagation(); sfx.click(); onClick(); } }, label);
}

export function spriteEl(sheet: string, scale = 3, opts: { flip?: boolean; still?: boolean; speed?: number; shadow?: boolean } = {}) {
  const s = h("div", { class: `sprite${opts.flip ? " flip" : ""}${opts.still ? " still" : ""}`, style: `--s:${scale};${opts.speed ? `--spd:${opts.speed}s;` : ""}` });
  if (opts.shadow !== false) s.append(h("div", { class: "shadow" }));
  const sh = h("div", { class: "sheet" });
  sh.style.backgroundImage = `url(game/sprites/${sheet}.png)`;
  // desync idle bounces a little
  sh.style.animationDelay = `${-Math.random()}s`;
  s.append(sh);
  return s;
}

export function coin() {
  return h("img", { class: "coin", src: "game/sprites/coin.png", alt: "" });
}

export function itemImg(id: string, size = 22) {
  return h("img", { src: `game/sprites/${id}.png`, alt: "", style: `width:${size}px;height:${size}px;image-rendering:pixelated;vertical-align:middle` });
}

export function elChip(el: Element) {
  const e = ELEMENTS[el];
  return h("span", { class: "el-chip", style: `color:${e.color}` }, `${e.icon} ${tl(e.name)}`);
}

export function stars(n: number, max = 3) {
  const s = h("span", { class: "stars" });
  for (let i = 0; i < max; i++) s.append(h("span", { class: i < n ? "star-on" : "star-off" }, "★"));
  return s;
}

export function hpColor(frac: number) {
  return frac > 0.5 ? "var(--green)" : frac > 0.22 ? "#f2c23a" : "var(--red)";
}

export function bar(frac: number, cls = "") {
  const b = h("div", { class: `bar ${cls}` });
  const fill = h("i");
  fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  if (!cls) fill.style.background = hpColor(frac);
  b.append(fill);
  return b;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let wrapRef: HTMLElement | null = null;
export function setWrap(w: HTMLElement) {
  wrapRef = w;
}

export function toast(msg: string) {
  if (!wrapRef) return;
  const long = msg.length > 48;
  wrapRef.querySelectorAll(".toast").forEach((x) => x.remove());
  const t = h("div", { class: `toast panel${long ? " long" : ""}` }, msg);
  wrapRef.append(t);
  setTimeout(() => t.remove(), long ? 4600 : 2300);
}

export function modal(build: (close: () => void) => Node, opts: { closable?: boolean; onClose?: () => void } = {}) {
  const back = h("div", { class: "modal-back" });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && opts.closable !== false && back === document.querySelector(".modal-back:last-of-type")) close();
  };
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };
  document.addEventListener("keydown", onKey);
  const box = h("div", { class: "modal panel" });
  box.append(build(close));
  back.append(box);
  if (opts.closable !== false) back.addEventListener("click", (e) => { if (e.target === back) close(); });
  (wrapRef ?? document.body).append(back);
  return close;
}
