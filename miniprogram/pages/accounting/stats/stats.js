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
        } else {
          this.setData({ totalIncome: 0, totalExpense: 0, totalBalance: 0 });
        }
      })
      .catch(err => {
        if (err.errCode === -502005) {
          this.setData({
            totalIncome: 0, totalExpense: 0, totalBalance: 0
          });
          wx.showToast({ title: '请先创建账本', icon: 'none' });
          return;
        }
        console.error('Load ledger failed:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.loadData();
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
        wx.showToast({ title: '加载统计失败', icon: 'none' });
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

  drawTrendChart() {
    // Will be implemented in Task 3
  },

  drawPieChart() {
    // Will be implemented in Task 4
  }
});
