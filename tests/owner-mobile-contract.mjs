import fs from "node:fs";

const api = fs.readFileSync("apps/api/src/owner-mobile.controller.ts", "utf8");
const app = fs.readFileSync("mobile/owner-app/App.tsx", "utf8");

const requiredApi = [
  'Controller("owner-mobile")',
  'audience: "owner-mobile"',
  'MAX_PIN_ATTEMPTS = 5',
  'OWNER_CASH_BUFFER_SATANG',
  'idemp_key',
  'commissionLiability',
  'OMISE_SECRET_KEY'
];
for (const token of requiredApi) {
  if (!api.includes(token)) throw new Error("Owner Mobile API contract missing: " + token);
}

if (app.includes("OMISE_SECRET_KEY") || app.includes("skey_live_") || app.includes("skey_test_")) {
  throw new Error("Mobile app must never contain Omise secret keys");
}
for (const token of ["expo-secure-store", "SCENOVA OWNER", "/owner-mobile/unlock", "/owner-mobile/owner-transfers"]) {
  if (!app.includes(token)) throw new Error("Owner Mobile app contract missing: " + token);
}

console.log("Owner Mobile security contract: PASS");
