# Clocktzee Dev Notes

## Current Version: 1.4.0

## 🐛 Bugs
- Four of a Kind example in Rules shows 11:12 — should be 1:111 or similar
- Birthday bonus not firing on 717 — investigate storage vs pattern match
- Rare Find + First of the Day awarded even on No Pattern (0pt) scores — bonuses should require qualifying base score

## ✏️ Improvements Queued
- HOF entries — add edit/delete capability
- First of the Day — make global (one person per day total, not per player)
- Period reset — needs live test before May go-live

## ✅ Confirmed Working
- Join flow
- Image upload
- Reactions
- Feed delete
- Player data protection (dirty flags)

## 🗄️ Data Migration Log

### Step 1 — players/ collection ✅ DONE (2026-04-19)
Ran `migrate-players.js`. Copied `settings/players` array into individual Firestore documents.

**players/ documents:**
| ID | Name |
|---|---|
| `jason` | Jason |
| `shanda` | Shanda |
| `lyric` | Lyric |
| `brayden` | Brayden |
| `karrigan` | Karrigan |
| `mattie_1776039712668` | Mattie |

Each doc currently has: `id`, `name`, `emoji`, `color`

### Step 2 — seed player fields ✅ DONE (2026-04-19)
Ran `seed-player-fields.js`. Each player doc now has: `id`, `name`, `emoji`, `color`, `isAdmin`, `birthday`, `theme`.
- `isAdmin: true` — jason only
- `birthday` — pulled from `settings/birthdays` (all 6 had entries, including Mattie: July 31)
- `theme: 'dark'` — all players

### Step 3 — App.jsx rebuild ⏳ PENDING
Switch App.jsx from reading `settings/players` + `settings/birthdays` as blobs
to live `onSnapshot` on the `players/` collection. Each player document becomes
the single source of truth for identity, birthday, admin status, and theme.
Settings dirty-flag pattern can be retired for player data once migration is complete.

## 📅 Target: Push full update before May 1
