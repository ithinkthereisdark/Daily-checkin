const db = wx.cloud.database();
const app = getApp();
const { getAll } = require('../../utils/db');

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
    selectedCheckins: [],
    displayTasks: [],
    displayCount: 0,
    checkedCount: 0,

    // Backfill
    backfillTask: null,
    backfillToday: ''
  },

  onShow() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      monthDisplay: `${now.getFullYear()}年${now.getMonth() + 1}月`,
      backfillToday: todayStr
    });
    this.loadHistory();
  },

  loadHistory(callback) {
    const nickName = app.globalData.nickName;

    return Promise.all([
      db.collection('tasks').where({ nickName }).limit(100).get(),
      getAll((limit) => db.collection('checkins').where({ nickName }).orderBy('_id', 'desc').limit(limit))
    ]).then(([tasksRes, allCheckins]) => {
      const taskMap = {};
      tasksRes.data.forEach(t => { taskMap[t._id] = t; });

      this._taskMap = taskMap;
      this._allCheckins = allCheckins;
      // allCheckins is already a flat array from getAll()

      // Day view groups
      const dateMap = {};
      allCheckins.forEach(c => {
        const task = taskMap[c.taskId];
        // Backward compat: normalize images to displayImages array
        const displayImages = c.images && c.images.length
          ? c.images
          : (c.image ? [c.image] : []);
        if (!dateMap[c.date]) dateMap[c.date] = [];
        dateMap[c.date].push({
          ...c,
          displayImages,
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
    }).finally(() => {
      if (callback) callback();
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
    let kid = 0;

    for (let i = 0; i < startWeekDay; i++) {
      row.push({ day: '', empty: true, kid: kid++ });
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

      row.push({ day: d, date: dateStr, state, isToday: dateStr === todayStr, isFuture: dateStr > todayStr, kid: kid++ });

      if (row.length === 7) {
        grid.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      while (row.length < 7) row.push({ day: '', empty: true, kid: kid++ });
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
    this._selectDate(date);
  },

  _selectDate(date) {
    const allCheckins = this._allCheckins || [];
    const taskMap = this._taskMap || {};

    const checkinMap = {};
    allCheckins
      .filter(c => c.date === date)
      .forEach(c => { checkinMap[c.taskId] = c; });

    const allTasks = Object.values(taskMap).filter(t =>
      t.startDate <= date && t.endDate >= date
    );

    const displayTasks = allTasks.map(task => {
      const checkin = checkinMap[task._id];
      return {
        taskId: task._id,
        taskName: task.name,
        taskEmoji: task.emoji,
        checkedIn: !!checkin,
        checkin: checkin ? {
          _id: checkin._id,
          description: checkin.description || '',
          displayImages: checkin.images && checkin.images.length
            ? checkin.images
            : (checkin.image ? [checkin.image] : []),
          date: checkin.date
        } : null
      };
    });

    displayTasks.sort((a, b) => {
      if (a.checkedIn && !b.checkedIn) return -1;
      if (!a.checkedIn && b.checkedIn) return 1;
      return 0;
    });

    this.setData({
      selectedDate: date,
      displayTasks,
      displayCount: displayTasks.length,
      checkedCount: displayTasks.filter(t => t.checkedIn).length,
      selectedCheckins: allCheckins.filter(c => c.date === date).map(c => ({
        ...c,
        displayImages: c.images && c.images.length
          ? c.images
          : (c.image ? [c.image] : []),
        taskName: taskMap[c.taskId] ? taskMap[c.taskId].name : '(已删除)',
        taskEmoji: taskMap[c.taskId] ? taskMap[c.taskId].emoji : '❓'
      }))
    });
  },

  getWeekday(dateStr) {
    const d = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[d.getDay()];
  },

  deleteRecord(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '删除记录',
      content: `确定删除 ${item.date}「${item.taskName}」的打卡记录吗？`,
      success: (res) => {
        if (!res.confirm) return;
        db.collection('checkins').doc(item._id).remove()
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            const selDate = this.data.selectedDate;
            this.loadHistory(() => {
              if (selDate) this._selectDate(selDate);
            });
          })
          .catch(err => {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    });
  },

  backfillFromHistory(e) {
    const { taskId } = e.currentTarget.dataset;
    const task = (this._taskMap || {})[taskId];
    if (!task) return;

    if (task.checkinCount >= task.targetCount) {
      wx.showToast({ title: '已达成目标次数', icon: 'none' });
      return;
    }

    this.setData({ backfillTask: task });
  },

  cancelBackfill() {
    this.setData({ backfillTask: null });
  },

  onBackfillDateChange(e) {
    const date = e.detail.value;
    const task = this.data.backfillTask;
    if (!task) return;

    this.setData({ backfillTask: null });
    const nickName = app.globalData.nickName;

    db.collection('checkins')
      .where({ taskId: task._id, nickName, date })
      .limit(1)
      .get()
      .then(res => {
        if (res.data.length > 0) {
          wx.showToast({ title: '此日期已打卡', icon: 'none' });
          return;
        }

        if (task.needDetail) {
          wx.navigateTo({
            url: `/pages/detail/detail?taskId=${task._id}&date=${date}`
          });
          return;
        }

        return db.collection('checkins').add({
          data: {
            taskId: task._id,
            date,
            nickName,
            description: '',
            images: [],
            createTime: new Date()
          }
        });
      })
      .then(() => {
        if (task.needDetail) return;
        wx.showToast({ title: '已补打', icon: 'success' });
        const selDate = this.data.selectedDate;
        this.loadHistory(() => {
          if (selDate) this._selectDate(selDate);
        });
      })
      .catch(err => {
        console.error('补打失败', err);
        wx.showToast({ title: '补打失败', icon: 'none' });
      });
  },

  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    if (url) {
      wx.previewImage({ urls: urls || [url], current: url });
    }
  }
});
