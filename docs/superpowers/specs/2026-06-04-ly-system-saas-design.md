# LY-SYSTEM SaaS — Design Spec

**Date:** 2026-06-04
**Status:** Approved design → ready for implementation planning
**Topic:** Turn the single-guild LY-SYSTEM bot+dashboard into a subscription SaaS that sells a **custom bot per customer** (the ProBot/MEE6 "custom bot" model), run as a **fleet of Discord clients inside one Node process**.

---

## 1. Goal

A Saudi-market Discord community owner subscribes, gets a bot **with their own name and avatar** running in their server, with **all** LY-SYSTEM features, managed from a central Arabic dashboard. The owner (you) runs the whole fleet from one Railway service.

The customer's defining wins:
- The bot carries **their** identity (name + avatar), changeable any time from the dashboard.
- It is genuinely **their** Discord application (they own the app + token).
- Same feature set as LY-SYSTEM today, plus ongoing updates (one `push` updates every customer).

## 2. Locked product decisions

| Decision | Choice |
|----------|--------|
| Product model | Custom bot per customer (customer owns the Discord app/token) |
| Runtime architecture | **Fleet-in-one-service**: one process, `Map<guildId, Client>` |
| Onboarding | Self-serve Arabic wizard (customer creates the Discord app) |
| Payment | Manual first (bank transfer + receipt) behind a `PaymentProvider` interface; Moyasar/gateway later |
| Plan | Single plan, all features |
| Price | **39 SAR/month**, annual = 12 months for the price of 10 |
| Trial | **7-day free trial** (provision client immediately, stop if unpaid) |
| Grace period | **3 days** past expiry, bot keeps running with a renewal banner, then stops |
| Target scale (year 1) | 10–50 customers |

## 3. Why fleet-in-one-service (and what it dissolves)

The earlier "separate Railway service per customer" idea was rejected after an adversarial review surfaced 39 findings. Fleet-in-one-service **dissolves ~15 of them**, including most criticals, because they were caused by service multiplication itself:

**Dissolved by this architecture:** Postgres connection-pool exhaustion (one pool now), `prisma db push` concurrency race (one pusher), Railway 10-concurrent-build cap, 50× redundant builds, zombie/dead-service cost, Railway provisioning API + partial-failure handling, Docker image pipeline, per-service `SESSION_SECRET` divergence, collecting the customer's `client_secret`, the manual OAuth-redirect-URI step, and the trivially-bypassable in-code expiry (we now run the token-bearing code, so the customer cannot bypass it).

**New trade-off accepted:** weaker fault isolation — one process crash drops all bots for the seconds it takes to restart. Acceptable at 10–50 customers; mitigated by strict per-client error isolation (§6.2) so a single bad token never crashes the shared process.

## 4. Architecture

```
┌──────────── One Railway service (the "crown jewel") ────────────┐
│                                                                  │
│  TenantRegistry : Map<guildId, TenantRuntime>                    │
│    each TenantRuntime = { client: Client, guildId, botClientId } │
│    ├─ tenant #0 → owner's LY bot (lifetime subscription)         │
│    ├─ tenant   → customer Ahmad's bot (his token)                │
│    └─ ...                                                         │
│                                                                  │
│  Token Vault   : AES-256-GCM encrypted tokens in Postgres        │
│  Scheduler     : one timer, loops over ACTIVE tenants            │
│  Express API   : ONE central dashboard for all customers         │
│  Subscription  : gate that spawns / stops clients on state       │
│                                                                  │
│  PostgreSQL (shared, guildId-keyed)  +  Lavalink (existing VPS)  │
└──────────────────────────────────────────────────────────────────┘
```

**Trust boundary:** only this one service holds `DATABASE_URL`, the encryption master key, and all customer tokens. Customers never receive any infrastructure credential. This is a single, normal SaaS trust boundary — far smaller blast radius than 50 copies of `DATABASE_URL`.

**Dashboard auth model flips to standard multi-tenant SaaS:** one dashboard URL, customer logs in via **our** central Discord OAuth app (not theirs), we discover which tenant guilds they're staff in, they pick a server, and the session carries the selected `guildId`.

## 5. Data model (additive Prisma models)

All additive — never rename/drop columns (`prisma db push` footgun, per CLAUDE.md).

