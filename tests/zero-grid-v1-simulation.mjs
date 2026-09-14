import assert from "node:assert/strict";

/**
 * ZERO GRID stability simulation only.
 * This file never connects to MT5 and never sends broker orders.
 *
 * Contract locked here:
 * - first level may sit close to market (firstOffset is independent from grid step)
 * - pending tickets are staged far/high-lot -> near/low-lot
 * - price still triggers levels naturally near -> far
 * - each level is one-shot per cycle
 * - basket is eligible to close as soon as estimated final net >= minimum
 * - close order is low-lot -> high-lot
 * - ZERO_GRID remains the cycle owner until the cycle is flat/reset
 */

export function buildPendingPlacementPlan({
  center,
  firstOffset = 1,
  step = 3,
  baseLot = 0.03,
  maxLevels = 30
}) {
  const plan = [];
  for (let level = maxLevels; level >= 1; level -= 1) {
    const distance = firstOffset + step * (level - 1);
    const lot = baseLot * level;
    plan.push({ side: 1, level, lot, price: center + distance });
    plan.push({ side: -1, level, lot, price: center - distance });
  }
  return plan;
}

export function buildClosePlan(positions) {
  return positions
    .map((position, sequence) => ({ ...position, sequence }))
    .sort((a, b) =>
      a.lot - b.lot ||
      a.level - b.level ||
      a.sequence - b.sequence
    );
}

export function simulateZeroGrid({
  prices,
  center = prices[0],
  firstOffset = 1,
  step = 3,
  baseLot = 0.03,
  maxLevels = 30,
  contractSize = 100,
  minRealizedProfit = 0.01,
  commissionPerLotPerSide = 0,
  modeRequests = []
}) {
  const positions = [];
  const usedBuy = new Set();
  const usedSell = new Set();
  const placementPlan = buildPendingPlacementPlan({
    center,
    firstOffset,
    step,
    baseLot,
    maxLevels
  });

  // Requested UI mode may change while settings are polled, but the active
  // cycle owner is immutable until the ZERO GRID cycle is flat/reset.
  let requestedMode = "ZERO_GRID";
  let cycleOwner = "ZERO_GRID";
  let close = null;

  const openLevel = (side, level, entry, index) => {
    const lot = baseLot * level;
    positions.push({ side, level, lot, entry, openedAt: index });
    (side > 0 ? usedBuy : usedSell).add(level);
  };

  const floating = (price) => positions.reduce((sum, p) => {
    const move = p.side > 0 ? price - p.entry : p.entry - price;
    return sum + move * p.lot * contractSize;
  }, 0);

  const openingCommission = () => positions.reduce(
    (sum, p) => sum + p.lot * commissionPerLotPerSide,
    0
  );

  const estimatedClosingCommission = openingCommission;

  for (let index = 1; index < prices.length; index += 1) {
    const request = modeRequests.find((item) => item.index === index);
    if (request?.mode) requestedMode = String(request.mode).toUpperCase();

    const previous = prices[index - 1];
    const price = prices[index];

    // Trigger simulation is deliberately near -> far. Placement sequence and
    // trigger sequence are different concepts: MT5/broker triggers by price.
    for (let level = 1; level <= maxLevels; level += 1) {
      const distance = firstOffset + step * (level - 1);
      const buyPrice = center + distance;
      const sellPrice = center - distance;
      if (!usedBuy.has(level) && previous < buyPrice && price >= buyPrice) {
        openLevel(1, level, buyPrice, index);
      }
      if (!usedSell.has(level) && previous > sellPrice && price <= sellPrice) {
        openLevel(-1, level, sellPrice, index);
      }
    }

    if (positions.length === 0) continue;

    // Never hand an active ZERO GRID basket to another engine mid-cycle.
    cycleOwner = "ZERO_GRID";

    const currentNet = floating(price) - openingCommission();
    const requiredPreCloseNet = minRealizedProfit + estimatedClosingCommission();

    // No TP and no mandatory reversal latch: any eligible positive basket may
    // close immediately, matching the agreed ZERO GRID rule.
    if (currentNet >= requiredPreCloseNet) {
      const closePlan = buildClosePlan(positions);
      close = {
        index,
        price,
        requestedMode,
        cycleOwner,
        positions: positions.map((p) => ({ ...p })),
        closePlan,
        currentNet,
        estimatedClosingCommission: estimatedClosingCommission(),
        estimatedRealizedNet: currentNet - estimatedClosingCommission()
      };
      break;
    }
  }

  return {
    close,
    requestedMode,
    cycleOwner,
    placementPlan,
    usedBuy: [...usedBuy],
    usedSell: [...usedSell],
    positions
  };
}

