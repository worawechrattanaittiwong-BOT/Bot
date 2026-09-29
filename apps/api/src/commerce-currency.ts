export type UsdThbQuote = {
  usdThb: number;
  source: "ENV_FIXED" | "FRANKFURTER" | "FRANKFURTER_STALE" | "FALLBACK";
  quotedAt: string;
};

const CACHE_MS = 15 * 60 * 1000;
const FALLBACK_RATE = 33.60;

let cachedQuote: UsdThbQuote | null = null;
let cachedAt = 0;
let pendingQuote: Promise<UsdThbQuote> | null = null;

function validRate(value: unknown) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 15 && rate <= 80 ? rate : null;
}

export function usdCentsToThbSatang(usdCents: unknown, usdThb: unknown) {
  const cents = Math.max(0, Math.trunc(Number(usdCents || 0)));
  const rate = validRate(usdThb);
  if (!rate) throw new Error("Invalid USD/THB rate");
  return Math.max(0, Math.round(cents * rate));
}

export function discountedUsdCents(usdCents: unknown, discountPercent: unknown) {
  const cents = Math.max(0, Math.trunc(Number(usdCents || 0)));
  const percent = Math.max(0, Math.min(100, Number(discountPercent || 0)));
  return Math.max(0, cents - Math.round(cents * percent / 100));
}

export async function getUsdThbQuote(): Promise<UsdThbQuote> {
  const fixed = validRate(process.env.USD_THB_RATE);
  if (fixed) {
    return { usdThb: fixed, source: "ENV_FIXED", quotedAt: new Date().toISOString() };
  }

  if (cachedQuote && Date.now() - cachedAt < CACHE_MS) return cachedQuote;
  if (pendingQuote) return pendingQuote;

  pendingQuote = (async () => {
    try {
      const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=THB", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) throw new Error("FX provider unavailable");
      const data: any = await response.json();
      const rate = validRate(data?.rates?.THB);
      if (!rate) throw new Error("FX provider returned invalid rate");
      cachedQuote = {
        usdThb: rate,
        source: "FRANKFURTER",
        quotedAt: String(data?.date || "").match(/^\d{4}-\d{2}-\d{2}$/)
          ? new Date(String(data.date) + "T00:00:00.000Z").toISOString()
          : new Date().toISOString()
      };
      cachedAt = Date.now();
      return cachedQuote;
    } catch {
      if (cachedQuote) {
        return { ...cachedQuote, source: "FRANKFURTER_STALE" };
      }
      const fallback = validRate(process.env.USD_THB_FALLBACK_RATE) || FALLBACK_RATE;
      return {
        usdThb: fallback,
        source: "FALLBACK",
        quotedAt: new Date().toISOString()
      };
    } finally {
      pendingQuote = null;
    }
  })();

  return pendingQuote;
}
