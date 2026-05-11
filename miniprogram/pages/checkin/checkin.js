const db = wx.cloud.database();
const app = getApp();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMOJI_LIST = ['🐱','📌','✅','🏃','📚','💪','🎯','✍️','🎨','🎵','🧘','💧','🍎','💤','📝','🧹','💰','💻','🌱','🙏','⭐','🔥','❤️','📅','🎓','🏠','🍽️','🚶','🧠','📖','🎮','🐾','😺','🎀','🍥','🐈','💩'];

function defaultStartDate() {
  return todayStr();
}

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    tasks: [],
    activeTasks: [],
    loading: false,

    // Management form state
    showNewForm: false,
    editingId: '',
    emojiList: EMOJI_LIST,
    formData: {},
    submitting: false
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

      const countMap = {};
      allCheckins.forEach(c => {
        countMap[c.taskId] = (countMap[c.taskId] || 0) + 1;
      });

      const merged = tasks.map(task => ({
        ...task,
        checkinCount: countMap[task._id] || 0,
        checkedInToday: !!todayMap[task._id],
        todayDoc: todayMap[task._id] || null,
        isExpired: task.endDate < today,
        isNotStarted: task.startDate > today
      }));

      merged.sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
        return a.createTime > b.createTime ? 1 : -1;
      });

      const activeTasks = merged.filter(t => !t.isExpired && !t.isNotStarted);

      this.setData({ tasks: merged, activeTasks, loading: false });
    }).catch(err => {
      console.error('加载数据失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // ========== Check-in area ==========

  onTapCheckin(e) {
    if (this.data.loading) return;
    const task = e.currentTarget.dataset.task;

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

    this.setData({ loading: true });

    if (task.checkedInToday) {
      db.collection('checkins').doc(task.todayDoc._id).remove()
        .then(() => { wx.showToast({ title: '已取消', icon: 'none' }); })
        .catch(() => { wx.showToast({ title: '取消失败', icon: 'none' }); })
        .finally(() => { this.loadData(); });
    } else {
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
  },

  // ========== Management area ==========

  openNewForm() {
    this.setData({
      showNewForm: true,
      editingId: '',
      formData: {
        name: '',
        emoji: '📌',
        startDate: defaultStartDate(),
        endDate: defaultEndDate(),
        targetCount: 7,
        needDetail: false
      }
    });
  },

  openEditForm(e) {
    const task = e.currentTarget.dataset.task;
    this.setData({
      showNewForm: false,
      editingId: task._id,
      formData: {
        name: task.name,
        emoji: task.emoji,
        startDate: task.startDate,
        endDate: task.endDate,
        targetCount: task.targetCount,
        needDetail: task.needDetail
      }
    });
  },

  cancelForm() {
    this.setData({ showNewForm: false, editingId: '' });
  },

  onNameInput(e) {
    this.setData({ 'formData.name': e.detail.value });
  },

  selectEmoji(e) {
    this.setData({ 'formData.emoji': e.currentTarget.dataset.emoji });
  },

  onStartDateChange(e) {
    this.setData({ 'formData.startDate': e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ 'formData.endDate': e.detail.value });
  },

  onTargetInput(e) {
    const v = parseInt(e.detail.value) || 0;
    this.setData({ 'formData.targetCount': Math.max(0, v) });
  },

  toggleNeedDetail(e) {
    this.setData({ 'formData.needDetail': e.detail.value });
  },

  submitForm() {
    const { formData, editingId, submitting } = this.data;
    if (submitting) return;

    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' });
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (formData.endDate < formData.startDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中' });

    const data = {
      name: formData.name.trim(),
      emoji: formData.emoji,
      startDate: formData.startDate,
      endDate: formData.endDate,
      targetCount: formData.targetCount,
      needDetail: formData.needDetail
    };

    const promise = editingId
      ? db.collection('tasks').doc(editingId).update({ data })
      : db.collection('tasks').add({
          data: {
            ...data,
            nickName: app.globalData.nickName,
            createTime: new Date()
          }
        });

    promise.then(() => {
      wx.hideLoading();
      wx.showToast({ title: editingId ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showNewForm: false, editingId: '', submitting: false });
      this.loadData();
    }).catch(err => {
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    });
  },

  deleteTask(e) {
    const task = e.currentTarget.dataset.task;
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${task.name}」及其所有打卡记录吗？`,
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中' });
        // Cascade delete checkins
        db.collection('checkins').where({ taskId: task._id }).get()
          .then(res => {
            const ids = res.data.map(d => d._id);
            const delPromises = ids.length > 0
              ? ids.map(id => db.collection('checkins').doc(id).remove())
              : [];
            return Promise.all(delPromises);
          })
          .then(() => db.collection('tasks').doc(task._id).remove())
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadData();
          })
          .catch(err => {
            wx.hideLoading();
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    });
  }
});
