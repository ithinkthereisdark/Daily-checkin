const db = wx.cloud.database();
const app = getApp();
const { ensureCategories, ensureEmojiLibrary } = require('../../utils/emoji');

Page({
  data: {
    tab: 'expense',
    categories: [],           // filtered by tab
    emojiLibrary: [],         // 用于新增时选择图标
    showAddForm: false,
    newCategoryName: '',
    newCategoryEmoji: '📌'
  },

  onShow() {
    const nickName = app.globalData.nickName;
    Promise.all([
      ensureCategories(nickName),
      ensureEmojiLibrary(nickName)
    ]).then(([categories, emojiLibrary]) => {
      this._allCategories = categories;
      this.setData({ emojiLibrary });
      this.filterCategories();
    }).catch(err => {
      console.error('Load category data failed:', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    });
  },

  filterCategories() {
    const tab = this.data.tab;
    const categories = (this._allCategories || [])
      .filter(c => c.type === tab)
      .sort((a, b) => {
        // 预设排在前面
        if (a.isPreset && !b.isPreset) return -1;
        if (!a.isPreset && b.isPreset) return 1;
        return 0;
      });
    this.setData({ categories });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    this.filterCategories();
  },

  openAddForm() {
    const defaultEmoji = this.data.emojiLibrary.length > 0 ? this.data.emojiLibrary[0] : '📌';
    this.setData({
      showAddForm: true,
      newCategoryName: '',
      newCategoryEmoji: defaultEmoji
    });
  },

  closeAddForm() {
    this.setData({ showAddForm: false });
  },

  goEmojiManager() {
    wx.navigateTo({ url: '/pages/emoji-manager/emoji-manager' });
  },

  onCategoryNameInput(e) {
    this.setData({ newCategoryName: e.detail.value });
  },

  selectEmoji(e) {
    this.setData({ newCategoryEmoji: e.currentTarget.dataset.emoji });
  },

  addCategory() {
    const name = this.data.newCategoryName.trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }

    const nickName = app.globalData.nickName;
    db.collection('categories').add({
      data: {
        name,
        emoji: this.data.newCategoryEmoji,
        type: this.data.tab,
        isPreset: false,
        nickName,
        createTime: new Date()
      }
    }).then(() => {
      wx.showToast({ title: '分类已添加', icon: 'success' });
      this.setData({ showAddForm: false });
      // 重新加载
      return ensureCategories(nickName);
    }).then(categories => {
      this._allCategories = categories;
      this.filterCategories();
    }).catch(err => {
      console.error('Add category failed:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  deleteCategory(e) {
    const item = e.currentTarget.dataset.item;
    if (item.isPreset) {
      wx.showToast({ title: '预设分类不可删除', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除分类',
      content: `确定删除「${item.name}」吗？`,
      success: (res) => {
        if (!res.confirm) return;
        db.collection('categories').doc(item._id).remove()
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            const nickName = app.globalData.nickName;
            return ensureCategories(nickName);
          })
          .then(categories => {
            this._allCategories = categories;
            this.filterCategories();
          })
          .catch(err => {
            console.error('Delete category failed:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      }
    });
  }
});
