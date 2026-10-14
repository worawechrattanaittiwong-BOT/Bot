const test=require("node:test");
const assert=require("node:assert/strict");
const {BotInspectionController}=require("../apps/api/dist/bot-inspection.controller.js");
const CUSTOMER="11111111-1111-4111-8111-111111111111";
const OWNER="22222222-2222-4222-8222-222222222222";
const OTHER="33333333-3333-4333-8333-333333333333";
const ACCOUNT="44444444-4444-4444-8444-444444444444";
const NOW=new Date();
const START=new Date(NOW.getTime()-3_600_000).toISOString();
const END=new Date(NOW.getTime()-1_800_000).toISOString();

function setup(role="USER"){
  const sqlCalls=[];
  const data={
    async one(sql,args){
      sqlCalls.push({sql,args});
      if(sql.includes("FROM users WHERE id=$1"))
        return {id:args[0],role,status:"ACTIVE",user_code:"USER001"};
      if(sql.includes("FROM mt5_accounts a JOIN users")){
        if(args[1]===false&&args[2]!==OTHER)return null;
        return {id:ACCOUNT,user_id:OTHER,account_number:"266078974",display_name:"Test",
          broker:"Exness",broker_server:"Exness-MT5Real38",mode:"CLOUD",status:"INACTIVE",created_at:NOW,
          user_code:"USER009",runtime_state:"STOPPED"};
      }
      throw Error("Unexpected query "+sql.slice(0,100));
    },
    async query(sql,args){
      sqlCalls.push({sql,args});
      if(sql.includes("FROM mt5_accounts a")&&sql.includes("JOIN users u")){
        if(args[0]===false)return {rows:[]};
        return {rows:[{id:ACCOUNT,account_number:"266078974",broker:"Exness",
          broker_server:"Exness-MT5Real38",mode:"CLOUD",status:"INACTIVE",user_code:"USER009",
          last_trade_at:null,created_at:NOW,runtime_state:"STOPPED"}]};
      }
      if(sql.includes("GROUP BY 1 ORDER BY 1"))
        return {rows:[{currency:"USD",entries:1,exits:1,pnl:"-35.30"}]};
      if(sql.includes("SELECT * FROM ("))
        return {rows:[
          {id:"ticket-1",source:"TRADE",recorded_at:START,event:"EXIT",status:null,direction:"BUY",
            volume:.03,price:4123, pnl:-35.30,position_id:"777",deal_ticket:"999",symbol:"XAUUSDm",
            currency:"USD",control_mode:"ZERO_GRID",event_at:START,time_source:"MT5",delivered_at:null,acked_at:null},
          {id:"1",source:"COMMAND",recorded_at:END,event:"SAFE_STOP",status:"ACKED",
            direction:null,volume:null,price:null,pnl:null,position_id:null,deal_ticket:null,
            symbol:null,currency:null,control_mode:null,event_at:END,time_source:"SERVER",delivered_at:END,acked_at:END}
        ]};
      if(sql.includes("c.command IN ('START','SAFE_STOP','CLOSE_ALL')"))
        return {rows:[{id:"2",command:"SAFE_STOP",status:"ACKED",created_at:END,delivered_at:END,acked_at:END},
        {id:"1",command:"START",status:"ACKED",created_at:START,delivered_at:START,acked_at:START}]};
      if(sql.includes("j.event_type IN ('ENTRY','EXIT')"))
        return {rows:[
          {id:"2",created_at:END,event_type:"EXIT",direction:"BUY",volume:.03,net_profit:-35.3,position_id:"777"},
          {id:"1",created_at:START,event_type:"ENTRY",direction:"BUY",volume:.03,net_profit:0,position_id:"777"}
        ]};
      throw Error("Unexpected query "+sql.slice(0,150));
    }
  };
  return {controller:new BotInspectionController(data),sqlCalls};
}

test("customer cannot access another user's archived account by UUID",async()=>{
  const {controller,sqlCalls}=setup("USER");
  await assert.rejects(controller.report({user:{sub:CUSTOMER}},ACCOUNT,START,END,"0"),
    e=>e.status===404);
  assert.equal(sqlCalls.filter(c=>c.sql.includes("FROM trade_journal")).length,0);
  assert(sqlCalls.some(c=>c.sql.includes("a.user_id=$3::uuid")&&c.args[1]===false));
});
test("customer account listing is scoped and cannot enumerate other customers",async()=>{
 const {controller,sqlCalls}=setup("USER");
 const res=await controller.accounts({user:{sub:CUSTOMER}});
 assert.equal(res.accounts.length,0);
 assert.equal(res.elevated,false);
 assert(sqlCalls.some(c=>c.sql.includes("a.user_id=$2::uuid")&&c.args[0]===false));
});
test("owner can inspect archived account with safe event fields and summary",async()=>{
 const {controller}=setup("OWNER");
 const accounts=await controller.accounts({user:{sub:OWNER}});
 assert.equal(accounts.accounts.length,1);
 assert.equal(accounts.accounts[0].archived,true);
 const r=await controller.report({user:{sub:OWNER}},ACCOUNT,START,END,"0");
 assert.equal(r.account.archived,true);
 assert.equal(r.summary[0].pnl,-35.3);
 assert.equal(r.sessions.length,1);
 assert.equal(r.sessions[0].endConfirmed,false);
 assert.equal(r.tradeGroups.length,1);
 assert.equal(r.tradeGroups[0].netProfit,-35.3);
 assert.equal(r.events.length,2);
 assert(!JSON.stringify(r).includes("password"));
 assert.equal(r.limitations.closureReasonAvailable,false);
 assert.equal(r.events[0].positionId,"777");
 assert.equal(r.events[0].executedAt,START);
});
test("invalid time window and pagination are rejected before report reads",async()=>{
 const {controller,sqlCalls}=setup("OWNER");
 await assert.rejects(controller.report({user:{sub:OWNER}},ACCOUNT,"2026-01-01T00:00:00Z","2026-10-14T12:00:00Z","0"), e=>e.status===400);
 await assert.rejects(controller.report({user:{sub:OWNER}},ACCOUNT,START,END,"-1"),e=>e.status===400);
 assert.equal(sqlCalls.filter(c=>c.sql.includes("FROM trade_journal")).length,0);
});

test("all trade range filters and timeline sorting use MT5 event time with broker UTC offset",async()=>{
 const {controller,sqlCalls}=setup("OWNER");
 await controller.report({user:{sub:OWNER}},ACCOUNT,START,END,"0");
 const journal=sqlCalls.filter(c=>c.sql.includes("FROM trade_journal j"));
 assert(journal.length>=3);
 assert(journal.every(q=>q.sql.includes("brokerUtcOffsetSeconds")));
 const events=sqlCalls.find(c=>c.sql.includes("SELECT * FROM ("));
 assert(events.sql.includes("ORDER BY event_at DESC"));
 assert(events.sql.includes("AS event_at"));
 const entries=sqlCalls.find(c=>c.sql.includes("LIMIT 1501"));
 assert(entries.sql.includes("AS created_at"));
 assert(entries.sql.includes("brokerUtcOffsetSeconds"));
});

test('server role wins over forged JWT role for cross-account inspection',async()=>{
  const {controller}=setup('USER');
  await assert.rejects(controller.report({user:{sub:CUSTOMER,role:'OWNER'}},ACCOUNT,START,END,'0'), e=>e.status===404);
});
