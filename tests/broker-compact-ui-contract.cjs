const assert=require("node:assert/strict");
const fs=require("node:fs");
const ui=fs.readFileSync("apps/web/app/broker/page.tsx","utf8");
const css=fs.readFileSync("apps/web/app/broker/page.module.css","utf8");
const rebate=fs.readFileSync("apps/web/components/ExnessRebateControl.tsx","utf8");
const rebateCss=fs.readFileSync("apps/web/components/ExnessRebateControl.module.css","utf8");
const order=[
  '<section id="ib-performance"',
  '<section id="exness-clients"',
  '<details id="exness-rebate"',
  '<details id="exness-transfers"',
  '<form id="exness-partner"',
  '<details id="exness-api"'
];
for(const label of order) assert(ui.includes(label),"Missing Broker feature "+label);
for(let i=1;i<order.length;i++)assert(ui.indexOf(order[i])>ui.indexOf(order[i-1]),"Broker feature order broken");
assert(ui.includes('className={styles.foldSummary}'));
assert(ui.includes('onClick={() => expandBrokerSection("exness-rebate")}'));
assert(ui.includes('onClick={() => expandBrokerSection("exness-transfers")}'));
assert(ui.includes('onClick={() => expandBrokerSection("exness-api")}'));
assert(ui.includes('onClick={() => expandBrokerSection("exness-partner")}'));
assert(ui.includes('const [rebateActivated, setRebateActivated] = useState(false)'));
assert(ui.includes('rebateActivated && <ExnessRebateControl/>'));
assert(ui.includes('previewActivated && <ExnessSignupCard showWhenInactive />'));
assert(ui.includes('ดูบัญชีเทรด'));
assert(ui.includes('verifyClient(client)'));
assert(ui.includes('styles.verifyDisclosure'));
assert(ui.includes('ตรวจสอบใหม่'));
assert(ui.includes('styles.subDisclosure'));
assert(rebate.includes('<details id="exness-rebate-edit"'));
assert(rebate.includes('if (editor instanceof HTMLDetailsElement) editor.open = true;'));
assert(rebate.includes('changePercent()'));
assert(rebate.includes('startApproval()'));
assert(rebate.includes('finishApproval()'));
assert(rebate.includes('destination_client_account'));
assert(css.includes('.quickNav{display:flex;flex-wrap:nowrap'));
assert(css.includes('.foldSummary'));
assert(css.includes('.healthGrid{display:grid;grid-template-columns:repeat(3'));
assert(rebateCss.includes('.helpDetails'));
console.log("Compact Broker navigation, progressive disclosure, MT5 actions, Rebate safeguards preserved: PASS");
