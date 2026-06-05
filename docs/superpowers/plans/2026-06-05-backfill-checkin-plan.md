# 补打功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打卡页长按任务卡片补打历史日期 + 记录页日视图长按删除打卡记录

**Architecture:** 三个独立页面修改：checkin 页加长按补打（底部浮动 picker）、detail 页支持 date 参数、history 页日视图加长按删除

**Tech Stack:** WeChat Mini Program native, WeChat Cloud Base

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `pages/checkin/checkin.js` (修改) | 长按处理 → 校验 → 底部补打栏 → 创建/跳转 |
| `pages/checkin/checkin.wxml` (修改) | 底部补打栏：picker + 取消按钮 |
| `pages/detail/detail.js` (修改) | 支持 `date` 参数替代 `todayStr()` |
| `pages/history/history.js` (修改) | 长按删除打卡记录 |
| `pages/history/history.wxml` (修改) | 日视图打卡项加 `bindlongpress` |

所有修改互不依赖，可独立执行。

---

### Task 1: checkin 长按补打

**Files:**
- Modify: `miniprogram/pages/checkin/checkin.js`
- Modify: `miniprogram/pages/checkin/checkin.wxml`

- [ ] **Step 1: 在 `checkin.js` data 中添加补打状态字段**

在 `data` 对象中添加：
```js
backfillTask: null,       // { task } — 当前正在补打的任务
backfillToday: '',        // 今天的日期字符串，供 picker end 属性使用
```

- [ ] **Step 2: 在 `onShow` 及 `loadData` 中设置 `backfillToday`**

在 `onShow` 开头和 `loadData` 回调中设置：
```js
this.setData({ backfillToday: todayStr() });
```

- [ ] **Step 3: 添加 `onLongPressTask` 方法**

在 Page 对象中添加新方法，放在 `onTapCheckin` 附近：

```js
onLongPressTask(e) {
  if (this.data.loading) return;
  const task = e.currentTarget.dataset.task;

  // 过期任务不可补打
  if (task.isExpired) {
    wx.showToast({ title: '任务已过期', icon: 'none' });
    return;
  }
  // 未开始任务不可补打
  if (task.isNotStarted) {
    wx.showToast({ title: '任务还未开始', icon: 'none' });
    return;
  }
  // 已达目标次数不可补打
  if (task.checkinCount >= task.targetCount) {
    wx.showToast({ title: '已达成目标次数', icon: 'none' });
    return;
  }

  this.setData({ backfillTask: task });
},

cancelBackfill() {
  this.setData({ backfillTask: null });
},
```

- [ ] **Step 4: 添加 `onBackfillDateChange` 方法处理日期选择**

```js
onBackfillDateChange(e) {
  const date = e.detail.value; // YYYY-MM-DD
  const task = this.data.backfillTask;
  if (!task) return;

  this.setData({ backfillTask: null });

  // 校验：该日期是否已打卡
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
        // 跳转详情页，日期预填
        wx.navigateTo({
          url: `/pages/detail/detail?taskId=${task._id}&date=${date}`
        });
        return;
      }

      // 快速打卡：直接创建
      this.setData({ loading: true });
      return db.collection('checkins').add({
        data: {
          taskId: task._id,
          date,
          nickName: app.globalData.nickName,
          description: '',
          images: [],
          createTime: new Date()
        }
      });
    })
    .then(() => {
      if (task.needDetail) return; // 已跳转详情页
      wx.showToast({ title: '已补打', icon: 'success' });
      this.loadData(() => {
        this.checkAllDoneAndCelebrate();
      });
    })
    .catch(err => {
      console.error('补打失败', err);
      wx.showToast({ title: '补打失败', icon: 'none' });
      this.setData({ loading: false });
    });
},
```

- [ ] **Step 5: 在 `checkin.wxml` 中添加底部补打栏**

在页面底部（`</view>` 关闭 `.page` 之前）添加：

```xml
<!-- Backfill bar -->
<view wx:if="{{backfillTask}}" class="backfill-bar">
  <text class="backfill-label">补打：{{backfillTask.emoji}} {{backfillTask.name}}</text>
  <picker
    mode="date"
    start="{{backfillTask.startDate}}"
    end="{{backfillToday}}"
    value="{{backfillToday}}"
    bindchange="onBackfillDateChange"
  >
    <view class="backfill-picker">📅 选择日期</view>
  </picker>
  <view class="backfill-cancel" bindtap="cancelBackfill">取消</view>
</view>
```

