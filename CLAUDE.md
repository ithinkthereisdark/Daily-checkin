# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A WeChat Mini Program (微信小程序) for task-driven daily check-in ("每日打卡"), built on WeChat Cloud Development (微信云开发). Users create tasks with emoji icons, date ranges, and target counts; the home grid shows all tasks with one-tap check-in toggle. Two-person private app — all data is filtered by nickname.

## Tech stack

- **WeChat Mini Program** (native framework, no third-party UI library)
- **WeChat Cloud Base** (云开发): Cloud Database + Cloud Storage, no cloud functions
- Base library version: 3.16.0 (see `project.private.config.json`)

## Architecture

```
miniprogram/
  app.js              ← Cloud init, nickname management
  app.json            ← 4 pages, 3-tab tabBar (打卡/管理/记录)
  app.wxss            ← Global styles
  pages/
    checkin/          ← Tab 1: task card grid, one-tap check-in toggle
    tasks/            ← Tab 2: task CRUD (name, emoji picker, date range, target, detail toggle)
    history/          ← Tab 3: check-in timeline grouped by date (read-only)
    detail/           ← Non-tab: detailed check-in form (navigated from checkin for needDetail tasks)
```

## Data model

| Collection | Fields |
|-----------|--------|
| `tasks` | name, emoji, startDate, endDate, targetCount, needDetail, nickName, createTime |
| `checkins` | taskId, date (YYYY-MM-DD), nickName, description, image, createTime |

Dates are stored as YYYY-MM-DD strings for simple comparison. All queries filter by `nickName` from `app.globalData.nickName`.

## Key flows

- **Check-in toggle**: Tap a task card → if `needDetail=false`, creates a checkin for today (or deletes existing one to cancel). If `needDetail=true`, navigates to detail page. Expired/future tasks are guarded.
- **Task lifecycle**: `startDate` (task begins) → active period → `endDate` (task expires, greyed out, bottom of grid). `targetCount` is the check-in ceiling — hitting it blocks new check-ins but allows cancelling today's.
- **Client-side joining**: History page fetches all tasks + all checkins, builds a taskMap, groups checkins by date. Same pattern is used by checkin page for counting.

## Cloud environment

- **Env ID**: `cloud1-d3geah2hy20028cb5` (hardcoded in `app.js`)
- Collections are auto-created on first write — no manual setup needed
- The old `records` collection from the previous version is kept but unused

## Development

- Open project root in **WeChat DevTools** (微信开发者工具)
- No build commands or test infrastructure
- Cloud functions directory (`cloudfunctions/`) is configured but empty
