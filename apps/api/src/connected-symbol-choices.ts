/**
 * Existing-account Symbol change only: broker names from the authenticated
 * EA's active Market Watch heartbeat. Never guess symbols or broker suffixes.
 * Initial Cloud MT5 connection continues to use Worker XAU discovery.
 */
export function connectedAccountSymbolChoices(metrics: any): string[] {
  const raw = Array.isArray(metrics?.marketWatchSymbols)
    ? metrics.marketWatchSymbols
    : [];
  const source = [...raw, metrics?.symbol];
  const result = new Map<string,string>();
  for (const value of source) {
    const symbol = String(value || "").trim();
    if (!symbol || symbol.length > 64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) continue;
    const upper = symbol.toUpperCase();
    // Trading support currently covers Gold and BTC/XBT only. Do not expose
    // unrelated forex/crypto names solely because they appear in Market Watch.
    if (!upper.startsWith("XAU") && !upper.includes("BTC") && !upper.includes("XBT")) continue;
    if (!result.has(upper)) result.set(upper, symbol);
    if (result.size >= 512) break;
  }
  return [...result.values()];
}

export function exactConnectedAccountSymbol(requested: string, metrics: any): string {
  return connectedAccountSymbolChoices(metrics).find(
    value => value.toUpperCase() === requested.toUpperCase()
  ) || "";
}