```prisma
model Customer {
  id             String   @id @default(cuid())
  discordUserId  String   @unique          // the buyer
  displayName    String?
  contactWhatsapp String?                   // off-platform renewal channel (KSA reality)
  createdAt      DateTime @default(now())
  subscriptions  Subscription[]
}

model Subscription {
  id             String   @id @default(cuid())
  customerId     String
  customer       Customer @relation(fields: [customerId], references: [id])
  guildId        String   @unique          // one subscription per managed server
  status         String                     // trial | pending | active | grace | expired | suspended
  plan           String   @default("all")
  startedAt      DateTime?
  trialEndsAt    DateTime?
  expiresAt      DateTime?                  // stored + compared in UTC; displayed Asia/Riyadh
  botClientId    String?                    // customer's application id (for invite link)
  botName        String?
  createdAt      DateTime @default(now())
  credential     BotCredential?
  payments       PaymentRecord[]
  @@index([status])
}

model BotCredential {
  subscriptionId String   @id
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  // AES-256-GCM. Token plaintext NEVER stored or logged.
  tokenCiphertext String
  tokenIv         String
  tokenAuthTag    String
  rotatedAt      DateTime @default(now())
}

model PaymentRecord {
  id             String   @id @default(cuid())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  amountSar      Int
  method         String                     // manual_bank_transfer | moyasar | ...
  status         String                     // submitted | approved | rejected
  receiptKey     String?                    // opaque storage key, not a customer-supplied URL
  periodMonths   Int      @default(1)
  note           String?
  submittedAt    DateTime @default(now())
  approvedAt     DateTime?
  approvedBy     String?                    // owner discord id
}
```

