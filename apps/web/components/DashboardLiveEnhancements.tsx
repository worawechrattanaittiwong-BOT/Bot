"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

type LiveSummary = {
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
type WinTone = "good" | "warn" | "bad" | "neutral";

export function DashboardLiveEnhancements() {
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [direction, setDirection] = useState<Direction>("flat");
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const previousPriceRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return;

    const setText = (element: Element | null | undefined, value: string) => {
      if (element && element.textContent !== value) element.textContent = value;
    };

    const readZeroGridValue = (modal: HTMLElement, label: string) => {
      const fields = Array.from(modal.querySelectorAll<HTMLElement>(".cc-bot-v2-field"));
      const field = fields.find(item => String(item.textContent || "").includes(label));
      const control = field?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
      return String(control?.value || "").trim();
    };

    const bindTargets = () => {
      const header = document.querySelector<HTMLElement>(".cc-v6-hourly-chart .cc-v6-panel-head");
      setHeaderTarget(header);

      const titleGroup = header?.firstElementChild as HTMLElement | null;
      const title = titleGroup?.querySelector<HTMLElement>("b");
      const subtitle = titleGroup?.querySelector<HTMLElement>("small");

      setText(title, "ราคา & อัตราชนะวันนี้");
      setText(subtitle, "ราคา Live · สถิติ Basket เฉพาะวันนี้");

      const modal = document.querySelector<HTMLElement>(".cc-bot-v2");
      if (!modal) return;

      modal.classList.add("cc-bot-v2-clean");
      const activeMode = modal.querySelector<HTMLElement>(".cc-bot-v2-modes button.active");
      const zeroGrid = String(activeMode?.textContent || "").toUpperCase().includes("ZERO GRID");
      modal.classList.toggle("cc-zero-grid-clean", zeroGrid);

      const panels = modal.querySelectorAll<HTMLElement>(".cc-bot-v2-main > .cc-bot-v2-panel");
      const limitsNumber = panels[2]?.querySelector<HTMLElement>(".cc-bot-v2-section-title > span");
      setText(limitsNumber, zeroGrid ? "03" : "04");

      if (!zeroGrid) return;

      const summaryRows = Array.from(modal.querySelectorAll<HTMLElement>(".cc-bot-v2-summary dl > div"));
      const step = readZeroGridValue(modal, "ระยะ Grid") || "—";
      const levels = readZeroGridValue(modal, "จำนวน Pending ต่อฝั่ง") || "—";
      const baseLot = readZeroGridValue(modal, "Base Lot") || "—";
      const minProfit = readZeroGridValue(modal, "กำไรสุทธิขั้นต่ำ") || "—";

      setText(summaryRows[1]?.querySelector("dt"), "ทิศทาง");
      setText(summaryRows[1]?.querySelector("dd"), "BUY STOP + SELL STOP");
      setText(summaryRows[2]?.querySelector("dt"), "Pending");
      setText(summaryRows[2]?.querySelector("dd"), levels === "—" ? "—" : levels + " / ฝั่ง");
      setText(summaryRows[3]?.querySelector("dt"), "ระยะ Grid");
      setText(summaryRows[3]?.querySelector("dd"), step === "—" ? "—" : step + " ราคา");
      setText(summaryRows[4]?.querySelector("dt"), "Lot / ปิด Basket");
      setText(
        summaryRows[4]?.querySelector("dd"),
        baseLot === "—" || minProfit === "—"
          ? "—"
          : "Base " + baseLot + " Lot · Net +$" + minProfit
      );
    };

    bindTargets();
    const observer = new MutationObserver(bindTargets);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    document.addEventListener("input", bindTargets, true);
    document.addEventListener("change", bindTargets, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", bindTargets, true);
      document.removeEventListener("change", bindTargets, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        // Customer UI is account-follow based. The backend resolves the active
        // installation/account automatically; no customer-facing Slot selector.
        const next = await api("/dashboard-live/summary") as LiveSummary;
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
        // Keep this enhancement quiet; the dashboard owns the main error surface.
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
  const winTone: WinTone = today.trades === 0 ? "neutral" : today.winRate >= 60 ? "good" : today.winRate >= 50 ? "warn" : "bad";
  const priceTone: Direction = marketClosed ? "flat" : direction;
  const winRateText = today.trades > 0 ? today.winRate.toFixed(1) + "%" : "0.0%";
  const winDetail = today.trades > 0 ? "ชนะ " + today.wins + "/" + today.trades + " Basket" : "ยังไม่มี Basket ปิดวันนี้";

  return (
    <>
      <style>{`
        .cc-bot-v2-clean .cc-bot-v2-section-title small,
        .cc-bot-v2-clean .cc-bot-v2-modes button small,
        .cc-bot-v2-clean .cc-bot-v2-field > small,
        .cc-bot-v2-clean .cc-bot-v2-engine-line,
        .cc-bot-v2-clean .cc-bot-v2-footer > div:first-child {
          display:none!important;
        }
        .cc-bot-v2-clean .cc-bot-v2-footer {
          justify-content:flex-end!important;
        }
        .cc-bot-v2-clean.cc-zero-grid-clean .cc-bot-v2-main > .cc-bot-v2-panel:nth-child(2),
        .cc-bot-v2-clean.cc-zero-grid-clean .cc-bot-v2-summary-note,
        .cc-bot-v2-clean.cc-zero-grid-clean .cc-bot-v2-summary dl > div:last-child {
          display:none!important;
        }
      `}</style>

      {headerTarget && createPortal(
        <div className="cc-header-live-summary" aria-live="polite">
          <div key={"price-" + price + "-" + priceTone} className={"cc-live-metric cc-live-metric-price " + priceTone}>
            <small>ราคาจริง</small>
            <b>{price > 0 ? price.toFixed(digits) : "—"}</b>
          </div>
          <div className={"cc-live-metric cc-live-metric-win tone-" + winTone}>
            <small>อัตราชนะวันนี้</small>
            <div className="cc-live-win-value">
              <b>{winRateText}</b>
              <span>{winDetail}</span>
            </div>
          </div>
        </div>,
        headerTarget
      )}
    </>
  );
}
