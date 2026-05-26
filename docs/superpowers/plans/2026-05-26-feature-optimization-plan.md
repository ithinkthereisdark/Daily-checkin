# 功能优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现记账统计页（Canvas图表 + 分类排行）、打卡月视图、自定义分类、庆祝动画四个功能优化。

**Architecture:** 新建 stats 统计页（4文件），修改 history（加月历模式）、accounting（加统计入口）、add（加自定义分类）、checkin（加庆祝动画）四个现有页面。图表使用小程序原生 Canvas 2D API（轻量无需引入 echarts 依赖）。

**Tech Stack:** WeChat Mini Program 原生框架，无第三方依赖。WeChat Cloud Base（云数据库）。

**Design Doc:** `docs/superpowers/specs/2026-05-26-feature-optimization-design.md`

---
## File Structure

```
新增:
  miniprogram/pages/accounting/stats/stats.js    — 统计数据查询/聚合/Canvas绑定
  miniprogram/pages/accounting/stats/stats.json  — 页面配置（无组件依赖）
  miniprogram/pages/accounting/stats/stats.wxml  — 布局：汇总条+时间切换+Canvas+排行
  miniprogram/pages/accounting/stats/stats.wxss  — 统计页样式

修改:
  miniprogram/pages/history/history.js           — 加 viewMode + calendarMap + switchView + tapDate
  miniprogram/pages/history/history.wxml         — 加日/月切换标签 + 月历grid + 日期详情
  miniprogram/pages/history/history.wxss         — 加月历相关样式
  miniprogram/pages/accounting/accounting.wxml   — FAB改为两个并排按钮
  miniprogram/pages/accounting/accounting.wxss   — FAB组样式
  miniprogram/pages/accounting/accounting.js     — 加 goStats 导航
  miniprogram/pages/accounting/add/add.js        — 加自定义分类数据层
  miniprogram/pages/accounting/add/add.wxml      — 加「+ 新增」入口 + 弹窗
  miniprogram/pages/accounting/add/add.wxss      — 加弹窗相关样式
  miniprogram/pages/checkin/checkin.js           — 加庆祝触发检测 + Canvas动画
  miniprogram/pages/checkin/checkin.wxml         — 加 Canvas overlay
  miniprogram/pages/checkin/checkin.wxss         — 加 Canvas overlay 样式
  miniprogram/app.json                            — stats 页面注册
```

---

### Task 1: 创建统计页骨架文件

**Files:**
- Create: `miniprogram/pages/accounting/stats/stats.json`
- Create: `miniprogram/pages/accounting/stats/stats.wxml`
- Create: `miniprogram/pages/accounting/stats/stats.js`
- Create: `miniprogram/pages/accounting/stats/stats.wxss`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 创建 stats.json**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "统计"
}
```

- [ ] **Step 2: 创建 stats.wxml 骨架**

```html
<view class="page">
  <!-- Top Bar -->
  <view class="top-bar">
    <view class="top-row1">
      <text>{{currentLedger.emoji}} {{currentLedger.name}}</text>
    </view>
    <view class="top-row2">
      <view class="summary">
        <view class="summary-item">
          <text class="summary-label">收入</text>
          <text class="summary-value income">¥{{totalIncome}}</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">支出</text>
          <text class="summary-value expense">¥{{totalExpense}}</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">结余</text>
          <text class="summary-value">¥{{totalBalance}}</text>
        </view>
      </view>
    </view>
  </view>

  <!-- Time Range Tabs -->
  <view class="range-tabs">
    <view
      class="range-tab {{range === 'month' ? 'active' : ''}}"
      data-range="month" bindtap="switchRange">当月</view>
    <view
      class="range-tab {{range === 'quarter' ? 'active' : ''}}"
      data-range="quarter" bindtap="switchRange">季度</view>
    <view
      class="range-tab {{range === 'half' ? 'active' : ''}}"
      data-range="half" bindtap="switchRange">半年</view>
    <view
      class="range-tab {{range === 'year' ? 'active' : ''}}"
      data-range="year" bindtap="switchRange">全年</view>
  </view>

  <scroll-view scroll-y class="main-scroll">
    <!-- Trend Bar Chart -->
    <view class="section">
      <text class="section-title">📊 收支趋势</text>
      <canvas type="2d" id="trendCanvas" class="chart-canvas bar-chart"></canvas>
    </view>

    <!-- Category Ranking -->
    <view class="section">
      <text class="section-title">{{rankType === 'expense' ? '📉' : '📈'}} 分类排行</text>
      <view class="rank-toggle">
        <view
          class="rank-tab {{rankType === 'expense' ? 'active' : ''}}"
          data-type="expense" bindtap="switchRankType">支出</view>
        <view
          class="rank-tab {{rankType === 'income' ? 'active' : ''}}"
          data-type="income" bindtap="switchRankType">收入</view>
      </view>
      <view class="rank-list">
        <view class="rank-item" wx:for="{{rankList}}" wx:key="category">
          <text class="rank-emoji">{{item.emoji}}</text>
          <text class="rank-name">{{item.category}}</text>
          <view class="rank-bar-wrap">
            <view class="rank-bar" style="width: {{item.percent}}%"></view>
          </view>
          <text class="rank-amount">¥{{item.amount}}</text>
        </view>
        <view wx:if="{{rankList.length === 0}}" class="rank-empty">暂无数据</view>
      </view>
    </view>

    <!-- Pie Chart -->
    <view class="section">
      <text class="section-title">🍕 分类占比</text>
      <view class="pie-wrap">
        <canvas type="2d" id="pieCanvas" class="chart-canvas pie-chart"></canvas>
        <view class="pie-legend" wx:if="{{pieData.length > 0}}">
          <view class="legend-item" wx:for="{{pieData}}" wx:key="category" wx:for-item="p">
            <view class="legend-dot" style="background: {{p.color}}"></view>
            <text class="legend-name">{{p.category}}</text>
            <text class="legend-pct">{{p.percent}}%</text>
          </view>
        </view>
      </view>
    </view>

    <view class="scroll-bottom"></view>
  </scroll-view>
</view>
```

- [ ] **Step 3: 创建 stats.js 骨架**

```js
const db = wx.cloud.database();
const app = getApp();
const _ = db.command;

