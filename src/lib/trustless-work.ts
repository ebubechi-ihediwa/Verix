const DEFAULT_TRUSTLESS_WORK_VIEWER_URL = "https://viewer.trustlesswork.com";

export function trustlessWorkViewerBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TRUSTLESS_WORK_VIEWER_URL ??
    DEFAULT_TRUSTLESS_WORK_VIEWER_URL
  ).replace(/\/$/, "");
}

export function isDemoEscrowId(externalId: string | null | undefined): boolean {
  return !externalId || externalId.startsWith("DEMO-") || externalId.startsWith("TW-ESC-");
}

export function trustlessWorkEscrowViewerUrl(externalId: string | null | undefined): string | null {
  if (isDemoEscrowId(externalId)) return null;
  return `${trustlessWorkViewerBaseUrl()}/escrow/${encodeURIComponent(externalId as string)}`;
}
