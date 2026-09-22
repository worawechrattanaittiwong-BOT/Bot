export type PerformanceJournalDeal = {
  deal_ticket?: string | number | null;
  position_id?: string | number | null;
  event_type?: string | null;
  direction?: string | null;
  volume?: number | string | null;
  price?: number | string | null;
  net_profit?: number | string | null;
  entry_model?: string | null;
  entry_trigger?: string | null;
  entry_quality_score?: number | string | null;
  confidence?: number | string | null;
  created_at: string;
  metadata?: Record<string, any> | null;
};

export type ReconstructedPosition = {
  positionId: string;
  direction: string;
  controlMode: string;
  symbol: string;
  volume: number;
  entryPrice: number | null;
  exitPrice: number | null;
  net_profit: number;
  openedAt: string;
  closedAt: string;
};

export type ReconstructedBasket = {
  key: string;
  direction: string;
  controlMode: string;
  symbol: string;
  net_profit: number;
  opened_at: string;
  created_at: string;
  metadata: Record<string, any>;
  entry_quality_score: number;
  confidence: number;
  entryCount: number;
  dealCount: number;
  positions: ReconstructedPosition[];
};

const VALID_MODES = ["AUTO","RACE","ZERO_GRID","FLIP_LOCK","MANUAL"];

export function resolveJournalControlMode(row: PerformanceJournalDeal) {
  const fingerprint = (
    String(row.entry_model || "") + " " +
    String(row.entry_trigger || "")
  ).toUpperCase();
  if (fingerprint.includes("RACE")) return "RACE";
  if (fingerprint.includes("FLIP")) return "FLIP_LOCK";
  if (fingerprint.includes("ZERO")) return "ZERO_GRID";
  if (fingerprint.includes("MANUAL")) return "MANUAL";
  const saved = String(row.metadata?.controlMode || "").toUpperCase();
  return VALID_MODES.includes(saved) ? saved : "AUTO";
}

function rowSymbol(row: PerformanceJournalDeal) {
  return String(row.metadata?.symbol || "").trim().toUpperCase() || "UNKNOWN";
}

