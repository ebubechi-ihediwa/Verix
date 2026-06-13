"use client";

export const CONNECTED_WALLET_STORAGE_KEY = "verix_connected_wallet";
export const CONNECTED_WALLET_PROVIDER_STORAGE_KEY = "verix_connected_wallet_provider";
export const CONNECTED_WALLET_NETWORK_KEY = "verix_wallet_network";

export type WalletProviderId = string;

export interface WalletProviderOption {
  id: WalletProviderId;
  name: string;
  description: string;
  availability: "available" | "extension-required" | "external";
}

export interface ConnectedWallet {
  address: string;
  network?: string;
  networkPassphrase?: string;
  provider: WalletProviderId;
  providerName: string;
}

// ── Lazy kit loader ───────────────────────────────────────────────────────────
// StellarWalletsKit touches localStorage at import time, which crashes SSR.
// We dynamic-import both packages only when running in the browser.

import type {
  StellarWalletsKit as StellarWalletsKitType,
  Networks as NetworksType,
  KitEventType as KitEventTypeEnum,
  ModuleInterface,
  KitEventWalletSelected,
} from "@creit.tech/stellar-wallets-kit";

type StellarMod = {
  StellarWalletsKit: typeof StellarWalletsKitType;
  Networks: typeof NetworksType;
  KitEventType: typeof KitEventTypeEnum;
};

let _stellarMod: StellarMod | null = null;
let _defaultModules: (() => ModuleInterface[]) | null = null;

async function loadMods(): Promise<{ stellar: StellarMod; defaultModules: () => ModuleInterface[] }> {
  if (typeof window === "undefined") {
    throw new Error("Stellar wallet kit is browser-only.");
  }
  if (!_stellarMod) {
    _stellarMod = (await import("@creit.tech/stellar-wallets-kit")) as unknown as StellarMod;
  }
  if (!_defaultModules) {
    const utils = await import("@creit.tech/stellar-wallets-kit/modules/utils");
    _defaultModules = utils.defaultModules as () => ModuleInterface[];
  }
  return { stellar: _stellarMod, defaultModules: _defaultModules };
}

// ── Kit init ──────────────────────────────────────────────────────────────────

let kitReady = false;
let selectedWalletId: string | undefined;
let unsubscribeWalletSelected: (() => void) | undefined;

async function initKit(): Promise<StellarMod> {
  const { stellar, defaultModules } = await loadMods();
  if (kitReady) return stellar;

  stellar.StellarWalletsKit.init({
    modules: defaultModules(),
    network: stellar.Networks.TESTNET,
    authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
  });

  unsubscribeWalletSelected = stellar.StellarWalletsKit.on(
    stellar.KitEventType.WALLET_SELECTED,
    (event: KitEventWalletSelected) => {
      selectedWalletId = event.payload.id;
    }
  );

  kitReady = true;
  return stellar;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheWallet(wallet: ConnectedWallet) {
  localStorage.setItem(CONNECTED_WALLET_STORAGE_KEY, wallet.address);
  localStorage.setItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY, wallet.provider);
  if (wallet.networkPassphrase) {
    localStorage.setItem(CONNECTED_WALLET_NETWORK_KEY, wallet.networkPassphrase);
  }
}

export function getCachedConnectedWallet(): ConnectedWallet | null {
  if (typeof window === "undefined") return null;
  const cachedAddress = localStorage.getItem(CONNECTED_WALLET_STORAGE_KEY);
  const cachedProvider =
    localStorage.getItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY) ?? "stellar-wallets-kit";
  if (!cachedAddress) return null;
  return {
    address: cachedAddress,
    provider: cachedProvider,
    providerName: cachedProvider,
    networkPassphrase: localStorage.getItem(CONNECTED_WALLET_NETWORK_KEY) ?? undefined,
  };
}

export function clearCachedConnectedWallet() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CONNECTED_WALLET_STORAGE_KEY);
  localStorage.removeItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY);
  localStorage.removeItem(CONNECTED_WALLET_NETWORK_KEY);
  _stellarMod?.StellarWalletsKit.disconnect().catch(() => undefined);
  selectedWalletId = undefined;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getWalletOptions(): Promise<WalletProviderOption[]> {
  const { stellar } = await loadMods();
  await initKit();
  const wallets = await stellar.StellarWalletsKit.refreshSupportedWallets();
  return (wallets as Array<{ id: string; name: string; type: string; isAvailable: boolean; url?: string }>).map(
    (w) => ({
      id: w.id,
      name: w.name,
      description: w.type,
      availability: w.isAvailable ? "available" : w.url ? "external" : "extension-required",
    })
  );
}

export async function getAuthorizedWallet(): Promise<ConnectedWallet | null> {
  if (typeof window === "undefined") return null;
  const { stellar } = await initKit().then(s => ({ stellar: s }));
  const cached = getCachedConnectedWallet();
  if (cached?.provider && cached.provider !== "stellar-wallets-kit") {
    try {
      stellar.StellarWalletsKit.setWallet(cached.provider);
      selectedWalletId = cached.provider;
    } catch {
      // wallet module not available — signing will fail gracefully
    }
  }
  return cached;
}

export async function connectWallet(providerId?: WalletProviderId): Promise<ConnectedWallet> {
  const stellar = await initKit();
  const { StellarWalletsKit, Networks } = stellar;

  if (providerId) {
    StellarWalletsKit.setWallet(providerId);
    selectedWalletId = providerId;
  }

  const { address } = providerId
    ? await StellarWalletsKit.fetchAddress()
    : await StellarWalletsKit.authModal();

  const network = await StellarWalletsKit.getNetwork().catch(() => ({
    network: "testnet",
    networkPassphrase: Networks.TESTNET,
  }));

  const provider = selectedWalletId ?? providerId ?? "stellar-wallets-kit";
  const wallet: ConnectedWallet = {
    address,
    provider,
    providerName: provider,
    network: network.network,
    networkPassphrase: network.networkPassphrase,
  };

  cacheWallet(wallet);
  return wallet;
}

export async function signWalletTransaction(
  xdr: string,
  address: string,
  networkPassphrase?: string
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const { StellarWalletsKit, Networks } = await initKit();

  if (!address?.startsWith("G")) {
    throw new Error("A connected Stellar wallet is required to sign escrow funding.");
  }

  return StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: networkPassphrase ?? Networks.TESTNET,
  });
}

export function disposeWalletKitListeners() {
  unsubscribeWalletSelected?.();
  unsubscribeWalletSelected = undefined;
  kitReady = false;
}
