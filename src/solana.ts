// Solana wallet sign-in through iDos Games.
// - Opened directly: the player's injected wallet (Phantom / Solflare / Backpack) signs the
//   engine's login challenge (loginWithWalletSolana).
// - Embedded on idosgames.com: the SITE's connected Solana wallet signs it
//   (loginWithWalletViaPlatform) — wallets can't be reached from inside the iframe.
// No on-chain transaction: an ed25519 signature proves ownership of the address.
import type { IDosGamesClient } from "@idosgames/core";

export const SOLANA_NETWORK = "solana";

interface InjectedSolana {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toBase58(): string; toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toBase58(): string; toString(): string } } | void>;
  signMessage(message: Uint8Array, display?: string): Promise<Uint8Array | { signature: Uint8Array }>;
}

type W = Window & {
  phantom?: { solana?: InjectedSolana };
  solflare?: InjectedSolana;
  backpack?: InjectedSolana;
  solana?: InjectedSolana;
};

export function findWallet(): { name: string; provider: InjectedSolana } | null {
  const w = window as W;
  if (w.phantom?.solana?.isPhantom) return { name: "Phantom", provider: w.phantom.solana };
  if (w.solflare?.isSolflare) return { name: "Solflare", provider: w.solflare };
  if (w.backpack) return { name: "Backpack", provider: w.backpack };
  if (w.solana) return { name: "Solana wallet", provider: w.solana };
  return null;
}

export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function shortAddr(a: string) {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export type SolLoginResult = { ok: true; address: string | null; via: string } | { ok: false; error: string; noWallet?: boolean };

export async function loginWithSolana(client: IDosGamesClient): Promise<SolLoginResult> {
  const wallet = await import("@idosgames/wallet");
  if (wallet.isEmbeddedInPlatform()) {
    const r = await wallet.loginWithWalletViaPlatform({ client, networkID: SOLANA_NETWORK, family: "solana" });
    if (!r.ok) return { ok: false, error: `${r.stage}: ${r.error}` };
    return { ok: true, address: null, via: "idosgames.com" };
  }
  const found = findWallet();
  if (!found) return { ok: false, error: "NO_WALLET", noWallet: true };
  const { provider, name } = found;
  let address: string;
  try {
    const res = await provider.connect();
    const pk = (res && "publicKey" in res && res.publicKey) || provider.publicKey;
    if (!pk) return { ok: false, error: "wallet did not return an address" };
    address = typeof pk.toBase58 === "function" ? pk.toBase58() : pk.toString();
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "connection rejected" };
  }
  const signMessage = async (msg: Uint8Array) => {
    const out = await provider.signMessage(msg, "utf8");
    return out instanceof Uint8Array ? out : out.signature;
  };
  const r = await wallet.loginWithWalletSolana({ client, networkID: SOLANA_NETWORK, walletAddress: address, signMessage });
  if (!r.ok) return { ok: false, error: `${r.stage}: ${r.error}` };
  return { ok: true, address, via: name };
}

/** The verified Solana address of the current session, read back from the server. */
export async function verifiedSolanaAddress(client: IDosGamesClient): Promise<string | null> {
  try {
    const r = await client.blockchain.getUserState();
    if (!r.ok) return null;
    const st = r.data.State;
    const last = st?.LastWalletLogin;
    if (last?.Address && (!last.NetworkID || last.NetworkID === SOLANA_NETWORK)) return last.Address;
    for (const w of Object.values(st?.LinkedWallets ?? {})) {
      if (w?.Address && w.NetworkID === SOLANA_NETWORK && w.IsSignatureVerified !== false) return w.Address;
    }
  } catch {
    /* ignore */
  }
  return null;
}
