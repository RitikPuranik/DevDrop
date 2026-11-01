# WhatsApp admin notifications

Meta WhatsApp Business Cloud API alerts to **one** configured admin number. Reuses the existing BullMQ `events-queue`, MongoDB outbox (`enqueueJob({ durable: true })`) and worker.

## Flow
```
billing.finalizePaidOrder / payment.finalizePurchaseFromPayment / buyer free claim
  -> events.notifySubscriptionPaid | notifyWebsitePurchased      (never throws, ids only)
  -> WhatsAppNotification (unique eventKey = idempotency) + durable events-queue job
  -> worker: notificationProcessor (re-verifies state, atomic claim, send)
  -> whatsappCloud.service -> Graph API
Admin: /api/admin/whatsapp/* (auth + adminOnly) -> report preview/send, history, retry, settings, test
```
Job types: `SUBSCRIPTION_PURCHASED`, `SUBSCRIPTION_RENEWED`, `WEBSITE_PURCHASED`, `ADMIN_REPORT`, `WHATSAPP_TEST`.

## Triggers (authoritative states)
- Subscription: `BillingOrder.status === 'paid'` and `appliedAt` set (kind `renewal` -> separate event type). Key `sub-paid-<orderId>`.
- Website: `Purchase.paymentStatus === 'completed'`. Key `web-purchase-<purchaseId>`. Free-template claims are skipped unless `WHATSAPP_NOTIFY_FREE_CLAIMS=true`.

## Delivery guarantees
`pending -> sending -> sent | failed | unconfirmed | skipped`. A `sent` record is never re-sent. Exactly-once is impossible against the API (no idempotency key); an *ambiguous* outcome (timeout/reset after the request left) is retried at most `WHATSAPP_MAX_AMBIGUOUS_RETRIES` times (default 1), then parked as `unconfirmed` for a manual retry. Definite failures retry with exponential backoff up to `WHATSAPP_JOB_ATTEMPTS` (default 4).

## Switches
`WHATSAPP_NOTIFICATIONS_ENABLED` (env master switch, default false) AND the admin toggle AND the category toggle. Tests need only the master switch + credentials.

## Meta test-number notes
- Add your number as a verified recipient in the Meta console.
- Plain text only delivers inside the 24h customer-service window: message the business number from your phone first (otherwise error 131047 is reported in history).
- The console's temporary token expires in ~24h; use a System User token.
- Set the same `WHATSAPP_*` variables in `backend/.env` and `worker/.env`.
