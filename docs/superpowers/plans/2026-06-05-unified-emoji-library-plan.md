# 统一图标库 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造统一的 emoji 图标库 + 重建记账分类系统，数据存云数据库，两人自动同步。

**Architecture:** 新增 `utils/emoji.js` 作为基础工具层（预设常量 + seed 逻辑），新增 emoji-manager 和 category-manager 两个管理页，改造 checkin/accounting/add 三处的 emoji 选择器，全部从云数据库读写。

**Tech Stack:** WeChat Mini Program native, WeChat Cloud Base (Cloud Database only)

---

## File Structure

| 文件 | 职责 |
|------|------|
| `utils/emoji.js` (新增) | 预设 emoji 列表、预设分类列表、seed 函数。单一数据出口。 |
| `pages/emoji-manager/emoji-manager.{js,wxml,wxss,json}` (新增) | emoji 库管理页：查看、添加、删除 |
| `pages/category-manager/category-manager.{js,wxml,wxss,json}` (新增) | 分类管理页：查看、添加、删除分类，emoji 从库中选取 |
| `app.json` (修改) | 注册两个新页面 |
| `pages/checkin/checkin.{js,wxml}` (修改) | 任务表单 emoji 选择器改为从 DB 读取 |
| `pages/accounting/accounting.{js,wxml}` (修改) | 账本创建弹窗 emoji 选择器改为从 DB 读取 |
| `pages/accounting/add/add.{js,wxml}` (修改) | 分类选择从 DB 读取，移除旧的 merge 逻辑和底部弹窗 |

---

### Task 1: Create `utils/emoji.js` — foundational utility

**Files:**
- Create: `miniprogram/utils/emoji.js`

- [ ] **Step 1: Write the utility file**