Page({
  data: {
    currentLedger: null,
    range: 'month',
    dateStart: '',
    dateEnd: '',
    totalIncome: 0,
    totalExpense: 0,
    totalBalance: 0,
    rankType: 'expense',
    rankList: [],
    pieData: [],
    trendMonths: [],
    trendData: []
  },

  onLoad(options) {
    const ledgerId = options.ledgerId || '';
    const nickName = app.globalData.nickName;
    db.collection('ledgers').where({ nickName }).orderBy('createTime', 'asc').get()
      .then(res => {
        const ledgers = res.data;
        let ledger = ledgers[0];
        if (ledgerId) {
          const found = ledgers.find(l => l._id === ledgerId);
          if (found) ledger = found;
        }
        if (ledger) {
          this.setData({ currentLedger: ledger });
          this.loadData();
        }
      })
      .catch(err => {
        console.error('Load ledger failed:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.loadData();
  },

  switchRankType(e) {
    this.setData({ rankType: e.currentTarget.dataset.type });
    this.buildRankList();
  },

  loadData() {
    // Step 4 fills this in
  },

  buildRankList() {
    // Step 5 fills this in
  },

  drawTrendChart() {
    // Step 6 fills this in
  },

  drawPieChart() {
    // Step 7 fills this in
  }
});
```

- [ ] **Step 4: 创建 stats.wxss 骨架**

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #FFF5EC;
}

.top-bar {
  background: #FFFBF7;
  flex-shrink: 0;
  box-shadow: 0 2rpx 12rpx rgba(180,140,120,0.06);
  padding: 16rpx 24rpx 14rpx;
}

.top-row1 {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 700;
  color: #5D4037;
  padding: 4rpx 0 12rpx;
}

.top-row2 {
  display: flex;
}

.summary {
  display: flex;
  flex: 1;
  justify-content: space-around;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.summary-label {
  font-size: 22rpx;
  color: #8D7B72;
  font-weight: 500;
}

.summary-value {
  font-size: 30rpx;
  font-weight: 700;
  color: #5D4037;
}

.summary-value.income { color: #2E7D32; }
.summary-value.expense { color: #C62828; }

.range-tabs {
  display: flex;
  background: #FFFBF7;
  padding: 12rpx 24rpx;
  gap: 12rpx;
  flex-shrink: 0;
  border-top: 1rpx solid #F5F0EB;
}

.range-tab {
  flex: 1;
  text-align: center;
  padding: 10rpx 0;
  border-radius: 20rpx;
  font-size: 24rpx;
  color: #8D7B72;
  background: #F5F0EB;
}

.range-tab.active {
  background: #E8905C;
  color: #fff;
  font-weight: 600;
}

.main-scroll {
  flex: 1;
  height: 0;
  padding: 16rpx 20rpx;
}

.scroll-bottom {
  height: 40rpx;
}

.section {
  background: #FFFBF7;
  border-radius: 20rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #5D4037;
  margin-bottom: 16rpx;
  display: block;
}

.chart-canvas {
  width: 100%;
}

.bar-chart {
  height: 360rpx;
}

.pie-chart {
  width: 360rpx;
  height: 360rpx;
  margin: 0 auto;
}

/* Rank */
.rank-toggle {
  display: flex;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.rank-tab {
  padding: 6rpx 20rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: #8D7B72;
  background: #F5F0EB;
}

.rank-tab.active {
  background: #E8905C;
  color: #fff;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.rank-emoji {
  font-size: 28rpx;
  width: 40rpx;
  text-align: center;
}

.rank-name {
  font-size: 24rpx;
  color: #5D4037;
  width: 80rpx;
  flex-shrink: 0;
}

.rank-bar-wrap {
  flex: 1;
  height: 16rpx;
  background: #F5F0EB;
  border-radius: 8rpx;
  overflow: hidden;
}

.rank-bar {
  height: 100%;
  background: #E8905C;
  border-radius: 8rpx;
  transition: width 0.4s ease;
}

.rank-amount {
  font-size: 24rpx;
  color: #5D4037;
  font-weight: 600;
  width: 100rpx;
  text-align: right;
}

.rank-empty {
  text-align: center;
  color: #BCAAA4;
  font-size: 24rpx;
  padding: 30rpx 0;
}

/* Pie */
.pie-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pie-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 20rpx;
  justify-content: center;
  margin-top: 16rpx;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: #5D4037;
}

.legend-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 4rpx;
}

.legend-pct {
  color: #BCAAA4;
}
```

- [ ] **Step 5: 在 app.json 注册 stats 页面**

在 `app.json` 的 `pages` 数组中，在 accounting 相关页面之后添加：

```json
"pages/accounting/stats/stats"
```

- [ ] **Step 6: 验证**

在微信开发者工具中编译，确认 stats 页面可以打开（空白但无报错），导航栏标题显示"统计"。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/accounting/stats/ miniprogram/app.json
git commit -m "feat: add stats page skeleton"
```

---

### Task 2: 统计页数据查询与聚合

**Files:**
- Modify: `miniprogram/pages/accounting/stats/stats.js`

- [ ] **Step 1: 实现 loadData 方法**

替换 stats.js 中的 `loadData` 骨架：

```js
loadData() {
  const { currentLedger, range } = this.data;
  if (!currentLedger) return;

  const now = new Date();
  let monthsBack = 0;
  if (range === 'month') monthsBack = 0;
  else if (range === 'quarter') monthsBack = 2;
  else if (range === 'half') monthsBack = 5;
  else if (range === 'year') monthsBack = 11;

  const dateEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const dateStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;

  this.setData({ dateStart, dateEnd });

  db.collection('transactions')
    .where({
      nickName: app.globalData.nickName,
      ledgerId: currentLedger._id,
      date: _.gte(dateStart).and(_.lte(dateEnd))
    })
    .orderBy('date', 'asc')
    .limit(1000)
    .get()
    .then(res => {
      const transactions = res.data;
      this.calcSummary(transactions);
      this.buildTrendData(transactions);
      this.buildRankList();
      this.buildPieData();
      // Delay canvas draw to ensure DOM ready
      setTimeout(() => {
        this.drawTrendChart();
        this.drawPieChart();
      }, 300);
    })
    .catch(err => {
      if (err.errCode === -502005) {
        // No transactions collection
        this.setData({
          totalIncome: 0, totalExpense: 0, totalBalance: 0,
          trendMonths: [], trendData: [], rankList: [], pieData: []
        });
        return;
      }
      console.error('Load stats failed:', err);
    });
},

calcSummary(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  transactions.forEach(tx => {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpense += tx.amount;
  });
  this.setData({
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalBalance: Math.round((totalIncome - totalExpense) * 100) / 100
  });
},
```

- [ ] **Step 2: 实现趋势数据构建方法**

在 stats.js 中添加：

```js
buildTrendData(transactions) {
  const { dateStart, dateEnd } = this.data;
  const startDate = new Date(dateStart);
  const endDate = new Date(dateEnd);

  // Build list of months
  const months = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= endDate) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: `${cursor.getMonth() + 1}月` });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Aggregate by month
  const monthMap = {};
  months.forEach(m => { monthMap[m.key] = { income: 0, expense: 0 }; });
  transactions.forEach(tx => {
    const monthKey = tx.date.substring(0, 7);
    if (monthMap[monthKey]) {
      if (tx.type === 'income') monthMap[monthKey].income += tx.amount;
      else monthMap[monthKey].expense += tx.amount;
    }
  });

  const trendData = months.map(m => ({
    month: m.label,
    income: Math.round(monthMap[m.key].income * 100) / 100,
    expense: Math.round(monthMap[m.key].expense * 100) / 100
  }));

  this.setData({ trendMonths: months, trendData });
},
```

- [ ] **Step 3: 实现排行和饼图数据构建**

```js
buildRankList() {
  const { trendData } = this.data;
  if (!trendData.length) {
    // Need full transactions for category breakdown
    // Will rebuild from raw data saved in loadData
    return;
  }
  // This depends on raw transactions — we store them in a module-level cache
  this._buildFromCache();
},

buildPieData() {
  this._buildFromCache();
},

