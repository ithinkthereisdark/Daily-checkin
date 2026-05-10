const db = wx.cloud.database();
const app = getApp();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    taskId: '',
    task: null,
    isUpdate: false,
    existingId: '',
    description: '',
    imagePath: '',
    imageCloudID: '',
    uploading: false
  },

  onLoad(options) {
    const taskId = options.taskId;
    this.setData({ taskId });

    db.collection('tasks').doc(taskId).get().then(res => {
      this.setData({ task: res.data });
    });

    const nickName = app.globalData.nickName;
    const today = todayStr();
    db.collection('checkins').where({ taskId, nickName, date: today }).get()
      .then(res => {
        if (res.data.length > 0) {
          const doc = res.data[0];
          this.setData({
            isUpdate: true,
            existingId: doc._id,
            description: doc.description || '',
            imageCloudID: doc.image || '',
            imagePath: doc.image || ''
          });
        }
      });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ imagePath: res.tempFiles[0].tempFilePath, imageCloudID: '' });
      }
    });
  },

  submit() {
    const { description, imagePath, isUpdate, existingId, taskId, uploading, task } = this.data;
    if (uploading) return;

    // Guard against expired/not-started task
    const today = todayStr();
    if (task && task.endDate < today) {
      wx.showToast({ title: '任务已过期', icon: 'none' });
      return;
    }
    if (task && task.startDate > today) {
      wx.showToast({ title: '任务还未开始', icon: 'none' });
      return;
    }

    if (!description.trim() && !imagePath) {
      wx.showToast({ title: '请填写描述或添加图片', icon: 'none' });
      return;
    }

    this.setData({ uploading: true });
    wx.showLoading({ title: '提交中' });

    const uploadPromise = imagePath && !imagePath.startsWith('cloud://')
      ? wx.cloud.uploadFile({
          cloudPath: 'checkins/' + Date.now() + '.jpg',
          filePath: imagePath
        })
      : Promise.resolve({ fileID: imagePath || '' });

    uploadPromise.then(uploadRes => {
      const image = uploadRes.fileID || '';
      const data = {
        taskId,
        date: todayStr(),
        nickName: app.globalData.nickName,
        description: description.trim(),
        image,
        createTime: new Date()
      };

      if (isUpdate) {
        return db.collection('checkins').doc(existingId).update({
          data: { description: data.description, image: data.image }
        });
      }
      return db.collection('checkins').add({ data });
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: isUpdate ? '已更新' : '打卡成功', icon: 'success' });
      setTimeout(() => { wx.navigateBack(); }, 600);
    }).catch(err => {
      wx.hideLoading();
      console.error('提交失败', err);
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ uploading: false });
    });
  }
});
