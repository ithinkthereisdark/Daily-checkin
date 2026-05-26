const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    viewMode: 'day',
    groups: [],

    // Month view
    currentYear: 0,
    currentMonth: 0,
    monthDisplay: '',
    calendarGrid: [],
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

    const dateStats = {};
    allCheckins.forEach(c => {
      if (!taskMap[c.taskId]) return;
      if (!dateStats[c.date]) dateStats[c.date] = { checkinTaskIds: new Set() };
      dateStats[c.date].checkinTaskIds.add(c.taskId);
    });

    function activeTasksOnDate(dateStr) {
      let count = 0;
      Object.values(taskMap).forEach(t => {
        if (t.startDate <= dateStr && t.endDate >= dateStr) count++;
      });
      return count;
    }

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const startWeekDay = firstDay.getDay();

    const grid = [];
    let row = [];

    for (let i = 0; i < startWeekDay; i++) {
      row.push({ day: '', empty: true });
    }

    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const stats = dateStats[dateStr];
      const checkedCount = stats ? stats.checkinTaskIds.size : 0;
      const totalActive = activeTasksOnDate(dateStr);
      let state = 'none';
      if (checkedCount > 0 && checkedCount >= totalActive && totalActive > 0) state = 'all';
      else if (checkedCount > 0) state = 'partial';

      row.push({ day: d, date: dateStr, state, isToday: dateStr === todayStr, isFuture: dateStr > todayStr });

      if (row.length === 7) {
        grid.push(row);
        row = [];
      }
    }

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