`tenant #0` (owner's guild) is seeded with a lifetime `active` subscription so the existing guild keeps working unchanged.

## 6. Components

### 6.1 TenantRegistry & per-tenant config
- `GlobalConfig` (env): `DATABASE_URL`, `SESSION_SECRET`, central dashboard `CLIENT_ID`/`DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `DASHBOARD_URL`, `PORT`, `MASTER_ENCRYPTION_KEY`, `OWNER_DISCORD_ID`, optional `LAVALINK_*`/`ANTHROPIC_API_KEY`/`RAPIDAPI_*`.
- `TenantRuntime` replaces the single `client` + `config.guildId`: `{ client, guildId, botClientId }`.
- `loadCommands()` runs once (commands are identical across tenants). For each tenant client we call `loadEvents(client, commands)` so each client gets its own handlers; handlers already extract `guildId` from the event context (`message.guild.id`, etc.), so they operate on the right guild automatically.
- `registerCommands(commands, token, botClientId, guildId)` is called per tenant, guild-scoped (instant), fire-and-forget — preserving the boot-order invariant in `boot.ts` (never awaited; guarded by `tests/boot.test.ts`).

### 6.2 Per-client fault isolation (replaces single `client.login`)
- Each tenant client logs in inside its own `try/catch`. A bad/expired token marks that subscription `suspended` (needs-token) and **does not** throw out of boot. `boot.ts` keeps starting the API even if some tenants fail.
- Each client gets `client.on('error'/'shardError', …)` handlers scoped to that tenant so one client's gateway error never bubbles to `process`.

### 6.3 Token vault
- `src/shared/crypto.ts`: AES-256-GCM encrypt/decrypt using `MASTER_ENCRYPTION_KEY`. Decrypt only in memory, only to call `client.login`. Never logged.
- `src/shared/logger.ts` gains a redaction layer scrubbing Discord-token-shaped strings and `Bot `/`Bearer ` prefixes before output (defense in depth).

### 6.4 Subscription gate (lifecycle)
- `src/db/subscriptions.ts`: cached lookup (like `settingsCache`), TTL ~5 min, force-refresh hourly + event-driven refresh when the owner edits a row.
- State machine: `trial → active → grace → expired → suspended`. `trialEndsAt`/`expiresAt` compared in **UTC**; **fail-open on DB error** (never drop a paying bot for an infra blip — alert the owner instead).
- Enforcement is now at the **registry** layer, not in-code-the-customer-runs: on `expired`, the central service stops/destroys that tenant client (cost control, since infra is one process now this is just freeing memory). `grace` keeps the client running but the dashboard + bot surface a renewal banner.
- Resume is explicit: extending the row re-spawns the client, re-arms the scheduler tenant, resets presence.

### 6.5 Scheduler (multi-tenant)
- One process timer. Each tick iterates **active** tenants and runs the existing tasks with that tenant's `(client, guildId)`. The tasks are already `guildId`-filtered (verified: `endDueGiveaways`, `fireDueReminders`, `announceBirthdays`, `refreshStatCounters`, `expireShopRoles`, `sweepRaids`, `postWeeklyDigest`, `runChurnAlerts`, `postDueScheduled`, `liftExpiredCases`, `sweepVoiceXp`, `pollCreatorContent`, `expireDueRoles`).
- **Bug fixes required before fleet (Phase 0):**
  - `src/bot/tempvoice.ts:137` `reconcileTempVoice` does `findMany()` with **no** `where` and **deletes** rows whose guild isn't cached → in a fleet it deletes other tenants' rooms. Fix: scope to the tenant's `guildId`; guard the delete so it only runs when the row's `guildId` matches and the channel is truly gone.
  - `src/bot/scheduler.ts` `flushStats` iterates `client.guilds.cache.values()` (all guilds a client sees). Scope strictly to the tenant `guildId`; add a startup guard that refuses to operate on any guild other than the tenant's configured one.

### 6.6 Auth (multi-guild) — `src/api/routes/auth.ts`
- OAuth login stays on **our** central app (`GlobalConfig.clientId/secret`) — customers do **not** provide a client secret and do **not** configure redirect URIs.
- After `identify`, resolve the user's accessible tenants: for each tenant guild, use that tenant's client to fetch the member and check `isStaff` against that guild's `staffRoleIds`. Session stores `{ user, guildIds: string[], guildId: selected }`.
- `GET /api/me` returns the user + accessible guilds + selected guild. A new `POST /api/select-guild` sets the active `guildId` (must be in `guildIds`).

### 6.7 API tenant-context — `requireStaff` + new `tenantContext` middleware
- `tenantContext` runs after `requireStaff`: reads `req.session.guildId`, asserts it's in `req.session.guildIds`, attaches `req.tenant = { guildId, client, botClientId }` (resolved from the registry).
- The ~38 routers change mechanically: `deps.config.guildId → req.tenant.guildId`, `deps.client → req.tenant.client`. This is the **bulk of the refactor** — broad but mechanical.
- **Defense-in-depth tenant guard:** a Prisma client-extension that injects/asserts `guildId` on tenant-scoped models and throws if a query is missing it, so a forgotten `where` fails closed instead of leaking another customer's data.
- `requireOwner` (new): checks `req.session.user.id === GlobalConfig.ownerDiscordId`. All provisioning / payment-approval / fleet routes mount behind `requireOwner`, **never** `requireStaff` (a central-guild moderator must not be an owner). Test asserts non-owner staff → 403.

### 6.8 Onboarding wizard (`web/` + new API)
Steps (Arabic, each illustrated; the hard ones happen in the English Dev Portal so each gets an annotated screenshot):
1. Create a Discord application + bot.
2. Set bot name + avatar (or skip; settable later in dashboard).
3. Enable **two** privileged intents only: **Server Members** + **Message Content**. (Presence dropped — no feature needs it; reduces failure surface.)
4. Copy the **bot token** (only the token — no client secret, no redirect URI).
5. Paste token + enter server ID (with a "how to copy ID" Arabic note) → we **live-validate** the token against Discord and confirm the intents.
6. Start 7-day trial → client spawns → "Invite your bot" button (invite link built from the validated `botClientId`).

Abuse controls (the validate endpoint is reachable by any logged-in Discord user): persisted per-`Customer` daily validation quota (not in-memory), token-shape pre-check, hardcoded `discord.com` host (no SSRF), a dedicated low body-size limit for portal/receipt routes (not the global 4 MB).

### 6.9 Owner panel + payments (`requireOwner`)
- Fleet view: every subscription, status, bot online/offline heartbeat, "stop/extend/suspend" actions.
- Payment approval: list submitted `PaymentRecord`s with receipt; one-click approve → extend `expiresAt` by `periodMonths`, refresh the subscription gate (live re-spawn if it was stopped).
- `PaymentProvider` interface: `ManualBankTransferProvider` now; `MoyasarProvider` later implements the same interface (webhook → auto-approve). Manual customers can later attach a recurring mandate without losing history.
- Receipts: stored via an opaque key in durable storage (Railway volume or S3-compatible), validated by **magic bytes** (PNG/JPEG/PDF), served only to `requireOwner` with `Content-Disposition: attachment` + `nosniff`.

### 6.10 Customer portal & bot identity
- Portal: subscription status, days left (Asia/Riyadh), renewal (self-serve: upload receipt against the existing subscription — not the new-customer wizard), data export, "needs new token" re-entry flow if the token was reset.
- Bot identity page: change avatar (base64 upload, throttle >10 min) and name (**throttle to ~2/hour** — username changes hit the account name-change limit, not the avatar limit; catch the 429 and show an Arabic "try later, up to 24h" message). Set name once at provisioning; later renames are deliberate.

### 6.11 Marketing & trust surface (Phase 4)
Arabic outcome-led pricing page, a **joinable demo server** (tenant #0), short demo video, a public Discord server as support+sales, a **status page** backed by the heartbeat monitor, Arabic ToS + privacy policy (honest token-handling + data-retention/deletion), refund/cancellation policy, and 15% VAT factored into pricing math. A `نسويها لك` (done-for-you) paid setup add-on for non-technical buyers.

## 7. Phasing

Each phase is independently shippable and testable. Tenant #0 (owner's guild) is the canary for every phase.

| Phase | Title | Deliverables | Key tests |
|------|-------|--------------|-----------|
| **0** | Fleet-safety fixes | Scope `reconcileTempVoice` + `flushStats` to tenant guildId; per-client error isolation; logger redaction | Unit test asserting **no** scheduler/boot query runs without a `guildId` filter; one bad token doesn't crash boot |
| **1** | Multi-client engine | `TenantRegistry`, `GlobalConfig`/`TenantRuntime` split, token vault + crypto, new Prisma models, subscription gate, scheduler loop, seed tenant #0 | Registry spawn/stop; gate state machine (incl. fail-open on DB error); crypto round-trip |
| **2** | Central multi-guild dashboard | Central OAuth, guild discovery + picker + `session.guildId`, `tenantContext` middleware, Prisma tenant guard, `requireOwner`, mechanical route refactor, bot-identity page | Cross-tenant isolation (user of guild A can't read guild B); non-owner staff → 403 on owner routes; rate-limit-aware identity changes |
| **3** | Onboarding + payments | Arabic wizard + live token validation + abuse controls, manual `PaymentProvider`, receipt storage, owner approval → live activation, 7-day trial + 3-day grace lifecycle | Wizard validation happy/error paths; trial→grace→expired transitions; provisioning idempotency (no double-activate) |
| **4** | Launch & ops | Pricing page, demo server, support Discord, status page + heartbeat alerts, renewal reminders (dashboard + WhatsApp), data export/delete, Arabic ToS/privacy/refund | Heartbeat alert fires on disconnect; data export/delete completeness |

## 8. Security posture (summary)

- Tokens encrypted at rest (AES-256-GCM); never logged (redaction layer); decrypted only to log in.
- Treat Railway as an acknowledged sub-processor; ToS clause authorizing us to hold the customer's bot token.
- One trust boundary (central service). Prisma tenant guard makes a forgotten `where` fail closed.
- `requireOwner` distinct from `requireStaff`; provisioning/payment routes owner-only.
- Wizard validate endpoint: persisted per-customer quota, hardcoded Discord host, dedicated small body limit, no server-side fetch of user URLs (avatars via base64 upload only).
- Incident plan: self-serve token rotation; 2FA on Railway + the central Discord account; breach-notification note in privacy policy.

## 9. Risks & open questions

1. **Music in multi-client** — `lavalink-client` multi-client (one manager, many client ids) is the least-certain integration. If it proves hard, music ships a sub-phase later; all non-audio features are unaffected. *(Resolve during Phase 1 spike.)*
2. **Memory ceiling** — N clients × `GuildMembers` cache in one process. Measure tenant #0 baseline, size the Railway instance, alert on OOM restarts. At 50 small guilds this is expected to be fine.
3. **Single-process availability** — accepted trade-off; mitigated by per-client isolation + Railway auto-restart + status page. Revisit horizontal split only past ~100 customers.
4. **Manual renewal churn** — the biggest *business* risk; mitigated by annual-default pricing + self-serve receipt renewal + off-platform (WhatsApp) reminder. Moyasar is a near-term follow-up, not "someday."

## 10. Out of scope (YAGNI for now)

Per-feature plan gating (single plan), automated payment gateway (interface only this round), multi-server-per-subscription beyond "each server = its own subscription," horizontal multi-process sharding, and per-tenant separate databases (the Prisma guard + one trust boundary suffice at this scale).
