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
// The Exness customer list should show counts, not masked MT5 digits.
const listStart=ui.indexOf('<div className={styles.clientList}>');
const detailStart=ui.indexOf('{detailOpenUser === client.userId && (',listStart);
assert(listStart>=0 && detailStart>listStart,"Exness client list and account details must remain present");
const clientList=ui.slice(listStart,detailStart);
assert(clientList.includes('client.exnessAccounts.length + " บัญชี MT5"'),"Customer rows show account count only");
assert(!clientList.includes('item.accountLast4'),"Customer rows must not disclose masked account suffixes");
assert(ui.includes('MT5 ••••{item.accountLast4}'),"On-demand account details must remain intact");
assert(ui.includes('placeholder="User ID / Email / MT5"'),"MT5 search must remain available");
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
