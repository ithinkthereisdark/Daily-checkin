# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A WeChat Mini Program (微信小程序) "花椒点点" for task-driven daily check-in (每日打卡) plus personal accounting (记账), built on WeChat Cloud Development (微信云开发). Two-person private app — all data is filtered by `nickName` from `app.globalData.nickName`. Users create tasks with emoji icons, date ranges, and target counts; the check-in page shows all tasks with one-tap check-in toggle and long-press backfill (补打). Points system (积分) rewards check-ins/accounting with crit surprises; the wishlist (心愿单) is the redemption loop: one person adds a wish, the other prices it in points, the wisher redeems (deducting points) and a pickup voucher code is shown to both, then provider ships and wisher receives to complete.

## Tech stack

- **WeChat Mini Program** (native framework, no third-party UI library)
- **WeChat Cloud Base** (云开发): Cloud Database + Cloud Storage
- One cloud function: `cloudfunctions/audioTrim` (Node.js + bundled ffmpeg binary)
- Base library version: 3.16.0 (see `project.private.config.json`)

## Architecture

```
miniprogram/
  app.js              ← Cloud init, nickname management (storage key 'nickName', default '无名')
  app.json            ← 13 pages, 4-tab tabBar (打卡/记录/记账/积分)
  app.wxss            ← Global styles
  utils/
    db.js             ← getAll(): cursor-paginated fetch-all helper (see below)
    emoji.js          ← PRESET_EMOJIS / PRESET_CATEGORIES + per-user seeders
    points.js         ← 积分规则：加减分/暴击/完成奖励/撤销/补偿/兑换扣分 + ACTION_META
    wishes.js         ← 心愿单 + 核销状态机、权限纯函数（canPrice/canRedeem/...）、凭证码
  pages/
    checkin/          ← Tab 1: task grid + inline task CRUD + backfill + celebration
    history/          ← Tab 2: day timeline + month calendar views (read-only)
    accounting/       ← Tab 3: month ledger view, grouped by date
      add/            ←   Transaction form: calculator input, category picker
      stats/          ←   Canvas 2D donut/bar charts, month picker
    points/           ← Tab 4: points balance + date-grouped ledger; header 双卡片 = 积分 + 心愿单入口
    detail/           ← Non-tab: detailed check-in form (needDetail / backfill)
    wishlist/         ← Non-tab: 心愿单主页（统计卡/进行中核销/对方的心愿/自己的心愿/历史；长按自己的心愿进编辑）
      add/            ←   添加/编辑心愿表单（编辑模式由 ?id= 进入，可删除，保存后清空定价）
    tools/            ← Non-tab: tool list (audio trim; 已移出 tabBar，保留注册)
      audio-trim/     ←   Upload → call audioTrim cloud function → preview result
    emoji-manager/    ← Non-tab: manage personal emoji library
    category-manager/ ← Non-tab: manage accounting categories
```

Note: the old `pages/tasks/` (Tab 2 管理) no longer exists — task CRUD moved into the checkin page itself (inline form via `showNewForm`/`editingId` state).

## Cross-cutting patterns (read these before editing pages)

