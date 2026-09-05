import { randomBytes } from "node:crypto";

console.log("JWT_SECRET=" + randomBytes(48).toString("hex"));
console.log("ADMIN_KEY=" + randomBytes(48).toString("hex"));
console.log("WORKER_KEY=" + randomBytes(48).toString("hex"));
console.log("CREDENTIAL_MASTER_KEY=" + randomBytes(32).toString("base64"));
