# Session-pinger

A [Command Code](https://commandcode.ai) mod that pushes a notification to your phone when a
**long** agent run finishes — so you can leave the laptop and stop checking whether it's done.

Delivery goes through [ntfy](https://ntfy.sh): no account, no bot token. You pick a secret
topic name, subscribe to it in the ntfy app, and the mod POSTs to `https://ntfy.sh/<topic>`.

Runs shorter than the threshold (default 60s) stay silent.

## Install

```bash
# straight from git, user scope (loads in every session)
cmd mods add Hsnmughal/Session-pinger -g

# or from a local checkout
cmd mods add ./path/to/Session-pinger -g
```

`-g` installs at user scope, so it loads in every session instead of only this workspace.
Restart Command Code, or run `/reload`, to pick it up.

To try it without installing:

```bash
cmd --mod ./src/index.ts
```

No build step — Command Code compiles the TypeScript with jiti at load time.

## Set up ntfy

1. Install the app: [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
   · [iOS](https://apps.apple.com/us/app/ntfy/id1625396347) · [F-Droid](https://f-droid.org/en/packages/io.heckel.ntfy/)
   · or use the web app at <https://ntfy.sh/app>.
2. Pick a **long, unguessable** topic name. Topic names on the public server are
   first-come-first-served and readable by anyone who knows them — treat the name as the
   password.
3. Subscribe to that topic in the app (server stays `ntfy.sh`).
4. In Command Code:

```
/ping-setup topic=<your-topic>
/ping-test
```

`/ping-test` sends a notification immediately; your phone should buzz. If it does, you're set.

## Commands

| Command | Does |
|---|---|
| `/ping` | Show the current setup (`server/topic`, threshold, whether a token is set) |
| `/ping-setup topic=<t> [server=…] [threshold=…] [token=…]` | Configure it; later calls merge keys, they don't overwrite the rest |
| `/ping-setup off` | Disable it |
| `/ping-test` | Send a notification now |

`threshold` accepts plain seconds or a unit: `90`, `45s`, `5m`, `1h`, `500ms`.

Self-hosted ntfy and protected topics:

```
/ping-setup topic=<topic> server=https://ntfy.example.com token=<token>
```

## Environment overrides

Read at load time and they win over the stored config — handy for `--mod` trials and CI:

| Variable | Meaning |
|---|---|
| `SESSION_PING_TOPIC` | ntfy topic |
| `SESSION_PING_SERVER` | server base URL (default `https://ntfy.sh`) |
| `SESSION_PING_THRESHOLD_MS` | minimum run length in milliseconds |
| `SESSION_PING_TOKEN` | bearer token for a protected topic |

## What the notification contains

```
Run finished after 2m 14s.

<last ~200 characters of the agent's final reply, whitespace collapsed>

cwd: /path/to/project
```

`stopReason` is translated to readable text: `end_turn` → finished, plus `interrupted`,
`max_turns`, `permission_denied`, `stop_hook`, `terminate`. Unknown reasons pass through
verbatim.

A failed delivery is reported once in the local feed as a warning — it never throws, so a
network hiccup can't break the session.

## Notes

- A **run** is one prompt until the agent stops, not a session shutdown. Long runs ping; exiting
  Command Code does not.
- Runs in print mode (`cmd -p`) also fire `run_end`, so long headless runs will ping too.
- `cmd --safe-mode` and `{"mods": {"disableAll": true}}` skip the mod, as they skip all mods.
- On Android, the Play Store build uses Firebase and can deliver late in doze mode; enable
  **Instant delivery** per subscription (or use the F-Droid build, which does it by default).

## Development

```bash
npm install    # dev deps only: typescript + @types/node, for the typecheck
npm test       # node:test, no framework
npm run check  # tsc, typecheck only
```

Everything Command Code needs ships in the repo and installs from git — there is no npm
package and no build artifact.

Layout:

| File | Holds |
|---|---|
| `src/index.ts` | the mod factory — the only file Command Code loads |
| `src/mod.ts` | hook wiring, `/ping`, `/ping-setup`, `/ping-test` |
| `src/config.ts` | config resolution (store + env precedence, validation, threshold parsing) |
| `src/deliver.ts` | ntfy POST, message formatting, failure handling |
| `src/duration.ts` | duration formatting |
| `src/types.ts` | the narrow surface the mod needs, independent of the harness |

The mod deliberately typechecks against `src/types.ts` rather than `@commandcode/harness`, so
`npm run check` needs no harness package and the mod keeps compiling if the harness API moves.

## License

MIT
