// Thin wrapper around the iDos Games SDK: login, cloud save, leaderboard.
// Everything here fails soft — the game stays fully playable offline.
import {
  beginSsoRedirect,
  createIDosGamesClient,
  isSsoAvailable,
  readSsoCodeFromUrl,
  type IDosGamesClient,
} from "@idosgames/core";
import { BrowserPlatformAdapter } from "@idosgames/core/platform";
import { loginWithSolana, verifiedSolanaAddress, type SolLoginResult } from "./solana";

export const SAVE_KEY = "ms_save";
export const LEADERBOARD_ID = "ms_progress";
export const SOL_KEY = "sol_wallet";

function resolveTitleId(): string {
  const q = new URLSearchParams(location.search).get("title");
  if (q && /^[A-Z0-9]{4,12}(-DEV)?$/.test(q)) return q;
  // test links on the platform's -dev host run against the DEV sandbox title
  if (/-dev\./i.test(location.hostname)) return "I5G9YDF8-DEV";
  return (import.meta.env.VITE_IDOS_TITLE_ID as string) || "I5G9YDF8";
}

export type CloudStatus = "connecting" | "offline" | "guest" | "account" | "wallet";

class Idos {
  client: IDosGamesClient | null = null;
  titleId = resolveTitleId();
  status: CloudStatus = "connecting";
  userId = "";
  /** Solana address proven by a wallet signature in this session (null = none). */
  solAddress: string | null = null;
  private leaderboardOk: boolean | null = null;
  private saveTimer: number | undefined;
  private pending: string | null = null;
  private listeners: Array<() => void> = [];

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  }

  private ensureClient(): IDosGamesClient {
    this.client ??= createIDosGamesClient({
      titleID: this.titleId,
      platform: new BrowserPlatformAdapter(),
      appVersion: "1.0.0",
    });
    return this.client;
  }

  async connect(): Promise<void> {
    try {
      const auth = this.ensureClient().auth;
      let ok = false;
      const sso = readSsoCodeFromUrl();
      if (sso) {
        const r = await this.withTimeout(auth.loginWithSsoCode(sso.code), 10000);
        ok = !!r?.ok;
      }
      if (!ok) {
        const r = await this.withTimeout(auth.autoLogin(), 8000);
        ok = !!r?.ok;
      }
      if (!ok) {
        const r = await this.withTimeout(auth.loginWithDeviceID(), 8000);
        ok = !!r?.ok;
      }
      if (ok && auth.isLoggedIn) {
        this.userId = auth.context?.userID ?? "";
        const t = auth.lastAuthType;
        this.status = t === "Wallet" ? "wallet" : t === "Device" || t === "None" ? "guest" : "account";
        if (t === "Wallet") this.solAddress = await this.withTimeout(verifiedSolanaAddress(this.client!), 6000);
      } else {
        this.status = "offline";
      }
    } catch (e) {
      console.warn("[idos] connect failed", e);
      this.status = "offline";
    }
    this.emit();
  }

  /** Sign in with a Solana wallet (switches the session to the wallet's account). */
  async loginSolana(): Promise<SolLoginResult> {
    const client = this.ensureClient();
    await this.flush();
    const r = (await this.withTimeout(loginWithSolana(client), 60000)) ?? { ok: false as const, error: "timeout" };
    if (!r.ok) return r;
    this.userId = client.auth.context?.userID ?? "";
    this.status = "wallet";
    this.leaderboardOk = null;
    this.solAddress = r.address ?? (await this.withTimeout(verifiedSolanaAddress(client), 6000));
    if (this.solAddress) {
      // shown next to the player's name in the ranking
      client.userCustomData.setPublicData(SOL_KEY, this.solAddress).catch(() => {});
    }
    this.emit();
    return { ...r, address: this.solAddress };
  }

  canLinkAccount(): boolean {
    try {
      return this.status === "guest" && isSsoAvailable();
    } catch {
      return false;
    }
  }

  linkAccount() {
    try {
      beginSsoRedirect({ titleID: this.titleId });
    } catch (e) {
      console.warn("[idos] sso redirect failed", e);
    }
  }

  async loadCloud(): Promise<string | null> {
    if (!this.client || this.status === "offline" || this.status === "connecting") return null;
    try {
      const r = await this.withTimeout(this.client.userCustomData.getMyUserCustomData(), 8000);
      if (!r || !r.ok) return null;
      const cd = this.client.data.user.state?.CustomData;
      return cd?.Private?.[SAVE_KEY]?.Value ?? null;
    } catch (e) {
      console.warn("[idos] load failed", e);
      return null;
    }
  }

  /** Debounced cloud save. */
  saveCloud(json: string) {
    if (!this.client || this.status === "offline" || this.status === "connecting") return;
    this.pending = json;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 1500);
  }

  async flush() {
    if (!this.client || !this.pending) return;
    const json = this.pending;
    this.pending = null;
    try {
      const r = await this.client.userCustomData.setPrivateData(SAVE_KEY, json);
      if (!r.ok) {
        console.warn("[idos] save rejected", r.reason, r.error);
        if (r.reason === "throttled" || r.reason === "connection") {
          this.pending = this.pending ?? json;
          this.saveTimer = window.setTimeout(() => this.flush(), 4000);
        }
      }
    } catch (e) {
      console.warn("[idos] save failed", e);
    }
  }

  private async hasLeaderboard(): Promise<boolean> {
    if (this.leaderboardOk !== null) return this.leaderboardOk;
    if (!this.client || this.status === "offline") return false;
    try {
      const r = await this.withTimeout(this.client.leaderboard.getDefinitions(), 6000);
      this.leaderboardOk = !!(r && r.ok && r.data.Definitions?.[LEADERBOARD_ID]?.IsEnabled !== false && r.data.Definitions?.[LEADERBOARD_ID]);
    } catch {
      this.leaderboardOk = false;
    }
    return this.leaderboardOk;
  }

  async submitScore(score: number) {
    if (!(await this.hasLeaderboard())) return;
    try {
      const r = await this.client!.leaderboard.submitScore(LEADERBOARD_ID, score);
      if (!r.ok) console.warn("[idos] score rejected", r.reason, r.error);
    } catch (e) {
      console.warn("[idos] score failed", e);
    }
  }

  async topPlayers(): Promise<{ name: string; score: number; me: boolean; sol?: string }[] | null> {
    if (!(await this.hasLeaderboard())) return null;
    try {
      const r = await this.withTimeout(this.client!.leaderboard.getLeaderboard(LEADERBOARD_ID), 6000);
      if (!r || !r.ok) return null;
      const top = r.data.TopUsers ?? [];
      const sol: Record<string, string> = {};
      try {
        const ids = top.map((u) => u.UserID).filter(Boolean).slice(0, 50);
        if (ids.length) {
          const pub = await this.withTimeout(this.client!.userCustomData.batchGetPublicUserCustomDataOf(ids), 6000);
          if (pub && pub.ok) for (const p of pub.data.Results ?? []) {
            const v = p.Public?.[SOL_KEY]?.Value;
            if (p.UserID && v) sol[p.UserID] = v;
          }
        }
      } catch {
        /* addresses are optional decoration */
      }
      return top.map((u, i) => ({
        name: u.PublicProfile?.Username || `Slime #${(u.UserID || String(i)).slice(-4)}`,
        score: u.Score ?? 0,
        me: u.UserID === this.userId,
        sol: sol[u.UserID],
      }));
    } catch {
      return null;
    }
  }
}

export const idos = new Idos();
