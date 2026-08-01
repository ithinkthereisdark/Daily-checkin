# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A WeChat Mini Program (微信小程序) "花椒点点" for task-driven daily check-in (每日打卡) plus personal accounting (记账), built on WeChat Cloud Development (微信云开发). Two-person private app — all data is filtered by `nickName` from `app.globalData.nickName`. Users create tasks with emoji icons, date ranges, and target counts; the check-in page shows all tasks with one-tap check-in toggle and long-press backfill (补打).

## Tech stack

- **WeChat Mini Program** (native framework, no third-party UI library)
- **WeChat Cloud Base** (云开发): Cloud Database + Cloud Storage
- One cloud function: `cloudfunctions/audioTrim` (Node.js + bundled ffmpeg binary)
- Base library version: 3.16.0 (see `project.private.config.json`)

## Architecture

```
miniprogram/
  app.js              ← Cloud init, nickname management (storage key 'nickName', default '无名')
  app.json            ← 10 pages, 4-tab tabBar (打卡/记账/记录/小工具)
  app.wxss            ← Global styles
  utils/
    db.js             ← getAll(): cursor-paginated fetch-all helper (see below)
    emoji.js          ← PRESET_EMOJIS / PRESET_CATEGORIES + per-user seeders
  pages/
    checkin/          ← Tab 1: task grid + inline task CRUD + backfill + celebration
    accounting/       ← Tab 2: month ledger view, grouped by date
      add/            ←   Transaction form: calculator input, category picker
      stats/          ←   Canvas 2D donut/bar charts, month picker
    history/          ← Tab 3: day timeline + month calendar views (read-only)
    detail/           ← Non-tab: detailed check-in form (needDetail / backfill)
    tools/            ← Tab 4: tool list (audio trim)
      audio-trim/     ←   Upload → call audioTrim cloud function → preview result
    emoji-manager/    ← Non-tab: manage personal emoji library
    category-manager/ ← Non-tab: manage accounting categories
```

Note: the old `pages/tasks/` (Tab 2 管理) no longer exists — task CRUD moved into the checkin page itself (inline form via `showNewForm`/`editingId` state).

## Cross-cutting patterns (read these before editing pages)

- **`getAll()` pagination** (`utils/db.js`): the mini-program client query limit is 20 docs. Every page that needs full collections uses `getAll((limit) => db.collection(...).where(...).orderBy('_id', 'desc').limit(limit))`. Contract: the queryFn must end with `.orderBy('_id', 'desc').limit(limit)` — getAll appends `where({ _id: _.lt(lastId) })` for subsequent pages and walks until a short page. Returns newest-first flat array. Do not use `.skip()`/`.limit()` alone for full reads.
- **Per-user seeding** (`utils/emoji.js`): `ensureEmojiLibrary(nickName)` and `ensureCategories(nickName)` lazily seed `emoji_library` / `categories` with presets on a user's first use (check `limit(1).get()`), then return the user's full list via `getAll()`. On error they fall back to the preset arrays. Call these before any page that needs emoji/category data; do not duplicate the preset lists elsewhere.
- **`-502005` = collection not yet created**: reads on a never-written collection throw this errCode. Accounting pages handle it by auto-creating a default ledger (账本) or showing an empty state — keep that handling when adding reads on new collections.
- **Backward compat for checkin images**: `checkins` now stores `images` (array of cloud fileIDs); legacy docs have a single `image` string. Everywhere images are displayed the fallback is `c.images && c.images.length ? c.images : (c.image ? [c.image] : [])` — keep this pattern.
- **Money rounding**: all amounts are `Math.round(x * 100) / 100` (2 decimals) at write and summary time.

## Data model

Dates are stored as `YYYY-MM-DD` strings for direct string comparison. All queries filter by `nickName`.

| Collection | Fields |
|-----------|--------|
| `tasks` | name, emoji, startDate, endDate, targetCount, needDetail, nickName, createTime |
| `checkins` | taskId, date, nickName, description, images (array, cloud fileIDs), isBackfill, createTime |
| `ledgers` | name, emoji, isDefault, nickName, createTime — accounting books (账本) |
| `transactions` | ledgerId, type (`income`/`expense`), category, categoryEmoji, amount, date, description, nickName, createTime |
| `categories` | name, emoji, type, isPreset, nickName, createTime — seeded from PRESET_CATEGORIES |
| `emoji_library` | emoji, nickName, createTime — seeded from PRESET_EMOJIS |

Legacy `records` and `expenses` collections are not referenced by any code — do not use them.

## Key flows

- **Check-in toggle** (checkin page): tap a card → if `needDetail=false`, add a checkin for today or delete it to cancel; if `needDetail=true`, navigate to `detail?taskId=`. Guards: not-started/expired tasks toast and return; hitting `targetCount` blocks new check-ins but allows cancelling today's. After every mutation `loadData()` refetches (tasks limit 100 + all checkins via getAll + today's checkins) and merges into `checkedInToday`/`checkinCount`; when all active tasks are done, a paw-print (🐾) Canvas celebration plays.
- **Backfill (补打)**: long-press an active task card → date picker → creates a checkin for that date with `isBackfill: true` (duplicate per taskId+date blocked). For `needDetail` tasks it goes to `detail?taskId=&date=YYYY-MM-DD`. The history month view shows an isBackfill badge; backfill is only offered from the checkin page.
- **Task lifecycle**: `startDate` → active → `endDate` (expired tasks greyed and sorted to the bottom of the grid). Deleting a task cascade-deletes its checkins (fetch by taskId via getAll, remove each, then remove the task).
- **Detail page**: shows an existing checkin for (taskId, date) if present → update mode; otherwise creates one. Uploads new images to `checkins/` cloud storage (MAX_IMAGES = 3), keeps already-uploaded `cloud://` fileIDs, guards expired/not-started dates.
- **Client-side joining**: history and checkin pages fetch tasks + all checkins and join on `taskId` in the client (taskMap pattern). History has a day timeline (grouped by date) and a month calendar view (per-day all/partial/none state computed from checkins ∩ active tasks on that date).
- **Accounting**: month-scoped query on `transactions` (`.where({ ledgerId, date: _.gte(monthStart).and(_.lte(monthEnd)) })`); `lastLedgerId` persisted in storage to restore the last-used ledger; a default ledger is auto-created when `ledgers` is empty. The add page uses a calculator-style expression evaluator (only `+`/`-`, `evaluate()` in add.js). Stats draws charts with Canvas 2D nodes (`type="2d"`, selector query `#trendCanvas`/`#pieCanvas`).
- **audioTrim cloud function**: client uploads the file to `audio-trim/input/`, calls `wx.cloud.callFunction({ name: 'audioTrim', data: { fileID, startTime, endTime, fileName } })`, and downloads the returned `fileID`. The function bundles a static ffmpeg binary, copies it to `/tmp` and chmods +x (the code dir is read-only), trims via stream-copy with a re-encode fallback, uploads to `audio-trim/output/`, and cleans up temp files. The client deletes the input file best-effort.

## Cloud environment

- **Env ID**: `cloud1-d3geah2hy20028cb5` (hardcoded in `app.js`; the cloud function uses `cloud.DYNAMIC_CURRENT_ENV`)
- Collections are auto-created on first write — no manual setup needed
- Cloud function must be deployed from WeChat DevTools (right-click cloudfunctions/audioTrim → 上传并部署) after any change

## Development

- Open project root in **WeChat DevTools** (微信开发者工具) — no build commands, no tests, manual testing only
- Emoji pickers and category pickers across pages all read from the shared per-user libraries (`utils/emoji.js`), not hardcoded lists
