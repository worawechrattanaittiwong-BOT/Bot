import fs from "node:fs";

const api = fs.readFileSync("apps/api/src/bot.controller.ts", "utf8");
const web = fs.readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
const ea = fs.readFileSync("mt5/FastBasketBot.mq5", "utf8");

function need(text, value, label) {
  if (!text.includes(value)) throw new Error(`missing ${label}: ${value}`);
}
function forbid(text, value, label) {
  if (text.includes(value)) throw new Error(`obsolete ${label}: ${value}`);
}

need(api, 'numberSetting("zeroGridLevelsPerSide", 1, 30, true);', "API ZERO level range");
forbid(api, 'numberSetting("zeroGridLevelsPerSide", 3, 3, true);', "API fixed-three range");
forbid(api, 'clean.zeroGridLevelsPerSide = 3;', "API forced-three override");

need(web, 'Array.from({length:30},(_,i)=>i+1)', "web 1..30 selector");
need(web, 'เลือกได้ 1–30 BUY STOP และ 1–30 SELL STOP', "web range explanation");
forbid(web, '3 BUY STOP + 3 SELL STOP', "web fixed-three label");
forbid(web, '<dd>3 BUY + 3 SELL</dd>', "web fixed-three summary");

need(ea, '#define ZERO_GRID_MAX_LEVELS 30', "EA upper bound");
need(ea, '#define ZERO_GRID_DEFAULT_LEVELS 3', "EA compatibility default");
need(ea, 'JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide)', "EA server-setting input");
need(ea, 'g_zeroGridCycleLevelsPerSide>0 ? g_zeroGridCycleLevelsPerSide : g_zeroGridLevelsPerSide', "EA cycle geometry lock");
forbid(ea, 'return ZERO_GRID_MAX_LEVELS;', "EA hardcoded effective levels");

// Explicit isolation sentinels: this feature must not replace AUTO/RACE engines.
need(ea, 'bool AutoV20Enabled()', "AUTO V20 engine");
need(ea, 'int RaceM5CandleDirection()', "RACE engine");
need(ea, 'bool ZeroGridModeEnabled()', "ZERO isolated engine");

console.log("ZERO GRID configurable levels 1..30 contract: PASS");
