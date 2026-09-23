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

type PromptOptions = {
  title?: string;
  message: string;
  requiredText?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  copyLabel?: string;
  tone?: PopupTone;
};

type PopupState = {
  kind: "notice" | "confirm" | "prompt";
  title: string;
  message: string;
  tone: PopupTone;
  confirmLabel?: string;
  cancelLabel?: string;
  requiredText?: string;
  placeholder?: string;
  copyLabel?: string;
};

type SystemPopupContextValue = {
  showPopup: (options: PopupOptions) => void;
  confirmPopup: (options: ConfirmOptions) => Promise<boolean>;
  promptPopup: (options: PromptOptions) => Promise<string | null>;
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

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

export function SystemPopupProvider({ children }: { children: React.ReactNode }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resolveOpenPopup = useCallback(() => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
      confirmResolverRef.current = null;
    }
    if (promptResolverRef.current) {
      promptResolverRef.current(null);
      promptResolverRef.current = null;
    }
  }, []);

  const closePopup = useCallback(() => {
    clearTimer();
    resolveOpenPopup();
    setPopup(null);
    setPromptValue("");
    setCopied(false);
  }, [clearTimer, resolveOpenPopup]);

  const showPopup = useCallback((options: PopupOptions) => {
    clearTimer();
    resolveOpenPopup();
    const tone = options.tone || "info";
    setPromptValue("");
    setCopied(false);
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
  }, [clearTimer, resolveOpenPopup]);

  const confirmPopup = useCallback((options: ConfirmOptions) => {
    clearTimer();
    resolveOpenPopup();
    const tone = options.tone || "warning";
    setPromptValue("");
    setCopied(false);
    setPopup({
      kind: "confirm",
      title: options.title || toneTitle(tone),
      message: options.message,
      tone,
      confirmLabel: options.confirmLabel || "ยืนยัน",
      cancelLabel: options.cancelLabel || "ยกเลิก"
    });
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, [clearTimer, resolveOpenPopup]);

  const promptPopup = useCallback((options: PromptOptions) => {
    clearTimer();
    resolveOpenPopup();
    const tone = options.tone || "warning";
    setPromptValue("");
    setCopied(false);
    setPopup({
      kind: "prompt",
      title: options.title || toneTitle(tone),
      message: options.message,
      tone,
      confirmLabel: options.confirmLabel || "ยืนยัน",
      cancelLabel: options.cancelLabel || "ยกเลิก",
      requiredText: options.requiredText,
      placeholder: options.placeholder,
      copyLabel: options.copyLabel || "คัดลอก"
    });
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
    });
  }, [clearTimer, resolveOpenPopup]);

  const resolveConfirm = useCallback((value: boolean) => {
    clearTimer();
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setPopup(null);
    resolver?.(value);
  }, [clearTimer]);

  const resolvePrompt = useCallback((value: string | null) => {
    clearTimer();
    const resolver = promptResolverRef.current;
    promptResolverRef.current = null;
    setPopup(null);
    setPromptValue("");
    setCopied(false);
    resolver?.(value);
  }, [clearTimer]);

  const promptMatches = popup?.kind === "prompt"
    ? popup.requiredText
      ? promptValue.trim() === popup.requiredText
      : promptValue.trim().length > 0
    : false;

  const copyRequiredText = useCallback(async () => {
    if (popup?.kind !== "prompt" || !popup.requiredText) return;
    const ok = await copyText(popup.requiredText);
    setPromptValue(popup.requiredText);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1400);
  }, [popup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !popup) return;
      if (popup.kind === "confirm") resolveConfirm(false);
      else if (popup.kind === "prompt") resolvePrompt(null);
      else closePopup();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popup, closePopup, resolveConfirm, resolvePrompt]);

  useEffect(() => () => {
    clearTimer();
    resolveOpenPopup();
  }, [clearTimer, resolveOpenPopup]);

  const value = useMemo(
    () => ({ showPopup, confirmPopup, promptPopup, closePopup }),
    [showPopup, confirmPopup, promptPopup, closePopup]
  );

  return (
    <SystemPopupContext.Provider value={value}>
      {children}
      {popup && (
        <div
          className={
            "sc-system-popup-layer " +
            (popup.kind === "confirm"
              ? "is-confirm"
              : popup.kind === "prompt"
                ? "is-prompt"
                : "is-notice")
          }
          role={popup.kind === "notice" ? "status" : "presentation"}
          aria-live={popup.kind === "notice" ? "polite" : undefined}
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (popup.kind === "confirm") resolveConfirm(false);
            else if (popup.kind === "prompt") resolvePrompt(null);
          }}
        >
          <div
            className={
              "sc-system-popup sc-system-popup-" + popup.tone +
              (popup.kind === "prompt" ? " sc-system-popup-prompt" : "")
            }
            role={popup.kind === "notice" ? "status" : "alertdialog"}
            aria-modal={popup.kind === "notice" ? undefined : true}
            aria-label={popup.title}
          >
            <span className="sc-system-popup-icon" aria-hidden="true">{toneIcon(popup.tone)}</span>
            <div className="sc-system-popup-copy">
              <b>{popup.title}</b>
              <p>{popup.message}</p>
            </div>

            {popup.kind === "notice" && (
              <button type="button" className="sc-system-popup-close" onClick={closePopup} aria-label="ปิด">×</button>
            )}

            {popup.kind === "prompt" && (
              <div className="sc-system-popup-prompt-body">
                {popup.requiredText && (
                  <div className="sc-system-popup-required">
                    <span>พิมพ์ข้อความนี้เพื่อยืนยัน</span>
                    <div>
                      <code>{popup.requiredText}</code>
                      <button type="button" onClick={copyRequiredText}>
                        {copied ? "คัดลอกแล้ว" : popup.copyLabel}
                      </button>
                    </div>
                  </div>
                )}
                <input
                  className="sc-system-popup-input"
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && promptMatches) {
                      event.preventDefault();
                      resolvePrompt(promptValue.trim());
                    }
                  }}
                  placeholder={popup.placeholder || popup.requiredText || "พิมพ์ข้อความยืนยัน"}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            )}

            {popup.kind !== "notice" && (
              <div className="sc-system-popup-actions">
                <button
                  type="button"
                  className="sc-system-popup-cancel"
                  onClick={() => popup.kind === "prompt" ? resolvePrompt(null) : resolveConfirm(false)}
                >
                  {popup.cancelLabel}
                </button>
                <button
                  type="button"
                  className="sc-system-popup-confirm"
                  disabled={popup.kind === "prompt" && !promptMatches}
                  onClick={() => popup.kind === "prompt"
                    ? resolvePrompt(promptValue.trim())
                    : resolveConfirm(true)}
                >
                  {popup.confirmLabel}
                </button>
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