// First level is independent from the $3 inter-level step and can stay close.
{
  const plan = buildPendingPlacementPlan({ center: 3000, firstOffset: 1, maxLevels: 3 });
  const buy1 = plan.find((p) => p.side === 1 && p.level === 1);
  const sell1 = plan.find((p) => p.side === -1 && p.level === 1);
  assert.equal(buy1.price, 3001);
  assert.equal(sell1.price, 2999);
}

// Pending placement is far/high-lot -> near/low-lot.
{
  const plan = buildPendingPlacementPlan({ center: 3000, firstOffset: 1, maxLevels: 3 });
  assert.deepEqual(plan.map((p) => p.level), [3, 3, 2, 2, 1, 1]);
  assert.deepEqual(plan.map((p) => Number(p.lot.toFixed(2))), [0.09, 0.09, 0.06, 0.06, 0.03, 0.03]);
}

// Straight down triggers one-shot SELL levels naturally near -> far.
{
  const result = simulateZeroGrid({
    prices: [3000, 2999, 2996, 2993],
    firstOffset: 1,
    minRealizedProfit: 999999
  });
  assert.deepEqual(result.usedSell, [1, 2, 3]);
  assert.deepEqual(result.usedBuy, []);
}

// The same level must not trigger twice when price revisits it.
{
  const result = simulateZeroGrid({
    prices: [3000, 3001, 3000, 3001, 3000],
    firstOffset: 1,
    minRealizedProfit: 999999
  });
  assert.deepEqual(result.usedBuy, [1]);
  assert.equal(result.positions.filter((p) => p.side > 0 && p.level === 1).length, 1);
}

// UI/settings mode changes must not steal an active ZERO GRID cycle.
{
  const result = simulateZeroGrid({
    prices: [3000, 2999, 2998.5, 2998],
    firstOffset: 1,
    minRealizedProfit: 999999,
    modeRequests: [{ index: 2, mode: "AUTO" }, { index: 3, mode: "RACE" }]
  });
  assert.equal(result.requestedMode, "RACE");
  assert.equal(result.cycleOwner, "ZERO_GRID");
  assert.deepEqual(result.usedSell, [1]);
}

// Any positive eligible basket may close immediately; reversal is not required.
{
  const result = simulateZeroGrid({
    prices: [3000, 3001, 3001.2],
    firstOffset: 1,
    commissionPerLotPerSide: 0
  });
  assert.ok(result.close);
  assert.ok(result.close.estimatedRealizedNet >= 0.01 - 1e-9);
}

// Close order is low-lot -> high-lot, deterministic for equal lots.
{
  const positions = [
    { side: 1, level: 3, lot: 0.09, entry: 3007 },
    { side: 1, level: 1, lot: 0.03, entry: 3001 },
    { side: 1, level: 2, lot: 0.06, entry: 3004 }
  ];
  const closePlan = buildClosePlan(positions);
  assert.deepEqual(closePlan.map((p) => Number(p.lot.toFixed(2))), [0.03, 0.06, 0.09]);
}

console.log("ZERO GRID stability simulation tests passed");