- [ ] **Step 6: 在任务卡片上添加 `bindlongpress`**

在 WXML 的任务卡片 `<view class="task-row ...">` 上添加 `bindlongpress="onLongPressTask"`：

找到：
```xml
<view class="task-row {{item.isExpired ? 'expired' : ''}}">
```

改为：
```xml
<view class="task-row {{item.isExpired ? 'expired' : ''}}" bindlongpress="onLongPressTask" data-task="{{item}}">
```

确保 `data-task="{{item}}"` 已存在（当前代码应该有）。

- [ ] **Step 7: 在 `checkin.wxss` 中添加底部栏样式**

在文件末尾添加：

```css
/* Backfill bar */
.backfill-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #FFFBF7;
  padding: 20rpx 30rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 16rpx;
  box-shadow: 0 -2rpx 16rpx rgba(180,140,120,0.12);
  z-index: 100;
}

.backfill-label {
  flex: 1;
  font-size: 26rpx;
  color: #5D4037;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backfill-picker {
  padding: 12rpx 24rpx;
  background: #E8905C;
  color: #fff;
  border-radius: 12rpx;
  font-size: 26rpx;
  font-weight: 600;
}

.backfill-cancel {
  padding: 12rpx 16rpx;
  color: #BCAAA4;
  font-size: 26rpx;
}
```

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/checkin/checkin.js miniprogram/pages/checkin/checkin.wxml miniprogram/pages/checkin/checkin.wxss
git commit -m "feat: add long-press backfill checkin on task cards
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: detail 页支持 date 参数

**Files:**
- Modify: `miniprogram/pages/detail/detail.js`

- [ ] **Step 1: 在 `detail.js` 中读取 `date` 参数并替代 `todayStr()`**

修改 `onLoad` 方法，读取 `options.date`：

当前 `onLoad` 中的查询逻辑用 `today` 变量（第 30 行）。改为支持外部传入的 date：

```js
onLoad(options) {
  const taskId = options.taskId;
  const backfillDate = options.date || ''; // 补打的指定日期
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
```

在 `data` 中添加：
```js
backfillDate: '',   // 补打的指定日期，为空则使用今天
```

- [ ] **Step 2: 修改 `submit` 方法使用指定日期**

在 `submit` 中，找到所有的 `todayStr()` 调用（guard 判断和创建/更新数据的 `date` 字段），替换为使用 `backfillDate`：

```js
submit() {
  const { description, imagePaths, isUpdate, existingId, taskId, uploading, task, backfillDate } = this.data;
  if (uploading) return;

  const today = backfillDate || todayStr();

  // Guard against expired/not-started task
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

    const images = [...cloudFiles, ...uploadedFileIDs];

    const data = {
      taskId,
      date: today,
      nickName: app.globalData.nickName,
      description: description.trim(),
      images,
      createTime: new Date()
    };

    if (isUpdate) {
      return db.collection('checkins').doc(existingId).update({
        data: { description: data.description, images: data.images }
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
},
```

核心改动：用 `const today = backfillDate || todayStr();` 替代所有 `todayStr()` 调用。

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/detail/detail.js
git commit -m "feat: support backfill date parameter in detail page
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: history 日视图长按删除

**Files:**
- Modify: `miniprogram/pages/history/history.js`
- Modify: `miniprogram/pages/history/history.wxml`

- [ ] **Step 1: 在 `history.js` 中添加删除方法**

```js
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
          this.loadHistory();
        })
        .catch(err => {
          console.error('删除失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
    }
  });
},
```

- [ ] **Step 2: 在 `history.wxml` 日视图的打卡项上添加长按**

找到日视图中的 `<view class="checkin-item">`，添加 `bindlongpress` 和 `data-item`：

日视图有两处 checkin-item（月视图的选中详情 + 日视图列表）。两处都需要加上：

```xml
<view class="checkin-item" bindlongpress="deleteRecord" data-item="{{item}}">
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/history/history.js miniprogram/pages/history/history.wxml
git commit -m "feat: add long-press delete in history day view
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 依赖顺序

三个任务修改不同的页面，无依赖关系，可任意顺序执行。

推荐顺序：1 → 2 → 3（checkin → detail → history）
