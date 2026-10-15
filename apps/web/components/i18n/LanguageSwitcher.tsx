"use client";

import { useCustomerLanguage } from "../../lib/i18n/provider";

type Props = { compact?: boolean };

export function LanguageSwitcher({ compact = false }: Props) {
  const { lang, setLang } = useCustomerLanguage();
  return (
    <div
      className={"scenova-lang-switch" + (compact ? " scenova-lang-switch--compact" : "")}
      role="group"
      aria-label="Language / ภาษา"
      data-i18n-no-auto
    >
      <svg aria-hidden="true" className="scenova-lang-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c-3.5 4.8-3.5 13.2 0 18M12 3c3.5 4.8 3.5 13.2 0 18" />
      </svg>
      <button
        type="button"
        aria-label="Thai"
        aria-pressed={lang === "th"}
        onClick={() => setLang("th")}
      >TH</button>
      <button
        type="button"
        aria-label="English"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
      >EN</button>
    </div>
  );
}
