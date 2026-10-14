type CommandRow={id:string;command:string;status:string;created_at:string|Date;delivered_at?:string|Date|null;acked_at?:string|Date|null};
type TradeRow={id:string;created_at:string|Date;event_type:string;direction?:string|null;volume?:number|null;net_profit?:number|null;position_id?:string|null;currency?:string|null};

const iso=(value:string|Date|null|undefined)=>value?new Date(value).toISOString():null;

export function buildBotSessions(rows:CommandRow[]) {
  const sorted=[...rows].sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  const result:Array<{id:string;startAt:string|null;startStatus:string;stopRequestedAt:string|null;stopDeliveredAt:string|null;stopAcknowledgedAt:string|null;stopStatus:string|null;endConfirmed:boolean}>=[];
  let current:typeof result[number]|null=null;
  for(const c of sorted){
    if(c.command==="START") {
      current={id:c.id,startAt:iso(c.created_at),startStatus:c.status,
        stopRequestedAt:null,stopDeliveredAt:null,stopAcknowledgedAt:null,
        stopStatus:null,endConfirmed:false};
      result.push(current);
    } else if((c.command==="SAFE_STOP"||c.command==="CLOSE_ALL") && current && !current.stopRequestedAt) {
      current.stopRequestedAt=iso(c.created_at);
      current.stopDeliveredAt=iso(c.delivered_at);
      current.stopAcknowledgedAt=iso(c.acked_at);
      current.stopStatus=c.status;
      // ACK means command received, not confirmation that open positions / pending orders are flat.
    }
  }
  return result;
}

export function approximateTradeGroups(rows:TradeRow[]) {
  const sorted=[...rows].sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  const result:Array<{id:string;startedAt:string|null;endedAt:string|null;entries:number;exits:number;grossLots:number;netProfit:number;complete:boolean;currency:string}>=[];
  let current:typeof result[number]|null=null;
  const openPositions=new Map<string,number>();
  let hasUnmatchedExit=false;
  for(const t of sorted){
    const event=String(t.event_type||"").toUpperCase();
    if(event!=="ENTRY"&&event!=="EXIT")continue;
    if(!current){
      current={id:t.id,startedAt:iso(t.created_at),endedAt:null,entries:0,exits:0,grossLots:0,netProfit:0,complete:false,currency:String(t.currency||"UNKNOWN").toUpperCase()};
      openPositions.clear();
      hasUnmatchedExit=false;
    }
    const pos=String(t.position_id||t.id);
    const currency=String(t.currency||"UNKNOWN").toUpperCase();
    if(current.currency!==currency)current.currency="MIXED";
    const volume=Math.max(0,Number(t.volume)||0);
    if(event==="ENTRY"){
      current.entries++;
      current.grossLots+=volume;
      openPositions.set(pos,(openPositions.get(pos)||0)+volume);
    } else{
      current.exits++;
      current.netProfit+=Number(t.net_profit)||0;
      if(openPositions.has(pos)){
        const remainder=(openPositions.get(pos)||0)-volume;
        if(remainder<=0.0000001)openPositions.delete(pos);else openPositions.set(pos,remainder);
      } else {
        // Missing earlier entry: cannot prove the group was flat before this sample.
        hasUnmatchedExit=true;
      }
    }
    if(current.entries>0 && current.exits>0 && openPositions.size===0){
      current.endedAt=iso(t.created_at);
      current.complete=!hasUnmatchedExit;result.push(current);current=null;
    }
  }
  if(current)result.push(current);
  return result.map(g=>({...g,grossLots:Number(g.grossLots.toFixed(4)),netProfit:Number(g.netProfit.toFixed(2))}));
}

