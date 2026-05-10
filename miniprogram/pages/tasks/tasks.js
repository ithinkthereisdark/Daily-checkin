const db = wx.cloud.database();
const app = getApp();

const EMOJI_LIST = ['📌','✅','🏃','📚','💪','🎯','✍️','🎨','🎵','🧘','💧','🍎','💤','📝','🧹','💰','💻','🌱','🙏','⭐','🔥','❤️','📅','🎓','🏠','🍽️','🚶','🧠','📖','🎮','💩'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    tasks: [],
    showForm: false,
    formIndex: -1,  // -1 = new, >= 0 = edit index
    formData: {
      name: '',
      emoji: '📌',
      startDate: '',
      endDate: '',
      targetCount: 7,
      needDetail: false
    },
    emojiList: EMOJI_LIST
  },

  onShow() {
    this.loadTasks();
  },

  loadTasks() {
    db.collection('tasks')
      .where({ nickName: app.globalData.nickName })
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        this.setData({ tasks: res.data });
      })
      .catch(err => {
        console.error('加载任务失败', err);
      });
  },

  openCreateForm() {
    const t = todayStr();
    const weekLater = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    this.setData({
      showForm: true,
      formIndex: -1,
      formData: {
        name: '',
        emoji: '📌',
        startDate: t,
        endDate: weekLater,
        targetCount: 7,
        needDetail: false
      }
    });
  },

  openEditForm(e) {
    const idx = e.currentTarget.dataset.index;
    const task = this.data.tasks[idx];
    this.setData({
      showForm: true,
      formIndex: idx,
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
    this.setData({ showForm: false });
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

  toggleNeedDetail() {
    this.setData({ 'formData.needDetail': !this.data.formData.needDetail });
  },

  submitForm() {
    const { formIndex, formData } = this.data;
    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' });
      return;
    }
    if (formData.startDate > formData.endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      emoji: formData.emoji,
      startDate: formData.startDate,
      endDate: formData.endDate,
      targetCount: formData.targetCount,
      needDetail: formData.needDetail,
    };

    let promise;
    if (formIndex >= 0) {
      promise = db.collection('tasks').doc(this.data.tasks[formIndex]._id).update({ data: payload });
    } else {
      payload.nickName = app.globalData.nickName;
      payload.createTime = new Date();
      promise = db.collection('tasks').add({ data: payload });
    }

    promise.then(() => {
      wx.showToast({ title: formIndex >= 0 ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false });
      this.loadTasks();
    }).catch(err => {
      console.error('保存任务失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  deleteTask(e) {
    const idx = e.currentTarget.dataset.index;
    const task = this.data.tasks[idx];
    wx.showModal({
      title: '删除任务',
      content: `确定删除「${task.name}」吗？所有打卡记录也会一起删除。`,
      success: (res) => {
        if (!res.confirm) return;
        // Delete checkins for this task, then delete the task
        db.collection('checkins').where({ taskId: task._id }).remove()
          .then(() => db.collection('tasks').doc(task._id).remove())
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadTasks();
          })
          .catch(err => {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    });
  }
});
