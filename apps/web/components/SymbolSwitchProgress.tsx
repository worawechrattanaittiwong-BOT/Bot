"use client";

import { ScenovaIcon } from "./ScenovaIcon";

// Post-connection Symbol replacement ONLY. Initial MT5 account connection uses
// the unchanged Mt5ConnectChecklist and its separate API/workflow.
export type SymbolSwitchObservation = {
  target: string;
  requestedAt: string;
  serverRequestedAt?: string | null;
  acknowledged: boolean;
  isCloud: boolean;
  runnerOnline: boolean;
  commandStatus?: string | null;
  mt5Online: boolean;
  brokerConnected?: boolean | null;
  activeSymbol?: string | null;
  heartbeatAt?: string | null;
  error?: string | null;
  status?: string | null;
};

export function getSymbolSwitchProgress(input: SymbolSwitchObservation) {
  const stage = String(input.commandStatus || "").toUpperCase();
  const requested = Date.parse(input.requestedAt || "");
  const received = input.acknowledged && Boolean(input.requestedAt) &&
    input.serverRequestedAt === input.requestedAt;
  const workerDone = received && (stage === "RELOADED" || stage === "READY");
  const freshHeartbeat = received && Number.isFinite(requested) &&
    Boolean(input.heartbeatAt) && Date.parse(String(input.heartbeatAt)) > requested &&
    input.mt5Online;
  const mt5Connected = Boolean(freshHeartbeat && input.brokerConnected !== false);
  const activeMatches = Boolean(mt5Connected && workerDone &&
    String(input.activeSymbol || "").toUpperCase() === input.target.toUpperCase());
  const failed = String(input.status || "").toUpperCase() === "FAILED" ||
    (received && stage === "FAILED");
  const steps = [
    {
      title:"รับคำสั่งเปลี่ยน Symbol",
      detail:"Server บันทึกคำสั่งสำหรับบัญชี MT5 เดิมแล้ว",
      waiting:"กำลังส่งคำสั่งให้ Server",
      done:received
    },
    {
      title:input.isCloud ? "ส่งคำสั่งไปยัง Cloud VPS" : "ส่งคำสั่งให้ Windows Agent",
      detail:input.isCloud ? "VPS รับและดำเนินการโหลด Symbol ใหม่แล้ว" : "Agent รับคำสั่งเปิด Symbol ใหม่แล้ว",
      waiting:input.isCloud
        ? (input.runnerOnline ? "กำลังรอ Cloud Worker รับคำสั่ง" : "กำลังรอ VPS ออนไลน์")
        : "กำลังรอ Windows Agent รับคำสั่ง",
      done:workerDone
    },
    {
      title:"เปิดกราฟ " + input.target + " และโหลด EA",
      detail:"ระบบยืนยันการรีโหลดกราฟและ EA แล้ว",
      waiting:"กำลังรอ MT5/EA เปิดกราฟ Symbol ใหม่",
      done:workerDone
    },
    {
      title:"ตรวจสอบการเชื่อมต่อ MT5",
      detail:"MT5/EA ส่ง Heartbeat ใหม่และเชื่อมต่อ Broker แล้ว",
      waiting:"กำลังรอ MT5 เชื่อมต่อและส่ง Heartbeat ล่าสุด",
      done:mt5Connected
    },
    {
      title:"ยืนยัน Symbol " + input.target,
      detail:"EA ยืนยันว่าทำงานบน " + input.target + " แล้ว · พร้อมเริ่มบอท",
      waiting:"กำลังยืนยัน Symbol จาก EA จริง · ยังไม่ถือว่าเปลี่ยนสำเร็จ",
      done:activeMatches
    }
  ];
  const activeIndex = steps.findIndex(step => !step.done);
  return {
    complete:activeMatches,
    failed,
    message:failed
      ? String(input.error || "Worker ไม่สามารถเปลี่ยน Symbol ได้ กรุณาตรวจสอบสถานะ VPS/MT5")
      : activeMatches
        ? "เปลี่ยนเป็น " + input.target + " สำเร็จ · MT5 เชื่อมต่อและ EA ยืนยัน Symbol แล้ว"
        : steps[activeIndex]?.waiting || "กำลังตรวจสอบสถานะ MT5",
    steps:steps.map((step,index) => ({
      title:step.title,
      detail:step.done ? step.detail : index === activeIndex ? step.waiting : "รอดำเนินการ",
      state:step.done ? "done" as const :
        index === activeIndex ? (failed ? "failed" as const : "active" as const) :
        "waiting" as const
    }))
  };
}

export function SymbolSwitchChecklist({ input }:{input:SymbolSwitchObservation}) {
  const progress = getSymbolSwitchProgress(input);
  return (
    <div className="cc-mt5-checklist" aria-label="ความคืบหน้าการเปลี่ยน Symbol">
      {progress.steps.map((step,index)=>(
        <div className={"cc-mt5-check-step state-"+step.state} key={index}>
          <span className="cc-mt5-check-mark" aria-hidden="true">
            {step.state === "done"
              ? <ScenovaIcon name="check" size={18}/>
              : step.state === "failed"
                ? <ScenovaIcon name="close" size={17}/>
                : <span className="cc-mt5-check-dot"/>}
          </span>
          <div className="cc-mt5-check-copy">
            <b>{step.title}</b>
            <small>{step.detail}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
