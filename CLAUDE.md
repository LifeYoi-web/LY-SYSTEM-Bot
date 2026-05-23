# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LY-SYSTEM Bot is a Discord bot built with **discord.js v14** and **TypeScript** (compiled to CommonJS). It is deployed on **Railway** for 24/7 hosting. The codebase is intentionally minimal and bilingual: code identifiers are English, while user-facing strings (command descriptions, embed text) are Arabic.

## Commands

```bash
npm install        # install dependencies
npm run build      # compile TypeScript: src/ -> dist/  (tsc)
npm start          # run the compiled bot: node dist/index.js
npm run dev        # ts-node on src/index.ts  (see caveat below)
```

There is **no test runner and no linter configured** — `package.json` has only `build`, `start`, and `dev`. Do not assume a `test` or `lint` script exists.

### Build-before-run is mandatory (important gotcha)

The module loaders in `src/index.ts` match `.js` files only and `require()` them relative to `__dirname`:

```ts
readdirSync(folderPath).filter(f => f.endsWith('.js'))
```

At runtime that resolves against the compiled `dist/` directory, so **commands and events are only discovered after `npm run build`**. Consequences:

- **`npm run dev` does not work as a full dev mode.** Under ts-node, `__dirname` points at `src/`, which contains `.ts` files — the `.js` filter excludes them, so **zero commands and zero events load**. Worse, `registerCommands()` then PUTs an empty array to Discord, **de-registering all global slash commands**.
- The reliable local workflow is `npm run build && npm start`. After changing any command or event, rebuild before starting.

## Architecture

Single entry point `src/index.ts` boots everything in one process via `main()`:
1. `loadCommands()` — walks `dist/commands/<category>/*.js`, `require()`s each, and stores it in an in-memory `Collection` keyed by command name.
2. `registerCommands()` — pushes all command definitions to Discord's **global** application command endpoint (`Routes.applicationCommands(clientId)`). Global registration can take up to ~1 hour to propagate to clients. This runs on **every startup**.
3. `loadEvents()` — walks `dist/events/*.js` and wires each to the client with `client.once`/`client.on` based on its `once` flag.
4. `client.login()`.

The bot is **stateless** — there is no database, cache, or file persistence. All data comes from live Discord API calls. Gateway intents enabled in `index.ts`: `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`.

### Module contracts (CommonJS, not ES exports)

Even though source is `.ts`, modules use `module.exports = {...}` because the loader `require()`s the compiled CommonJS output.

**Command** — one file per command in `src/commands/<category>/`:
```ts
module.exports = {
  data: new SlashCommandBuilder().setName('...').setDescription('...'),
  async execute(interaction: ChatInputCommandInteraction) { /* ... */ },
};
```

**Event** — one file per event in `src/events/`:
```ts
module.exports = {
  name: 'eventName',   // a discord.js client event
  once: false,         // true => client.once, false => client.on
  async execute(...args, commands) { /* ... */ },
};
```
Every event handler receives the shared `commands` Collection as its **last** argument (see `loadEvents()` in `index.ts`). `interactionCreate` uses this to look up and dispatch slash commands; it also owns the central try/catch that replies with an ephemeral error message when a command throws.

### Adding a command

Create `src/commands/<category>/<name>.ts` following the command contract above, then `npm run build && npm start`. New categories are just new sub-folders under `src/commands/` — the loader picks them up automatically; no central registry to edit.

## Conventions

- **Logging:** use the `logger` from `src/utils/logger.ts` (`logger.info/success/warning/error`) rather than `console.*`. It prints emoji-prefixed, timestamped lines.
- **Embeds / branding:** user-facing replies are `EmbedBuilder` embeds using the LY brand orange `0xf57c00` and a `LY-SYSTEM Bot` footer (see `src/commands/general/ping.ts`).
- **Language:** keep code/identifiers in English; write command descriptions and reply text in Arabic to match existing commands.

## Configuration & Deployment

Secrets come from `.env` (loaded via `import 'dotenv/config'` at the top of `index.ts`). Required variables:
- `DISCORD_TOKEN` — bot token (secret; never commit)
- `CLIENT_ID` — Discord application ID (used for command registration)

Deployment is configured in `railway.json` (NIXPACKS builder): build = `npm install && npm run build`, start = `npm start`, restart on failure (max 5 retries). Set `DISCORD_TOKEN` and `CLIENT_ID` as Railway variables.