```js
// miniprogram/utils/emoji.js
const db = wx.cloud.database();

// ===== 预设 Emoji 列表（合并 checkin + accounting + add 三处并去重）=====
const PRESET_EMOJIS = [
  '🐱','📌','✅','🏃','📚','💪','🎯','✍️','🎨','🎵','🧘','💧','🍎','💤','📝','🧹',
  '💰','💻','🌱','🙏','⭐','🔥','❤️','📅','🎓','🏠','🍽️','🚶','🧠','📖','🎮',
  '🐾','😺','🎀','🍥','🐈','💩','📒','💵','🏦','💳','📊','💼','🚗','💎',
  '🚌','🛍️','💊','📱','👗','💄','🎁','📈','📋','↩️'
];

// ===== 预设分类列表 =====
const PRESET_CATEGORIES = [
  // 支出
  { name: '餐饮', emoji: '🍽️', type: 'expense' },
  { name: '交通', emoji: '🚌', type: 'expense' },
  { name: '购物', emoji: '🛍️', type: 'expense' },
  { name: '住房', emoji: '🏠', type: 'expense' },
  { name: '娱乐', emoji: '🎮', type: 'expense' },
  { name: '医疗', emoji: '💊', type: 'expense' },
  { name: '教育', emoji: '📚', type: 'expense' },
  { name: '通讯', emoji: '📱', type: 'expense' },
  { name: '服饰', emoji: '👗', type: 'expense' },
  { name: '美容', emoji: '💄', type: 'expense' },
  { name: '运动', emoji: '🏃', type: 'expense' },
  { name: '宠物', emoji: '🐱', type: 'expense' },
  { name: '礼物', emoji: '🎁', type: 'expense' },
  { name: '办公', emoji: '💼', type: 'expense' },
  { name: '其他', emoji: '📌', type: 'expense' },
  // 收入
  { name: '工资', emoji: '💰', type: 'income' },
  { name: '礼金', emoji: '🎁', type: 'income' },
  { name: '理财', emoji: '📈', type: 'income' },
  { name: '兼职', emoji: '💼', type: 'income' },
  { name: '报销', emoji: '📋', type: 'income' },
  { name: '退款', emoji: '↩️', type: 'income' },
  { name: '其他', emoji: '📌', type: 'income' }
];

/**
 * 确保 emoji_library 已 seed——如果该用户无数据则写入预设列表
 * @param {string} nickName
 * @returns {Promise<Array>} emoji 字符数组
 */
function ensureEmojiLibrary(nickName) {
  return db.collection('emoji_library').where({ nickName }).limit(1).get()
    .then(res => {
      if (res.data.length > 0) {
        // 已有数据，直接返回
        return db.collection('emoji_library').where({ nickName })
          .orderBy('createTime', 'asc').limit(200).get();
      }
      // 首次使用——seed 预设
      const batch = PRESET_EMOJIS.map(emoji => ({
        emoji,
        nickName,
        createTime: new Date()
      }));
      // 逐条添加（云数据库不支持批量 add）
      return Promise.all(batch.map(data =>
        db.collection('emoji_library').add({ data })
      )).then(() =>
        db.collection('emoji_library').where({ nickName })
          .orderBy('createTime', 'asc').limit(200).get()
      );
    })
    .then(res => res.data.map(item => item.emoji))
    .catch(err => {
      console.error('Load emoji_library failed:', err);
      // Fallback: 返回预设列表
      return [...PRESET_EMOJIS];
    });
}

/**
 * 确保 categories 已 seed——如果该用户无数据则写入预设分类
 * @param {string} nickName
 * @returns {Promise<Array>} 分类对象数组 [{_id, name, emoji, type, isPreset}, ...]
 */
function ensureCategories(nickName) {
  return db.collection('categories').where({ nickName }).limit(1).get()
    .then(res => {
      if (res.data.length > 0) {
        // 已有数据（可能是旧版自定义分类），不覆盖，但补充缺失的预设分类
        return db.collection('categories').where({ nickName }).limit(200).get();
      }
      // 首次使用——seed 预设
      return Promise.all(PRESET_CATEGORIES.map(cat =>
        db.collection('categories').add({
          data: {
            name: cat.name,
            emoji: cat.emoji,
            type: cat.type,
            isPreset: true,
            nickName,
            createTime: new Date()
          }
        })
      )).then(() =>
        db.collection('categories').where({ nickName }).limit(200).get()
      );
    })
    .then(res => res.data)
    .catch(err => {
      console.error('Load categories failed:', err);
      // Fallback: 返回预设分类（带上 isPreset）
      return PRESET_CATEGORIES.map((c, i) => ({ ...c, isPreset: true, _id: 'fallback_' + i }));
    });
}

module.exports = {
  PRESET_EMOJIS,
  PRESET_CATEGORIES,
  ensureEmojiLibrary,
  ensureCategories
};
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/utils/emoji.js
git commit -m "feat: add emoji utility with preset lists and seed logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Create emoji-manager page (4 files)

**Files:**
- Create: `miniprogram/pages/emoji-manager/emoji-manager.js`
- Create: `miniprogram/pages/emoji-manager/emoji-manager.wxml`
- Create: `miniprogram/pages/emoji-manager/emoji-manager.wxss`
- Create: `miniprogram/pages/emoji-manager/emoji-manager.json`

- [ ] **Step 1: Create `emoji-manager.json`**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "图标管理"
}
```

- [ ] **Step 2: Create `emoji-manager.js`**

```js
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
            if (res.data.length === 0) return;
            return Promise.all(res.data.map(doc =>
              db.collection('emoji_library').doc(doc._id).remove()
            ));
          })
          .then(() => {
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
```

- [ ] **Step 3: Create `emoji-manager.wxml`**