_buildFromCache() {
  const transactions = this._rawTransactions;
  if (!transactions || !transactions.length) {
    this.setData({ rankList: [], pieData: [] });
    return;
  }

  const rankType = this.data.rankType;
  const categoryMap = {};

  transactions.forEach(tx => {
    if (tx.type !== rankType) return;
    const key = tx.category;
    if (!categoryMap[key]) {
      categoryMap[key] = { category: key, emoji: tx.categoryEmoji, amount: 0 };
    }
    categoryMap[key].amount += tx.amount;
  });

  const total = Object.values(categoryMap).reduce((s, c) => s + c.amount, 0);
  const rankList = Object.values(categoryMap)
    .map(c => ({ ...c, amount: Math.round(c.amount * 100) / 100, percent: total > 0 ? Math.round(c.amount / total * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  this.setData({ rankList });
},

// Modify loadData to cache raw transactions
// In the .then(res => { ... }) block, add before calcSummary:
// this._rawTransactions = res.data;
```

实际上这一步需要调整 loadData 来缓存原始数据。合并修改：

**完整 loadData 替换**（合并 Step 1 和 Step 3 的缓存）：

```js
loadData() {
  const { currentLedger, range } = this.data;
  if (!currentLedger) return;

  const now = new Date();
  let monthsBack = 0;
  if (range === 'month') monthsBack = 0;
  else if (range === 'quarter') monthsBack = 2;
  else if (range === 'half') monthsBack = 5;
  else if (range === 'year') monthsBack = 11;

  const dateEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const dateStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;

  this.setData({ dateStart, dateEnd });

  db.collection('transactions')
    .where({
      nickName: app.globalData.nickName,
      ledgerId: currentLedger._id,
      date: _.gte(dateStart).and(_.lte(dateEnd))
    })
    .orderBy('date', 'asc')
    .limit(1000)
    .get()
    .then(res => {
      const transactions = res.data;
      this._rawTransactions = transactions;
      this.calcSummary(transactions);
      this.buildTrendData(transactions);
      this.buildRankListFrom(transactions);
      this.buildPieDataFrom(transactions);
      setTimeout(() => {
        this.drawTrendChart();
        this.drawPieChart();
      }, 300);
    })
    .catch(err => {
      if (err.errCode === -502005) {
        this._rawTransactions = [];
        this.setData({
          totalIncome: 0, totalExpense: 0, totalBalance: 0,
          trendMonths: [], trendData: [], rankList: [], pieData: []
        });
        return;
      }
      console.error('Load stats failed:', err);
    });
},

calcSummary(transactions) {
  let totalIncome = 0, totalExpense = 0;
  transactions.forEach(tx => {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpense += tx.amount;
  });
  this.setData({
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalBalance: Math.round((totalIncome - totalExpense) * 100) / 100
  });
},

buildTrendData(transactions) {
  const startDate = new Date(this.data.dateStart);
  const endDate = new Date(this.data.dateEnd);
  const months = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= endDate) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: `${cursor.getMonth() + 1}月` });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const monthMap = {};
  months.forEach(m => { monthMap[m.key] = { income: 0, expense: 0 }; });
  transactions.forEach(tx => {
    const mk = tx.date.substring(0, 7);
    if (monthMap[mk]) {
      if (tx.type === 'income') monthMap[mk].income += tx.amount;
      else monthMap[mk].expense += tx.amount;
    }
  });

  const trendData = months.map(m => ({
    month: m.label,
    income: Math.round(monthMap[m.key].income * 100) / 100,
    expense: Math.round(monthMap[m.key].expense * 100) / 100
  }));

  this.setData({ trendMonths: months, trendData });
},

buildRankListFrom(transactions) {
  const rankType = this.data.rankType;
  const catMap = {};
  transactions.forEach(tx => {
    if (tx.type !== rankType) return;
    const key = tx.category;
    if (!catMap[key]) catMap[key] = { category: key, emoji: tx.categoryEmoji, amount: 0 };
    catMap[key].amount += tx.amount;
  });
  const total = Object.values(catMap).reduce((s, c) => s + c.amount, 0);
  const rankList = Object.values(catMap)
    .map(c => ({
      ...c,
      amount: Math.round(c.amount * 100) / 100,
      percent: total > 0 ? Math.round(c.amount / total * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);
  this.setData({ rankList });
},

buildPieDataFrom(transactions) {
  const rankType = this.data.rankType;
  const colors = ['#E8905C','#FFB74D','#FFCC80','#FFE0B2','#FFF3E0','#BCAAA4','#A1887F','#8D6E63','#FFAB91','#F8BBD0'];
  const catMap = {};
  transactions.forEach(tx => {
    if (tx.type !== rankType) return;
    const key = tx.category;
    if (!catMap[key]) catMap[key] = { category: key, emoji: tx.categoryEmoji, amount: 0 };
    catMap[key].amount += tx.amount;
  });
  const total = Object.values(catMap).reduce((s, c) => s + c.amount, 0);
  const items = Object.values(catMap)
    .map(c => ({ ...c, amount: Math.round(c.amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  const pieData = items.map((item, i) => ({
    ...item,
    percent: total > 0 ? Math.round(item.amount / total * 10000) / 100 : 0,
    color: colors[i % colors.length]
  }));
  this.setData({ pieData });
},

switchRankType(e) {
  const type = e.currentTarget.dataset.type;
  this.setData({ rankType: type });
  if (this._rawTransactions) {
    this.buildRankListFrom(this._rawTransactions);
    this.buildPieDataFrom(this._rawTransactions);
    setTimeout(() => this.drawPieChart(), 200);
  }
},
```

- [ ] **Step 2: 验证**

在微信开发者工具中编译，console 确认 `loadData` 被调用且数据正确，无报错。

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/stats/stats.js
git commit -m "feat: add stats data query and aggregation"
```

---

### Task 3: Canvas 趋势柱状图

**Files:**
- Modify: `miniprogram/pages/accounting/stats/stats.js`

- [ ] **Step 1: 实现 drawTrendChart**

在 stats.js 中添加 `drawTrendChart` 方法：

```js
drawTrendChart() {
  const { trendData } = this.data;
  if (!trendData.length) return;

  const query = wx.createSelectorQuery();
  query.select('#trendCanvas').fields({ node: true, size: true }).exec(res => {
    if (!res[0] || !res[0].node) return;
    const canvas = res[0].node;
    const ctx = canvas.getContext('2d');
    const dpr = wx.getSystemInfoSync().pixelRatio;
    const width = res[0].width;
    const height = res[0].height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 16, bottom: 40, left: 44 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    // Find max value
    let maxVal = 0;
    trendData.forEach(d => {
      if (d.income > maxVal) maxVal = d.income;
      if (d.expense > maxVal) maxVal = d.expense;
    });
    if (maxVal === 0) maxVal = 100;
    maxVal = maxVal * 1.15;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Y axis gridlines
    const gridLines = 4;
    ctx.strokeStyle = '#F0E8E0';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Bars
    const barGap = 4;
    const groupWidth = chartW / trendData.length;
    const barW = (groupWidth - barGap * 3) / 2;

    trendData.forEach((d, i) => {
      const gx = pad.left + groupWidth * i;

      // Expense bar (red, left side of group)
      const expH = (d.expense / maxVal) * chartH;
      ctx.fillStyle = '#C62828';
      ctx.fillRect(gx + barGap, pad.top + chartH - expH, barW, expH);

      // Income bar (green, right side of group)
      const incH = (d.income / maxVal) * chartH;
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(gx + barGap * 2 + barW, pad.top + chartH - incH, barW, incH);

      // Month label
      ctx.fillStyle = '#8D7B72';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.month, gx + groupWidth / 2, height - 6);
    });

    // Y axis labels
    ctx.fillStyle = '#BCAAA4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridLines; i++) {
      const val = Math.round(maxVal - (maxVal / gridLines) * i);
      const y = pad.top + (chartH / gridLines) * i;
      ctx.fillText(String(val), pad.left - 6, y + 3);
    }

    // Legend
    const lx = width - pad.right - 80;
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(lx, 4, 12, 12);
    ctx.fillStyle = '#5D4037';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('收入', lx + 16, 14);

    ctx.fillStyle = '#C62828';
    ctx.fillRect(lx + 48, 4, 12, 12);
    ctx.fillStyle = '#5D4037';
    ctx.fillText('支出', lx + 64, 14);
  });
},
```

- [ ] **Step 2: 验证**

在微信开发者工具中查看统计页，确认柱状图渲染正确，颜色、标签、比例显示正常。

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/stats/stats.js
git commit -m "feat: add trend bar chart canvas rendering"
```

---

### Task 4: Canvas 分类饼图

**Files:**
- Modify: `miniprogram/pages/accounting/stats/stats.js`

- [ ] **Step 1: 实现 drawPieChart**

在 stats.js 中添加：

```js
drawPieChart() {
  const { pieData } = this.data;
  if (!pieData.length) return;

  const query = wx.createSelectorQuery();
  query.select('#pieCanvas').fields({ node: true, size: true }).exec(res => {
    if (!res[0] || !res[0].node) return;
    const canvas = res[0].node;
    const ctx = canvas.getContext('2d');
    const dpr = wx.getSystemInfoSync().pixelRatio;
    const size = res[0].width;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 10;
    const innerR = outerR * 0.55;

    ctx.clearRect(0, 0, size, size);

    let startAngle = -Math.PI / 2;
    pieData.forEach(d => {
      const sliceAngle = (d.percent / 100) * Math.PI * 2;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();

      // Percentage label on slice (if slice > 5%)
      if (d.percent > 5) {
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = (outerR + innerR) / 2;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.percent + '%', cx + labelR * Math.cos(midAngle), cy + labelR * Math.sin(midAngle));
      }

      startAngle += sliceAngle;
    });

    // Center circle (donut hole fill)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFBF7';
    ctx.fill();
  });
},
```

- [ ] **Step 2: 验证**

在微信开发者工具中确认饼图渲染正确，环形图 + 百分比标签 + 图例一致。

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/stats/stats.js
git commit -m "feat: add category pie chart canvas rendering"
```

---

### Task 5: 记账页添加统计入口按钮

**Files:**
- Modify: `miniprogram/pages/accounting/accounting.wxml`
- Modify: `miniprogram/pages/accounting/accounting.wxss`
- Modify: `miniprogram/pages/accounting/accounting.js`

- [ ] **Step 1: 替换 FAB 为双按钮组**

在 accounting.wxml 中，替换现有的 FAB：

```html
<!-- 将现有单个 FAB 替换为以下两个并排按钮 -->
<view class="fab-group">
  <view class="fab fab-stats" bindtap="goStats">
    <text class="fab-icon">📊</text>
  </view>
  <view class="fab fab-add" bindtap="goAdd">
    <text>+</text>
  </view>
</view>
```

- [ ] **Step 2: 添加 FAB 组样式**

在 accounting.wxss 中替换现有 `.fab` 样式：

```css
/* FAB Group */
.fab-group {
  position: fixed;
  bottom: 120rpx;
  right: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  z-index: 20;
}

.fab {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(232,144,92,0.4);
}

.fab:active {
  transform: scale(0.92);
  transition: transform 0.15s;
}

.fab-add {
  background: #E8905C;
}

.fab-add text {
  font-size: 56rpx;
  color: #fff;
  line-height: 1;
}

.fab-stats {
  background: #FFFBF7;
  border: 2rpx solid #E8905C;
}

.fab-icon {
  font-size: 40rpx;
  line-height: 1;
}
```

- [ ] **Step 3: 添加 goStats 方法**

在 accounting.js 中添加：

```js
goStats() {
  const ledgerId = this.data.currentLedger ? this.data.currentLedger._id : '';
  wx.navigateTo({ url: `/pages/accounting/stats/stats?ledgerId=${ledgerId}` });
},
```

- [ ] **Step 4: 验证**

在微信开发者工具中打开记账页，确认两个浮动按钮显示：📊（统计）在上，+（记账）在下。点击 📊 跳转到统计页。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/accounting/accounting.wxml miniprogram/pages/accounting/accounting.wxss miniprogram/pages/accounting/accounting.js
git commit -m "feat: add stats entry FAB on accounting page"
```

---

### Task 6: 打卡记录月视图 — 切换与数据

**Files:**
- Modify: `miniprogram/pages/history/history.js`
- Modify: `miniprogram/pages/history/history.wxml`
- Modify: `miniprogram/pages/history/history.wxss`

- [ ] **Step 1: 修改 history.js 添加月视图逻辑**

已有 `loadHistory` 拉取了 tasks + checkins。新增 viewMode 切换和月历数据构建。修改 history.js：

```js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    viewMode: 'day',  // 'day' | 'month'
    groups: [],

    // Month view
    currentYear: 0,
    currentMonth: 0,
    monthDisplay: '',
    calendarGrid: [],  // rows × 7 cells
    selectedDate: '',
    selectedCheckins: []
  },

  onShow() {
    const now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      monthDisplay: `${now.getFullYear()}年${now.getMonth() + 1}月`
    });
    this.loadHistory();
  },

  loadHistory() {
    const nickName = app.globalData.nickName;

    Promise.all([
      db.collection('tasks').where({ nickName }).get(),
      db.collection('checkins').where({ nickName }).orderBy('date', 'desc').orderBy('createTime', 'desc').get()
    ]).then(([tasksRes, checkinsRes]) => {
      const taskMap = {};
      tasksRes.data.forEach(t => { taskMap[t._id] = t; });

      // Build checkin items (for both views)
      this._taskMap = taskMap;
      this._allCheckins = checkinsRes.data;

      // Day view groups
      const dateMap = {};
      checkinsRes.data.forEach(c => {
        const task = taskMap[c.taskId];
        if (!dateMap[c.date]) dateMap[c.date] = [];
        dateMap[c.date].push({
          ...c,
          taskName: task ? task.name : '(已删除)',
          taskEmoji: task ? task.emoji : '❓'
        });
      });

      const groups = Object.keys(dateMap)
        .sort((a, b) => b.localeCompare(a))
        .map(date => ({
          date,
          weekday: this.getWeekday(date),
          checkins: dateMap[date]
        }));

      this.setData({ groups });

      // Build month view
      this.buildCalendar();
    }).catch(err => {
      console.error('加载记录失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // ====== Month View ======

  buildCalendar() {
    const { currentYear, currentMonth } = this.data;
    const taskMap = this._taskMap || {};
    const allCheckins = this._allCheckins || [];

    // Build date → { total tasks active that day, checked tasks that day }
    const dateStats = {};
    allCheckins.forEach(c => {
      if (!dateStats[c.date]) dateStats[c.date] = { checkinTaskIds: new Set() };
      dateStats[c.date].checkinTaskIds.add(c.taskId);
    });

    // Determine active tasks per day based on task date ranges
    const activeTasksOnDate = (dateStr) => {
      let count = 0;
      Object.values(taskMap).forEach(t => {
        if (t.startDate <= dateStr && t.endDate >= dateStr) count++;
      });
      return count;
    };

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekDay = firstDay.getDay();

    const grid = [];
    let row = [];

    // Fill leading empty cells
    for (let i = 0; i < startWeekDay; i++) {
      row.push({ day: '', empty: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const stats = dateStats[dateStr];
      const checkedCount = stats ? stats.checkinTaskIds.size : 0;
      const totalActive = activeTasksOnDate(dateStr);
      let state = 'none';  // no checkin
      if (checkedCount > 0 && checkedCount >= totalActive && totalActive > 0) state = 'all';
      else if (checkedCount > 0) state = 'partial';

      const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

      row.push({ day: d, date: dateStr, state, isToday: dateStr === today, isFuture: dateStr > today });

      if (row.length === 7) {
        grid.push(row);
        row = [];
      }
    }

    // Fill trailing empty cells
    if (row.length > 0) {
      while (row.length < 7) row.push({ day: '', empty: true });
      grid.push(row);
    }

    this.setData({ calendarGrid: grid });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    this.setData({
      currentYear, currentMonth,
      monthDisplay: `${currentYear}年${currentMonth}月`,
      selectedDate: '', selectedCheckins: []
    });
    this.buildCalendar();
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    this.setData({
      currentYear, currentMonth,
      monthDisplay: `${currentYear}年${currentMonth}月`,
      selectedDate: '', selectedCheckins: []
    });
    this.buildCalendar();
  },

  switchView(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ viewMode: mode, selectedDate: '', selectedCheckins: [] });
  },

  tapDate(e) {
    const { date, empty, isFuture } = e.currentTarget.dataset;
    if (empty || isFuture) return;

    const allCheckins = this._allCheckins || [];
    const taskMap = this._taskMap || {};
    const dateCheckins = allCheckins
      .filter(c => c.date === date)
      .map(c => ({
        ...c,
        taskName: taskMap[c.taskId] ? taskMap[c.taskId].name : '(已删除)',
        taskEmoji: taskMap[c.taskId] ? taskMap[c.taskId].emoji : '❓'
      }));

    this.setData({
      selectedDate: date,
      selectedCheckins: dateCheckins
    });
  },

  getWeekday(dateStr) {
    const d = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[d.getDay()];
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  }
});
```

- [ ] **Step 2: 修改 history.wxml 添加月视图**

在 `<view class="page">` 内部，最前面添加切换标签和月视图区域：

```html
<view class="page">

  <!-- View Toggle -->
  <view class="view-toggle">
    <view class="toggle-tab {{viewMode === 'day' ? 'active' : ''}}" data-mode="day" bindtap="switchView">日视图</view>
    <view class="toggle-tab {{viewMode === 'month' ? 'active' : ''}}" data-mode="month" bindtap="switchView">月视图</view>
  </view>

  <!-- Month View -->
  <view wx:if="{{viewMode === 'month'}}" class="month-view">
    <!-- Month Picker -->
    <view class="month-nav">
      <view class="month-arrow" bindtap="prevMonth">◀</view>
      <text class="month-label">{{monthDisplay}}</text>
      <view class="month-arrow" bindtap="nextMonth">▶</view>
    </view>

    <!-- Weekday Header -->
    <view class="weekday-row">
      <text class="weekday-cell">日</text>
      <text class="weekday-cell">一</text>
      <text class="weekday-cell">二</text>
      <text class="weekday-cell">三</text>
      <text class="weekday-cell">四</text>
      <text class="weekday-cell">五</text>
      <text class="weekday-cell">六</text>
    </view>

    <!-- Calendar Grid -->
    <view class="calendar-grid">
      <block wx:for="{{calendarGrid}}" wx:key="index" wx:for-item="row">
        <view class="cal-row">
          <view
            class="cal-cell {{item.empty ? 'empty' : ''}} {{item.state === 'partial' ? 'partial' : ''}} {{item.state === 'all' ? 'all' : ''}} {{item.isToday ? 'today' : ''}} {{item.isFuture ? 'future' : ''}} {{selectedDate === item.date ? 'selected' : ''}}"
            wx:for="{{row}}"
            wx:for-item="item"
            wx:key="day"
            data-date="{{item.date}}"
            data-empty="{{item.empty}}"
            data-is-future="{{item.isFuture}}"
            bindtap="tapDate"
          >
            <text wx:if="{{!item.empty}}" class="cal-day">{{item.day}}</text>
          </view>
        </view>
      </block>
    </view>

    <!-- Selected Date Detail -->
    <view wx:if="{{selectedDate}}" class="cal-detail">
      <view class="cal-detail-header">
        <text class="cal-detail-date">{{selectedDate}} {{selectedCheckins.length > 0 ? '' : ''}}</text>
        <text class="cal-detail-count" wx:if="{{selectedCheckins.length > 0}}">{{selectedCheckins.length}}条记录</text>
      </view>
      <view wx:if="{{selectedCheckins.length === 0}}" class="cal-detail-empty">当天无打卡记录</view>
      <view class="checkin-list" wx:else>
        <block wx:for="{{selectedCheckins}}" wx:key="_id">
          <view class="checkin-item">
            <text class="item-emoji">{{item.taskEmoji}}</text>
            <view class="item-body">
              <text class="item-name">{{item.taskName}}</text>
              <text wx:if="{{item.description}}" class="item-desc">{{item.description}}</text>
              <image
                wx:if="{{item.image}}"
                src="{{item.image}}"
                mode="aspectFill"
                class="item-image"
                data-url="{{item.image}}"
                bindtap="previewImage">
              </image>
            </view>
          </view>
        </block>
      </view>
    </view>
  </view>

  <!-- Day View (existing) -->
  <!-- 包裹在 wx:if="{{viewMode === 'day'}}" 中 -->
  <block wx:if="{{viewMode === 'day'}}">
    <!-- 原有的日视图内容，不变 -->
    ...
  </block>
</view>
```

需把原有的日视图内容包裹在 `<block wx:if="{{viewMode === 'day'}}">` 中。完整结构看 Step 3 一起处理。

- [ ] **Step 3: 完整 history.wxml**

完整替换 history.wxml：

```html
<view class="page">
  <!-- View Toggle -->
  <view class="view-toggle">
    <view class="toggle-tab {{viewMode === 'day' ? 'active' : ''}}" data-mode="day" bindtap="switchView">日视图</view>
    <view class="toggle-tab {{viewMode === 'month' ? 'active' : ''}}" data-mode="month" bindtap="switchView">月视图</view>
  </view>

  <!-- ========== Month View ========== -->
  <view wx:if="{{viewMode === 'month'}}" class="month-view">
    <view class="month-nav">
      <view class="month-arrow" bindtap="prevMonth">◀</view>
      <text class="month-label">{{monthDisplay}}</text>
      <view class="month-arrow" bindtap="nextMonth">▶</view>
    </view>

    <view class="weekday-row">
      <text class="weekday-cell">日</text><text class="weekday-cell">一</text><text class="weekday-cell">二</text>
      <text class="weekday-cell">三</text><text class="weekday-cell">四</text><text class="weekday-cell">五</text>
      <text class="weekday-cell">六</text>
    </view>

    <view class="calendar-grid">
      <block wx:for="{{calendarGrid}}" wx:key="index" wx:for-item="row">
        <view class="cal-row">
          <view
            class="cal-cell {{item.empty ? 'empty' : ''}} {{item.state === 'partial' ? 'partial' : ''}} {{item.state === 'all' ? 'all' : ''}} {{item.isToday ? 'today' : ''}} {{item.isFuture ? 'future' : ''}} {{selectedDate === item.date ? 'selected' : ''}}"
            wx:for="{{row}}" wx:for-item="item" wx:key="day"
            data-date="{{item.date}}" data-empty="{{item.empty}}" data-is-future="{{item.isFuture}}"
            bindtap="tapDate">
            <text wx:if="{{!item.empty}}" class="cal-day">{{item.day}}</text>
          </view>
        </view>
      </block>
    </view>

    <view wx:if="{{selectedDate}}" class="cal-detail">
      <view class="cal-detail-header">
        <text class="cal-detail-date">{{selectedDate}}</text>
        <text class="cal-detail-count" wx:if="{{selectedCheckins.length > 0}}">{{selectedCheckins.length}}条记录</text>
      </view>
      <view wx:if="{{selectedCheckins.length === 0}}" class="cal-detail-empty">当天无打卡记录</view>
      <view class="checkin-list" wx:else>
        <block wx:for="{{selectedCheckins}}" wx:key="_id">
          <view class="checkin-item">
            <text class="item-emoji">{{item.taskEmoji}}</text>
            <view class="item-body">
              <text class="item-name">{{item.taskName}}</text>
              <text wx:if="{{item.description}}" class="item-desc">{{item.description}}</text>
              <image wx:if="{{item.image}}" src="{{item.image}}" mode="aspectFill" class="item-image" data-url="{{item.image}}" bindtap="previewImage"></image>
            </view>
          </view>
        </block>
      </view>
    </view>
  </view>

  <!-- ========== Day View (existing) ========== -->
  <block wx:if="{{viewMode === 'day'}}">
    <block wx:for="{{groups}}" wx:key="date">
      <view class="date-group">
        <view class="date-header">
          <view class="date-dot"></view>
          <text class="date-text">{{item.date}}</text>
          <text class="date-weekday">{{item.weekday}}</text>
          <view class="date-paw">
            <view class="dp-toe"></view><view class="dp-toe"></view><view class="dp-toe"></view>
            <view class="dp-pad"></view>
          </view>
        </view>
        <view class="checkin-list">
          <block wx:for="{{item.checkins}}" wx:key="_id">
            <view class="checkin-item">
              <text class="item-emoji">{{item.taskEmoji}}</text>
              <view class="item-body">
                <text class="item-name">{{item.taskName}}</text>
                <text wx:if="{{item.description}}" class="item-desc">{{item.description}}</text>
                <image wx:if="{{item.image}}" src="{{item.image}}" mode="aspectFill" class="item-image" data-url="{{item.image}}" bindtap="previewImage"></image>
              </view>
              <view class="item-tail">
                <view class="tail-dot"></view><view class="tail-dot"></view><view class="tail-dot"></view>
              </view>
            </view>
          </block>
        </view>
      </view>
    </block>

    <view wx:if="{{groups.length === 0}}" class="empty">
      <text class="empty-emoji">🐾</text>
      <text class="empty-text">还没有打卡记录</text>
      <text class="empty-hint">去打卡页开始你的第一个任务吧~</text>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 添加月历样式到 history.wxss**

在现有 history.wxss 末尾追加：

```css
/* ====== View Toggle ====== */
.view-toggle {
  display: flex;
  background: #FFFBF7;
  border-radius: 20rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(180,140,120,0.06);
}

.toggle-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 26rpx;
  font-weight: 600;
  color: #8D7B72;
  background: #FFFBF7;
}

.toggle-tab.active {
  background: #E8905C;
  color: #fff;
}

/* ====== Month View ====== */
.month-view {
  background: #FFFBF7;
  border-radius: 20rpx;
  padding: 24rpx 16rpx;
  box-shadow: 0 2rpx 14rpx rgba(180,140,120,0.06);
}

.month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  margin-bottom: 20rpx;
}

.month-arrow {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #E8905C;
  background: #FFF2EC;
  border-radius: 50%;
}

.month-label {
  font-size: 32rpx;
  font-weight: 700;
  color: #5D4037;
}

/* Weekday Header */
.weekday-row {
  display: flex;
  margin-bottom: 8rpx;
}

.weekday-cell {
  flex: 1;
  text-align: center;
  font-size: 22rpx;
  color: #BCAAA4;
  padding: 8rpx 0;
}

/* Calendar Grid */
.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.cal-row {
  display: flex;
  gap: 6rpx;
}

.cal-cell {
  flex: 1;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  background: #F5F0EB;
  position: relative;
}

.cal-cell.empty {
  background: transparent;
}

.cal-cell.partial {
  background: rgba(232,144,92,0.35);
}

.cal-cell.all {
  background: #E8905C;
}

.cal-cell.all .cal-day {
  color: #fff;
  font-weight: 700;
}

.cal-cell.today {
  border: 2rpx solid #E8905C;
}

.cal-cell.future {
  opacity: 0.35;
}

.cal-cell.selected {
  border: 3rpx solid #E8905C;
  transform: scale(1.05);
}

.cal-day {
  font-size: 28rpx;
  color: #5D4037;
  font-weight: 500;
}

/* Calendar Detail */
.cal-detail {
  margin-top: 24rpx;
  border-top: 1rpx solid #F5F0EB;
  padding-top: 20rpx;
}

.cal-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 8rpx;
  margin-bottom: 12rpx;
}

.cal-detail-date {
  font-size: 28rpx;
  font-weight: 700;
  color: #5D4037;
}

.cal-detail-count {
  font-size: 22rpx;
  color: #BCAAA4;
}

.cal-detail-empty {
  text-align: center;
  color: #BCAAA4;
  font-size: 24rpx;
  padding: 30rpx 0;
}
```

- [ ] **Step 5: 验证**

在微信开发者工具中打开记录页：
- 默认显示日视图（原有功能不变）
- 切换到月视图，确认日历网格正确渲染
- 三状态颜色正确（灰/浅橙/深橙）
- 今天有边框标识
- 点击有打卡记录的日期，下方展示打卡列表
- 切换回日视图正常

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/history/
git commit -m "feat: add month calendar view to history page"
```

---

### Task 7: 自定义分类 — 数据层

**Files:**
- Modify: `miniprogram/pages/accounting/add/add.js`

- [ ] **Step 1: 修改 add.js 加载自定义分类**

修改 `onLoad` 和新增加载自定义分类逻辑。在 add.js 的关键位置修改：

在 `data` 中添加 `customCategories: []` 和 `showCategoryForm: false` 及 `newCategoryEmoji: '📌'` 和 `newCategoryName: ''`。

完整修改后的 add.js 关键部分：

在 Page data 中添加：
```js
data: {
  // ... existing fields ...
  customCategories: [],
  showCategoryForm: false,
  newCategoryName: '',
  newCategoryEmoji: '📌',
  categoryFormType: 'expense'
},
```

新增方法 `loadCustomCategories`：
```js
loadCustomCategories() {
  const nickName = app.globalData.nickName;
  db.collection('categories').where({ nickName }).get()
    .then(res => {
      this.setData({ customCategories: res.data });
      this.mergeCategories();
    })
    .catch(err => {
      if (err.errCode !== -502005) console.error('Load categories failed:', err);
      this.setData({ customCategories: [] });
      this.mergeCategories();
    });
},

mergeCategories() {
  const type = this.data.type;
  const base = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const custom = this.data.customCategories.filter(c => c.type === type);
  const merged = [...base, ...custom];
  this.setData({ categories: merged });
},
```

在 `onLoad` 的末尾调用：
```js
this.loadCustomCategories();
```

在 `switchType` 中替换 `categories` 赋值为调用 `this.mergeCategories()`：
```js
switchType(e) {
  const type = e.currentTarget.dataset.type;
  this.setData({
    type,
    selectedCategory: '',
    selectedCategoryEmoji: ''
  });
  this.mergeCategories();
},
```

- [ ] **Step 2: 添加自定义分类创建和删除方法**

```js
openCategoryForm(e) {
  const type = e.currentTarget.dataset.type || this.data.type;
  this.setData({
    showCategoryForm: true,
    categoryFormType: type,
    newCategoryName: '',
    newCategoryEmoji: '📌'
  });
},

closeCategoryForm() {
  this.setData({ showCategoryForm: false });
},

onCategoryNameInput(e) {
  this.setData({ newCategoryName: e.detail.value });
},

selectCategoryEmoji(e) {
  this.setData({ newCategoryEmoji: e.currentTarget.dataset.emoji });
},

saveCategory() {
  const { newCategoryName, newCategoryEmoji, categoryFormType } = this.data;
  const name = newCategoryName.trim();
  if (!name) {
    wx.showToast({ title: '请输入分类名称', icon: 'none' });
    return;
  }

  const nickName = app.globalData.nickName;
  db.collection('categories').add({
    data: {
      name,
      emoji: newCategoryEmoji,
      type: categoryFormType,
      nickName,
      createTime: new Date()
    }
  }).then(() => {
    wx.showToast({ title: '分类已添加', icon: 'success' });
    this.setData({ showCategoryForm: false });
    this.loadCustomCategories();
  }).catch(err => {
    console.error('Save category failed:', err);
    wx.showToast({ title: '添加失败', icon: 'none' });
  });
},

deleteCategory(e) {
  const id = e.currentTarget.dataset.id;
  wx.showModal({
    title: '删除分类',
    content: '确定要删除这个自定义分类吗？',
    success: (res) => {
      if (res.confirm) {
        db.collection('categories').doc(id).remove()
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadCustomCategories();
          })
          .catch(err => {
            console.error('Delete category failed:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    }
  });
},
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/add/add.js
git commit -m "feat: add custom category data layer"
```

---

### Task 8: 自定义分类 — UI

**Files:**
- Modify: `miniprogram/pages/accounting/add/add.wxml`
- Modify: `miniprogram/pages/accounting/add/add.wxss`

- [ ] **Step 1: 修改分类选择区**

在 add.wxml 的分类 grid 后面，加入「+ 新增」入口：

找到 `<!-- Category Grid -->` 区域，在 `</view>` (category-grid 结束标签) 之后添加：

```html
<!-- + 新增分类按钮 -->
<view class="add-cat-btn" data-type="{{type}}" bindtap="openCategoryForm">
  <text class="add-cat-icon">+</text>
  <text class="add-cat-text">新增分类</text>
</view>
```

然后自定义分类需要支持长按删除。在每个分类 cell 上添加长按事件（仅自定义分类生效）。修改 cat-cell：

```html
<view
  class="cat-cell {{selectedCategory === item.name ? 'selected' : ''}} {{item._id ? 'custom' : ''}}"
  wx:for="{{categories}}"
  wx:key="name"
  data-name="{{item.name}}"
  data-emoji="{{item.emoji}}"
  data-id="{{item._id || ''}}"
  bindtap="selectCategory"
  bindlongpress="{{item._id ? 'deleteCategory' : ''}}"
>
  <text class="cat-emoji">{{item.emoji}}</text>
  <text class="cat-name">{{item.name}}</text>
</view>
```

- [ ] **Step 2: 添加底部弹窗**

在 add.wxml 的 `</view>` (最外层 page) 之前添加：

```html
<!-- Add Category Bottom Sheet -->
<view class="sheet-overlay" wx:if="{{showCategoryForm}}" bindtap="closeCategoryForm">
  <view class="sheet-content" catchtap>
    <view class="sheet-handle"></view>
    <view class="form-title">新增分类</view>

    <!-- Type toggle -->
    <view class="type-toggle small">
      <view class="type-tab {{categoryFormType === 'expense' ? 'active expense' : ''}}" data-type="expense" bindtap="openCategoryForm">支出</view>
      <view class="type-tab {{categoryFormType === 'income' ? 'active income' : ''}}" data-type="income" bindtap="openCategoryForm">收入</view>
    </view>

    <view class="form-label">选择图标</view>
    <view class="emoji-grid">
      <block wx:for="{{['🍽️','🚌','🛍️','🏠','🎮','💊','📚','📱','👗','💄','🏃','🐱','🎁','💼','📌','💰','📈','📋','↩️','💵','🎵','🌱','💻','❤️','⭐','🔥','✅','📅','🎓','🎯']}}" wx:key="*this">
        <view class="emoji-cell {{newCategoryEmoji === item ? 'selected' : ''}}" data-emoji="{{item}}" bindtap="selectCategoryEmoji">{{item}}</view>
      </block>
    </view>

    <input class="form-input" placeholder="分类名称" value="{{newCategoryName}}" bindinput="onCategoryNameInput" maxlength="8"/>

    <view class="form-actions">
      <view class="form-btn cancel" bindtap="closeCategoryForm">取消</view>
      <view class="form-btn confirm" bindtap="saveCategory">确定</view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 添加样式**

在 add.wxss（需先读取当前样式）末尾追加：

```css
/* Add Category Button */
.add-cat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 16rpx 0;
  margin-top: 8rpx;
  border-radius: 14rpx;
  border: 2rpx dashed #E0D5CC;
  background: transparent;
}

.add-cat-icon {
  font-size: 28rpx;
  color: #E8905C;
  font-weight: 700;
}

.add-cat-text {
  font-size: 24rpx;
  color: #E8905C;
  font-weight: 600;
}

/* Custom category cell */
.cat-cell.custom:active {
  opacity: 0.7;
}

/* Sheet Overlay (shared with accounting page styles) */
.sheet-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.sheet-content {
  width: 100%;
  background: #FFFBF7;
  border-radius: 28rpx 28rpx 0 0;
  padding: 0 28rpx 40rpx;
}

.sheet-handle {
  width: 60rpx;
  height: 6rpx;
  background: #E0D5CC;
  border-radius: 3rpx;
  margin: 16rpx auto 24rpx;
}

.form-title {
  text-align: center;
  font-size: 30rpx;
  font-weight: 700;
  color: #5D4037;
  padding: 0 0 20rpx;
}

.type-toggle.small {
  margin-bottom: 16rpx;
}

.form-label {
  font-size: 26rpx;
  color: #8D7B72;
  margin-bottom: 12rpx;
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 20rpx;
}

.emoji-cell {
  width: 62rpx;
  height: 62rpx;
  font-size: 34rpx;
  background: #FFFBF7;
  border-radius: 14rpx;
  border: 2rpx solid #F0E8E0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emoji-cell.selected {
  border-color: #E8905C;
  background: #FFF2EC;
  transform: scale(1.1);
}

.form-input {
  height: 72rpx;
  background: #FFFBF7;
  border-radius: 16rpx;
  border: 2rpx solid #F0E8E0;
  padding: 0 16rpx;
  font-size: 28rpx;
  color: #5D4037;
  box-sizing: border-box;
  margin-bottom: 20rpx;
}

.form-actions {
  display: flex;
  gap: 16rpx;
}

.form-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.form-btn.cancel {
  background: #F5F0EB;
  color: #8D7B72;
}

.form-btn.confirm {
  background: #E8905C;
  color: #fff;
}

.form-btn:active {
  opacity: 0.8;
}
```

- [ ] **Step 4: 验证**

在微信开发者工具中：
- 打开记账添加页，确认分类列表后显示「+ 新增分类」按钮
- 点击弹出底部弹窗，可以选 emoji + 输入名称 + 切换收支类型
- 点击确定后分类出现在列表中
- 长按自定义分类弹出删除确认，删除后消失
- 系统分类不能长按删除

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/accounting/add/
git commit -m "feat: add custom category UI with bottom sheet"
```

---

### Task 9: 庆祝动画 — Canvas 猫爪印飘落

**Files:**
- Modify: `miniprogram/pages/checkin/checkin.js`
- Modify: `miniprogram/pages/checkin/checkin.wxml`
- Modify: `miniprogram/pages/checkin/checkin.wxss`

- [ ] **Step 1: 添加庆祝动画逻辑到 checkin.js**

在 Page data 中添加：
```js
data: {
  // ... existing ...
  showCelebration: false
},
```

添加 Canvas 动画方法：

```js
checkAllDoneAndCelebrate() {
  const { activeTasks } = this.data;
  if (!activeTasks.length) return;

  // Check if all active tasks are done today
  const allDone = activeTasks.every(t => t.checkedInToday);

  if (allDone) {
    this.setData({ showCelebration: true });
    setTimeout(() => this.startCelebration(), 300);
  }
},

startCelebration() {
  const query = wx.createSelectorQuery();
  query.select('#celebrationCanvas').fields({ node: true, size: true }).exec(res => {
    if (!res[0] || !res[0].node) return;
    const canvas = res[0].node;
    const ctx = canvas.getContext('2d');
    const dpr = wx.getSystemInfoSync().pixelRatio;
    const width = res[0].width;
    const height = res[0].height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Create paw particles
    const particles = [];
    const pawEmoji = '🐾'; // 🐾
    const particleCount = 15;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: -20 - Math.random() * height * 0.3,
        size: 20 + Math.random() * 24,
        speed: 1.2 + Math.random() * 2,
        opacity: 0.6 + Math.random() * 0.4,
        sway: (Math.random() - 0.5) * 2,
        swaySpeed: 0.02 + Math.random() * 0.03,
        rotation: (Math.random() - 0.5) * 0.4,
        delay: i * 60
      });
    }

    const startTime = Date.now();
    const duration = 2500;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > duration) {
        // Fade out
        const fadeProgress = (elapsed - duration) / 400;
        if (fadeProgress >= 1) {
          this.setData({ showCelebration: false });
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1 - fadeProgress;
        // Draw remaining particles with fading
        particles.forEach(p => {
          if (elapsed - p.delay < 0) return;
          const pElapsed = (elapsed - p.delay) / 1000;
          const py = -20 + p.speed * 60 * pElapsed;
          const px = p.x + Math.sin(pElapsed * p.swaySpeed * 60) * 15;
          if (py < height + 40) {
            ctx.save();
            ctx.globalAlpha = p.opacity * (1 - fadeProgress);
            ctx.font = `${p.size}px sans-serif`;
            ctx.translate(px, py);
            ctx.rotate(p.rotation);
            ctx.fillText(pawEmoji, -p.size / 2, p.size / 2);
            ctx.restore();
          }
        });
        canvas.requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        const pElapsed = Math.max(0, (elapsed - p.delay) / 1000);
        if (pElapsed <= 0) return;
        const py = -20 + p.speed * 60 * pElapsed;
        const px = p.x + Math.sin(pElapsed * p.swaySpeed * 60) * 15;

        if (py < height + 40) {
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.font = `${p.size}px sans-serif`;
          ctx.translate(px, py);
          ctx.rotate(p.rotation + pElapsed * 0.3);
          ctx.fillText(pawEmoji, -p.size / 2, p.size / 2);
          ctx.restore();
        }
      });

      canvas.requestAnimationFrame(animate);
    };

    // Start after short delay
    setTimeout(() => canvas.requestAnimationFrame(animate), 100);
  });
},
```

修改 `onTapCheckin` 方法中打卡成功后的处理，在 `.then(() => { wx.showToast(...) })` 之后添加庆祝检测。将打卡成功回调改为：

```js
// In the !task.checkedInToday branch, replace the .then:
.then(() => {
  wx.showToast({ title: '已打卡', icon: 'success' });
  this.loadData();
  // Check all-done after data reloads
  setTimeout(() => this.checkAllDoneAndCelebrate(), 500);
})
```

注意：由于 `loadData` 是异步的，需要等数据更新后再检查。更稳妥的做法是直接在 `loadData` 末尾加回调。修改 `loadData` 方法签名支持回调：

在 `loadData` 的 `.then` 末尾（`this.setData({ tasks: merged, activeTasks, loading: false });` 之后）添加：
```js
if (onComplete) onComplete();
```

并将 `loadData` 签名为 `loadData(onComplete)`。然后在 `onTapCheckin` 中调用的 `this.loadData()` 改为：
```js
this.loadData(() => {
  this.checkAllDoneAndCelebrate();
});
```

同时在 `onShow` 中保持 `this.loadData()` 不变（无回调）。

- [ ] **Step 2: 添加 Canvas overlay 到 checkin.wxml**

在 checkin.wxml 的 `</view>` (最外层 page) 之前添加：

```html
<!-- Celebration Canvas Overlay -->
<canvas
  wx:if="{{showCelebration}}"
  type="2d"
  id="celebrationCanvas"
  class="celebration-canvas"
></canvas>
```

- [ ] **Step 3: 添加 Canvas overlay 样式到 checkin.wxss**

```css
.celebration-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 999;
  pointer-events: none;
}
```

- [ ] **Step 4: 验证**

在微信开发者工具中：
- 创建两个当天活跃任务
- 逐个打卡
- 最后一个打卡时，触发猫爪印飘落动画
- 2.5秒后动画自动消失
- 动画期间不能交互（pointer-events: none）

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/checkin/
git commit -m "feat: add celebration paw animation on all tasks done"
```

---

### Task 10: 最终集成验证

- [ ] **Step 1: 全局验证所有功能**

在微信开发者工具中完整走一遍：

1. **统计页**：记账页 → 点击 📊 → 统计页展示，切换时间范围，柱状图和饼图正常渲染
2. **月视图**：记录 Tab → 切换到月视图 → 日历三色显示 → 点击日期看详情 → 切换月份
3. **自定义分类**：记账添加页 → 新增分类 → 选择新分类记账 → 提交成功
4. **庆祝动画**：打卡页 → 确保至少2个活跃任务 → 逐一打卡 → 最后完成时播放动画
5. **回归**：确认原有功能不受影响（打卡切换、记账流水、任务CRUD）

- [ ] **Step 2: 验证无报错**

检查微信开发者工具 Console 无报错。

- [ ] **Step 3: Commit（如有遗留修改）**

```bash
git status
git add -A
git commit -m "chore: final integration tweaks"
```
