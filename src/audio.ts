// Music (from the original game) + tiny synthesized sound effects.
import { save } from "./save";

type Track = "map" | "battle";
const tracks: Partial<Record<Track, HTMLAudioElement>> = {};
let current: Track | null = null;
let unlocked = false;
let ctx: AudioContext | null = null;

function track(name: Track) {
  if (!tracks[name]) {
    const a = new Audio(`game/audio/${name}.mp3`);
    a.loop = true;
    a.volume = name === "battle" ? 0.45 : 0.5;
    a.preload = "auto";
    tracks[name] = a;
  }
  return tracks[name]!;
}

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    ctx = null;
  }
  if (current) playMusic(current, true);
}

export function playMusic(name: Track, force = false) {
  if (current === name && !force) return;
  for (const [k, a] of Object.entries(tracks)) if (k !== name) a?.pause();
  current = name;
  if (!unlocked || !save.music) return;
  const a = track(name);
  if (a.paused) a.play().catch(() => {});
}

export function refreshMusic() {
  if (!save.music) Object.values(tracks).forEach((a) => a?.pause());
  else if (current) playMusic(current, true);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) Object.values(tracks).forEach((a) => a?.pause());
  else refreshMusic();
});

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!ctx || !save.sfx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, delay = 0) {
  if (!ctx || !save.sfx) return;
  const t0 = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start(t0);
}

let collect: HTMLAudioElement | null = null;

export const sfx = {
  click: () => tone(660, 0.06, "square", 0.05),
  hit: () => { noise(0.12, 0.25); tone(180, 0.12, "square", 0.12, -90); },
  crit: () => { noise(0.2, 0.35); tone(240, 0.2, "sawtooth", 0.15, -160); },
  special: () => { tone(300, 0.25, "sawtooth", 0.1, 500); tone(600, 0.3, "triangle", 0.08, 300, 0.05); },
  heal: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.18, "sine", 0.1, 0, i * 0.07)); },
  defend: () => { tone(220, 0.15, "triangle", 0.15, 60); tone(440, 0.15, "triangle", 0.06, 0, 0.05); },
  faint: () => tone(400, 0.6, "triangle", 0.15, -330),
  charge: () => { tone(110, 0.6, "sawtooth", 0.08, 220); },
  coin: () => {
    if (!save.sfx) return;
    collect ??= new Audio("game/audio/collect.mp3");
    collect.volume = 0.5;
    collect.currentTime = 0;
    collect.play().catch(() => {});
  },
  levelUp: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, "square", 0.06, 0, i * 0.09)); },
  win: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "square", 0.06, 0, i * 0.11)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.1, 0, i * 0.18)); },
  buy: () => { tone(880, 0.08, "square", 0.06); tone(1320, 0.12, "square", 0.06, 0, 0.08); },
  error: () => tone(160, 0.15, "square", 0.08),
};
