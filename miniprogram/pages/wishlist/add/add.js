const app = getApp();
const db = wx.cloud.database();
const { addWish } = require('../../../utils/wishes');

const MAX_IMAGES = 3;

Page({
  data: {
    isEdit: false,        // 编辑模式（从心愿卡片长按进入）
    editingId: '',
    title: '',
    description: '',
    imagePaths: [],   // mixed: cloud:// fileIDs (already uploaded) + temp paths (newly selected)
    submitting: false,
    deleting: false
  },

  onLoad(options) {
    if (!options.id) return;

    // 编辑模式：加载已有心愿预填
    this.setData({ isEdit: true, editingId: options.id });
    wx.setNavigationBarTitle({ title: '编辑心愿' });

    db.collection('wishes').doc(options.id).get()
      .then(res => {
        const w = res.data;
        this.setData({
          title: w.title,
          description: w.description || '',
          imagePaths: w.images || []
        });
      })
      .catch(err => {
        console.error('加载心愿失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  chooseImage() {
    const remaining = MAX_IMAGES - this.data.imagePaths.length;
    if (remaining <= 0) return;

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPaths = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ imagePaths: [...this.data.imagePaths, ...newPaths] });
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
    wx.previewImage({ urls: this.data.imagePaths, current: url });
  },

  submit() {
    const { title, description, imagePaths, submitting, isEdit, editingId } = this.data;
    if (submitting) return;

    if (!title.trim()) {
      wx.showToast({ title: '请输入心愿标题', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中' });

    // 区分已上传的 cloud fileID 与待上传的临时路径（detail 页同款模式）
    const cloudFiles = imagePaths.filter(p => p.startsWith('cloud://'));
    const newPaths = imagePaths.filter(p => !p.startsWith('cloud://'));

    const uploadPromises = newPaths.map(path =>
      wx.cloud.uploadFile({
        cloudPath: 'wishes/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg',
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
      const images = [...cloudFiles, ...uploadedFileIDs];

      if (isEdit) {
        // 编辑后清除定价（内容可能已变），需要对方重新定价
        return db.collection('wishes').doc(editingId).update({
          data: { title: title.trim(), description: description.trim(), images, points: null }
        });
      }
      return addWish(app.globalData.nickName, {
        title: title.trim(),
        description: description.trim(),
        images
      });
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: isEdit ? '已保存' : '心愿已添加', icon: 'success' });
      setTimeout(() => { wx.navigateBack(); }, 600);
    }).catch(err => {
      wx.hideLoading();
      console.error('保存心愿失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    });
  },

  // 编辑模式专属：删除心愿（open 状态可删，未核销/已定价均可）
  onDelete() {
    const { isEdit, editingId, deleting } = this.data;
    if (!isEdit || deleting) return;

    db.collection('wishes').doc(editingId).get()
      .then(res => {
        const w = res.data;
        if (!w || w.status !== 'open') {
          wx.showToast({ title: '有进行中的核销，无法删除', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '删除心愿',
          content: `确定删除「${w.title}」吗？${w.points != null ? '将同时清除定价信息。' : ''}`,
          confirmColor: '#C62828',
          success: (res2) => {
            if (!res2.confirm) return;
            this.setData({ deleting: true });
            db.collection('wishes').doc(editingId).remove()
              .then(() => {
                wx.showToast({ title: '已删除', icon: 'success' });
                setTimeout(() => wx.navigateBack(), 600);
              })
              .catch(err => {
                console.error('删除心愿失败', err);
                wx.showToast({ title: '删除失败', icon: 'none' });
                this.setData({ deleting: false });
              });
          }
        });
      })
      .catch(err => {
        console.error('加载心愿失败', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  }
});
