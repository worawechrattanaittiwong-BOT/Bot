"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

type SessionUser = {
  id: string;
  userCode: string;
  email: string;
  role: string;
  status: string;
};

export default function SiteHeader() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("bot_token");
    if (!token) {
      setChecking(false);
      return;
    }

    fetch(API_URL + "/api/auth/session", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid session");
        return res.json();
      })
      .then((data) => setUser(data.user || null))
      .catch(() => {
        localStorage.removeItem("bot_token");
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  function logout() {
    localStorage.removeItem("bot_token");
    setUser(null);
    window.location.href = "/";
  }

  const consoleHref = user?.role === "OWNER" || user?.role === "ADMIN"
    ? "/admin"
    : "/dashboard";

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <a className="brand-lockup" href="/">
          <span className="brand-mark">◆</span>
          <span><strong>SCENOVA</strong><small>MT5 BOT EA</small></span>
        </a>

        <nav className="nav site-nav">
          <a className="btn ghost hide-sm" href="#how">วิธีใช้งาน</a>

          {checking ? (
            <span className="session-checking">กำลังตรวจสอบบัญชี...</span>
          ) : user ? (
            <>
              <a className="btn primary" href={consoleHref}>
                {user.role === "OWNER" || user.role === "ADMIN" ? "Owner Console" : "Control Center"}
              </a>
              <button type="button" className="btn ghost" onClick={logout}>ออกจากระบบ</button>
            </>
          ) : (
            <>
              <a className="btn" href="/login">เข้าสู่ระบบ</a>
              <a className="btn primary" href="/login?mode=register">เริ่มใช้งาน</a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
