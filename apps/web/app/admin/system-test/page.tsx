"use client";

import { useEffect, useMemo, useState } from "react";
import { OwnerMobileNav, OwnerSidebar } from "../../../components/OwnerSidebar";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import {
  SYSTEM_TESTS,
  SystemTestResult,
  runSystemTest
} from "../../../lib/system-test";
import s from "./page.module.css";

type HistoryEntry = {
  id: string;
  mode: string;
  total: number;
  passed: number;
  failed: number;
  score: number;
  createdAt: string;
};

const HISTORY_KEY = "scenova_system_test_history_v1";

function statusLabel(status?: SystemTestResult["status"]) {
  if (status === "running") return "RUNNING";
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  return "READY";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

export default function SystemTestPage() {
  const [selected, setSelected] = useState<string[]>(SYSTEM_TESTS.map(test => test.id));
  const [results, setResults] = useState<Record<string, SystemTestResult>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [runDone, setRunDone] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [message, setMessage] = useState("พร้อมทดสอบ · ระบบนี้ใช้ GET/read-only เท่านั้น");

  useEffect(() => {
    if (!localStorage.getItem("bot_token")) {
      window.location.href = "/login";
      return;
    }
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, 12));
      }
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      passed: values.filter(item => item.status === "pass").length,
      failed: values.filter(item => item.status === "fail").length,
      running: values.filter(item => item.status === "running").length
    };
  }, [results]);

  const progress = runTotal > 0 ? Math.round(runDone / runTotal * 100) : 0;
  const allSelected = selected.length === SYSTEM_TESTS.length;

  function logout() {
    localStorage.removeItem("bot_token");
    window.location.href = "/login";
  }

  function toggleTest(id: string) {
    if (busy) return;
    setSelected(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    );
  }

  function saveHistory(entry: HistoryEntry) {
    const next = [entry, ...history].slice(0, 12);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  async function execute(ids: string[], mode: string) {
    if (busy || ids.length === 0) {
      if (ids.length === 0) setMessage("กรุณาเลือก Test อย่างน้อย 1 รายการ");
      return;
    }

    const definitions = SYSTEM_TESTS.filter(test => ids.includes(test.id));
    setBusy(true);
    setRunDone(0);
    setRunTotal(definitions.length);
    setMessage(`กำลังรัน ${mode} · ${definitions.length} tests`);

    setResults(current => {
      const next = { ...current };
      for (const test of definitions) {
        delete next[test.id];
      }
      return next;
    });

    const completed: SystemTestResult[] = [];

    try {
      for (const test of definitions) {
        setResults(current => ({
          ...current,
          [test.id]: {
            id: test.id,
            status: "running",
            durationMs: 0,
            detail: "Checking…",
            checkedAt: new Date().toISOString()
          }
        }));

        const result = await runSystemTest(test);
        completed.push(result);
        setResults(current => ({ ...current, [test.id]: result }));
        setRunDone(done => done + 1);
      }

      const passed = completed.filter(item => item.status === "pass").length;
      const failed = completed.filter(item => item.status === "fail").length;
      const score = completed.length ? Math.round(passed / completed.length * 100) : 0;

      saveHistory({
        id: Date.now().toString(36).toUpperCase(),
        mode,
        total: completed.length,
        passed,
        failed,
        score,
        createdAt: new Date().toISOString()
      });

      setMessage(
        failed === 0
          ? `ทดสอบเสร็จแล้ว · PASS ${passed}/${completed.length}`
          : `ทดสอบเสร็จแล้ว · พบ ${failed} จุดที่ต้องตรวจสอบ`
      );
    } finally {
      setBusy(false);
    }
  }

  function clearResults() {
    if (busy) return;
    setResults({});
    setRunDone(0);
    setRunTotal(0);
    setMessage("ล้างผลบนหน้าจอแล้ว · ประวัติเดิมยังเก็บไว้");
  }

  function clearHistory() {
    if (busy) return;
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }

  const quickIds = SYSTEM_TESTS.filter(test => test.quick).map(test => test.id);

  return (
    <div className="app-wrap owner-app">
      <OwnerSidebar activeKey="system-test" onLogout={logout}/>

      <main className={`main app-main owner-main ${s.shellMain}`}>
        <div className={s.root}>
          <div className="mobile-only mobile-app-head">
            <div className="brand-lockup scenova-brand-lockup">
              <ScenovaBrand className="scenova-brand-logo-mobile"/>
            </div>
            <button className="btn ghost" onClick={logout}>ออก</button>
          </div>
          <OwnerMobileNav activeKey="system-test"/>

          <header className={s.header}>
            <div>
              <span className={s.kicker}>SCENOVA / SYSTEM TEST CENTER</span>
              <h1>System Test</h1>
              <p>
                ตรวจสุขภาพระบบจากหน้า Admin แบบแยกโมดูล ไม่เปลี่ยน Trading Logic,
                ไม่ส่งคำสั่ง Start/Stop/Close และไม่เขียนข้อมูลลงฐานข้อมูล
              </p>
            </div>
            <div className={s.headerBadges}>
              <span className={s.safeBadge}>● READ-ONLY</span>
              <span className={s.liveBadge}>GET ONLY · SAFE CHECK</span>
            </div>
          </header>

          <section className={s.hero}>
            <div className={s.heroPanel}>
              <div className={s.heroTop}>
                <div>
                  <span className={s.kicker}>TEST RUNNER</span>
                  <h2 className={s.heroTitle}>ตรวจระบบด้วยปุ่มเดียว</h2>
                  <p className={s.heroText}>
                    Quick Test ตรวจ Core/Admin ที่สำคัญ ส่วน Full Test ตรวจ API,
                    Database, Admin, Trading read model, Backtest และ Package catalogs
                  </p>
                </div>
              </div>

              <div className={s.actions}>
                <button
                  className={s.primary}
                  disabled={busy}
                  onClick={() => execute(quickIds, "QUICK")}
                >
                  {busy ? "กำลังทดสอบ…" : "▶ Run Quick Test"}
                </button>
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => execute(SYSTEM_TESTS.map(test => test.id), "FULL")}
                >
                  Run Full Test
                </button>
                <button
                  className={s.secondary}
                  disabled={busy || selected.length === 0}
                  onClick={() => execute(selected, "SELECTED")}
                >
                  Run Selected ({selected.length})
                </button>
                <button className={s.ghost} disabled={busy} onClick={clearResults}>
                  Clear
                </button>
              </div>

              <div className={s.progressWrap}>
                <div className={s.progressMeta}>
                  <span>{message}</span>
                  <b>{runTotal ? `${runDone}/${runTotal}` : "READY"}</b>
                </div>
                <div className={s.progress}>
                  <div className={s.progressBar} style={{ width: `${progress}%` }}/>
                </div>
              </div>

              <div className={s.notice}>
                Safe Mode: ทุก test ในหน้านี้เป็น HTTP GET เท่านั้น จึงไม่สร้าง Order,
                ไม่เปลี่ยน Settings, ไม่แก้ Subscription และไม่แตะคำสั่ง MT5
              </div>
            </div>

            <div className={s.scorePanel}>
              <div className={s.scoreCell}>
                <small>TESTS AVAILABLE</small>
                <strong>{SYSTEM_TESTS.length}</strong>
                <span>แยกเป็น Core / Admin / Trading / Commerce</span>
              </div>
              <div className={s.scoreCell}>
                <small>PASSED</small>
                <strong className={s.goodValue}>{summary.passed}</strong>
                <span>endpoint ที่ตอบและ validate ผ่าน</span>
              </div>
              <div className={s.scoreCell}>
                <small>FAILED</small>
                <strong className={summary.failed ? s.badValue : ""}>{summary.failed}</strong>
                <span>จุดที่ต้องตรวจ log/config เพิ่ม</span>
              </div>
              <div className={s.scoreCell}>
                <small>RUNNING</small>
                <strong className={summary.running ? s.runningValue : ""}>{summary.running}</strong>
                <span>แสดงผลสดทีละ test</span>
              </div>
            </div>
          </section>

          <div className={s.toolbar}>
            <div>
              <h2>Test Checklist</h2>
              <p>เลือกเฉพาะส่วนที่ต้องการ หรือกด Full Test เพื่อตรวจทั้งหมด</p>
            </div>
            <div className={s.toolbarRight}>
              <label className={s.selectAll}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={busy}
                  onChange={() => setSelected(allSelected ? [] : SYSTEM_TESTS.map(test => test.id))}
                />
                เลือกทั้งหมด
              </label>
            </div>
          </div>

          <section className={s.testGrid}>
            {SYSTEM_TESTS.map(test => {
              const result = results[test.id];
              const status = result?.status || "idle";
              const stateClass =
                status === "pass" ? s.testCardPass :
                status === "fail" ? s.testCardFail :
                status === "running" ? s.testCardRunning : "";

              return (
                <article key={test.id} className={`${s.testCard} ${stateClass}`}>
                  <label className={s.checkbox} aria-label={`เลือก ${test.label}`}>
                    <input
                      type="checkbox"
                      checked={selected.includes(test.id)}
                      disabled={busy}
                      onChange={() => toggleTest(test.id)}
                    />
                  </label>

                  <div className={s.testCopy}>
                    <div className={s.testTop}>
                      <span className={s.testId}>{test.id}</span>
                      <span className={s.group}>{test.group}</span>
                    </div>
                    <h3>{test.label}</h3>
                    <p>{test.description}</p>
                    {result && (
                      <p className={s.resultDetail}>
                        {result.detail} · {result.durationMs} ms
                      </p>
                    )}
                  </div>

                  <span className={`${s.status} ${s[status]}`}>
                    {statusLabel(status)}
                  </span>
                </article>
              );
            })}
          </section>

          <section className={s.bottomGrid}>
            <div className={s.historyPanel}>
              <div className={s.panelHead}>
                <div>
                  <h2>Test History</h2>
                  <span>เก็บเฉพาะใน browser นี้ สูงสุด 12 รอบ</span>
                </div>
                <button className={s.smallButton} onClick={clearHistory} disabled={busy || history.length === 0}>
                  Clear history
                </button>
              </div>

              {history.length === 0 ? (
                <div className={s.empty}>ยังไม่มีประวัติ · กด Run Quick Test เพื่อเริ่มตรวจ</div>
              ) : (
                <div className={s.historyList}>
                  {history.map(item => (
                    <div className={s.historyRow} key={item.id}>
                      <b>{formatDate(item.createdAt)}</b>
                      <span>{item.mode}</span>
                      <div className={s.historyBar}>
                        <span style={{ width: `${item.score}%` }}/>
                      </div>
                      <span>{item.score}% · {item.passed}/{item.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className={s.testPanel}>
              <div className={s.panelHead}>
                <div>
                  <h2>Safety Boundary</h2>
                  <span>สิ่งที่ Tester หน้านี้จะไม่ทำ</span>
                </div>
              </div>
              <div className={s.safetyList}>
                {[
                  "ไม่ Start / Stop / Close Bot",
                  "ไม่เปิดหรือปิด Order บน MT5",
                  "ไม่เปลี่ยน Trial / Subscription",
                  "ไม่สร้าง Payment / Checkout",
                  "ไม่แก้ Cloud Node หรือ Recovery State",
                  "ไม่เขียนข้อมูล Test ลง Database"
                ].map(item => (
                  <div className={s.safetyItem} key={item}>
                    <span className={s.safetyDot}/>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
