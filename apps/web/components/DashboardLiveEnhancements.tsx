"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

type LiveSummary = {
  slotId: string | null;
  symbol?: string;
  price: number;
  bid: number;
  ask: number;
  digits: number;
  marketSessionState: string;
  lastSeenAt?: string | null;
  today: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    netProfit: number;
  };
};

type Direction = "up" | "down" | "flat";

export function DashboardLiveEnhancements() {
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [direction, setDirection] = useState<Direction>("flat");
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [insightTarget, setInsightTarget] = useState<HTMLElement | null>(null);
  const previousPriceRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return;

    const bindTargets = () => {
      setHeaderTarget(document.querySelector<HTMLElement>(".cc-v6-hourly-chart .cc-v6-panel-head"));
      setInsightTarget(document.querySelector<HTMLElement>(".cc-v6-market-insight .cc-v6-insight-rows"));
    };

    bindTargets();
    const observer = new MutationObserver(bindTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const slotSelect = document.querySelector<HTMLSelectElement>(".slot-switcher-select");
        const slotId = String(slotSelect?.value || "");
        const path = "/dashboard-live/summary" + (slotId ? "?slotId=" + encodeURIComponent(slotId) : "");
        const next = await api(path) as LiveSummary;
        if (cancelled) return;

        const nextPrice = Number(next.price || 0);
        const previousPrice = previousPriceRef.current;
        if (nextPrice > 0 && previousPrice > 0) {
          if (nextPrice > previousPrice) setDirection("up");
          else if (nextPrice < previousPrice) setDirection("down");
          else setDirection("flat");
        } else {
          setDirection("flat");
        }
        if (nextPrice > 0) previousPriceRef.current = nextPrice;
        setSummary(next);
      } catch {
        // The dashboard already owns the main error surface. Keep this enhancement quiet.
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 1200);
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const digits = Math.max(0, Math.min(8, Number(summary?.digits ?? 2)));
  const price = Number(summary?.price || 0);
  const marketClosed = String(summary?.marketSessionState || "").toUpperCase() === "CLOSED";
  const today = summary?.today || { trades: 0, wins: 0, losses: 0, winRate: 0, netProfit: 0 };
  const winTone = today.trades === 0 ? "neutral" : today.winRate >= 60 ? "good" : today.winRate >= 50 ? "warn" : "bad";
  const priceTone: Direction = marketClosed ? "flat" : direction;

  return (
    <>
      {headerTarget && createPortal(
        <div className={"cc-header-live-price " + priceTone} aria-live="polite" aria-label="ราคาจริงแบบเรียลไทม์">
          <b>{price > 0 ? price.toFixed(digits) : "—"}</b>
        </div>,
        headerTarget
      )}

      {insightTarget && createPortal(
        <div className={"cc-v6-insight-row cc-daily-win-row tone-" + winTone}>
          <span>อัตราชนะวันนี้</span>
          <b>
            {today.trades > 0
              ? today.winRate.toFixed(1) + "% · ชนะ " + today.wins + "/" + today.trades + " Basket"
              : "0.0% · ยังไม่มี Basket ปิดวันนี้"}
          </b>
        </div>,
        insightTarget
      )}
    </>
  );
}
