# Clocktzee Dev Notes

## Current Version: 2.1.1

---

## ✅ Recently Completed (v2.1.1 session — May 2026)

- **Debug console.log cleanup** — all debug logging removed from production code; `src/` is clean.
- **Four of a Kind Rules example corrected** — example in the Rules tab now shows `1:111` (was erroneously `11:12`).
- **Rare Find + First of the Day gated on base score > 0** — both bonuses now require a qualifying pattern; No Pattern (0pt) submissions no longer trigger them.
- **First of the Day made global** — `isFirstOfDay` now checks all submissions across all players and games (not per-player). Only the very first qualifying submission of the calendar day earns the bonus.

---

## ✅ Previously Completed (v2.0.0 session — Apr 2026)

- **Two-phase cache loading** — players, games, and activeGame restored instantly from localStorage cache on mount; Firestore `onSnapshot` listeners update state in the background and write fresh data back to `ctz_cached_players` and `ctz_cached_games_<playerId>` for next visit. First-ever load shows a minimal branded screen.
- **PlayerSelectScreen loading placeholder** — when `players.length === 0 && !playersLoaded`, shows a centered 🎲 + "Loading..." instead of the "+ New Player" button. Button only appears after players are confirmed loaded.
- **Admin PIN restored** — Admin tab requires PIN entry ("GPJ") before revealing content. `isAdmin` still controls tab visibility. PIN clears on logout/player switch.
- **Game creation open to all players** — `isAdmin` gate removed from "+ Create New Game" in `GameSelectScreen` and "+ Create Game" in `ProfileSheet`. Any logged-in player can create or join a game.
- **Birthday input fixed** — `PlayerModal` now uses two separate number inputs (Month 1–12, Day 1–31) instead of the MM/DD text field. No placeholder value blocking backspace.
- **checkBirthday loosened** — now matches birthday pattern as a contiguous substring within a longer digit string, provided the same digit doesn't extend it on either side (e.g. "0412" matches April 12 inside "50412" but not inside "40412").
- **Full v2.0.0 games system** — games/ collection, weekly/monthly/quarterly periods, per-game leaderboard, ChampionsTab, GameSelectScreen, CreateGameModal, JoinGameModal, ProfileSheet My Games section.
- **Welcome / Terms modal** — shown on first visit or version upgrade; includes changelog and Terms of Use.
- **Hall of Champions** — tracks Top Score 🏆 and Most Finds 📸 per period per game.
- **Palindrome scoring** — 5+ digit palindromes score 60 pts.
- **Run-based N-of-a-kind** — consecutive digit runs required (e.g. 1011 is not Three of a Kind; 10111 is).
- **Two Pair count-based** — position-independent (1212 correctly scores as Two Pair).
- **Hall of Fame expanded** — 23 entries.
- **PWA icon** — clocktzee.jpg (1024×1024), manifest.json, apple-touch-icon meta tags.

---

## 🐛 Still Open

- *(No known open bugs as of v2.1.1)*

---

## ✏️ Improvements Queued

- **Period reset — live test needed** — confirm weekly reset fires correctly at Monday 4:00 AM CST. Champions doc written, `ctz_last_period_<gameId>` localStorage key drives detection. Has not been verified against a real period boundary.

---

## ✅ Confirmed Working (live testing)

- Join flow (join code entry, `arrayUnion` into game members)
- Image upload, compression, 48h expiry
- Reactions on feed cards
- Feed delete (admin)
- Player data protection (dirty flags retired; `players/` collection is source of truth)
- Session restore from `ctz_player_id` (cache-first, Firestore background)
- Game auto-select from `ctz_active_game` on return
- ProfileSheet My Games, Switch Game
- Score preview (live as digits typed)
- Confetti on personal best
- Streak detection (5-day)
- Hall of Fame bonus (+40)
- Period-scoped duplicate submission check

---

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

### Step 2 — seed player fields ✅ DONE (2026-04-19)
Ran `seed-player-fields.js`. Each player doc now has: `id`, `name`, `emoji`, `color`, `isAdmin`, `birthday`, `theme`.
- `isAdmin: true` — jason only
- `birthday` — pulled from `settings/birthdays` (all 6 had entries, including Mattie: July 31)
- `theme: 'dark'` — all players

### Step 3 — App.jsx rebuild ✅ DONE (2026-04-25)
`players/` collection is the single source of truth via live `onSnapshot`. Settings dirty-flag pattern retired for player data. Birthday, isAdmin, and theme all read from player docs.

---

## 📅 Status: Live — v2.1.1 (May 2026)
