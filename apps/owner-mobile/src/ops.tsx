import React, { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { type OwnerApi } from "./management";
import { layout as s, useTheme } from "./theme";
import { Badge, Button, Copy, DetailRow, Empty, Field, Icon, IconTile, Notice, Page, PinField, Surface } from "./ui";

type OverviewData = {
  customers: { total_customers: number; active_customers: number };
  bots: { total: number; running: number; online: number; safe_stop: number };
  cloud: { nodes: number; online_nodes: number; capacity: number; active_instances: number; blocked: number };
  incidents: { open: number };
  maintenance: { status: string; title?: string | null; message?: string | null };
};

type TradingItem = {
  instance_id: string;
  slot_id: string;
  mode: string;
  slot_number: number;
  user_id: string;
  user_code: string;
  email: string;
  account_number?: string | null;
  broker_server?: string | null;
  actual_state: string;
  desired_state: string;
  last_seen_at?: string | null;
  runner_id?: string | null;
  symbol?: string | null;
  positions: number;
  pending_orders: number;
  ea_version?: string | null;
};

function msg(error: unknown) {
  return error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ";
}

function stateTone(value: string): "success" | "warning" | "danger" | "neutral" {
  const state=String(value||"").toUpperCase();
  if (state==="RUNNING") return "success";
  if (state==="SAFE_STOP") return "warning";
  if (state==="OFFLINE" || state==="ERROR") return "danger";
  return "neutral";
}

function incidentLabel(value:string) {
  const type=String(value||"").toUpperCase();
  if(type==="WORKER_OFFLINE") return "VPS ออฟไลน์";
  if(type==="WORKER_CAPACITY") return "ทรัพยากร VPS";
  if(type==="EA_HEARTBEAT_STALE") return "EA ไม่ตอบสนอง";
  if(type==="RECOVERY_CIRCUIT_OPEN") return "Recovery หยุด";
  return value||"เหตุการณ์ระบบ";
}

function Stat({ label, value, note, tone="accent" }: { label:string; value:string|number; note:string; tone?:"accent"|"success"|"warning"|"blue" }) {
  const { colors:c }=useTheme();
  return <Surface style={{ flex:1, minWidth:145, gap:8 }}>
    <View style={s.row}><IconTile name={tone==="warning"?"alert":tone==="blue"?"list":"shield"} tone={tone} size={34}/><Copy style={[s.small,{color:c.muted,flex:1}]}>{label}</Copy></View>
    <Copy style={[s.number,{fontSize:28}]}>{value}</Copy>
    <Copy style={[s.small,{color:c.subtle}]}>{note}</Copy>
  </Surface>;
}

export function OverviewScreen({ api }: { api:OwnerApi }) {
  const { colors:c }=useTheme();
  const [data,setData]=useState<OverviewData|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function load() {
    setLoading(true);
    try { setData(await api("/owner-mobile/overview")); setError(""); }
    catch(e){ setError(msg(e)); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ void load(); },[]);

  const maintenance=String(data?.maintenance?.status||"OFF").toUpperCase();
  return <Page title="ภาพรวม" subtitle="สิ่งสำคัญที่ต้องรู้ตอนนี้" refreshing={loading} onRefresh={()=>void load()}>
    {!!error&&<Notice text={error} danger onRetry={()=>void load()}/>}
    {!data&&!loading?<Empty title="ยังไม่มีข้อมูล" caption="ดึงลงเพื่อโหลดใหม่" icon="home"/>:data&&<>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>
        <Stat label="ลูกค้า Active" value={data.customers.active_customers} note={"ทั้งหมด "+data.customers.total_customers} tone="blue"/>
        <Stat label="บอทกำลังทำงาน" value={data.bots.running} note={"Online "+data.bots.online} tone="success"/>
        <Stat label="ปัญหาที่ต้องดู" value={data.incidents.open} note={data.incidents.open?"มีรายการต้องตรวจสอบ":"ระบบปกติ"} tone={data.incidents.open?"warning":"success"}/>
        <Stat label="Cloud Slots" value={data.cloud.active_instances+"/"+data.cloud.capacity} note={data.cloud.online_nodes+"/"+data.cloud.nodes+" VPS Online"} tone="accent"/>
      </View>
      <Surface>
        <View style={s.between}>
          <View style={s.row}><IconTile name="shield" tone={maintenance==="OFF"?"success":"warning"}/><View><Copy style={s.heading}>สถานะระบบ</Copy><Copy style={[s.small,{color:c.muted}]}>Cloud / Maintenance</Copy></View></View>
          <Badge text={maintenance==="OFF"?"ปกติ":maintenance} tone={maintenance==="OFF"?"success":"warning"}/>
        </View>
        <DetailRow label="VPS ถูกพัก" value={String(data.cloud.blocked)}/>
        <DetailRow label="SAFE STOP" value={String(data.bots.safe_stop)} last/>
      </Surface>
    </>}
  </Page>;
}

export function TradingScreen({ api }: { api:OwnerApi }) {
  const { colors:c }=useTheme();
  const [q,setQ]=useState("");
  const [items,setItems]=useState<TradingItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function load() {
    setLoading(true);
    try {
      const result=await api("/owner-mobile/trading?q="+encodeURIComponent(q.trim()));
      setItems(Array.isArray(result?.items)?result.items:[]);
      setError("");
    } catch(e){ setError(msg(e)); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ void load(); },[]);

  return <Page title="Trading" subtitle="สถานะ MT5 และบอทของลูกค้า" refreshing={loading} onRefresh={()=>void load()}>
    <Surface style={s.stack}>
      <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="User ID / Email / MT5"/>
      <Button label="ค้นหา" icon="search" variant="secondary" onPress={()=>void load()}/>
    </Surface>
    {!!error&&<Notice text={error} danger onRetry={()=>void load()}/>}
    {!items.length&&!loading?<Empty title="ไม่พบรายการ" caption="ยังไม่มีบัญชีที่ตรงกับการค้นหา" icon="list"/>:
      items.map(item=><Surface key={item.instance_id} style={{gap:10}}>
        <View style={s.between}>
          <View style={[s.row,s.grow]}><IconTile name="list" tone={item.mode==="CLOUD"?"accent":"blue"} size={36}/><View style={s.grow}><Copy style={s.heading}>{item.user_code}</Copy><Copy numberOfLines={1} style={[s.small,{color:c.muted}]}>{item.account_number||"ยังไม่เชื่อม MT5"} · {item.mode}</Copy></View></View>
          <Badge text={item.actual_state||"UNKNOWN"} tone={stateTone(item.actual_state)}/>
        </View>
        <View style={s.between}><Copy style={[s.small,{color:c.muted}]}>Symbol</Copy><Copy style={s.label}>{item.symbol||"—"}</Copy></View>
        <View style={s.between}><Copy style={[s.small,{color:c.muted}]}>Position / Pending</Copy><Copy style={s.label}>{Number(item.positions||0)} / {Number(item.pending_orders||0)}</Copy></View>
        <View style={s.between}><Copy style={[s.small,{color:c.muted}]}>EA</Copy><Copy style={[s.small,{color:c.muted}]}>{item.ea_version||"—"}</Copy></View>
      </Surface>)
    }
  </Page>;
}

type SystemData = {
  protection: {
    controls?: { cloud_provisioning_paused?: boolean; cloud_recovery_paused?: boolean; updated_at?: string | null };
    nodes: Array<{ runner_id:string; region?:string; capacity:number; active_instances:number; occupied?:number; last_seen_at?:string|null; health_state?:string; capacity_blocked?:boolean; quarantined?:boolean; telemetry?:{ version?:string; cpuPercent?:number; ramUsedGb?:number; ramTotalGb?:number; diskFreeGb?:number } }>;
    incidents: Array<{ id:string; state:string; severity:string; category:string; runner_id?:string|null; last_seen_at?:string|null }>;
    recoveries: Array<{ id:string; cloud_recovery_state:string }>;
  };
  maintenance: { status:string; blockStarts?:boolean; summary?:any };
};

export function SystemScreen({ api, onBack }: { api:OwnerApi; onBack:()=>void }) {
  const { colors:c }=useTheme();
  const [data,setData]=useState<SystemData|null>(null);
  const [loading,setLoading]=useState(false);
  const [pin,setPin]=useState("");
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");

  async function load() {
    setLoading(true);
    try { setData(await api("/owner-mobile/system")); setError(""); }
    catch(e){ setError(msg(e)); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ void load(); },[]);

  function protection(paused:boolean) {
    if(pin.length!==6) return;
    Alert.alert(
      paused?"พัก Cloud":"เปิด Cloud",
      paused?"หยุดรับลูกค้าใหม่และหยุด Recovery ชั่วคราว?":"เปิดรับลูกค้าใหม่และเปิด Recovery กลับ?",
      [
        {text:"ยกเลิก",style:"cancel"},
        {text:paused?"พัก Cloud":"เปิด Cloud",style:paused?"destructive":"default",onPress:()=>void (async()=>{
          setLoading(true);
          try {
            await api("/owner-mobile/system/protection-controls",{
              method:"POST",
              body:JSON.stringify({ cloudProvisioningPaused:paused, cloudRecoveryPaused:paused, reason, pin })
            });
            setPin(""); setReason(""); await load();
          } catch(e){ Alert.alert("ทำรายการไม่สำเร็จ",msg(e)); setLoading(false); }
        })()}
      ]
    );
  }

  function maintenanceAction(resume:boolean) {
    if(pin.length!==6) return;
    Alert.alert(
      resume?"เปิดระบบกลับ":"ปิดระบบฉุกเฉิน",
      resume?"ยืนยันเปิดระบบให้ลูกค้าใช้งานอีกครั้ง?":"ระบบจะบล็อก Start และเข้าสู่ขั้นตอนปิดการทำงานตามกติกา Maintenance",
      [
        {text:"ยกเลิก",style:"cancel"},
        {text:resume?"เปิดระบบ":"ปิดระบบ",style:resume?"default":"destructive",onPress:()=>void (async()=>{
          setLoading(true);
          try {
            await api(resume?"/owner-mobile/system/maintenance/resume":"/owner-mobile/system/maintenance/shutdown",{
              method:"POST", body:JSON.stringify({ pin, message:reason })
            });
            setPin(""); setReason(""); await load();
          } catch(e){ Alert.alert("ทำรายการไม่สำเร็จ",msg(e)); setLoading(false); }
        })()}
      ]
    );
  }

  function quarantine(node:SystemData["protection"]["nodes"][number]) {
    if(pin.length!==6) return;
    const next=!node.quarantined;
    Alert.alert(
      next?"พัก VPS":"เปิด VPS กลับ",
      next?"หยุดส่งงานใหม่และ Recovery ไปที่ "+node.runner_id+"?":"ยกเลิกการพัก "+node.runner_id+"?",
      [
        {text:"ยกเลิก",style:"cancel"},
        {text:next?"พักเครื่อง":"เปิดใช้งาน",style:next?"destructive":"default",onPress:()=>void (async()=>{
          setLoading(true);
          try {
            await api("/owner-mobile/system/nodes/"+encodeURIComponent(node.runner_id)+"/quarantine",{
              method:"POST", body:JSON.stringify({ quarantined:next, reason, pin })
            });
            setPin(""); await load();
          } catch(e){ Alert.alert("ทำรายการไม่สำเร็จ",msg(e)); setLoading(false); }
        })()}
      ]
    );
  }

  const openIncidents=data?.protection?.incidents?.filter(x=>x.state==="OPEN")||[];
  const recoveryOpen=data?.protection?.recoveries?.filter(x=>x.cloud_recovery_state==="CIRCUIT_OPEN")||[];
  const maintenance=String(data?.maintenance?.status||"OFF").toUpperCase();

  return <Page title="ระบบ Cloud" subtitle="สถานะสำคัญและการควบคุมฉุกเฉิน" onBack={onBack} refreshing={loading} onRefresh={()=>void load()}>
    {!!error&&<Notice text={error} danger onRetry={()=>void load()}/>}
    {data&&<>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>
        <Stat label="ปัญหา" value={openIncidents.length} note="ที่ต้องตรวจสอบ" tone={openIncidents.length?"warning":"success"}/>
        <Stat label="Recovery" value={recoveryOpen.length} note="ที่หยุดชั่วคราว" tone={recoveryOpen.length?"warning":"success"}/>
      </View>

      {openIncidents.length>0&&<Surface style={s.stack}>
        <Copy style={s.heading}>รายการที่ต้องดู</Copy>
        {openIncidents.slice(0,5).map((item,index)=><DetailRow
          key={item.id}
          label={String(item.severity||"").toUpperCase()==="CRITICAL"?"วิกฤต":"เตือน"}
          value={incidentLabel(item.category)+(item.runner_id?" · "+item.runner_id:"")}
          last={index===Math.min(openIncidents.length,5)-1}
        />)}
      </Surface>}

      <Surface style={s.stack}>
        <View style={s.between}><Copy style={s.heading}>Cloud Protection</Copy><Badge text={data.protection.controls?.cloud_provisioning_paused?"พักอยู่":"เปิด"} tone={data.protection.controls?.cloud_provisioning_paused?"warning":"success"}/></View>
        <Field label="หมายเหตุ" value={reason} onChangeText={setReason} placeholder="ระบุเหตุผลเมื่อมีการพักระบบ"/>
        <PinField value={pin} onChange={setPin}/>
        <View style={{flexDirection:"row",gap:8}}>
          <View style={s.grow}><Button label="พัก Cloud" icon="alert" variant="danger" disabled={pin.length!==6} onPress={()=>void protection(true)}/></View>
          <View style={s.grow}><Button label="เปิด Cloud" icon="check" variant="secondary" disabled={pin.length!==6} onPress={()=>void protection(false)}/></View>
        </View>
      </Surface>

      <Surface style={s.stack}>
        <View style={s.between}><Copy style={s.heading}>Maintenance</Copy><Badge text={maintenance==="OFF"?"ปกติ":maintenance} tone={maintenance==="OFF"?"success":"warning"}/></View>
        {maintenance==="OFF"
          ? <Button label="ปิดระบบฉุกเฉิน" icon="alert" variant="danger" disabled={pin.length!==6} onPress={()=>maintenanceAction(false)}/>
          : <Button label="เปิดระบบกลับ" icon="check" disabled={pin.length!==6} onPress={()=>maintenanceAction(true)}/>}
      </Surface>

      <Copy style={[s.heading,{marginTop:2}]}>VPS</Copy>
      {data.protection.nodes.map(node=>{
        const online=Boolean(node.last_seen_at&&Date.now()-new Date(node.last_seen_at).getTime()<=30000);
        const used=Math.max(Number(node.occupied||0),Number(node.active_instances||0));
        return <Surface key={node.runner_id} style={s.stack}>
          <View style={s.between}>
            <View><Copy style={s.heading}>{node.runner_id}</Copy><Copy style={[s.small,{color:c.muted}]}>{node.region||"—"} · {used}/{node.capacity}</Copy></View>
            <Badge text={node.quarantined?"พักเครื่อง":online?"Online":"Offline"} tone={node.quarantined?"warning":online?"success":"danger"}/>
          </View>
          <DetailRow label="Worker" value={node.telemetry?.version||"—"}/>
          <DetailRow label="CPU" value={node.telemetry?.cpuPercent==null?"—":node.telemetry.cpuPercent+"%"}/>
          <DetailRow label="RAM" value={node.telemetry?.ramUsedGb==null?"—":node.telemetry.ramUsedGb+"/"+(node.telemetry?.ramTotalGb??"—")+" GB"}/>
          <DetailRow label="Disk ว่าง" value={node.telemetry?.diskFreeGb==null?"—":node.telemetry.diskFreeGb+" GB"} last/>
          <Button label={node.quarantined?"เปิดเครื่องกลับ":"พักเครื่อง"} icon={node.quarantined?"check":"alert"} variant={node.quarantined?"secondary":"danger"} disabled={pin.length!==6} onPress={()=>void quarantine(node)}/>
        </Surface>;
      })}
    </>}
  </Page>;
}

export function MoreScreen({
  onSystem,onPackages,onPromotions,onSettings
}:{
  onSystem:()=>void;
  onPackages:()=>void;
  onPromotions:()=>void;
  onSettings:()=>void;
}) {
  const { colors:c }=useTheme();
  const entries=[
    {title:"ระบบ Cloud",caption:"VPS, Protection และ Maintenance",icon:"shield" as const,onPress:onSystem},
    {title:"แพ็กเกจ",caption:"ราคาและเปิด/ปิดการขาย",icon:"list" as const,onPress:onPackages},
    {title:"โปรโมชั่น",caption:"สร้างและจัดการรหัสส่วนลด",icon:"percent" as const,onPress:onPromotions},
    {title:"ตั้งค่าแอป",caption:"ธีม เวอร์ชัน อัปเดต และความปลอดภัย",icon:"settings" as const,onPress:onSettings}
  ];
  return <Page title="เพิ่มเติม" subtitle="เครื่องมือจัดการที่ไม่ได้ใช้ทุกวัน">
    {entries.map(item=><Pressable key={item.title} accessibilityRole="button" onPress={item.onPress} style={({pressed})=>({opacity:pressed ? .7 : 1})}>
      <Surface>
        <View style={s.between}>
          <View style={[s.row,s.grow]}><IconTile name={item.icon}/><View style={s.grow}><Copy style={s.heading}>{item.title}</Copy><Copy style={[s.small,{color:c.muted}]}>{item.caption}</Copy></View></View>
          <Icon name="chevron" color={c.subtle} size={18}/>
        </View>
      </Surface>
    </Pressable>)}
  </Page>;
}
