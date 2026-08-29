const db = wx.cloud.database();
const app = getApp();
const { awardCheckin, maybeAwardTaskCompletion } = require('../../utils/points');

const MAX_IMAGES = 3;

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
    imagePaths: [],   // mixed: cloud:// fileIDs (saved) + temp paths (newly selected)
    uploading: false,
    backfillDate: ''
  },

  onLoad(options) {
    const taskId = options.taskId;
    const backfillDate = options.date || '';
    this.setData({ taskId, backfillDate });

    db.collection('tasks').doc(taskId).get().then(res => {
      this.setData({ task: res.data });
    });

    const nickName = app.globalData.nickName;
    const today = backfillDate || todayStr();
    db.collection('checkins').where({ taskId, nickName, date: today }).limit(100).get()
      .then(res => {
        if (res.data.length > 0) {
          const doc = res.data[0];
          // Backward compat: prefer images array, fallback to single image field
          let imagePaths = [];
          if (doc.images && doc.images.length > 0) {
            imagePaths = doc.images;
          } else if (doc.image) {
            imagePaths = [doc.image];
          }

          this.setData({
            isUpdate: true,
            existingId: doc._id,
            description: doc.description || '',
            imagePaths
          });
        }
      });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  chooseImage() {
    const currentCount = this.data.imagePaths.length;
    const remaining = MAX_IMAGES - currentCount;
    if (remaining <= 0) return;

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPaths = res.tempFiles.map(f => f.tempFilePath);
        this.setData({
          imagePaths: [...this.data.imagePaths, ...newPaths]
        });
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const imagePaths = [...this.data.imagePaths];
    imagePaths.splice(index, 1);
    this.setData({ imagePaths });
  },

  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    // collect all displayable URLs (temp paths and cloud fileIDs both work)
    const urls = this.data.imagePaths;
    wx.previewImage({ urls, current: url });
  },

  submit() {
    const { description, imagePaths, isUpdate, existingId, taskId, uploading, task, backfillDate } = this.data;
    if (uploading) return;

    // Guard against expired/not-started task
    const today = backfillDate || todayStr();
    if (task && task.endDate < today) {
      wx.showToast({ title: '任务已过期', icon: 'none' });
      return;
    }
    if (task && task.startDate > today) {
      wx.showToast({ title: '任务还未开始', icon: 'none' });
      return;
    }

    if (!description.trim() && imagePaths.length === 0) {
      wx.showToast({ title: '请填写描述或添加图片', icon: 'none' });
      return;
    }

    this.setData({ uploading: true });
    wx.showLoading({ title: '提交中' });

    // Separate: cloud fileIDs (already uploaded) vs temp paths (need upload)
    const cloudFiles = imagePaths.filter(p => p.startsWith('cloud://'));
    const newPaths = imagePaths.filter(p => !p.startsWith('cloud://'));

    const uploadPromises = newPaths.map(path =>
      wx.cloud.uploadFile({
        cloudPath: 'checkins/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg',
        filePath: path
      })
    );

    Promise.allSettled(uploadPromises).then(results => {
      const uploadedFileIDs = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.fileID);

      if (uploadedFileIDs.length < newPaths.length) {
        console.warn(`${newPaths.length - uploadedFileIDs.length} images failed to upload`);
      }

      // Combine previously-saved cloud files with newly uploaded ones
      const images = [...cloudFiles, ...uploadedFileIDs];

      const data = {
        taskId,
        date: today,
        nickName: app.globalData.nickName,
        description: description.trim(),
        images,
        isBackfill: !!backfillDate,
        createTime: new Date()
      };

      if (isUpdate) {
        return db.collection('checkins').doc(existingId).update({
          data: { description: data.description, images: data.images }
        }).then(() => null);
      }
      return db.collection('checkins').add({ data }).then(res => res._id);
    }).then((newId) => {
      wx.hideLoading();
      if (newId) {
        // 新增打卡（含补打）：补打单次 0 分，但补打也计入任务完成进度
        if (!backfillDate) {
          const plan = awardCheckin(newId, app.globalData.nickName, today, task ? task.name : '');
          wx.showToast({ title: '打卡成功 +' + (plan.base + plan.critExtra) + (plan.critExtra ? ' ⚡' : ''), icon: 'success' });
        } else {
          wx.showToast({ title: '打卡成功', icon: 'success' });
        }
        if (task) maybeAwardTaskCompletion(taskId, app.globalData.nickName, task.targetCount, task.name);
      } else {
        wx.showToast({ title: isUpdate ? '已更新' : '打卡成功', icon: 'success' });
      }
      setTimeout(() => { wx.navigateBack(); }, 600);
    }).catch(err => {
      wx.hideLoading();
      console.error('提交失败', err);
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ uploading: false });
    });
  }
});
