# LY-SYSTEM Freemium — Design Spec

**Date:** 2026-06-05
**Status:** Approved design → ready for implementation planning
**Supersedes:** the product-model rows of `2026-06-04-ly-system-saas-design.md` (single 39-SAR plan, custom-bot-for-everyone). The fleet architecture (§4), data model (§5), components (§6) and security posture (§8) of that spec **remain valid** — they now power only the top tier, and its Phases 1–3 become Stage د here. Phase 0 (fleet-safety) is **done and deployed** (2026-06-05).

---

## 1. Goal

A free, public, shared LY-SYSTEM bot any Arabic server can invite (the marketing funnel — ProBot's model), with two paid tiers that unlock depth:

| Tier | Price | Delivery |
|------|-------|----------|
| **مجاني** (free) | 0 | ONE shared public bot serving N guilds |
| **بريميوم** (premium) | **19 SAR/mo** | same shared bot, full feature depth + limits lifted |
| **بوت مخصص** (custom) | **39 SAR/mo** | everything + a customer-owned branded bot (the fleet) |

Annual = 12 months for the price of 10. Payment: manual bank transfer + receipt behind the `PaymentProvider` interface (per the 2026-06-04 spec §6.9); gateways later.

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Product model | Freemium, 3 tiers (free / premium 19 / custom 39) |
| Free delivery | Shared public bot — near-zero marginal cost per free guild |
| Gating philosophy | **Hybrid**: free is generous on basics with limits; premium = exclusives + lifted limits; custom = premium + bot identity |
| Launch scope | Stages أ+ب+ج ship before launch (sell premium 19); stage د after launch (opens custom 39) |
| Trial | 7-day trial on the **custom** tier only (the free tier IS the premium funnel) |
| Owner guild | tenant #0 seeded `plan='custom'`, lifetime — keeps working unchanged |
| Revenue start | Stage ب — premium 19 needs **no fleet, no token vault** |

## 3. Architecture

### 3.1 Entitlements — `src/shared/entitlements.ts` (the PlanGate)

Single source of truth, pure + unit-tested:

- `type Plan = 'free' | 'premium' | 'custom'`; `PLAN_RANK = { free: 0, premium: 1, custom: 2 }`.
- `FEATURES: Record<FeatureKey, Plan>` — minimum plan per feature key (matrix in §4).
- `LIMITS: Record<LimitKey, Record<Plan, number>>` — numeric caps per plan (∞ = `Infinity`).
- `src/db/subscriptions.ts`: `getPlan(guildId)` cached like `settingsCache` (TTL ~5 min, invalidated on dashboard/owner writes). Missing row → `'free'`. **Fail-open to the cached value** on DB error (a paying guild never loses premium on an infra blip); cold-cache failure → `'free'` (fail-safe).
- Bot-side: `requirePlan(guildId, feature)` returns `{ ok } | { ok: false, upsell }` where `upsell` is a compact Arabic embed («ميزة بريميوم 🔒» + upgrade URL) reused by every command/handler.
- API-side: `requireFeature(key)` Express middleware (after `requireStaff`) → 403 with `{ upgrade: true }`; the SPA renders lock badges + upgrade CTA instead of hiding pages (visible-but-locked sells).
- Enforcement points: slash commands (top of `execute`), event handlers (cheap check before work), API routes (middleware), dashboard UI (badges). Scheduler tasks check per-guild plan where the task is premium (e.g. creator polling).

### 3.2 Multi-guild shared bot (Stage أ)

The current single-guild bot becomes the shared public bot:

- **Command registration:** global (`Routes.applicationCommands`) instead of guild-scoped. Still fire-and-forget LAST in `boot()` (the 5/24 invariant + `tests/boot.test.ts` stand).
- **Events:** already extract `guildId` from context, and Phase 0 made every query guild-scoped (locked by `tests/scheduler-tenant-isolation.test.ts`). Remove remaining `process.env.GUILD_ID` single-guild assumptions (e.g. `ready.ts` warms only the configured guild; member-cache warming becomes lazy/per-guild on demand).
- **guildCreate:** `ensureGuildSettings(guildId)` + create a `free` Subscription row + post an Arabic onboarding embed (dashboard link). **guildDelete:** mark subscription `left` (data retained 30 days, then eligible for cleanup).
- **Stats:** `allowStatsGuild` is called for every guild with a Subscription row (the registry of known guilds replaces the single-guild allowlist).
- **Scheduler:** one timer; each tick iterates known guilds and calls `runSchedulerTick(deps, statePerGuild)` per guild (the Phase-0 extraction made tick state explicit precisely for this). Premium-only tasks (creator polling) skip free guilds via PlanGate.
- **Dashboard auth:** central OAuth stays; after `identify`, compute the user's manageable guilds (mutual with the bot + `isStaff` per guild), session carries `{ guildIds, guildId: selected }`, new `POST /api/select-guild` + guild-picker UI. `tenantContext` middleware + the Prisma tenant-guard extension + `requireOwner` — exactly §6.6–6.7 of the 2026-06-04 spec, pulled forward because ALL tiers need them now.

### 3.3 Data model (additive)

Same models as the 2026-06-04 spec §5 (`Customer`, `Subscription`, `BotCredential`, `PaymentRecord`) with one change: `Subscription.plan` is `'free' | 'premium' | 'custom'` (default `'free'`), and `Subscription` rows exist for **every** guild the shared bot is in (free rows have no `Customer`). `BotCredential` only exists for custom-tier rows (Stage د). All feature config stays in the existing per-guild tables.

### 3.4 Custom-bot fleet (Stage د)

Unchanged from the 2026-06-04 spec: `TenantRegistry: Map<guildId, Client>`, AES-256-GCM token vault, per-client fault isolation (§6.2 — already half-built in Phase 0), subscription gate spawning/stopping clients, Arabic onboarding wizard, owner panel. The shared public bot is simply tenant #0's client serving many guilds; custom clients serve one guild each. A custom guild's client replaces the shared bot in that guild (onboarding asks the owner to kick the shared bot, or we leave both and the custom bot takes precedence — wizard step decides; default: shared bot auto-leaves when a custom bot activates for that guild).

## 4. Tier matrix (launch defaults — live in `entitlements.ts`, adjustable)

### Free (the shared bot, generous basics)
- Moderation suite + cases + logs — **full** (trust builder).
- AutoMod basic: banned words, anti-spam, anti-invite, anti-link, anti-scam.
- Welcome/goodbye: text + **classic card style only**; no custom BG.
- Leveling: message XP + role rewards (no voice XP, no multipliers).
- Tickets: **1 ticket type**; transcripts kept 7 days; no AI summary.
- Community: suggestions, reminders, birthdays, AFK, counting, highlights, profiles, starboard.
- Limits: tags ≤ 10, auto-responses ≤ 5, role panels ≤ 2, scheduled messages ≤ 3, stat counters ≤ 2, saved embeds ≤ 5, giveaways: 1 active, application forms: 1.
- Economy basic: wallet, `/daily`, `/pay`, shop ≤ 5 items (no games, no `/work`, no `/rep`).
- Invites tracking basic (no rewards config), anti-raid basic (join gate), alt-age gate.

### Premium 19 (everything below + free, limits lifted to ∞)
- 🛡️ **Protection pack**: anti-nuke + panic mode + server backups/restore + captcha gate (§6.1).
- 🎨 All 9 card styles + **free-layout card editor** + custom BG.
- 📺 Creator alerts: YouTube, TikTok, **Twitch, Kick** (+ live-role).
- 🏆 Voice XP, per-role/per-channel XP multipliers, public web leaderboard, XP timeframes.
- 🎰 Economy full: `/work`, games (dice/slots w/ house edge), `/rep`, transfer tax, transactions ledger, unlimited shop.
- 🔍 AutoMod advanced: regex rules + per-rule action/log + link whitelist + bypass list.
- 🎵 Music (Lavalink) + temp voice rooms.
- 🧠 AI: ticket summaries (existing) + smart moderation (wave 2).
- Unlimited: ticket types, tags, auto-responses, panels, scheduled, counters, embeds, giveaways, forms; transcripts kept forever.

### Custom 39 (premium + identity)
- Customer-owned bot: their name/avatar/presence, token in the encrypted vault, identity editable from the dashboard (rate-limit-aware per the 2026-06-04 spec §6.10).
- Priority support; 7-day trial.

## 5. Stages

| Stage | Title | Deliverables | Key tests |
|-------|-------|--------------|-----------|
| **أ** | Multi-guild core + PlanGate | Global commands; guildCreate/Delete lifecycle; Subscription model + `getPlan` cache; `entitlements.ts` matrix; enforcement helpers (bot + API + UI badges); multi-guild dashboard auth + picker + `tenantContext` + Prisma tenant guard + `requireOwner`; gate existing features per §4 | Cross-guild isolation (staff of A can't read B); free guild blocked from premium feature w/ Arabic upsell; limits enforced at create-time; plan cache invalidation; fail-open for cached paid plan |
| **ب** | Payments + portal | Manual `PaymentProvider`, receipt upload (magic-byte validated), owner approval → plan flip + cache invalidation; customer portal (status, days left Asia/Riyadh, renewal); grace logic (3 days) on expiry → downgrade to free (never data loss — config kept, just gated) | active→grace→free transitions (trial enters only at stage د); receipt abuse limits; non-owner staff → 403 on owner routes |
| **ج** | Launch exclusives ×5 | Protection pack; Twitch/Kick (+X) alerts; economy depth; leveling depth + public leaderboard; card editor (§6) | Per-feature suites; anti-nuke thresholds unit-tested; backup snapshot/restore round-trip; public leaderboard route rate-limited + opt-in |
| 🚀 | **Launch** — sell premium 19 | Pricing page (3 tiers, «بوت مخصص قريبًا»), upgrade flow, support server | — |
| **د** | Custom-bot fleet | The 2026-06-04 spec Phases 1+3 (registry, vault, wizard, owner fleet panel) — sell 39 | Registry spawn/stop; vault crypto round-trip; one bad token ≠ crash (already guarded) |

## 6. Launch-exclusive mini-specs (Stage ج)

### 6.1 Protection pack (vs Wick)
- **Anti-nuke:** audit-log watchers (channel/role delete, ban, webhook create, bot add) with per-actor sliding-window thresholds (e.g. ≥4 channel deletes/60s). Punishment: strip actor's roles (or ban), restore what's recoverable, alert owner. Config: thresholds, punishment, whitelist (owner + trusted ids). New `AntiNukeConfig` single-row table (separate from `RaidConfig`, which gates joins — different threat, different lifecycle).
- **Panic mode:** `/panic` + dashboard button → lockdown @everyone perms, pause invites, raise verification; one-click revert (extends existing raid lockdown helpers).
- **Backups:** snapshot roles/channels/categories/permissions + key configs to a versioned JSON blob (new `ServerBackup` table, ≤10 backups/guild, manual + weekly auto). Restore wizard with diff preview. Restores structure, not messages.
- **Captcha gate:** join → quarantine role → dashboard-hosted verify page (session-signed link in DM/welcome channel) → solve → role granted. `suspicious-only` mode chains the existing alt-age gate.

### 6.2 Streaming platforms (extends `src/bot/creator/`)
- Twitch via Helix (env `TWITCH_CLIENT_ID/SECRET`, app token, poll streams endpoint — same self-throttled poll pattern as YouTube). Kick via its public unofficial API (best-effort, feature-flagged). X posts via RapidAPI (optional, like TikTok). Live-role: while a tracked creator is live, grant a configured role to their linked member (config maps creator → memberId); no presence intent needed.

### 6.3 Economy depth
- `/work` (cooldown + min/max payout config), `/gamble dice|slots` (house-edge %, min/max bet, daily loss cap), `/rep @user` (1/day), transfer tax %, `/transactions` (reads existing `EconomyTransaction`), leaderboard timeframes (daily/weekly snapshots via scheduler).

### 6.4 Leveling depth
- `roleMultipliers: Json` + `channelMultipliers: Json` on LevelConfig (applied in `applyXpGain`). Public web leaderboard: unauthenticated `GET /lb/:guildSlug` (opt-in toggle, rate-limited, pretty RTL page served by the SPA). XP timeframes via daily XP snapshots. Decay/prestige = wave 2.

### 6.5 Card editor (vs ProBot)
- `welcomeCardLayout: Json` on GuildSettings: positions/sizes/colors/shapes for avatar, title, subtitle, member-count + custom BG. Dashboard editor: drag-drop canvas with live client-side preview, server renders via the existing `welcomeCard` pipeline (`layout` style = 10th style consuming the JSON). The 9 preset styles remain one-click.

## 7. Compatibility & migration

- Stage أ ships with the bot still in one guild — the shared bot IS the current bot; nothing breaks. Owner guild seeded `custom` lifetime.
- Public bot invite link stays unlisted until stage ب completes (controlled rollout).
- Downgrade (expiry) NEVER deletes data: premium config rows stay, features re-gate. Re-upgrade restores instantly.
- Schema stays additive (`prisma db push` footgun rules apply).

## 8. Abuse & safety

- Free-tier rate limits: per-guild command cooldowns unchanged; public leaderboard + captcha pages rate-limited per IP; receipt endpoints small body-limit (per 2026-06-04 spec §6.8 abuse controls).
- PlanGate failure: paid plans fail-open from cache; unknown guilds fail to `free`.
- The Prisma tenant-guard extension (2026-06-04 §6.7) lands in Stage أ — a forgotten `where` fails closed.

## 9. Out of scope (YAGNI)

Moyasar/auto-billing, AI persona & AI automod (wave 2), per-guild custom limit overrides, prestige/decay, message-content backups, multi-language dashboard (Arabic only), Bluesky/Rumble.
