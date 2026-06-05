# 月视图全任务显示 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 月视图点击日期后列出当天所有活动任务，已打卡/未打卡用不同底色区分，未打卡可长按补打。

**Architecture:** 修改 `tapDate` 方法构建全任务合并列表，WXML 用 wx:if 区分两种 item 样式。

**Tech Stack:** WeChat Mini Program native

---

### Task: history 月视图增强

**Files:**
- Modify: `miniprogram/pages/history/history.js`
- Modify: `miniprogram/pages/history/history.wxml`
- Modify: `miniprogram/pages/history/history.wxss`

- [ ] **Step 1: 重写 `tapDate` 方法**

替换现有的 `tapDate`，改为构建当天全任务列表（已打卡 + 未打卡）：

```js
tapDate(e) {
  const { date, empty, isFuture } = e.currentTarget.dataset;
  if (empty || isFuture) return;

  const allCheckins = this._allCheckins || [];
  const taskMap = this._taskMap || {};

  // 当天打卡记录 map: taskId → checkin
  const checkinMap = {};
  allCheckins
    .filter(c => c.date === date)
    .forEach(c => { checkinMap[c.taskId] = c; });

  // 当天所有活动任务
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

  // 已打卡排前面
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
    // 保留 selectedCheckins 给月视图删除功能复用
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
```

在 data 中添加：
```js
displayTasks: [],
displayCount: 0,
checkedCount: 0,
```

- [ ] **Step 2: 更新 WXML 的 `.cal-detail` 区域**

替换月视图中选中日期的详情区域，使用新的 `displayTasks`：

```xml
<view wx:if="{{selectedDate}}" class="cal-detail">
  <view class="cal-detail-header">
    <text class="cal-detail-date">{{selectedDate}}</text>
    <text class="cal-detail-count" wx:if="{{displayCount > 0}}">{{checkedCount}}/{{displayCount}} 已打卡</text>
  </view>
  <view wx:if="{{displayTasks.length === 0}}" class="cal-detail-empty">当天无任务</view>
  <view class="checkin-list" wx:else>
    <block wx:for="{{displayTasks}}" wx:key="taskId">
      <!-- 已打卡 -->
      <view wx:if="{{item.checkedIn}}" class="checkin-item" bindlongpress="deleteRecord" data-item="{{item.checkin}}">
        <text class="item-emoji">{{item.taskEmoji}}</text>
        <view class="item-body">
          <text class="item-name">{{item.taskName}}</text>
          <text wx:if="{{item.checkin.description}}" class="item-desc">{{item.checkin.description}}</text>
          <view wx:if="{{item.checkin.displayImages.length > 0}}" class="item-images">
            <image
              wx:for="{{item.checkin.displayImages}}"
              wx:key="*this"
              src="{{innerItem}}"
              mode="aspectFill"
              class="item-image"
              data-url="{{innerItem}}"
              data-urls="{{item.checkin.displayImages}}"
              bindtap="previewImage">
            </image>
          </view>
        </view>
      </view>
      <!-- 未打卡 -->
      <view wx:else class="checkin-item unchecked" bindlongpress="backfillFromHistory" data-task-id="{{item.taskId}}" data-task-name="{{item.taskName}}" data-task-emoji="{{item.taskEmoji}}" data-date="{{selectedDate}}">
        <text class="item-emoji unchecked-emoji">{{item.taskEmoji}}</text>
        <view class="item-body">
          <text class="item-name unchecked-name">{{item.taskName}}</text>
          <text class="unchecked-hint">未打卡</text>
        </view>
      </view>
    </block>
  </view>
</view>
```

> 注意：`wx:for="{{item.checkin.displayImages}}"` 内部用 `wx:for-item="innerItem"` 避免与外层 `item` 冲突。

- [ ] **Step 3: 添加 `backfillFromHistory` 方法**

在 history.js 中添加补打方法：

```js
backfillFromHistory(e) {
  const { taskId, taskName, taskEmoji, date } = e.currentTarget.dataset;
  const nickName = app.globalData.nickName;

  // 检查是否已达目标次数
  db.collection('checkins').where({ taskId, nickName }).count()
    .then(res => {
      const task = (this._taskMap || {})[taskId];
      if (task && task.targetCount && res.total >= task.targetCount) {
        wx.showToast({ title: '已达成目标次数', icon: 'none' });
        return Promise.reject('target reached');
      }
      return db.collection('checkins').add({
        data: {
          taskId,
          date,
          nickName,
          description: '',
          images: [],
          createTime: new Date()
        }
      });
    })
    .then(() => {
      wx.showToast({ title: `已补打 ${date}`, icon: 'success' });
      this.loadHistory();
    })
    .catch(err => {
      if (err === 'target reached') return;
      console.error('补打失败', err);
      wx.showToast({ title: '补打失败', icon: 'none' });
    });
},
```

- [ ] **Step 4: 添加未打卡样式**

在 history.wxss 末尾添加：

```css
.checkin-item.unchecked {
  background: rgba(0, 0, 0, 0.02);
}

.unchecked-emoji {
  opacity: 0.4;
}

.unchecked-name {
  color: #BCAAA4;
}

.unchecked-hint {
  font-size: 22rpx;
  color: #D7CCC8;
  margin-top: 4rpx;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/history/history.js miniprogram/pages/history/history.wxml miniprogram/pages/history/history.wxss
git commit -m "feat: show all tasks in month view with checked/unchecked distinction"
```