```xml
<view class="page">
  <view class="emoji-grid">
    <view
      class="emoji-cell"
      wx:for="{{emojis}}"
      wx:key="*this"
      data-emoji="{{item}}"
      bindlongpress="deleteEmoji"
    >
      <text class="emoji-char">{{item}}</text>
    </view>
  </view>

  <view class="add-bar">
    <button class="add-btn" bindtap="openAddForm">+ 添加新图标</button>
  </view>

  <!-- Add Form Overlay -->
  <view class="sheet-overlay" wx:if="{{showAddForm}}" bindtap="closeAddForm">
    <view class="sheet-content" catchtap>
      <view class="sheet-handle"></view>
      <view class="form-title">添加新图标</view>
      <view class="form-hint">在输入框中输入任意 emoji 字符</view>
      <input
        class="emoji-input"
        placeholder="点击这里输入图标..."
        value="{{newEmoji}}"
        bindinput="onEmojiInput"
        maxlength="2"
        focus="{{showAddForm}}"
      />
      <view class="form-actions">
        <view class="form-btn cancel" bindtap="closeAddForm">取消</view>
        <view class="form-btn confirm" bindtap="addEmoji">确定</view>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: Create `emoji-manager.wxss`**

```css
.page {
  padding: 30rpx;
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.emoji-cell {
  width: calc((100% - 60rpx) / 4);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFBF7;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(180,140,120,0.08);
}

.emoji-char {
  font-size: 48rpx;
}

.add-bar {
  margin-top: 40rpx;
  text-align: center;
}

.add-btn {
  width: 100%;
  background: #FFFBF7;
  border: 2rpx dashed #D7CCC8;
  border-radius: 16rpx;
  color: #A1887F;
  font-size: 28rpx;
  padding: 20rpx;
}

/* Bottom Sheet */
.sheet-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.35);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet-content {
  width: 100%;
  background: #FFFBF7;
  border-radius: 32rpx 32rpx 0 0;
  padding: 30rpx;
}

.sheet-handle {
  width: 60rpx;
  height: 6rpx;
  background: #D7CCC8;
  border-radius: 3rpx;
  margin: 0 auto 24rpx;
}

.form-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #5D4037;
  text-align: center;
  margin-bottom: 12rpx;
}

.form-hint {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #BCAAA4;
  margin-bottom: 24rpx;
}

.emoji-input {
  width: 100%;
  height: 80rpx;
  background: #F5F0EB;
  border-radius: 14rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  font-size: 36rpx;
  text-align: center;
  margin-bottom: 24rpx;
}

.form-actions {
  display: flex;
  gap: 20rpx;
}

