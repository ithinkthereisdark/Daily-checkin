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
    const type = e.currentTarget.dataset.type;
    this.setData({ rankType: type });
    if (this._rawTransactions) {
      this.buildRankListFrom(this._rawTransactions);
      this.buildPieDataFrom(this._rawTransactions);
      setTimeout(() => this.drawPieChart(), 200);
    }
  },

  loadData() {
    // Will be implemented in Task 2
  },

  calcSummary(transactions) {
    // Will be implemented in Task 2
  },

  buildTrendData(transactions) {
    // Will be implemented in Task 2
  },

  buildRankListFrom(transactions) {
    // Will be implemented in Task 2
  },

  buildPieDataFrom(transactions) {
    // Will be implemented in Task 2
  },

  drawTrendChart() {
    // Will be implemented in Task 3
  },

  drawPieChart() {
    // Will be implemented in Task 4
  }
});
