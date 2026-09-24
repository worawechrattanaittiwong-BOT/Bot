const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");
require("reflect-metadata");
const { CloudPaymentController } = require("../apps/api/dist/cloud.controller");

const controller = new CloudPaymentController({}, {});
const secret = randomBytes(32);
process.env.OMISE_WEBHOOK_SECRET = secret.toString("base64");

const rawBody = Buffer.from(JSON.stringify({
  object: "event",
  key: "charge.complete",
  data: { id: "chrg_test_contract" }
}), "utf8");
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret)
  .update(timestamp + "." + rawBody.toString("utf8"))
  .digest("hex");

assert.doesNotThrow(() => controller.verifyWebhookSignature({
  headers: {
    "omise-signature": signature,
    "omise-signature-timestamp": timestamp
  },
  rawBody
}));

assert.throws(() => controller.verifyWebhookSignature({
  headers: {
    "omise-signature": "0".repeat(64),
    "omise-signature-timestamp": timestamp
  },
  rawBody
}), /Invalid Omise webhook signature/);

const stale = String(Math.floor(Date.now() / 1000) - 3600);
const staleSignature = createHmac("sha256", secret)
  .update(stale + "." + rawBody.toString("utf8"))
  .digest("hex");
assert.throws(() => controller.verifyWebhookSignature({
  headers: {
    "omise-signature": staleSignature,
    "omise-signature-timestamp": stale
  },
  rawBody
}), /Expired Omise webhook signature/);

delete process.env.OMISE_WEBHOOK_SECRET;
assert.doesNotThrow(() => controller.verifyWebhookSignature({
  headers: {},
  rawBody: Buffer.alloc(0)
}));

console.log("PASS: Omise webhook HMAC, replay window, and optional rollout contract.");
