const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

// Compile real pure helper from TypeScript; no code changes or server connection.
const source=fs.readFileSync('apps/api/src/bot-inspection-analysis.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObj={exports:{}};
vm.runInNewContext(js,{module:moduleObj,exports:moduleObj.exports,Map,Number,Date,String,Math,Array});
const {buildBotSessions,approximateTradeGroups,attachSessionTrades,inspectBotEvents}=moduleObj.exports;

test('multiple START/STOP requests are distinct and ACK is not treated as flat confirmation',()=>{
 const c=(id,command,time,ack=null)=>({id,command,created_at:time,status:ack?'ACKED':'PENDING',acked_at:ack});
 const sessions=buildBotSessions([
   c('1','START','2026-10-14T12:15:00Z'),
   c('2','SAFE_STOP','2026-10-14T12:16:00Z','2026-10-14T12:18:00Z'),
   c('3','START','2026-10-14T12:20:00Z'),
   c('4','SAFE_STOP','2026-10-14T12:20:20Z','2026-10-14T12:20:30Z'),
 ]);
 assert.equal(sessions.length,2);
 assert.equal(sessions[0].stopAcknowledgedAt,'2026-10-14T12:18:00.000Z');
 assert.equal(sessions[0].endConfirmed,false);
 assert.equal(sessions[1].startAt,'2026-10-14T12:20:00.000Z');
});

test('trade grouping separates flat periods, matches the real loss example',()=>{
 const rows=[
  {id:'1',created_at:'2026-10-14T11:16:57Z',event_type:'ENTRY',direction:'BUY',volume:.03,position_id:'aa'},
  {id:'2',created_at:'2026-10-14T11:17:37Z',event_type:'EXIT',direction:'BUY',volume:.03,position_id:'aa',net_profit:1.37},
  {id:'3',created_at:'2026-10-14T12:33:11Z',event_type:'ENTRY',direction:'SELL',volume:.03,position_id:'bb'},
  {id:'4',created_at:'2026-10-14T12:33:14Z',event_type:'EXIT',direction:'SELL',volume:.03,position_id:'bb',net_profit:-.88},
  {id:'5',created_at:'2026-10-14T12:33:32Z',event_type:'ENTRY',direction:'SELL',volume:.03,position_id:'cc'},
  {id:'6',created_at:'2026-10-14T12:34:01Z',event_type:'ENTRY',direction:'BUY',volume:.03,position_id:'dd'},
  {id:'7',created_at:'2026-10-14T12:34:46Z',event_type:'ENTRY',direction:'SELL',volume:.06,position_id:'ee'},
  {id:'8',created_at:'2026-10-14T12:35:03Z',event_type:'EXIT',direction:'BUY',volume:.03,position_id:'dd',net_profit:-21.39},
  {id:'9',created_at:'2026-10-14T12:35:04Z',event_type:'EXIT',direction:'SELL',volume:.06,position_id:'ee',net_profit:-14.63},
  {id:'10',created_at:'2026-10-14T12:35:05Z',event_type:'EXIT',direction:'SELL',volume:.03,position_id:'cc',net_profit:.23}
 ];
 const groups=approximateTradeGroups([...rows].reverse());
 assert.equal(groups.length,3);
 assert.equal(groups[2].entries,3);
 assert.equal(groups[2].grossLots,.12);
 assert.equal(groups[2].netProfit,-35.79);
 assert.equal(groups.reduce((sum,g)=>sum+g.netProfit,0).toFixed(2),'-35.30');
 assert(groups.every(g=>g.complete));
});

test('unmatched exit does not claim complete group',()=>{
 const g=approximateTradeGroups([
  {id:'1',created_at:'2026-10-14T12:00:00Z',event_type:'EXIT',volume:.03,position_id:'old',net_profit:-10},
  {id:'2',created_at:'2026-10-14T12:01:00Z',event_type:'ENTRY',volume:.03,position_id:'new',net_profit:0},
  {id:'3',created_at:'2026-10-14T12:02:00Z',event_type:'EXIT',volume:.03,position_id:'new',net_profit:1}
 ]);
 assert.equal(g.length,1);
 assert.equal(g[0].complete,false);
});

test('new inspection routes enforce JWT, row ownership and include archived accounts',()=>{
 const ctrl=fs.readFileSync('apps/api/src/bot-inspection.controller.ts','utf8');
 const page=fs.readFileSync('apps/web/app/bot-inspection/page.tsx','utf8');
 const nav=fs.readFileSync('apps/web/components/OwnerSidebar.tsx','utf8');
 assert(ctrl.includes('@UseGuards(JwtGuard)'));
 assert(ctrl.includes('FROM users WHERE id=$1'));
 assert(ctrl.includes('($2::boolean OR a.user_id=$3::uuid)'));
 assert(ctrl.includes('($1::boolean OR a.user_id=$2::uuid)'));
 assert(ctrl.includes('role==="OWNER" || role==="ADMIN"'));
 assert(ctrl.includes('archived:String(a.status).toUpperCase()!=="ACTIVE"'));
 assert(ctrl.includes('COUNT')===false || ctrl.includes('event_type'));
 assert(!ctrl.includes('SELECT * FROM bot_commands'));
 assert(!ctrl.includes('c.payload'));
 assert(!ctrl.includes('install_token_hash'));
 assert(page.includes('datetime-local'));
 assert(page.includes('Asia/Bangkok'));
 assert(page.includes('เวลาไทย UTC+7'));
 assert(page.includes('ถอดออก'));
 assert(nav.includes('href:"/bot-inspection"'));
});

test('session P/L is grouped per START and currency, never blended across USD and USC',()=>{
  const sessions=buildBotSessions([
    {id:'a',command:'START',created_at:'2026-10-14T10:00:00Z',status:'ACKED'},
    {id:'b',command:'START',created_at:'2026-10-14T11:00:00Z',status:'ACKED'}
  ]);
  const rows=[
    {id:'1',created_at:'2026-10-14T10:20:00Z',event_type:'EXIT',net_profit:-8,currency:'USD'},
    {id:'2',created_at:'2026-10-14T11:05:00Z',event_type:'ENTRY',net_profit:0,currency:'USC'},
    {id:'3',created_at:'2026-10-14T11:06:00Z',event_type:'EXIT',net_profit:50,currency:'USC'}
  ];
  const result=attachSessionTrades(sessions,rows);
  assert.equal(result[0].pnlByCurrency[0].pnl,-8);
  assert.equal(result[0].pnlByCurrency[0].currency,'USD');
  assert.equal(result[1].pnlByCurrency[0].pnl,50);
  assert.equal(result[1].pnlByCurrency[0].currency,'USC');
  assert.equal(result[1].entries,1);
});

test('inspection flags trade after STOP request, before EA delivery, without claiming Stop Out',()=>{
 const requested='2026-10-14T12:34:40Z',delivered='2026-10-14T12:34:58Z';
 const findings=inspectBotEvents(
   [{id:'s',command:'SAFE_STOP',status:'ACKED',created_at:requested,delivered_at:delivered,acked_at:'2026-10-14T12:35:08Z'}],
   [{id:'entry',event_type:'ENTRY',created_at:'2026-10-14T12:34:46Z',volume:.06,net_profit:0},
    {id:'exit',event_type:'EXIT',created_at:'2026-10-14T12:35:03Z',volume:.03,net_profit:-21.39}]
 );
 assert(findings.some(f=>f.code==='STOP_DELIVERY_DELAY'&&f.detail.includes('18 วินาที')));
 assert(findings.some(f=>f.code==='ENTRY_DURING_STOP_DELIVERY'));
 assert(findings.some(f=>f.code==='CLOSE_REASON_UNAVAILABLE'&&f.level==='INFO'));
 assert(!JSON.stringify(findings).includes('ยืนยันว่า Stop Out'));
});

test('group P/L includes entry-side broker commission and fees',()=>{
  const rows=[
    {id:'entry',created_at:'2026-10-14T12:00:00Z',event_type:'ENTRY',volume:.03,position_id:'p',currency:'USD',net_profit:-.12},
    {id:'exit',created_at:'2026-10-14T12:01:00Z',event_type:'EXIT',volume:.03,position_id:'p',currency:'USD',net_profit:1.00}
  ];
  const groups=approximateTradeGroups(rows);
  assert.equal(groups.length,1);
  assert.equal(groups[0].netProfit,.88);
  assert.equal(groups[0].complete,true);
});

test('inspection uses actual normalized trade time: late-uploaded old entry not flagged after STOP',()=>{
  const stop=[{id:'stop',command:'SAFE_STOP',status:'ACKED',created_at:'2026-10-14T12:34:40Z',delivered_at:'2026-10-14T12:34:58Z'}];
  // created_at is the corrected time projected by the SQL query, not ingestion time.
  const deals=[{id:'old-entry',created_at:'2026-10-14T12:33:00Z',event_type:'ENTRY',net_profit:0}];
  const findings=inspectBotEvents(stop,deals);
  assert(!findings.some(f=>f.code==='ENTRY_DURING_STOP_DELIVERY'));
});
