const db = wx.cloud.database();
const app = getApp();
const { ensureEmojiLibrary } = require('../../utils/emoji');

Page({
  data: {
    emojis: [],         // emoji 字符数组
    showAddForm: false,
    newEmoji: ''
  },

  onShow() {
    this.loadEmojis();
  },

  loadEmojis() {
    const nickName = app.globalData.nickName;
    ensureEmojiLibrary(nickName).then(emojis => {
      this.setData({ emojis });
    });
  },

  openAddForm() {
    this.setData({ showAddForm: true, newEmoji: '' });
  },

  closeAddForm() {
    this.setData({ showAddForm: false, newEmoji: '' });
  },

  onEmojiInput(e) {
    this.setData({ newEmoji: e.detail.value });
  },

  addEmoji() {
    const emoji = this.data.newEmoji.trim();
    if (!emoji) {
      wx.showToast({ title: '请输入图标', icon: 'none' });
      return;
    }

    // 检查是否已存在
    if (this.data.emojis.includes(emoji)) {
      wx.showToast({ title: '该图标已存在', icon: 'none' });
      return;
    }

    const nickName = app.globalData.nickName;
    db.collection('emoji_library').add({
      data: { emoji, nickName, createTime: new Date() }
    }).then(() => {
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ showAddForm: false, newEmoji: '' });
      this.loadEmojis();
    }).catch(err => {
      console.error('Add emoji failed:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  deleteEmoji(e) {
    const emoji = e.currentTarget.dataset.emoji;
    wx.showModal({
      title: '删除图标',
      content: `确定删除 ${emoji} 吗？已使用该图标的内容不受影响。`,
      success: (res) => {
        if (!res.confirm) return;
        const nickName = app.globalData.nickName;
        db.collection('emoji_library')
          .where({ nickName, emoji })
          .get()
          .then(res => {
            if (res.data.length === 0) return 0;
            return Promise.all(res.data.map(doc =>
              db.collection('emoji_library').doc(doc._id).remove()
            )).then(() => res.data.length);
          })
          .then(deletedCount => {
            if (deletedCount === 0) return;
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadEmojis();
          })
          .catch(err => {
            console.error('Delete emoji failed:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    });
  }
});
