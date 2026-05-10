const db = wx.cloud.database();
const app = getApp();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    tasks: [],
    loading: false
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    const nickName = app.globalData.nickName;
    const today = todayStr();

    Promise.all([
      db.collection('tasks').where({ nickName }).orderBy('createTime', 'asc').get(),
      db.collection('checkins').where({ nickName }).get(),
      db.collection('checkins').where({ nickName, date: today }).get()
    ]).then(([tasksRes, allCheckinsRes, todayCheckinsRes]) => {
      const tasks = tasksRes.data;
      const allCheckins = allCheckinsRes.data;
      const todayMap = {};
      todayCheckinsRes.data.forEach(c => { todayMap[c.taskId] = c; });

      // Count per task
      const countMap = {};
      allCheckins.forEach(c => {
        countMap[c.taskId] = (countMap[c.taskId] || 0) + 1;
      });

      // Merge and sort
      const merged = tasks.map(task => ({
        ...task,
        checkinCount: countMap[task._id] || 0,
        checkedInToday: !!todayMap[task._id],
        todayDoc: todayMap[task._id] || null,
        isExpired: task.endDate < today,
        isNotStarted: task.startDate > today
      }));

      // Sort: active first, expired last; within each group, by createTime
      merged.sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
        return a.createTime > b.createTime ? 1 : -1;
      });

      this.setData({ tasks: merged, loading: false });
    }).catch(err => {
      console.error('加载数据失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onTapTask(e) {
    if (this.data.loading) return;
    const task = e.currentTarget.dataset.task;
    const idx = e.currentTarget.dataset.index;

    if (task.isNotStarted) {
      wx.showToast({ title: '任务还未开始', icon: 'none' });
      return;
    }
    if (task.isExpired) {
      wx.showToast({ title: '任务已过期', icon: 'none' });
      return;
    }

    if (task.needDetail) {
      if (task.checkinCount >= task.targetCount && !task.checkedInToday) {
        wx.showToast({ title: '已达成目标次数', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: `/pages/detail/detail?taskId=${task._id}` });
      return;
    }

    // Toggle: check in or cancel
    this.setData({ loading: true });

    if (task.checkedInToday) {
      db.collection('checkins').doc(task.todayDoc._id).remove()
        .then(() => { wx.showToast({ title: '已取消', icon: 'none' }); })
        .catch(() => { wx.showToast({ title: '取消失败', icon: 'none' }); })
        .finally(() => { this.loadData(); });
    } else {
      // Check if target reached
      if (task.checkinCount >= task.targetCount) {
        wx.showToast({ title: '已达成目标次数', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      db.collection('checkins').add({
        data: {
          taskId: task._id,
          date: todayStr(),
          nickName: app.globalData.nickName,
          description: '',
          image: '',
          createTime: new Date()
        }
      }).then(() => { wx.showToast({ title: '已打卡', icon: 'success' }); })
        .catch(() => { wx.showToast({ title: '打卡失败', icon: 'none' }); })
        .finally(() => { this.loadData(); });
    }
  }
});
