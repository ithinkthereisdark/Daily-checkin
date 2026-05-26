const db = wx.cloud.database();
const app = getApp();
const _ = db.command;

Page({
  data: {
    currentLedger: null,
    trendType: 'expense',
    totalIncome: 0,
    totalExpense: 0,
    totalBalance: 0,
    rankList: [],
    pieData: [],
    trendDays: [],
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
          this.setData({ totalIncome: 0, totalExpense: 0, totalBalance: 0 });
          wx.showToast({ title: '请先创建账本', icon: 'none' });
          return;
        }
        console.error('Load ledger failed:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  switchTrendType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ trendType: type });
    if (this._rawTransactions) {
      this.buildRankListFrom(this._rawTransactions);
      this.buildPieDataFrom(this._rawTransactions);
      setTimeout(() => {
        this.drawTrendChart();
        this.drawPieChart();
      }, 200);
    }
  },

  loadData() {
    const { currentLedger } = this.data;
    if (!currentLedger) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const dateEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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
            trendDays: [], trendData: [], rankList: [], pieData: []
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
    const { dateStart } = this.data;
    const startDate = new Date(dateStart);
    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ key: dateStr, label: String(d) });
    }

    const dayMap = {};
    days.forEach(d => { dayMap[d.key] = { income: 0, expense: 0 }; });
    transactions.forEach(tx => {
      if (dayMap[tx.date]) {
        if (tx.type === 'income') dayMap[tx.date].income += tx.amount;
        else dayMap[tx.date].expense += tx.amount;
      }
    });

    const trendData = days.map(d => ({
      day: d.label,
      income: Math.round(dayMap[d.key].income * 100) / 100,
      expense: Math.round(dayMap[d.key].expense * 100) / 100
    }));

    this.setData({ trendDays: days, trendData });
  },

  buildRankListFrom(transactions) {
    const trendType = this.data.trendType;
    const catMap = {};
    transactions.forEach(tx => {
      if (tx.type !== trendType) return;
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
    const trendType = this.data.trendType;
    const colors = ['#E8905C','#FFB74D','#FFCC80','#FFE0B2','#FFF3E0','#BCAAA4','#A1887F','#8D6E63','#FFAB91','#F8BBD0'];
    const catMap = {};
    transactions.forEach(tx => {
      if (tx.type !== trendType) return;
      const key = tx.category;
      if (!catMap[key]) catMap[key] = { category: key, emoji: tx.categoryEmoji, amount: 0 };
      catMap[key].amount += tx.amount;
    });
    const total = Object.values(catMap).reduce((s, c) => s + c.amount, 0);

    if (total === 0) {
      this.setData({ pieData: [] });
      return;
    }

    const items = Object.values(catMap)
      .map(c => ({ ...c, amount: Math.round(c.amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const pieData = items.map((item, i) => ({
      ...item,
      percent: Math.round(item.amount / total * 10000) / 100,
      color: colors[i % colors.length]
    }));

    const pctSum = pieData.reduce((s, p) => s + p.percent, 0);
    if (pieData.length > 0 && pctSum !== 100) {
      pieData[pieData.length - 1].percent += Math.round((100 - pctSum) * 100) / 100;
    }

    this.setData({ pieData });
  },

  drawTrendChart() {
    const { trendData, trendType } = this.data;
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
      ctx.save();
      ctx.scale(dpr, dpr);

      const pad = { top: 20, right: 16, bottom: 36, left: 44 };
      const chartW = width - pad.left - pad.right;
      const chartH = height - pad.top - pad.bottom;

      // Find max value
      let maxVal = 0;
      trendData.forEach(d => {
        const val = trendType === 'income' ? d.income : d.expense;
        if (val > maxVal) maxVal = val;
      });
      if (maxVal === 0) maxVal = 100;
      maxVal = maxVal * 1.15;

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
      const barColor = trendType === 'income' ? '#2E7D32' : '#C62828';
      const barGap = Math.max(2, Math.min(6, chartW / trendData.length * 0.3));
      const barW = (chartW - barGap * (trendData.length + 1)) / trendData.length;

      trendData.forEach((d, i) => {
        const val = trendType === 'income' ? d.income : d.expense;
        const barH = (val / maxVal) * chartH;
        const bx = pad.left + barGap + (barW + barGap) * i;

        ctx.fillStyle = barColor;
        ctx.fillRect(bx, pad.top + chartH - barH, barW, Math.max(barH, 1));

        // Day label (show every few days to avoid crowding)
        const showLabel = trendData.length <= 15 || i % 3 === 0 || i === trendData.length - 1;
        if (showLabel) {
          ctx.fillStyle = '#8D7B72';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(d.day, bx + barW / 2, height - 6);
        }
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

      ctx.restore();
    });
  },

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
      ctx.save();
      ctx.scale(dpr, dpr);

      const cx = size / 2;
      const cy = size / 2;
      const outerR = size / 2 - 10;
      const innerR = outerR * 0.55;

      ctx.clearRect(0, 0, size, size);

      let startAngle = -Math.PI / 2;
      pieData.forEach(d => {
        const sliceAngle = (d.percent / 100) * Math.PI * 2;

        ctx.beginPath();
        ctx.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();

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

      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFBF7';
      ctx.fill();

      ctx.restore();
    });
  }
});