.form-btn {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  border-radius: 14rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.form-btn.cancel {
  background: #F5F0EB;
  color: #8D7B72;
}

.form-btn.confirm {
  background: #E8905C;
  color: #fff;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/emoji-manager/
git commit -m "feat: add emoji manager page with add/delete support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Create category-manager page (4 files)

**Files:**
- Create: `miniprogram/pages/category-manager/category-manager.js`
- Create: `miniprogram/pages/category-manager/category-manager.wxml`
- Create: `miniprogram/pages/category-manager/category-manager.wxss`
- Create: `miniprogram/pages/category-manager/category-manager.json`

- [ ] **Step 1: Create `category-manager.json`**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "分类管理"
}
```

- [ ] **Step 2: Create `category-manager.js`**

```js
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
```

- [ ] **Step 3: Create `category-manager.wxml`**

```xml
<view class="page">
  <!-- Type Tabs -->
  <view class="type-tabs">
    <view class="type-tab {{tab === 'expense' ? 'active' : ''}}" data-tab="expense" bindtap="switchTab">支出</view>
    <view class="type-tab {{tab === 'income' ? 'active' : ''}}" data-tab="income" bindtap="switchTab">收入</view>
  </view>

  <!-- Category List -->
  <view class="cat-list">
    <view
      class="cat-row"
      wx:for="{{categories}}"
      wx:key="_id"
      data-item="{{item}}"
      bindlongpress="deleteCategory"
    >
      <text class="cat-emoji">{{item.emoji}}</text>
      <text class="cat-name">{{item.name}}</text>
      <text wx:if="{{item.isPreset}}" class="cat-preset-tag">预设</text>
      <text wx:else class="cat-delete-hint">长按删除</text>
    </view>

    <view wx:if="{{categories.length === 0}}" class="empty">
      <text class="empty-emoji">📝</text>
      <text class="empty-text">暂无分类</text>
    </view>
  </view>

  <!-- Add Button -->
  <view class="add-bar">
    <button class="add-btn" bindtap="openAddForm">+ 新增分类</button>
  </view>

  <!-- Add Form Overlay -->
  <view class="sheet-overlay" wx:if="{{showAddForm}}" bindtap="closeAddForm">
    <view class="sheet-content" catchtap>
      <view class="sheet-handle"></view>
      <view class="form-title">新增分类</view>

      <view class="form-label">选择图标</view>
      <view class="emoji-grid">
        <view
          class="emoji-cell {{newCategoryEmoji === item ? 'selected' : ''}}"
          wx:for="{{emojiLibrary}}"
          wx:key="*this"
          data-emoji="{{item}}"
          bindtap="selectEmoji"
        >{{item}}</view>
      </view>

      <input
        class="form-input"
        placeholder="分类名称"
        value="{{newCategoryName}}"
        bindinput="onCategoryNameInput"
        maxlength="8"
      />

      <view class="form-actions">
        <view class="form-btn cancel" bindtap="closeAddForm">取消</view>
        <view class="form-btn confirm" bindtap="addCategory">确定</view>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: Create `category-manager.wxss`**

```css
.page {
  padding: 30rpx;
}

/* Type Tabs */
.type-tabs {
  display: flex;
  background: #FFFBF7;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(180,140,120,0.06);
}

.type-tab {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #8D7B72;
}

.type-tab.active {
  background: #E8905C;
  color: #fff;
}

/* Category List */
.cat-list {
  background: #FFFBF7;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(180,140,120,0.06);
}

.cat-row {
  display: flex;
  align-items: center;
  padding: 24rpx 24rpx;
  border-bottom: 1rpx solid #F5F0EB;
}

.cat-row:last-child {
  border-bottom: none;
}

.cat-emoji {
  font-size: 38rpx;
  margin-right: 16rpx;
}

.cat-name {
  font-size: 28rpx;
  color: #5D4037;
  font-weight: 500;
  flex: 1;
}

.cat-preset-tag {
  font-size: 20rpx;
  color: #BCAAA4;
  background: #F5F0EB;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.cat-delete-hint {
  font-size: 20rpx;
  color: #D7CCC8;
}

/* Empty */
.empty {
  text-align: center;
  padding: 60rpx 0;
}

.empty-emoji {
  display: block;
  font-size: 60rpx;
  margin-bottom: 12rpx;
}

.empty-text {
  font-size: 26rpx;
  color: #BCAAA4;
}

/* Add Bar */
.add-bar {
  margin-top: 30rpx;
}

.add-btn {
  width: 100%;
  background: #FFFBF7;
  border: 2rpx dashed #D7CCC8;
  border-radius: 16rpx;
  color: #A1887F;
  font-size: 28rpx;
  padding: 20rpx;
}

/* Bottom Sheet */
.sheet-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.35);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet-content {
  width: 100%;
  max-height: 80vh;
  background: #FFFBF7;
  border-radius: 32rpx 32rpx 0 0;
  padding: 30rpx;
  overflow-y: auto;
}

.sheet-handle {
  width: 60rpx;
  height: 6rpx;
  background: #D7CCC8;
  border-radius: 3rpx;
  margin: 0 auto 24rpx;
}

.form-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #5D4037;
  text-align: center;
  margin-bottom: 24rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: #8D7B72;
  margin-bottom: 12rpx;
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.emoji-grid .emoji-cell {
  width: calc((100% - 98rpx) / 8);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F0EB;
  border-radius: 12rpx;
  font-size: 32rpx;
  border: 3rpx solid transparent;
}

.emoji-grid .emoji-cell.selected {
  border-color: #E8905C;
  background: #FFF2EC;
}

.form-input {
  width: 100%;
  height: 80rpx;
  background: #F5F0EB;
  border-radius: 14rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  margin-bottom: 24rpx;
}

.form-actions {
  display: flex;
  gap: 20rpx;
}

.form-btn {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  border-radius: 14rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.form-btn.cancel {
  background: #F5F0EB;
  color: #8D7B72;
}

.form-btn.confirm {
  background: #E8905C;
  color: #fff;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/category-manager/
git commit -m "feat: add category manager page with preset/custom support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Register new pages in app.json

**Files:**
- Modify: `miniprogram/app.json`

- [ ] **Step 1: Add new pages to app.json**

Read `miniprogram/app.json` and insert the two new pages in the `pages` array (order doesn't matter for non-tab pages, but put them after existing pages):

```json
{
  "pages": [
    "pages/checkin/checkin",
    "pages/accounting/accounting",
    "pages/history/history",
    "pages/detail/detail",
    "pages/tools/tools",
    "pages/tools/audio-trim/index",
    "pages/accounting/add/add",
    "pages/accounting/stats/stats",
    "pages/emoji-manager/emoji-manager",
    "pages/category-manager/category-manager"
  ],
  ...
}
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/app.json
git commit -m "feat: register emoji-manager and category-manager pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Modify checkin page — emoji from DB

**Files:**
- Modify: `miniprogram/pages/checkin/checkin.js`
- Modify: `miniprogram/pages/checkin/checkin.wxml`

- [ ] **Step 1: Update `checkin.js`**

In `checkin.js`, make these changes:

1. Remove the `EMOJI_LIST` constant (lines 10).
2. Add `const { ensureEmojiLibrary } = require('../../utils/emoji');` at the top.
3. In `data`, change `emojiList: EMOJI_LIST` to `emojiList: []`.
4. Add a `loadEmojiLibrary()` method that calls `ensureEmojiLibrary`.
5. Call `loadEmojiLibrary()` in `onShow()`.
6. In `openNewForm()`, set `formData.emoji` to the first emoji from the library or '📌' as fallback.

```js
const db = wx.cloud.database();
const app = getApp();
const { getAll } = require('../../utils/db');
const { ensureEmojiLibrary } = require('../../utils/emoji');
```

Remove the `EMOJI_LIST` constant (line 10, the entire Array).

In `data`, change:
```js
emojiList: [],
```

Add the `loadEmojiLibrary` method and call it in `onShow`:

```js
onShow() {
  this.loadEmojiLibrary();
  this.loadData(() => {
    if (this._pendingCheck) {
      this._pendingCheck = false;
      this.checkAllDoneAndCelebrate();
    }
  });
},

loadEmojiLibrary() {
  const nickName = app.globalData.nickName;
  ensureEmojiLibrary(nickName).then(emojis => {
    this.setData({ emojiList: emojis });
  });
},
```

In `openNewForm()`, change the `formData.emoji` default from `'📌'` to use the library's first emoji:
```js
const defaultEmoji = this.data.emojiList.length > 0 ? this.data.emojiList[0] : '📌';
this.setData({
  showNewForm: true,
  editingId: '',
  formData: {
    name: '',
    emoji: defaultEmoji,
    startDate: defaultStartDate(),
    endDate: defaultEndDate(),
    targetCount: 7,
    needDetail: false
  }
});
```

Also in `openEditForm()`, keep the existing emoji (it comes from the task data):
```js
openEditForm(e) {
  const task = e.currentTarget.dataset.task;
  this.setData({
    showNewForm: false,
    editingId: task._id,
    formData: {
      name: task.name,
      emoji: task.emoji,
      ...
    }
  });
},
```
(No change needed here — just verifying the task's own emoji is preserved.)

- [ ] **Step 2: Update `checkin.wxml`**

In the emoji grid area, add a "管理图标" link below the emoji grid:

```xml
<view class="form-item">
  <text class="form-label">🎨 选择图标</text>
  <view class="emoji-grid">
    <block wx:for="{{emojiList}}" wx:key="*this">
      <view class="emoji-cell {{formData.emoji === item ? 'selected' : ''}}" data-emoji="{{item}}" bindtap="selectEmoji">{{item}}</view>
    </block>
  </view>
  <view class="manage-link" bindtap="goEmojiManager">
    <text>管理图标 →</text>
  </view>
</view>
```

The `goEmojiManager` method in `checkin.js`:
```js
goEmojiManager() {
  wx.navigateTo({ url: '/pages/emoji-manager/emoji-manager' });
},
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/checkin/checkin.js miniprogram/pages/checkin/checkin.wxml
git commit -m "feat: migrate checkin emoji picker to unified emoji library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Modify accounting page — ledger emoji from DB

**Files:**
- Modify: `miniprogram/pages/accounting/accounting.js`
- Modify: `miniprogram/pages/accounting/accounting.wxml`

- [ ] **Step 1: Update `accounting.js`**

1. Remove `LEDGER_EMOJIS` constant (line 5).
2. Add `const { ensureEmojiLibrary } = require('../../utils/emoji');` at the top.
3. In `data`, change `ledgerEmojis: LEDGER_EMOJIS` to `ledgerEmojis: []`.
4. Add `loadEmojiLibrary()` method, call it in `onShow()`.

```js
const db = wx.cloud.database();
const app = getApp();
const _ = db.command;
const { ensureEmojiLibrary } = require('../../utils/emoji');
```

Remove `const LEDGER_EMOJIS = [...]` entirely.

In `data`, change:
```js
ledgerEmojis: [],
```

Add to the Page object:
```js
onShow() {
  this.initMonth();
  this.loadEmojiLibrary();
  this.loadData();
},

loadEmojiLibrary() {
  const nickName = app.globalData.nickName;
  ensureEmojiLibrary(nickName).then(emojis => {
    this.setData({ ledgerEmojis: emojis });
  });
},
```

In `openLedgerForm()`, set default emoji from library:
```js
openLedgerForm() {
  const defaultEmoji = this.data.ledgerEmojis.length > 0 ? this.data.ledgerEmojis[0] : '📒';
  this.setData({
    showLedgerPicker: false,
    showLedgerForm: true,
    newLedgerName: '',
    newLedgerEmoji: defaultEmoji
  });
},
```

- [ ] **Step 2: Update `accounting.wxml`**

Add a "管理图标" link below the emoji grid in the ledger form overlay. In the New Ledger Form Overlay section, after the emoji grid:
```xml
<view class="emoji-grid">
  <view
    class="emoji-cell {{newLedgerEmoji === item ? 'selected' : ''}}"
    wx:for="{{ledgerEmojis}}"
    wx:key="*this"
    data-emoji="{{item}}"
    bindtap="selectLedgerEmoji"
  >{{item}}</view>
</view>
<view class="manage-link" bindtap="goEmojiManager">
  <text>管理图标 →</text>
</view>
```

Add the `goEmojiManager` method to `accounting.js`:
```js
goEmojiManager() {
  wx.navigateTo({ url: '/pages/emoji-manager/emoji-manager' });
},
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/accounting.js miniprogram/pages/accounting/accounting.wxml
git commit -m "feat: migrate accounting ledger emoji picker to unified emoji library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Modify accounting add page — categories from DB

**Files:**
- Modify: `miniprogram/pages/accounting/add/add.js`
- Modify: `miniprogram/pages/accounting/add/add.wxml`

- [ ] **Step 1: Update `add.js`**

This is the largest change. The page currently has:
- Hardcoded `EXPENSE_CATEGORIES` and `INCOME_CATEGORIES`
- `loadCustomCategories()` + `mergeCategories()` pattern
- `openCategoryForm()` / `saveCategory()` / `deleteCategory()` — inline category management

We replace all of this with:
- Read categories from DB via `ensureCategories()`
- Navigate to `category-manager` page for management
- Keep `selectCategory` interaction as-is (it works with whatever data we give it)

Full rewrite of relevant sections:

```js
const db = wx.cloud.database();
const app = getApp();
const { ensureCategories } = require('../../utils/emoji');

// Remove EXPENSE_CATEGORIES and INCOME_CATEGORIES constants entirely
// Keep the evaluate() function and todayStr() helper as-is
```

In `data`, remove: `customCategories`, `showCategoryForm`, `newCategoryName`, `newCategoryEmoji`, `categoryFormType`, `categoryEmojis`.

The updated data block:
```js
data: {
  isEdit: false,
  editId: '',
  ledgers: [],
  currentLedger: null,
  showLedgerPicker: false,
  type: 'expense',
  categories: [],
  selectedCategory: '',
  selectedCategoryEmoji: '',
  description: '',
  date: '',
  expression: '',
  currentInput: '',
  result: '0',
  saving: false
},
```

In `onLoad`, replace `this.loadCustomCategories()` with category loading:
```js
onLoad(options) {
  if (options.id) {
    this.setData({ isEdit: true, editId: options.id });
    wx.setNavigationBarTitle({ title: '编辑记录' });
  } else {
    wx.setNavigationBarTitle({ title: '记一笔' });
  }
  this.setData({
    date: this.todayStr(),
    preferredLedgerId: options.ledgerId || ''
  });
  const isEdit = this.data.isEdit && this.data.editId;
  this.loadLedgers().then(() => {
    if (isEdit) {
      return this.loadTransaction();
    }
  });
  this.loadCategories();  // independent of ledger loading
},
```

Replace `loadCustomCategories()` + `mergeCategories()` with:
```js
loadCategories() {
  const nickName = app.globalData.nickName;
  ensureCategories(nickName).then(categories => {
    this._allCategories = categories;
    this.filterCategories();
  });
},

filterCategories() {
  const type = this.data.type;
  const categories = (this._allCategories || [])
    .filter(c => c.type === type)
    .sort((a, b) => {
      if (a.isPreset && !b.isPreset) return -1;
      if (!a.isPreset && b.isPreset) return 1;
      return 0;
    });
  this.setData({ categories });
},
```

In `switchType`, call `filterCategories()` instead of `mergeCategories()`:
```js
switchType(e) {
  const type = e.currentTarget.dataset.type;
  this.setData({
    type,
    selectedCategory: '',
    selectedCategoryEmoji: ''
  });
  this.filterCategories();
},
```

In `loadTransaction`, after setting data, call `filterCategories()` instead of `mergeCategories()`:
```js
loadTransaction() {
  db.collection('transactions').doc(this.data.editId).get()
    .then(res => {
      const tx = res.data;
      if (!tx) return;
      const currentLedger = this.data.ledgers.find(l => l._id === tx.ledgerId) || this.data.currentLedger;
      this.setData({
        currentLedger,
        type: tx.type,
        selectedCategory: tx.category,
        selectedCategoryEmoji: tx.categoryEmoji,
        description: tx.description || '',
        date: tx.date,
        expression: String(tx.amount),
        currentInput: '',
        result: String(tx.amount)
      });
      this.filterCategories();
    })
    .catch(err => {
      console.error('Load transaction failed:', err);
    });
},
```

Remove these methods entirely:
- `loadCustomCategories()`
- `mergeCategories()`
- `openCategoryForm()`
- `closeCategoryForm()`
- `onCategoryNameInput()`
- `selectCategoryEmoji()`
- `saveCategory()`
- `deleteCategory()`

Add navigation to category manager:
```js
goCategoryManager() {
  wx.navigateTo({ url: '/pages/category-manager/category-manager' });
},
```

- [ ] **Step 2: Update `add.wxml`**

Replace the category management section. Keep the category grid but add a link to the manager page. Remove the entire bottom sheet for "新增分类" (lines 95-120).

After the category grid, replace:
```xml
<!-- + 新增分类按钮 -->
<view class="add-cat-btn" data-type="{{type}}" bindtap="openCategoryForm">
  <text class="add-cat-icon">+</text>
  <text class="add-cat-text">新增分类</text>
</view>
```

With:
```xml
<view class="manage-link" bindtap="goCategoryManager">
  <text>管理分类 →</text>
</view>
```

Remove the entire "Add Category Bottom Sheet" section (from `<!-- Add Category Bottom Sheet -->` to its closing `</view>` — lines 95-120).

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/accounting/add/add.js miniprogram/pages/accounting/add/add.wxml
git commit -m "feat: migrate accounting categories to unified system, remove inline form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Dependency Order

```
Task 1 (utils/emoji.js)
  ├── Task 2 (emoji-manager page)
  ├── Task 3 (category-manager page)
  ├── Task 5 (checkin modification)
  ├── Task 6 (accounting modification)
  └── Task 7 (add page modification)
Task 4 (app.json) — after pages are created
```

Recommended execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7
