import fs from "node:fs";

const source = fs.readFileSync("apps/api/src/bot.controller.ts", "utf8");

function requireMatch(pattern, label) {
  if (!pattern.test(source)) {
    throw new Error("BOT START error contract missing: " + label);
  }
}

requireMatch(
  /private mapStartDatabaseConflict\(error: any\)/,
  "dedicated database conflict mapper"
);
requireMatch(
  /code === "55000"[\s\S]*runtime migration is active for this bot instance[\s\S]*new ConflictException/,
  "runtime migration trigger maps to HTTP 409"
);
requireMatch(
  /code === "P0001"[\s\S]*SCENOVA_MAINTENANCE_BLOCKS_START[\s\S]*SCENOVA_MAINTENANCE_BLOCKS_START_COMMAND[\s\S]*new ConflictException/,
  "maintenance trigger race maps to HTTP 409"
);
requireMatch(
  /const mappedConflict = this\.mapStartDatabaseConflict\(error\);[\s\S]*if \(mappedConflict\) throw mappedConflict;[\s\S]*throw error;/,
  "only recognized conflicts are translated and unexpected errors still propagate"
);
requireMatch(
  /event: "BOT_START_FAILED"[\s\S]*errorCode: error\?\.code \|\| null[\s\S]*errorConstraint: error\?\.constraint \|\| null/,
  "Pass 1 failure diagnostics remain intact"
);

console.log("BOT START exact-error mapping contract PASS");
