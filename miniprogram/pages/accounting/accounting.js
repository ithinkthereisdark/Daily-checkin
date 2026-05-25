const db = wx.cloud.database();
const app = getApp();
const _ = db.command;

const LEDGER_EMOJIS = ['📒', '💰', '💵', '🏦', '💳', '📊', '💼', '🏠', '🚗', '🐱', '💎', '🎯', '📝', '❤️', '⭐', '📌'];

Page({
  data: {
    ledgers: [],
    currentLedger: null,
    monthKey: '',
    monthDisplay: '',
    displayYear: '',
    displayMonth: '',
    monthStart: '',
    monthEnd: '',
    groupedTransactions: [],
    monthlyIncome: 0,
    monthlyExpense: 0,
    monthlyBalance: 0,
    showDetail: false,
    detailTx: null,
    showLedgerPicker: false,
    showLedgerForm: false,
    newLedgerName: '',
    newLedgerEmoji: '📒',
    ledgerEmojis: LEDGER_EMOJIS,
    loading: true
  },

  onShow() {
    this.initMonth();
    this.loadData();
  },

  initMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthStart = `${monthKey}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
    this.setData({
      monthKey,
      monthDisplay: `${year}年${month}月`,
      displayYear: `${year}`,
      displayMonth: `${month}月`,
      monthStart,
      monthEnd
    });
  },

  loadData() {
    this.setData({ loading: true });
    const nickName = app.globalData.nickName;

    db.collection('ledgers').where({ nickName }).orderBy('createTime', 'asc').get()
      .then(res => {
        if (res.data.length === 0) {
          return this.createDefaultLedger().then(ledger => {
            this.setData({ ledgers: [ledger], currentLedger: ledger });
          });
        }
        const ledgers = res.data;
        const lastId = wx.getStorageSync('lastLedgerId');
        let currentLedger = null;
        if (lastId) currentLedger = ledgers.find(l => l._id === lastId);
        if (!currentLedger) currentLedger = ledgers.find(l => l.isDefault) || ledgers[0];
        this.setData({ ledgers, currentLedger });
      })
      .catch(err => {
        // Collection not yet created — create it with a default ledger
        if (err.errCode === -502005) {
          return this.createDefaultLedger().then(ledger => {
            this.setData({ ledgers: [ledger], currentLedger: ledger });
          });
        }
        throw err;
      })
      .then(() => {
        if (this.data.currentLedger) {
          this.loadTransactions();
        } else {
          this.setData({ loading: false });
        }
      })
      .catch(err => {
        console.error('Load data failed:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      });
  },

  createDefaultLedger() {
    const nickName = app.globalData.nickName;
    return db.collection('ledgers').add({
      data: {
        name: '默认账本',
        emoji: '📒',
        isDefault: true,
        nickName,
        createTime: new Date()
      }
    }).then(res => ({ _id: res._id, name: '默认账本', emoji: '📒', isDefault: true }));
  },

  loadTransactions() {
    const { currentLedger, monthStart, monthEnd } = this.data;
    db.collection('transactions')
      .where({
        nickName: app.globalData.nickName,
        ledgerId: currentLedger._id,
        date: _.gte(monthStart).and(_.lte(monthEnd))
      })
      .orderBy('date', 'desc')
      .orderBy('createTime', 'desc')
      .limit(500)
      .get()
      .then(res => {
        const transactions = res.data;
        const grouped = this.groupTransactions(transactions);
        const { monthlyIncome, monthlyExpense } = this.calcSummary(transactions);
        this.setData({
          groupedTransactions: grouped,
          monthlyIncome,
          monthlyExpense,
          monthlyBalance: Math.round((monthlyIncome - monthlyExpense) * 100) / 100,
          loading: false
        });
      })
      .catch(err => {
        // Collection not yet created — no transactions, just show empty
        if (err.errCode === -502005) {
          this.setData({
            groupedTransactions: [],
            monthlyIncome: 0,
            monthlyExpense: 0,
            monthlyBalance: 0,
            loading: false
          });
          return;
        }
        console.error('Load transactions failed:', err);
        this.setData({ loading: false });
      });
  },

  groupTransactions(transactions) {
    const groups = {};
    transactions.forEach(tx => {
      if (!groups[tx.date]) {
        groups[tx.date] = {
          date: tx.date,
          weekday: this.getWeekday(tx.date),
          transactions: [],
          dayIncome: 0,
          dayExpense: 0
        };
      }
      groups[tx.date].transactions.push(tx);
      if (tx.type === 'income') {
        groups[tx.date].dayIncome += tx.amount;
      } else {
        groups[tx.date].dayExpense += tx.amount;
      }
    });

    return Object.values(groups)
      .map(g => ({
        ...g,
        dayTotal: Math.round((g.dayIncome - g.dayExpense) * 100) / 100
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  getWeekday(dateStr) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[new Date(dateStr).getDay()];
  },

  calcSummary(transactions) {
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') monthlyIncome += tx.amount;
      else monthlyExpense += tx.amount;
    });
    return {
      monthlyIncome: Math.round(monthlyIncome * 100) / 100,
      monthlyExpense: Math.round(monthlyExpense * 100) / 100
    };
  },

  selectMonth(e) {
    const val = e.detail.value;
    const [year, month] = val.split('-');
    const monthKey = val;
    const monthStart = `${val}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const monthEnd = `${val}-${String(lastDay).padStart(2, '0')}`;

    this.setData({
      monthKey,
      monthDisplay: `${year}年${parseInt(month)}月`,
      displayYear: year,
      displayMonth: `${parseInt(month)}月`,
      monthStart,
      monthEnd
    });
    this.loadTransactions();
  },

  toggleLedgerPicker() {
    this.setData({ showLedgerPicker: !this.data.showLedgerPicker });
  },

  switchLedger(e) {
    const id = e.currentTarget.dataset.id;
    const ledger = this.data.ledgers.find(l => l._id === id);
    if (ledger && ledger._id !== this.data.currentLedger._id) {
      wx.setStorageSync('lastLedgerId', ledger._id);
      this.setData({ currentLedger: ledger, showLedgerPicker: false });
      this.loadTransactions();
    } else {
      this.setData({ showLedgerPicker: false });
    }
  },

  openLedgerForm() {
    this.setData({
      showLedgerPicker: false,
      showLedgerForm: true,
      newLedgerName: '',
      newLedgerEmoji: '📒'
    });
  },

  closeLedgerForm() {
    this.setData({ showLedgerForm: false });
  },

  onLedgerNameInput(e) {
    this.setData({ newLedgerName: e.detail.value });
  },

  selectLedgerEmoji(e) {
    this.setData({ newLedgerEmoji: e.currentTarget.dataset.emoji });
  },

  createLedger() {
    const { newLedgerName, newLedgerEmoji } = this.data;
    const name = newLedgerName.trim();
    if (!name) {
      wx.showToast({ title: '请输入账本名称', icon: 'none' });
      return;
    }

    const nickName = app.globalData.nickName;
    db.collection('ledgers').add({
      data: {
        name,
        emoji: newLedgerEmoji,
        isDefault: false,
        nickName,
        createTime: new Date()
      }
    }).then(res => {
      const newLedger = { _id: res._id, name, emoji: newLedgerEmoji, isDefault: false };
      const ledgers = [...this.data.ledgers, newLedger];
      wx.setStorageSync('lastLedgerId', newLedger._id);
      this.setData({
        ledgers,
        currentLedger: newLedger,
        showLedgerForm: false
      });
      this.loadTransactions();
      wx.showToast({ title: '账本已创建', icon: 'success' });
    }).catch(err => {
      console.error('Create ledger failed:', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
    });
  },

  showDetail(e) {
    const txId = e.currentTarget.dataset.id;
    let found = null;
    this.data.groupedTransactions.some(group =>
      group.transactions.some(tx => {
        if (tx._id === txId) { found = tx; return true; }
        return false;
      })
    );
    if (found) {
      this.setData({ showDetail: true, detailTx: found });
    }
  },

  hideDetail() {
    this.setData({ showDetail: false, detailTx: null });
  },

  editTransaction() {
    const id = this.data.detailTx._id;
    this.hideDetail();
    wx.navigateTo({ url: `/pages/accounting/add/add?id=${id}` });
  },

  deleteTransaction() {
    const tx = this.data.detailTx;
    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条记账记录吗？',
      success: (res) => {
        if (res.confirm) {
          db.collection('transactions').doc(tx._id).remove()
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.hideDetail();
              this.loadTransactions();
            })
            .catch(err => {
              console.error('Delete failed:', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  },

  goAdd() {
    const ledgerId = this.data.currentLedger ? this.data.currentLedger._id : '';
    wx.navigateTo({ url: `/pages/accounting/add/add?ledgerId=${ledgerId}` });
  }
});
