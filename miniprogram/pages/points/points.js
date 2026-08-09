const db = wx.cloud.database();
const app = getApp();
const { getAll } = require('../../utils/db');
const { ACTION_META, getSummary, maybeCompensateLegacyPoints } = require('../../utils/points');
const { fetchWishes, fetchRedemptions } = require('../../utils/wishes');

Page({
  data: {
    balance: 0,
    todayNet: 0,
    monthNet: 0,
    groups: [],
    wishTotal: 0,      // 心愿单数量（右卡主数字）
    wishPrice: 0,      // 待定价数（对方心愿未定价）
    wishShip: 0,       // 待发货数（pending 核销单）
    loading: true
  },

  goWishlist() {
    wx.navigateTo({ url: '/pages/wishlist/wishlist' });
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    const nickName = app.globalData.nickName;

    // 集合尚未创建（-502005）→ 按空记录处理，让补偿逻辑顺带创建集合
    const fetchRecords = () => getAll((limit) => db.collection('points_records').where({ nickName }).orderBy('_id', 'desc').limit(limit))
      .catch(err => {
        if (err && err.errCode === -502005) return [];
        throw err;
      });

    fetchRecords()
      .then(records => maybeCompensateLegacyPoints(nickName, records).then(() => fetchRecords()))
      .then(records => Promise.all([records, fetchWishes(), fetchRedemptions()]))
      .then(([records, wishes, reds]) => {
        const { balance, todayNet, monthNet } = getSummary(records);

        // ===== 右卡心愿单统计 =====
        const needPrice = wishes.filter(w => w.status === 'open' && w.points == null && w.nickName !== nickName).length;

        const dateMap = {};
        records.forEach(r => {
          const meta = ACTION_META[r.action] || { emoji: '⭐', label: r.action };
          if (!dateMap[r.date]) {
            dateMap[r.date] = { date: r.date, weekday: this.getWeekday(r.date), records: [], dayTotal: 0 };
          }
          dateMap[r.date].records.push({ ...r, emoji: meta.emoji, label: meta.label });
          dateMap[r.date].dayTotal += r.points;
        });

        const ts = d => (d.createTime ? new Date(d.createTime).getTime() : 0);
        const groups = Object.keys(dateMap)
          .sort((a, b) => b.localeCompare(a))
          .map(d => {
            // 组内按操作时间倒序（最新在前）
            dateMap[d].records.sort((x, y) => ts(y) - ts(x));
            return dateMap[d];
          });

        this.setData({
          balance, todayNet, monthNet, groups,
          wishTotal: wishes.length,
          wishPrice: needPrice,
          wishShip: reds.filter(r => r.status === 'pending').length,
          loading: false
        });
      })
      .catch(err => {
        console.error('加载积分失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  getWeekday(dateStr) {
    const d = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[d.getDay()];
  }
});
