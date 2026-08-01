const db = wx.cloud.database();
const app = getApp();
const { getAll } = require('../../utils/db');
const { ACTION_META, getSummary } = require('../../utils/points');

Page({
  data: {
    balance: 0,
    todayNet: 0,
    monthNet: 0,
    groups: [],
    loading: true
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    const nickName = app.globalData.nickName;

    getAll((limit) => db.collection('points_records').where({ nickName }).orderBy('_id', 'desc').limit(limit))
      .then(records => {
        const { balance, todayNet, monthNet } = getSummary(records);

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

        this.setData({ balance, todayNet, monthNet, groups, loading: false });
      })
      .catch(err => {
        // 集合尚未创建（-502005）→ 空状态
        if (err.errCode === -502005) {
          this.setData({ balance: 0, todayNet: 0, monthNet: 0, groups: [], loading: false });
          return;
        }
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
