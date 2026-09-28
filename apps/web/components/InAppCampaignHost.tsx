"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, getToken } from "../lib/api";
import styles from "./InAppCampaignHost.module.css";

type Campaign = {
  id: string;
  code: string;
  title: string;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  targetUrl: string;
  ctaLabel: string;
  slotCode: string;
  delayMs: number;
};

function bangkokDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function tokenSubject() {
  const token = getToken();
  if (!token) return "";
  try {
    const raw = token.split(".")[1] || "";
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(window.atob(padded));
    return String(payload?.sub || "session").slice(0, 80);
  } catch {
    return "session";
  }
}

function hostAllowed(pathname: string) {
  if (!pathname || pathname === "/") return false;
  if (
    pathname === "/login" ||
    pathname === "/website" ||
    pathname === "/reset-password" ||
    pathname === "/verify-2fa" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/shared-performance/") ||
    pathname.startsWith("/performance/")
  ) return false;
  return true;
}

function localKey(subject: string, campaignId: string, date: string, suffix: string) {
  return `scenova_campaign:${subject}:${campaignId}:${date}:${suffix}`;
}

export function InAppCampaignHost() {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [visible, setVisible] = useState(false);
  const [hideToday, setHideToday] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCampaign(null);
    setVisible(false);
    setHideToday(false);

    if (!getToken() || !hostAllowed(pathname)) return;
    let cancelled = false;

    const run = async () => {
      try {
        const response = await api(
          "/in-app-campaigns/active?path=" + encodeURIComponent(pathname)
        );
        const next = response?.campaign as Campaign | null;
        if (cancelled || !next?.id || !next.slotCode) return;

        const subject = tokenSubject();
        const date = bangkokDateKey();
        const hiddenKey = localKey(subject, next.id, date, "hidden");
        const slotKey = localKey(subject, next.id, date, "slot:" + next.slotCode);
        if (
          window.localStorage.getItem(hiddenKey) === "1" ||
          window.localStorage.getItem(slotKey) === "1"
        ) return;

        const tryShow = () => {
          if (cancelled) return;
          if (document.querySelector(".sc-system-popup-layer")) {
            timerRef.current = window.setTimeout(tryShow, 1000);
            return;
          }
          setCampaign(next);
          setVisible(true);
          window.localStorage.setItem(slotKey, "1");
          void api("/in-app-campaigns/" + encodeURIComponent(next.id) + "/event", {
            method: "POST",
            body: JSON.stringify({
              eventType: "VIEW",
              slotCode: next.slotCode,
              path: pathname
            })
          }).catch(() => undefined);
        };

        timerRef.current = window.setTimeout(
          tryShow,
          Math.max(0, Math.min(15_000, Number(next.delayMs || 2500)))
        );
      } catch {
        // Promotions must never block or degrade the authenticated app.
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [pathname]);

  async function sendEvent(eventType: "CLOSE" | "CLICK" | "HIDE_TODAY") {
    if (!campaign) return;
    try {
      await api("/in-app-campaigns/" + encodeURIComponent(campaign.id) + "/event", {
        method: "POST",
        body: JSON.stringify({
          eventType,
          slotCode: campaign.slotCode,
          path: pathname
        })
      });
    } catch {}
  }

  function markHiddenToday() {
    if (!campaign) return;
    const subject = tokenSubject();
    const date = bangkokDateKey();
    window.localStorage.setItem(localKey(subject, campaign.id, date, "hidden"), "1");
  }

  async function closeCampaign() {
    if (!campaign) return;
    setVisible(false);
    if (hideToday) {
      markHiddenToday();
      await sendEvent("HIDE_TODAY");
    } else {
      await sendEvent("CLOSE");
    }
  }

  async function openCampaign() {
    if (!campaign) return;
    if (hideToday) {
      markHiddenToday();
      void sendEvent("HIDE_TODAY");
    }
    void sendEvent("CLICK");
    setVisible(false);
    window.location.href = campaign.targetUrl;
  }

  if (!visible || !campaign) return null;

  const creative = campaign.mobileImageUrl || campaign.imageUrl || "";
  return (
    <div className={styles.layer} role="presentation" onMouseDown={(event)=>{
      if (event.target === event.currentTarget) void closeCampaign();
    }}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={campaign.title}
        onMouseDown={event=>event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="ปิดโฆษณา"
          onClick={()=>void closeCampaign()}
        >
          ×
        </button>

        {creative ? (
          <button type="button" className={styles.creativeButton} onClick={()=>void openCampaign()}>
            <picture>
              {campaign.mobileImageUrl ? (
                <source media="(max-width: 720px)" srcSet={campaign.mobileImageUrl}/>
              ) : null}
              <img className={styles.creative} src={campaign.imageUrl || creative} alt={campaign.title}/>
            </picture>
          </button>
        ) : (
          <div className={styles.fallback}>
            <b>{campaign.title}</b>
            <span>SCENOVA Promotion</span>
          </div>
        )}

        <footer className={styles.footer}>
          <label className={styles.hideToday}>
            <input
              type="checkbox"
              checked={hideToday}
              onChange={event=>setHideToday(event.target.checked)}
            />
            <span>ไม่แสดงโฆษณานี้อีกในวันนี้</span>
          </label>
          <button type="button" className={styles.cta} onClick={()=>void openCampaign()}>
            {campaign.ctaLabel || "ดูรายละเอียด"}
            <span aria-hidden="true">›</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
