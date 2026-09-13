import assert from "node:assert/strict";

/**
 * ZERO GRID V1 simulation only.
 * This file never connects to MT5 and never sends broker orders.
 */
export function simulateZeroGrid({
  prices,
  center = prices[0],
  step = 3,
  baseLot = 0.03,
  maxLevels = 30,
  tickSize = 0.01,
  contractSize = 100,
  minRealizedProfit = 0.01,
  commissionPerLotPerSide = 0
}) {
  const positions = [];
  const usedBuy = new Set();
  const usedSell = new Set();
  let runDirection = 0;
  let extreme = center;
  let reversalSeen = false;
  let close = null;

  const openLevel = (side, level, entry) => {
    const lot = baseLot * level;
    positions.push({ side, level, lot, entry });
    const targetSet = side > 0 ? usedBuy : usedSell;
    targetSet.add(level);
    if (runDirection === 0) {
      runDirection = side;
      extreme = entry;
    }
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
    const previous = prices[index - 1];
    const price = prices[index];

    for (let level = 1; level <= maxLevels; level += 1) {
      const buyPrice = center + step * level;
      const sellPrice = center - step * level;
      if (!usedBuy.has(level) && previous < buyPrice && price >= buyPrice) {
        openLevel(1, level, buyPrice);
      }
      if (!usedSell.has(level) && previous > sellPrice && price <= sellPrice) {
        openLevel(-1, level, sellPrice);
      }
    }

    if (positions.length === 0) continue;

    if (runDirection > 0) {
      if (price > extreme) {
        extreme = price;
        reversalSeen = false;
      } else if (price <= extreme - tickSize) {
        reversalSeen = true;
      }
    } else {
      if (price < extreme) {
        extreme = price;
        reversalSeen = false;
      } else if (price >= extreme + tickSize) {
        reversalSeen = true;
      }
    }

    const currentNet = floating(price) - openingCommission();
    const requiredPreCloseNet = minRealizedProfit + estimatedClosingCommission();

    if (reversalSeen && currentNet >= requiredPreCloseNet) {
      close = {
        index,
        price,
        positions: positions.map((p) => ({ ...p })),
        currentNet,
        estimatedClosingCommission: estimatedClosingCommission(),
        estimatedRealizedNet: currentNet - estimatedClosingCommission()
      };
      break;
    }
  }

  return {
    close,
    usedBuy: [...usedBuy],
    usedSell: [...usedSell],
    positions
  };
}

// Straight down opens one-shot SELL levels.
{
  const result = simulateZeroGrid({ prices: [3000, 2997, 2994, 2991] });
  assert.deepEqual(result.usedSell, [1, 2, 3]);
  assert.deepEqual(result.usedBuy, []);
}

// The same price level must not create duplicate orders when revisited.
{
  const result = simulateZeroGrid({ prices: [3000, 3003, 3000, 3003, 3000] });
  assert.deepEqual(result.usedBuy, [1]);
  assert.equal(result.positions.filter((p) => p.side > 0 && p.level === 1).length, 1);
}

// A reversal does not force a losing close; it waits for net-positive eligibility.
{
  const result = simulateZeroGrid({
    prices: [3000, 2997, 2994, 2991, 2991.01, 2992, 2994, 2997, 3000],
    commissionPerLotPerSide: 0.1
  });
  if (result.close) {
    assert.ok(result.close.estimatedRealizedNet >= 0.01 - 1e-9);
  }
}

console.log("ZERO GRID V1 simulation tests passed");
