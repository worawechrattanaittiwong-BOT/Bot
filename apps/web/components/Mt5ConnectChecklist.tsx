import { ScenovaIcon } from "./ScenovaIcon";

export type ConnectStepState = "done" | "active" | "waiting" | "failed";

export type Mt5ProgressInput = {
  acknowledged: boolean;
  isCloud: boolean;
  accountMatches: boolean;
  runnerOnline: boolean;
  terminalOnline: boolean;
  eaHeartbeat: boolean;
  cloudControlReady: boolean;
  brokerConnected: boolean | null;
  symbolsFound: number;
  discoveryReady: boolean;
  symbolConfirmed: boolean;
  activeSymbolMatches: boolean;
  localSymbol: boolean;
  status: string;
};

// After a customer confirms a broker-discovered exact Symbol, the Worker may
// clear its temporary discovery list. Completion must use the authoritative
// confirmed symbol plus a live, matching EA instead of the discovery cache.
export function isCloudMt5ConnectionComplete(input: Pick<Mt5ProgressInput,
  "isCloud" | "accountMatches" | "runnerOnline" | "terminalOnline" |
  "eaHeartbeat" | "cloudControlReady" | "brokerConnected" |
  "symbolConfirmed" | "activeSymbolMatches">) {
  return input.isCloud &&
    input.accountMatches &&
    input.runnerOnline &&
    input.terminalOnline &&
    input.eaHeartbeat &&
    input.cloudControlReady &&
    input.brokerConnected !== false &&
    input.symbolConfirmed &&
    input.activeSymbolMatches;
}

export function getMt5ConnectSteps(input: Mt5ProgressInput) {
  // Only assert stages supported by server observations; never use elapsed
  // browser time to manufacture either success or failure.
  const received = input.acknowledged || input.accountMatches;
  const runner = received && (!input.isCloud || input.runnerOnline);
  const terminal = runner && input.accountMatches && input.terminalOnline;
  const broker = terminal && input.brokerConnected !== false &&
    (input.brokerConnected === true ||
      input.eaHeartbeat ||
      (input.isCloud && input.symbolsFound > 0));
  const found = broker && (input.isCloud
    ? ((input.discoveryReady && input.symbolsFound > 0) || input.symbolConfirmed)
    : input.localSymbol);
  const confirmed = found && (!input.isCloud || input.symbolConfirmed);
  const ready = confirmed && input.eaHeartbeat &&
    (!input.isCloud || isCloudMt5ConnectionComplete(input));

  const stages = [
    { title:"รับข้อมูลบัญชี MT5", detail:"เซิร์ฟเวอร์รับข้อมูลบัญชีแล้ว", waiting:"กำลังส่งข้อมูลบัญชี", done:received },
    { title:input.isCloud ? "เตรียมเซิร์ฟเวอร์ VPS" : "เตรียมระบบ Local MT5", detail:input.isCloud ? "VPS ออนไลน์แล้ว" : "พร้อมตรวจสอบ MT5", waiting:input.isCloud ? "กำลังเตรียม VPS" : "กำลังตรวจสอบระบบ", done:runner },
    { title:"เปิดโปรแกรม MT5", detail:"ตรวจพบ MT5 ทำงานแล้ว", waiting:"กำลังตรวจสอบการเปิด MT5", done:terminal },
    { title:"เชื่อมต่อ Broker", detail:"ยืนยันการเชื่อมต่อบัญชีเทรดแล้ว", waiting:"กำลังยืนยันบัญชีเทรด", done:broker },
    { title:"ตรวจสอบ Symbol ทองคำ", detail:input.isCloud ? "ยืนยัน Symbol แล้ว" : "ตรวจพบ Symbol จาก MT5", waiting:input.isCloud && found && !input.symbolConfirmed ? "พบ Symbol แล้ว · กรุณาเลือกและยืนยัน" : "กำลังตรวจหา Symbol จาก MT5", done:confirmed },
    { title:"เตรียม EA", detail:"EA ตอบรับและพร้อมทำงาน", waiting:input.isCloud && confirmed && !input.activeSymbolMatches ? "กำลังรอ EA ยืนยัน Symbol ที่เลือก" : "กำลังรอ EA ยืนยันความพร้อม", done:ready }
  ];
  // A completed operation has already been verified by the caller. This
  // also covers Local rebind, whose API confirms a heartbeat before returning.
  if (input.status === "SUCCESS") return stages.map(stage => ({
    title:stage.title, detail:stage.detail, state:"done" as ConnectStepState
  }));
  const activeIndex = stages.findIndex(stage => !stage.done);
  return stages.map((stage,index) => ({
    title:stage.title,
    detail:stage.done ? stage.detail : (index === activeIndex ? stage.waiting : "รอดำเนินการ"),
    state:stage.done ? "done" as ConnectStepState
      : index === activeIndex ? (input.status === "FAILED" ? "failed" as ConnectStepState : "active" as ConnectStepState)
      : "waiting" as ConnectStepState
  }));
}

export function Mt5ConnectChecklist(props: {
  input:Mt5ProgressInput;
  onPickSymbol?:()=>void;
}) {
  const steps = getMt5ConnectSteps(props.input);
  const needsSymbol = props.input.isCloud &&
    props.input.discoveryReady &&
    props.input.symbolsFound > 0 &&
    !props.input.symbolConfirmed &&
    props.input.accountMatches &&
    props.input.status === "RUNNING";

  return (
    <div className="cc-mt5-checklist" aria-label="ความคืบหน้าการเชื่อมต่อ MT5">
      {steps.map((step,index)=>(
        <div className={"cc-mt5-check-step state-"+step.state} key={index}>
          <span className="cc-mt5-check-mark" aria-hidden="true">
            {step.state==="done"
              ? <ScenovaIcon name="check" size={18}/>
              : step.state==="failed"
                ? <ScenovaIcon name="close" size={17}/>
                : <span className="cc-mt5-check-dot"/>}
          </span>
          <div className="cc-mt5-check-copy">
            <b>{step.title}</b>
            <small>{step.detail}</small>
            {index===4 && needsSymbol && props.onPickSymbol && (
              <button type="button" className="cc-mt5-pick-symbol" onClick={props.onPickSymbol}>
                เลือก Symbol ทองคำ
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
