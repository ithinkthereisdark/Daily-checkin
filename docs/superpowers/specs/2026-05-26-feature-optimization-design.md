# 功能优化设计文档

**日期**：2026-05-26  
**状态**：待实现

---

## 概述

四个功能优化 + 一个样式修复：

1. **记账统计页** — 独立页面，趋势图 + 分类排行 + 饼图
2. **打卡月视图** — 历史页日历网格，三状态展示
3. **自定义分类** — 记账分类支持用户新增
4. **庆祝动画** — 全部完成时猫爪印飘落
5. **图标替换** — 用户自行处理，不纳入本次

---

## 技术方案

### 图表库：echarts-for-weixin

引入 `echarts-for-weixin` 组件处理趋势柱状图和饼图。排行榜用纯列表。

### 月历：手写 7 列 grid

CSS Grid 渲染，三种状态（无打卡 / 部分 / 全部完成），点击日期展开当天详情。

### 庆祝动画：Canvas 2D

全屏 canvas overlay，requestAnimationFrame 驱动 🐾 飘落，~2.5 秒。

### 自定义分类：云数据库

新增 `categories` 集合，字段：name, emoji, type(income/expense), nickName, createTime。加载时合并系统预置 + 用户自定义。

---

## 文件变更

```
新增:
  miniprogram/pages/accounting/stats/stats.js
  miniprogram/pages/accounting/stats/stats.json
  miniprogram/pages/accounting/stats/stats.wxml
  miniprogram/pages/accounting/stats/stats.wxss
  miniprogram/components/ec-canvas/          (echarts-for-weixin)

修改:
  miniprogram/pages/history/history.{js,wxml,wxss}      — 加月历视图
  miniprogram/pages/accounting/accounting.{js,wxml,wxss}  — 加统计入口按钮
  miniprogram/pages/accounting/add/add.{js,wxml,wxss}     — 加自定义分类
  miniprogram/pages/checkin/checkin.{js,wxml,wxss}        — 加庆祝动画
```

`app.json` 无需修改。

---

## 功能设计

### 1. 记账统计页

**入口**：记账页悬浮按钮区，和「+」记账按钮并排。

**页面结构**（从上到下）：
- 导航栏：返回 + 标题 + 账本名
- 当月汇总条：收入 / 支出 / 结余
- 时间范围切换：[当月] [季度] [半年] [全年]
- 收支趋势柱状图（echarts）：X 轴月份，Y 轴金额，绿色收入 / 红色支出并排
- 分类排行榜列表：按金额降序，显示 emoji + 名称 + 金额 + 占比条
- 分类占比饼图（echarts）

**数据查询**：transactions 集合，按 ledgerId + nickName + 时间范围过滤，前端聚合。

**时间范围定义**：
- 当月：本月1日至今日
- 季度：近3个月（当前月在内）
- 半年：近6个月
- 全年：近12个月

### 2. 打卡月视图

**位置**：历史页，顶部加「日/月」切换标签。

**月历网格**：
- 月份选择器：左右箭头切换月份
- 7 列表头：日一二三四五六
- 日期格子：5-6 行，按当月天数和首日周几自动排列
- 三状态颜色：
  - 无打卡：灰色/留白
  - 部分完成：橙色半透明
  - 全部完成：橙色实心

**交互**：
- 点击日期格子 → 下方展示该日打卡列表
- 未来日期不可点击
- 日视图保持原有逻辑不变

**数据**：复用现有 tasks + checkins 查询。

### 3. 自定义分类

**入口**：add 页分类选择区最后一个格子「+ 新增」

**弹窗**：底部 sheet，含 emoji 选择 grid + 名称输入框 + 确定/取消

**数据模型**：`categories` 集合
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 分类名称 |
| emoji | string | 分类图标 |
| type | string | income / expense |
| nickName | string | 创建者 |
| createTime | date | 创建时间 |

**加载逻辑**：系统预置 + `categories.where({ nickName })` 合并

**删除**：长按自定义分类 → 确认后删除（已有记录不受影响）

### 4. 庆祝动画

**触发**：打卡操作成功后，检测所有当天活跃任务是否全部完成。仅在完成最后一个任务时触发。

**实现**：
- 全屏 Canvas 2D overlay，默认隐藏
- `showCelebration: true` 时显示
- 每帧 15-20 个 🐾，从屏幕上方随机掉落
- 随机属性：X 位置、大小(20-40rpx)、透明度、速度、左右摆动
- ~2.5 秒后自动淡出隐藏
- `requestAnimationFrame` 在动画结束后清理

---

## 数据流

```
统计页:  accounting → stats.js
         read transactions (filter by ledgerId, date range)
         → aggregate by month (trend) + category (ranking/pie)
         → render echarts

月视图:  history.js
         read tasks + checkins (existing query)
         → build calendarMap: { "YYYY-MM-DD": { total, done } }
         → render grid

自定义分类:
         add.js → read categories + system presets → merge → render grid
         add.js → write categories (on create)

庆祝动画:
         checkin.js → create checkin → check all-done → show canvas → hide after 2.5s
```