// Session financial summary covers only trades visible inside the selected time window.
// START-to-next-START is a grouping boundary, not proof that the EA stopped flat.
export function attachSessionTrades(
  sessions:ReturnType<typeof buildBotSessions>,rows:TradeRow[]
) {
  const ordered=[...sessions].sort((a,b)=>+new Date(a.startAt||0)-+new Date(b.startAt||0));
  const summaries=ordered.map(s=>({
    ...s,entries:0,exits:0,
    pnlByCurrency:[] as Array<{currency:string;pnl:number}>
  }));
  const totals=ordered.map(()=>new Map<string,number>());
  let sessionIndex=-1;
  const trades=[...rows].sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  for(const t of trades){
    const at=+new Date(t.created_at);
    while(sessionIndex+1<ordered.length && at>=+new Date(ordered[sessionIndex+1].startAt||0))sessionIndex++;
    if(sessionIndex<0)continue;
    const s=summaries[sessionIndex];
    if(t.event_type==="ENTRY")s.entries++;
    if(t.event_type==="EXIT")s.exits++;
    const currency=String(t.currency||"UNKNOWN").toUpperCase();
    totals[sessionIndex].set(currency,(totals[sessionIndex].get(currency)||0)+(Number(t.net_profit)||0));
  }
  for(let i=0;i<summaries.length;i++){
    summaries[i].pnlByCurrency=Array.from(totals[i],([currency,pnl])=>({currency,pnl:Number(pnl.toFixed(2))}));
  }
  return summaries;
}

// Deterministic inspection warnings from server-observed timestamps; no AI guesses.
export function inspectBotEvents(commands:CommandRow[],trades:TradeRow[]) {
  const findings:Array<{code:string;title:string;detail:string;observedAt:string|null;level:"WARNING"|"INFO"}>=[];
  const starts=[...commands].filter(c=>c.command==="START").sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  const stops=[...commands].filter(c=>c.command==="SAFE_STOP"||c.command==="CLOSE_ALL")
    .sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  for(const stop of stops){
    const requested=+new Date(stop.created_at);
    const delivered=stop.delivered_at?+new Date(stop.delivered_at):NaN;
    const nextStart=starts.find(c=>+new Date(c.created_at)>requested);
    const nextStartAt=nextStart?+new Date(nextStart.created_at):Infinity;
    if(Number.isFinite(delivered)&&delivered>requested && delivered-requested>=10_000){
      const seconds=Math.round((delivered-requested)/1000);
      findings.push({code:"STOP_DELIVERY_DELAY",title:"คำสั่งหยุดส่งถึง EA ช้า",
        detail:`ใช้ ${seconds} วินาทีตั้งแต่คำขอจนส่งถึง EA`,observedAt:iso(stop.created_at),level:"WARNING"});
    }
    if(Number.isFinite(delivered)&&delivered>requested){
      const entries=trades.filter(t=>t.event_type==="ENTRY" && +new Date(t.created_at)>requested &&
        +new Date(t.created_at)<delivered && +new Date(t.created_at)<nextStartAt);
      if(entries.length){
        findings.push({code:"ENTRY_DURING_STOP_DELIVERY",title:"มีไม้เปิดหลังขอหยุด ก่อนคำสั่งถึง EA",
          detail:`พบ ${entries.length} ไม้ในช่วงคำสั่งหยุดยังส่งไม่ถึง EA`,
          observedAt:iso(entries[0].created_at),level:"WARNING"});
      }
    }
  }
  const severeLoss=trades.filter(t=>t.event_type==="EXIT" && (Number(t.net_profit)||0)<0);
  if(severeLoss.length){
    findings.push({code:"CLOSE_REASON_UNAVAILABLE",title:"เหตุผลปิดขาดทุนยังตรวจไม่ครบ",
      detail:"Trade Journal ยังไม่มี MT5 DEAL_REASON จึงไม่สามารถยืนยัน Stop Out/ปิดมือ/EA ได้",
      observedAt:iso(severeLoss[severeLoss.length-1].created_at),level:"INFO"});
  }
  return findings.slice(-12);
}
