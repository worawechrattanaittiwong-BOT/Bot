# Cloud launch

## What is included

- Owner console: `/admin?view=workers` — VPS registration, one-time per-node key, capacity, pause new sales, real telemetry, monthly package prices, orders and connection guide.
- Customer portal: `/cloud` — 1/3/6/12 calendar-month packages, PromptPay QR, payment status, Cloud slots and renewals. Linked from Dashboard → Access.
- Payments: Opn/Omise. Amount, currency, live/test mode and order metadata are verified by retrieving the charge directly from the provider. Duplicate events cannot extend a subscription twice. Capacity is reserved before QR creation.
- Windows worker: `/downloads/SCENOVA-CloudWorker.ps1`. Recovers assigned work, creates separate MT5 portable directories and restarts exited terminals. EA still receives settings/Start/Safe Stop from the existing API.
- Additive migrations run during API startup. Existing Local installations remain in place.

## Before enabling sales

1. Add a Windows VPS in Cloud Console. Set a conservative capacity based on a real load test, not the advertised vCore count. Save its Worker Key in a secure location; the API stores only its hash.
2. Use a dedicated Windows account. Prepare a clean MT5 portable template at `C:\BotTrading\template` (outside Program Files), with `terminal64.exe` and `MQL5\Experts\FastBasketBot.ex5`. Do not use a template containing a customer's trading account or old EA preset. Enable Algo Trading and allow the API base URL in WebRequest. Close the template terminal after verifying a Demo connection.
3. Download and run `powershell.exe -ExecutionPolicy Bypass -File .\SCENOVA-CloudWorker.ps1 -Install`. Enter Runner ID, HTTPS API base (e.g. `https://snvea-bot.online/backend`) and Worker Key. Confirm the template test only after it passed. Config is protected with Windows DPAPI and directory ACLs. Keep the Windows account logged in; the scheduled task runs at logon, not as a headless boot service. Disconnecting RDP is fine; signing out stops interactive MT5.
4. Check actual Worker telemetry in the console, then enable **รับลูกค้าใหม่** for the node. Validate a Demo MT5 reaches the EA heartbeat stage; a running terminal process alone does not prove the broker login or EA connection succeeded.
5. Set package prices in the Packages tab. No prices are invented, and all packages default to disabled.
6. Configure `OMISE_SECRET_KEY` on the API server. First use a test merchant key with test users; **test payments also activate test subscriptions**, so do not expose test checkout publicly. Register `https://YOUR_DOMAIN/backend/api/payments/omise/webhook` for `charge.create` and `charge.complete`. If API hosting uses another base path, use that base instead.
7. Run one provider sandbox payment and one Demo provisioning cycle. Only then switch to the live key and set `CLOUD_CHECKOUT_ENABLED=true`. The Hostinger compose file forwards both settings. Never put keys in the browser, repository or logs.

Payment provider documentation: [PromptPay](https://docs.omise.co/promptpay), [webhook verification](https://docs.opn.ooo/api-webhooks). MT5 startup options: [MetaQuotes platform start](https://www.metatrader5.com/en/terminal/help/start_advanced/start).

## Customer flow

Choose package → capacity reservation → provider QR → verified payment → active Cloud slot → enter MT5 Login / Server / Trading Password → Worker provisions terminal → EA online → customer presses Start.

Purchasing a package never sends Start. Membership starts on payment confirmation. Renewal extends from the later of now and the current subscription expiry for the selected slot, using calendar months. Each new purchase without a selected slot creates one additional Cloud slot.

## Recovery and limitations

- New orders fail before payment when there is no online, template-ready node accepting new customers. Pausing sales does not stop existing MT5 or prevent fulfilment of paid reservations.
- Payment timeouts stay in REVIEW and keep their reservation. Do not issue a new charge blindly. Find the charge by `metadata.order_id` in the merchant dashboard, then use the charge ID in Console → Connection settings → Reconcile. A pending charge with an ID is automatically rechecked once per minute in batches of 10, even when no customer browser is open.
- Only a provider-confirmed failed/expired charge releases a pending reservation. Expired paid subscriptions continue occupying their seat until the operator retires the account; this deliberately avoids reusing a terminal that may still manage positions. Automatic seat retirement/migration and refund automation are not included.
- Cloud account changes are blocked while a worker is bound. Stop the old terminal and verify positions before an operator reconfigures it. There is no automatic cross-server failover: never run the same trading account on two workers.
- Worker startup files are ACL-protected. The plaintext startup INI is removed after a successful EA heartbeat; MT5 keeps its own account storage. Logs do not include trading passwords or install tokens.
- If the Worker Key is lost, rotate it through the admin key-rotation action and reinstall the Worker on that node.
- Payment provider onboarding/approval, production keys, actual Windows VPS provisioning and broker-specific template testing require the operator's real accounts and machines. This repository does not perform those external steps automatically.
