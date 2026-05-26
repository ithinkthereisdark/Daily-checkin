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

      // Find max value for Y axis
      let maxVal = 0;
      trendData.forEach(d => {
        if (d.income > maxVal) maxVal = d.income;
        if (d.expense > maxVal) maxVal = d.expense;
      });
      if (maxVal === 0) maxVal = 100;
      maxVal = maxVal * 1.15;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw Y axis gridlines
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

      // Draw bars
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

        // Month label below bar
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

      // Legend (top right)
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

  drawPieChart() {
    // Will be implemented in Task 4
  }
});
