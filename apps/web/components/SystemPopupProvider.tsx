"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type PopupTone = "success" | "error" | "warning" | "info";

type PopupOptions = {
  title?: string;
  message: string;
  tone?: PopupTone;
  duration?: number;
};

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: PopupTone;
};

type PopupState = {
  kind: "notice" | "confirm";
  title: string;
  message: string;
  tone: PopupTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

type SystemPopupContextValue = {
  showPopup: (options: PopupOptions) => void;
  confirmPopup: (options: ConfirmOptions) => Promise<boolean>;
  closePopup: () => void;
};

const SystemPopupContext = createContext<SystemPopupContextValue | null>(null);

function toneTitle(tone: PopupTone) {
  if (tone === "success") return "สำเร็จ";
  if (tone === "error") return "ดำเนินการไม่สำเร็จ";
  if (tone === "warning") return "โปรดยืนยัน";
  return "SCENOVA";
}

function toneIcon(tone: PopupTone) {
  if (tone === "success") return "✓";
  if (tone === "error") return "×";
  if (tone === "warning") return "!";
  return "i";
}

export function SystemPopupProvider({ children }: { children: React.ReactNode }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const timerRef = useRef<number | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closePopup = useCallback(() => {
    clearTimer();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setPopup(null);
  }, [clearTimer]);

  const showPopup = useCallback((options: PopupOptions) => {
    clearTimer();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    const tone = options.tone || "info";
    setPopup({
      kind: "notice",
      title: options.title || toneTitle(tone),
      message: options.message,
      tone
    });
    timerRef.current = window.setTimeout(() => {
      setPopup(null);
      timerRef.current = null;
    }, Math.max(1400, options.duration ?? 2800));
  }, [clearTimer]);

  const confirmPopup = useCallback((options: ConfirmOptions) => {
    clearTimer();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    const tone = options.tone || "warning";
    setPopup({
      kind: "confirm",
      title: options.title || toneTitle(tone),
      message: options.message,
      tone,
      confirmLabel: options.confirmLabel || "ยืนยัน",
      cancelLabel: options.cancelLabel || "ยกเลิก"
    });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [clearTimer]);

  const resolveConfirm = useCallback((value: boolean) => {
    clearTimer();
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPopup(null);
    resolver?.(value);
  }, [clearTimer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && popup) {
        if (popup.kind === "confirm") resolveConfirm(false);
        else closePopup();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popup, closePopup, resolveConfirm]);

  useEffect(() => () => {
    clearTimer();
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, [clearTimer]);

  const value = useMemo(() => ({ showPopup, confirmPopup, closePopup }), [showPopup, confirmPopup, closePopup]);

  return (
    <SystemPopupContext.Provider value={value}>
      {children}
      {popup && (
        <div
          className={"sc-system-popup-layer " + (popup.kind === "confirm" ? "is-confirm" : "is-notice")}
          role={popup.kind === "confirm" ? "presentation" : "status"}
          aria-live={popup.kind === "confirm" ? undefined : "polite"}
          onMouseDown={(event) => {
            if (popup.kind === "confirm" && event.target === event.currentTarget) resolveConfirm(false);
          }}
        >
          <div
            className={"sc-system-popup sc-system-popup-" + popup.tone}
            role={popup.kind === "confirm" ? "alertdialog" : "status"}
            aria-modal={popup.kind === "confirm" ? true : undefined}
            aria-label={popup.title}
          >
            <span className="sc-system-popup-icon" aria-hidden="true">{toneIcon(popup.tone)}</span>
            <div className="sc-system-popup-copy">
              <b>{popup.title}</b>
              <p>{popup.message}</p>
            </div>
            {popup.kind === "notice" ? (
              <button type="button" className="sc-system-popup-close" onClick={closePopup} aria-label="ปิด">×</button>
            ) : (
              <div className="sc-system-popup-actions">
                <button type="button" className="sc-system-popup-cancel" onClick={() => resolveConfirm(false)}>{popup.cancelLabel}</button>
                <button type="button" className="sc-system-popup-confirm" onClick={() => resolveConfirm(true)}>{popup.confirmLabel}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </SystemPopupContext.Provider>
  );
}

export function useSystemPopup() {
  const context = useContext(SystemPopupContext);
  if (!context) throw new Error("useSystemPopup must be used inside SystemPopupProvider");
  return context;
}
