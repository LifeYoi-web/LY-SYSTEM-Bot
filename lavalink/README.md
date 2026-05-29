# Lavalink setup (music feature)

The LY-SYSTEM bot stays on Railway; the **audio + YouTube extraction** runs here, on a
**VPS with a non-blocked IP**. The bot talks to this node over the network. This is what
keeps YouTube from blocking the Railway IP.

## 1. Get a VPS

Any small VPS works (1 vCPU / 1–2 GB RAM is plenty for one server). A residential or
lightly-used datacenter IP is best — YouTube blocks heavily-abused ranges.

## 2. Run Lavalink

**Option A — Docker (recommended):**
```bash
# copy this folder to the VPS, then:
cd lavalink
# edit application.yml: set a strong password
docker compose up -d
docker compose logs -f   # watch it boot + download the YouTube plugin
```

**Option B — Java (no Docker):**
```bash
# needs Java 17+
# download Lavalink.jar from https://github.com/lavalink-devs/Lavalink/releases
# put application.yml next to it, then:
java -jar Lavalink.jar
```

> ⚠️ Verify the YouTube plugin version in `application.yml` against the latest at
> https://github.com/lavalink-devs/youtube-source/releases and update it if needed —
> an outdated plugin is the usual cause of "node connects but nothing plays".

## 3. (Recommended) YouTube OAuth for reliability

From a server IP, YouTube often demands sign-in. Enable OAuth so Lavalink authenticates:

1. Uncomment the `oauth:` block in `application.yml` with `enabled: true` (no refresh token yet).
2. Start Lavalink and watch the logs — it prints a URL + code to authorize a (preferably
   throwaway) Google account, then logs a **refresh token**.
3. Paste that token into `refreshToken:` and restart. Done.

## 4. Open the port + secure it

- Open TCP **2333** in the VPS firewall (or your chosen port).
- Use a **strong `password`** — it's the only thing protecting the node.
- Best practice: put it behind a reverse proxy with TLS (then set `LAVALINK_SECURE=true`).

## 5. Point the bot at it (Railway → Variables)

```
LAVALINK_HOST=your.vps.ip.or.domain
LAVALINK_PORT=2333
LAVALINK_PASSWORD=the-password-from-application.yml
LAVALINK_SECURE=false   # true only if you put TLS in front of it
```

Redeploy/restart the bot. On `ready` it connects to the node; you'll see
`Lavalink node connected: main` in the bot logs. Then `/play` works in any voice channel.

If `LAVALINK_*` is left blank, the music feature stays disabled and the bot runs normally.
