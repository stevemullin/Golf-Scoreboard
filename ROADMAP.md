# Roadmap

Current status of the Golf Pool Scoreboard. See [README.md](README.md) for how
things work and [BACKLOG.md](BACKLOG.md) for the original idea capture.

_Last updated: 2026-06-22._

## ✅ Shipped

- **Hosting** — free on Render + Neon; GitHub auto-deploy; keep-alive pinger; typecheck CI gate; idempotent migrations.
- **Live scoreboard** — best-4-of-6 scoring, cut/WD/DQ penalties, projected cut line + RISK badges (per-tournament Top 50/60/70), THRU/tee times, champion celebration, richer event header (dates / TV / status), optional hole-by-hole scorecard toggle.
- **View any tournament** — header dropdown to see past events, not just the active one.
- **Admin** — PGA-schedule event picker; create / rename / delete tournaments; edit ESPN ID / year; set active; cut size; pick deadline; JSON backup; force refresh; clear a member's picks.
- **Golfer Tiers** (majors) — build 5 tiers from winner odds (8-per-tier default, draggable dividers), tiered pick entry (1 per tier + extra from T4/T5), odds-sorted dropdowns, re-tier validation.
- **Self-service picks** — per-member secret links, own-pick page with lock, scoreboard pick masking until reveal, email reminders via Brevo + admin "Nudge now".
- **Import past events** — admin tool to backfill completed majors from ESPN's official final scores + pasted picks (ESPN's `?dates=<year>` endpoint; `?event=<id>` doesn't serve historical). Single or **bulk** (`# Major Year` headers). Frozen, viewable via the tournament dropdown.
- **History page** (`/history`) — all-time standings (titles, win %, avg finish, best score), champions by event, most-picked golfers, best/worst team records.

## 🔜 Next — small, ready to build

- **Automated daily reminders** — the endpoint exists (`/api/cron/reminders`); just needs the external cron wired (see Ops).
- **Standings-over-rounds chart** for live events (the History page now has its Title Race chart; a per-round line for the live board is the remaining half).

## 🗓 Later — bigger or needs design

- **Notify members on re-tier** — email the members whose submitted picks a re-tier invalidated (admin already sees the warnings).
- **Reminder timezone** — reminder emails show the deadline in ET (hardcoded); make it configurable if the pool runs on another timezone.
- ~~Season view~~ / ~~SMS reminders~~ — considered and **declined** (2026-06-23).
- ~~Regenerate the typed API client~~ — superseded by hand-typed `src/lib/api-types.ts`; a full OpenAPI regen is optional.

## ⚙️ Ops / setup (not code — your action)

- [x] Set `BREVO_API_KEY` + `EMAIL_FROM` in Render to enable reminder emails.
- [ ] For automated daily nudges: add `CRON_SECRET` in Render + a free [cron-job.org](https://cron-job.org) job hitting `POST /api/cron/reminders` (header `X-Cron-Secret`).
- [ ] Lengthen `ADMIN_PASSWORD` in Render (it was short).
- [ ] Turn on the UptimeRobot keep-alive (`/api/healthz/db`, every 5 min) around tournament time.
- [ ] **Live dry-run for the 2026 majors** — point a tournament at the real ESPN event id and verify tiers → picks → masking → reveal → scoring end-to-end on a live event (so far tested against finished events).
