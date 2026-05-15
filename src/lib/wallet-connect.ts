"use client";

import {
  KitEventType,
  Networks,
  StellarWalletsKit,
} from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

export const CONNECTED_WALLET_STORAGE_KEY = "verix_connected_wallet";
export const CONNECTED_WALLET_PROVIDER_STORAGE_KEY = "verix_connected_wallet_provider";

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

let kitReady = false;
let selectedWalletId: string | undefined;
let unsubscribeWalletSelected: (() => void) | undefined;

function initKit() {
  if (kitReady || typeof window === "undefined") return;

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
  });

  unsubscribeWalletSelected = StellarWalletsKit.on(
    KitEventType.WALLET_SELECTED,
    (event) => {
      selectedWalletId = event.payload.id;
    }
  );

  kitReady = true;
}

function cacheWallet(wallet: ConnectedWallet) {
  localStorage.setItem(CONNECTED_WALLET_STORAGE_KEY, wallet.address);
  localStorage.setItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY, wallet.provider);
}

export async function getWalletOptions(): Promise<WalletProviderOption[]> {
  initKit();
  const wallets = await StellarWalletsKit.refreshSupportedWallets();

  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    description: wallet.type,
    availability: wallet.isAvailable
      ? "available"
      : wallet.url
        ? "external"
        : "extension-required",
  }));
}

export function clearCachedConnectedWallet() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CONNECTED_WALLET_STORAGE_KEY);
  localStorage.removeItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY);
  StellarWalletsKit.disconnect().catch(() => undefined);
  selectedWalletId = undefined;
}

export async function getAuthorizedWallet(): Promise<ConnectedWallet | null> {
  if (typeof window === "undefined") return null;
  initKit();

  const cachedAddress = localStorage.getItem(CONNECTED_WALLET_STORAGE_KEY);
  const cachedProvider =
    localStorage.getItem(CONNECTED_WALLET_PROVIDER_STORAGE_KEY) ?? "stellar-wallets-kit";
  if (!cachedAddress) return null;

  return {
    address: cachedAddress,
    provider: cachedProvider,
    providerName: cachedProvider,
  };
}

export async function connectWallet(providerId?: WalletProviderId): Promise<ConnectedWallet> {
  initKit();

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
  initKit();

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
