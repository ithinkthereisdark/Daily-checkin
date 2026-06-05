# 补打功能设计

**日期**: 2026-06-05
**状态**: 已确认

## 概述

打

卡页面增加补打功能：长按任务卡片弹出日期选择器，选择过去某一未打卡的日期进行补打。同时在记录页日视图增加删除功能，可删除任意一天的打卡记录。

## 交互流程

### 打卡页 — 补打

1. 用户**长按**任务卡片
2. 弹出微信原生 `picker mode="date"` 日期选择器
3. 日期范围：`task.startDate` ~ `today()`（今天）。微信原生 picker 不支持禁用单日，因此在用户选完日期后，通过 DB 查询校验该日期是否已打卡。
4. 若选中日期已打卡，toast 提示"此日期已打卡"，不执行后续操作。
5. 若日期可用：
   - `needDetail = false`：直接创建一条空打卡记录（和快速打卡一样），日期为选中日期
   - `needDetail = true`：跳转到详情页 `/pages/detail/detail?taskId=xxx&date=yyyy-MM-dd`，日期预填为选中日期

### 详情页 — 支持指定日期

- URL 新增可选参数 `date`
- 如果传入 `date`，详情页使用该日期替代"今天"
- 根据 `taskId + date + nickName` 查询该日期的已有记录（支持更新）
- 提交时使用指定日期

### 记录页日视图 — 删除打卡

- 日视图中每条打卡记录支持**长按删除**
- 弹出确认弹窗："确定删除这条打卡记录吗？"
- 确认后从 `checkins` 集合删除该记录

## 关键约束

| 约束 | 处理 |
|------|------|
| 日期范围 | `task.startDate` ~ `today` |
| 已打卡日期 | 选中后 DB 查询校验，已存在则 toast "此日期已打卡" |
| 目标次数 | 受 `targetCount` 限制，超出提示"已达成目标次数" |
| 过期任务 | 不可补打（`task.endDate < today`） |
| 未开始任务 | 不可补打（`task.startDate > today`） |

## 数据模型

无新增集合，`checkins` 集合结构不变。

## 变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `pages/checkin/checkin.js` | 长按补打逻辑：日期选择器 + 创建记录 |
| 修改 | `pages/checkin/checkin.wxml` | 任务卡片加 `bindlongpress` |
| 修改 | `pages/detail/detail.js` | 支持 `date` 参数替代默认的 `todayStr()` |
| 修改 | `pages/history/history.js` | 日视图长按删除打卡记录 |
| 修改 | `pages/history/history.wxml` | 日视图打卡项加 `bindlongpress` |

## 边界情况

- **同一天补打两次**：detail 页面会检测到已有记录并进入更新模式
- **补打后被取消**：通过记录页删除功能可以删除任意补打记录
- **任务删除后**：任务卡消失，不存在补打入口
- **网络异常**：打卡创建失败时 toast 提示，不影响已有数据
