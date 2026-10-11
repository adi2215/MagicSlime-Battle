import "./style.css";
import { mountApp, refreshTopbar, showMain, showTitle } from "./screens";
import { idos } from "./idos";
import { save, syncFromCloud } from "./save";
import { unlockAudio } from "./audio";

document.documentElement.lang = save.lang;
const root = document.getElementById("app")!;
mountApp(root);
document.getElementById("loader")?.remove();
window.addEventListener("pointerdown", unlockAudio, { once: true });

// Connect to iDos Games in the background; the game is playable meanwhile.
idos.connect().then(async () => {
  const changed = await syncFromCloud();
  document.documentElement.lang = save.lang;
  if (changed) {
    // a newer save came from the cloud: redraw whatever menu is open
    if (document.querySelector(".title-screen")) showTitle();
    else if (!document.querySelector(".battle")) showMain();
  }
  refreshTopbar();
});

window.addEventListener("pagehide", () => void idos.flush());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void idos.flush();
});