- **`getAll()` pagination** (`utils/db.js`): the mini-program client query limit is 20 docs. Every page that needs full collections uses `getAll((limit) => db.collection(...).where(...).orderBy('_id', 'desc').limit(limit))`. Contract: the queryFn must end with `.orderBy('_id', 'desc').limit(limit)` — getAll appends `where({ _id: _.lt(lastId) })` for subsequent pages and walks until a short page. Returns newest-first flat array. Do not use `.skip()`/`.limit()` alone for full reads.
- **Per-user seeding** (`utils/emoji.js`): `ensureEmojiLibrary(nickName)` and `ensureCategories(nickName)` lazily seed `emoji_library` / `categories` with presets on a user's first use (check `limit(1).get()`), then return the user's full list via `getAll()`. On error they fall back to the preset arrays. Call these before any page that needs emoji/category data; do not duplicate the preset lists elsewhere.
- **`-502005` = collection not yet created**: reads on a never-written collection throw this errCode. Every read of a new collection must catch it → `[]` (see `fetchWishes`/`fetchRedemptions` in `utils/wishes.js`, `fetchRecords` in points page). Note: the client-side `add()` does **not** auto-create collections — new collections must be created manually in the CloudBase console (see Cloud environment).
- **Wishlist permission model** (`utils/wishes.js`): roles are derived, never stored — `wish.nickName` is the wisher, the other user is the provider (`redeemer !== me`). All buttons render through `canPrice`/`canRedeem`/`canShip`/`canReceive`/`canCancel` pure functions; unmatched users simply never see the button. `redemptions` stores `wishNickName`/`redeemer` redundantly so history rows survive wish deletion.
- **Class-name collisions bite**: two buttons with the same class (`.delete-btn` for image-grid ✕ vs the wish-delete button) merge CSS declarations — the wish-delete button inherited `position: absolute; top/right: 6rpx` from the image one and flew to the page corner. Use distinct class names (`delete-wish-btn`).
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
| `points_records` | nickName, action (`checkin`/`accounting`/`task_complete`/`crit`/`revoke`/`compensation`/`redeem`), actionId (来源文档 _id，task_complete 时是 taskId), points (+/-), date, note, createTime — 积分流水，余额 = 求和 |
| `wishes` | nickName(提出者), title, description, points (Number\|null；null=未定价，编辑保存后清空需重新定价), status (`open`/`redeemed`), createTime — 心愿单（无图片：云存储仅创建者可读写，对方看不到，已移除图片功能；历史 docs 可能残留 images 字段，忽略即可） |
| `redemptions` | wishId, wishTitle, wishPoints, wishNickName, redeemer (恒=心愿提出者), code (取货凭证码), status (`pending`/`shipped`/`received`/`cancelled`), createTime, shipTime, receiveTime, cancelTime — 核销单；提供者 = 非 redeemer 的一方 |

Legacy `records` and `expenses` collections are not referenced by any code — do not use them.

## Key flows