function positionKey(row: PerformanceJournalDeal) {
  const positionId = String(row.position_id ?? "").trim();
  if (positionId) return positionId;
  return "DEAL-" + String(row.deal_ticket ?? "");
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reconstructCompletedJournal(rows: PerformanceJournalDeal[]) {
  const ordered=[...(rows || [])].sort((a,b) => {
    const dt=new Date(a.created_at).getTime()-new Date(b.created_at).getTime();
    if(dt!==0) return dt;
    return String(a.deal_ticket ?? "").localeCompare(String(b.deal_ticket ?? ""));
  });

  type PositionState = {
    positionId:string;
    direction:string;
    controlMode:string;
    symbol:string;
    openedAt:string;
    closedAt:string;
    openedVolume:number;
    remainingVolume:number;
    entryValue:number;
    entryVolume:number;
    exitPrice:number|null;
    netProfit:number;
  };
  type BasketState = {
    key:string;
    root:string;
    direction:string;
    controlMode:string;
    symbol:string;
    openedAt:string;
    netProfit:number;
    entryCount:number;
    dealCount:number;
    metadata:Record<string,any>;
    entryQuality:number;
    confidence:number;
    positionKeys:Set<string>;
  };

  const activeBaskets=new Map<string,BasketState>();
  const activePositions=new Map<string,PositionState>();
  const positionOwner=new Map<string,string>();
  const closedPositions:ReconstructedPosition[]=[];
  const baskets:ReconstructedBasket[]=[];
  let sequence=0;

  const finishPosition=(key:string,state:PositionState) => {
    const result:ReconstructedPosition={
      positionId:state.positionId,
      direction:state.direction,
      controlMode:state.controlMode,
      symbol:state.symbol,
      volume:Number(state.openedVolume.toFixed(8)),
      entryPrice:state.entryVolume>0 ? Number((state.entryValue/state.entryVolume).toFixed(10)) : null,
      exitPrice:state.exitPrice,
      net_profit:Number(state.netProfit.toFixed(2)),
      openedAt:state.openedAt,
      closedAt:state.closedAt
    };
    closedPositions.push(result);
    activePositions.delete(key);
    positionOwner.delete(key);
  };

  const finishBasket=(root:string,state:BasketState) => {
    const positions=closedPositions.filter((position) =>
      position.controlMode===state.controlMode &&
      position.symbol===state.symbol &&
      new Date(position.openedAt).getTime()>=new Date(state.openedAt).getTime() &&
      new Date(position.closedAt).getTime()<=new Date(state.metadata.__closedAt || position.closedAt).getTime()
    );
    const closedAt=String(state.metadata.__closedAt || state.openedAt);
    const cleanMetadata={...(state.metadata || {})};
    delete cleanMetadata.__closedAt;
    cleanMetadata.controlMode=state.controlMode;
    cleanMetadata.symbol=state.symbol;
    baskets.push({
      key:state.key,
      direction:state.direction,
      controlMode:state.controlMode,
      symbol:state.symbol,
      net_profit:Number(state.netProfit.toFixed(2)),
      opened_at:state.openedAt,
      created_at:closedAt,
      metadata:cleanMetadata,
      entry_quality_score:state.entryQuality,
      confidence:state.confidence,
      entryCount:state.entryCount,
      dealCount:state.dealCount,
      positions
    });
    activeBaskets.delete(root);
  };

  for(const row of ordered){
    const event=String(row.event_type || "").toUpperCase();
    if(event!=="ENTRY" && event!=="EXIT") continue;
    const volume=Math.max(0,numeric(row.volume));
    const net=numeric(row.net_profit);
    const pKey=positionKey(row);

    if(event==="ENTRY"){
      const mode=resolveJournalControlMode(row);
      const symbol=rowSymbol(row);
      const root=symbol+"|"+mode;
      let basket=activeBaskets.get(root);
      if(!basket){
        sequence++;
        basket={
          key:root+"|"+sequence,
          root,
          direction:String(row.direction || "").toUpperCase() || "BUY",
          controlMode:mode,
          symbol,
          openedAt:row.created_at,
          netProfit:0,
          entryCount:0,
          dealCount:0,
          metadata:{...(row.metadata || {})},
          entryQuality:numeric(row.entry_quality_score),
          confidence:numeric(row.confidence),
          positionKeys:new Set<string>()
        };
        activeBaskets.set(root,basket);
      }

      let position=activePositions.get(pKey);
      if(!position){
        position={
          positionId:pKey,
          direction:String(row.direction || "").toUpperCase() || basket.direction,
          controlMode:basket.controlMode,
          symbol:basket.symbol,
          openedAt:row.created_at,
          closedAt:row.created_at,
          openedVolume:0,
          remainingVolume:0,
          entryValue:0,
          entryVolume:0,
          exitPrice:null,
          netProfit:0
        };
        activePositions.set(pKey,position);
      }
      position.openedVolume+=volume;
      position.remainingVolume+=volume;
      if(volume>0 && numeric(row.price)>0){
        position.entryValue+=numeric(row.price)*volume;
        position.entryVolume+=volume;
      }
      position.netProfit+=net;
      positionOwner.set(pKey,root);
      basket.positionKeys.add(pKey);
      basket.netProfit+=net;
      basket.entryCount++;
      basket.dealCount++;
      continue;
    }

    let root=positionOwner.get(pKey) || "";
    let basket=root ? activeBaskets.get(root) : undefined;
    let position=activePositions.get(pKey);

    // If performance history was cleared while a position was already open,
    // preserve the post-reset realized P/L instead of silently dropping it.
    if(!basket || !position){
      const mode=resolveJournalControlMode(row);
      const symbol=rowSymbol(row);
      sequence++;
      root=symbol+"|"+mode+"|ORPHAN|"+sequence;
      basket={
        key:root,
        root,
        direction:String(row.direction || "").toUpperCase() || "BUY",
        controlMode:mode,
        symbol,
        openedAt:row.created_at,
        netProfit:0,
        entryCount:0,
        dealCount:0,
        metadata:{...(row.metadata || {})},
        entryQuality:numeric(row.entry_quality_score),
        confidence:numeric(row.confidence),
        positionKeys:new Set<string>([pKey])
      };
      activeBaskets.set(root,basket);
      position={
        positionId:pKey,
        direction:basket.direction,
        controlMode:basket.controlMode,
        symbol:basket.symbol,
        openedAt:row.created_at,
        closedAt:row.created_at,
        openedVolume:volume,
        remainingVolume:volume,
        entryValue:0,
        entryVolume:0,
        exitPrice:null,
        netProfit:0
      };
      activePositions.set(pKey,position);
      positionOwner.set(pKey,root);
    }

    position.netProfit+=net;
    position.remainingVolume=Math.max(0,position.remainingVolume-volume);
    position.exitPrice=numeric(row.price)>0 ? numeric(row.price) : position.exitPrice;
    position.closedAt=row.created_at;
    basket.netProfit+=net;
    basket.dealCount++;
    basket.metadata.__closedAt=row.created_at;

    if(position.remainingVolume<=0.00000001)
      finishPosition(pKey,position);

    const stillOpen=Array.from(basket.positionKeys).some((key) => activePositions.has(key));
    if(!stillOpen)
      finishBasket(root,basket);
  }

  return {
    baskets:baskets.sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()),
    positions:closedPositions.sort((a,b)=>new Date(a.closedAt).getTime()-new Date(b.closedAt).getTime())
  };
}
