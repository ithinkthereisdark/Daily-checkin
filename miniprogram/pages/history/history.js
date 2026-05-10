const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    groups: []
  },

  onShow() {
    this.loadHistory();
  },

  loadHistory() {
    const nickName = app.globalData.nickName;

    Promise.all([
      db.collection('tasks').where({ nickName }).get(),
      db.collection('checkins').where({ nickName }).orderBy('date', 'desc').orderBy('createTime', 'desc').get()
    ]).then(([tasksRes, checkinsRes]) => {
      // Build task map
      const taskMap = {};
      tasksRes.data.forEach(t => { taskMap[t._id] = t; });

      // Group by date
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

      // Convert to sorted array (already sorted by date desc from query)
      const groups = Object.keys(dateMap)
        .sort((a, b) => b.localeCompare(a))
        .map(date => ({
          date,
          weekday: this.getWeekday(date),
          checkins: dateMap[date]
        }));

      this.setData({ groups });
    }).catch(err => {
      console.error('加载记录失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
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