- **Check-in toggle** (checkin page): tap a card → if `needDetail=false`, add a checkin for today or delete it to cancel; if `needDetail=true`, navigate to `detail?taskId=`. Guards: not-started/expired tasks toast and return; hitting `targetCount` blocks new check-ins but allows cancelling today's. After every mutation `loadData()` refetches (tasks limit 100 + all checkins via getAll + today's checkins) and merges into `checkedInToday`/`checkinCount`; when all active tasks are done, a paw-print (🐾) Canvas celebration plays.
- **Backfill (补打)**: long-press an active task card → date picker → creates a checkin for that date with `isBackfill: true` (duplicate per taskId+date blocked). For `needDetail` tasks it goes to `detail?taskId=&date=YYYY-MM-DD`. The history month view shows an isBackfill badge; backfill is only offered from the checkin page.
- **Task lifecycle**: `startDate` → active → `endDate` (expired tasks greyed and sorted to the bottom of the grid). Deleting a task cascade-deletes its checkins (fetch by taskId via getAll, remove each, then remove the task).
- **Detail page**: shows an existing checkin for (taskId, date) if present → update mode; otherwise creates one. Uploads new images to `checkins/` cloud storage (MAX_IMAGES = 3), keeps already-uploaded `cloud://` fileIDs, guards expired/not-started dates.
- **Client-side joining**: history and checkin pages fetch tasks + all checkins and join on `taskId` in the client (taskMap pattern). History has a day timeline (grouped by date) and a month calendar view (per-day all/partial/none state computed from checkins ∩ active tasks on that date).
- **Accounting**: month-scoped query on `transactions` (`.where({ ledgerId, date: _.gte(monthStart).and(_.lte(monthEnd)) })`); `lastLedgerId` persisted in storage to restore the last-used ledger; a default ledger is auto-created when `ledgers` is empty. The add page uses a calculator-style expression evaluator (only `+`/`-`, `evaluate()` in add.js). Stats draws charts with Canvas 2D nodes (`type="2d"`, selector query `#trendCanvas`/`#pieCanvas`).
- **Points (utils/points.js)**: 打卡 +1、记账 +1、暴击互斥掷骰（10%→+3，5%→+5，另记一条 crit）；任务完成奖励 = 打卡天数（含补打）首次达 targetCount 时一次性 +天数×1（幂等，计数口径与打卡页一致）；补打单次 0 分；取消/删除按 actionId 求和精确扣回（旧数据自动跳过）；删任务时级联撤回其全部积分。积分页首次加载时自动执行历史补偿（无积分记录的旧打卡/记账打包为一条 `compensation` 记录，每人一次，幂等）。兑换扣分用 `awardRedeem(redemptionId, nickName, points, date, note)`——写 `action:'redeem'` 负分记录，**不吞错**（返回真实 promise，供核销失败回滚感知），与 `awardCheckin` 的 fire-and-forget 语义不同。
- **Wishlist & redemption (utils/wishes.js + wishlist pages)**: A 添加心愿（仅标题/描述，无图片——云存储仅创建者可读写，跨用户图片不可见，已移除图片功能）→ 只有 B 可定价/改价（`canPrice`，`wx.showModal editable` 定价，content 必须为空、提示放 placeholderText——editable 模式下 content 会预填进输入框）→ A 核销（`redeemWish`：先建 redemptions(pending+凭证码) → wish 置 `redeemed` 锁死防重复 → `awardRedeem` 扣分；扣分失败自动回滚单+cancelled、心愿回 open）→ B 发货（`canShip`）→ A 收货（`canReceive`）完成；pending 阶段 A 可取消（`cancelRedemption`：单置 cancelled + 心愿回 open + `revokeByActionId` 退分）。凭证码 `genCode()`（时间戳36进制+4位随机）pending 起双方可见。一个心愿至多一条非终态核销单，可有多条历史单。**编辑心愿**：长按自己的心愿卡 → `add?id=` 编辑模式，保存修改会清空 `points`（需对方重新定价），删除仅 `open` 状态可删。积分页头部双卡片：右卡 = 心愿总数 + 待定价/待发货统计，点击跳转 wishlist 页。
- **Wishlist pages structure**: `wishlist` 主页四分区——🔔 进行中核销（凭证码 + 发货/收货/取消按钮）、💝 对方的心愿（定价/改价）、🎁 自己的心愿（核销/长按编辑，`+ 添加` 恒可见）、📜 历史（终态核销单，标题后带提出者小字昵称）。两个心愿分区**始终显示**（空时虚线占位提示），进行中/历史空则隐藏。顶部统计卡 + 右上角手动刷新按钮（静默 `loadData(true)`）。所有 mutation 经 `runBusy()` 串行锁防连点。
- **audioTrim cloud function**: client uploads the file to `audio-trim/input/`, calls `wx.cloud.callFunction({ name: 'audioTrim', data: { fileID, startTime, endTime, fileName } })`, and downloads the returned `fileID`. The function bundles a static ffmpeg binary, copies it to `/tmp` and chmods +x (the code dir is read-only), trims via stream-copy with a re-encode fallback, uploads to `audio-trim/output/`, and cleans up temp files. The client deletes the input file best-effort.

## Cloud environment

- **Env ID**: `cloud1-d3geah2hy20028cb5` (hardcoded in `app.js`; the cloud function uses `cloud.DYNAMIC_CURRENT_ENV`)
- **Collections must be created manually in the CloudBase console** — the client-side `add()` does NOT auto-create them (reads on missing collections throw `-502005`). Permission rules per collection:
  - `仅创建者可读写`: tasks / checkins / ledgers / transactions / categories / emoji_library / points_records (single-user data, filtered by nickName)
  - `所有用户可读写`: **wishes / redemptions** (cross-user collaboration — the partner must read AND update the other user's docs: pricing, ship/receive status transitions)
- Cloud function must be deployed from WeChat DevTools (right-click cloudfunctions/audioTrim → 上传并部署) after any change

## Development

- Open project root in **WeChat DevTools** (微信开发者工具) — no build commands, no tests, manual testing only
- Emoji pickers and category pickers across pages all read from the shared per-user libraries (`utils/emoji.js`), not hardcoded lists
