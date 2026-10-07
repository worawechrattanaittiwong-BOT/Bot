type ZeroGridCycleRow = {
  direction?: string | null;
  net_profit?: number | string | null;
  opened_at?: string | null;
  created_at?: string | null;
};

function num(value: unknown) {
  const parsed=Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ZERO GRID Performance treats a completed reconstructed Basket as one bot
// cycle. This helper only replaces metrics that are cycle-scoped in the owner
// Performance report. Position execution, lot, payoff and duration analytics
// remain position-scoped and are intentionally not overwritten here.
export function buildZeroGridCyclePresentation(
  rows: ZeroGridCycleRow[],
  startBalance: number | null
) {
  const cycles=[...(rows || [])].sort(
    (a,b)=>new Date(String(a.created_at || 0)).getTime()-new Date(String(b.created_at || 0)).getTime()
  );
  const profits=cycles.map((row)=>num(row.net_profit));
  const longs=cycles.filter((row)=>String(row.direction || "").toUpperCase()==="BUY");
  const shorts=cycles.filter((row)=>String(row.direction || "").toUpperCase()==="SELL");

  let maxWinStreak=0,maxLossStreak=0,currentWin=0,currentLoss=0;
  let maxWinStreakProfit=0,maxLossStreakLoss=0,currentWinProfit=0,currentLossProfit=0;
  let winRuns=0,lossRuns=0,totalWins=0,totalLosses=0;
  for(const profit of profits){
    if(profit>0){
      if(currentWin===0) winRuns++;
      currentWin++;totalWins++;currentWinProfit+=profit;
      currentLoss=0;currentLossProfit=0;
      if(currentWin>maxWinStreak){maxWinStreak=currentWin;maxWinStreakProfit=currentWinProfit;}
      else if(currentWin===maxWinStreak) maxWinStreakProfit=Math.max(maxWinStreakProfit,currentWinProfit);
    }else if(profit<0){
      if(currentLoss===0) lossRuns++;
      currentLoss++;totalLosses++;currentLossProfit+=profit;
      currentWin=0;currentWinProfit=0;
      if(currentLoss>maxLossStreak){maxLossStreak=currentLoss;maxLossStreakLoss=currentLossProfit;}
      else if(currentLoss===maxLossStreak) maxLossStreakLoss=Math.min(maxLossStreakLoss,currentLossProfit);
    }else{
      currentWin=0;currentLoss=0;currentWinProfit=0;currentLossProfit=0;
    }
  }

  let running=startBalance ?? 0;
  const curve:any[]=[];
  if(startBalance!==null){
    curve.push({
      time:cycles[0]?.opened_at || cycles[0]?.created_at || new Date().toISOString(),
      tradeNumber:0,
      balance:Number(running.toFixed(2)),
      equity:Number(running.toFixed(2)),
      drawdownPercent:0
    });
  }
  cycles.forEach((cycle,index)=>{
    running+=num(cycle.net_profit);
    curve.push({
      time:String(cycle.created_at || ""),
      tradeNumber:index+1,
      balance:Number(running.toFixed(2)),
      equity:Number(running.toFixed(2)),
      drawdownPercent:0
    });
  });

  return {
    curve,
    summary:{
      cycleCount:cycles.length,
      buyTrades:longs.length,
      sellTrades:shorts.length,
      buyWinRate:longs.length ? Number((longs.filter((row)=>num(row.net_profit)>0).length/longs.length*100).toFixed(2)) : 0,
      sellWinRate:shorts.length ? Number((shorts.filter((row)=>num(row.net_profit)>0).length/shorts.length*100).toFixed(2)) : 0,
      maxWinStreak,
      maxLossStreak,
      maxWinStreakProfit:Number(maxWinStreakProfit.toFixed(2)),
      maxLossStreakLoss:Number(maxLossStreakLoss.toFixed(2)),
      averageWinStreak:winRuns ? Number((totalWins/winRuns).toFixed(2)) : 0,
      averageLossStreak:lossRuns ? Number((totalLosses/lossRuns).toFixed(2)) : 0
    }
  };
}
