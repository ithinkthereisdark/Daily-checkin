const db = wx.cloud.database();
const app = getApp();
const { getAll } = require('../../utils/db');
const {
  RED_LABEL, fetchWishes, fetchRedemptions,
  priceWish, redeemWish, shipRedemption, receiveRedemption, cancelRedemption,
  canPrice, canRedeem, canShip, canReceive, canCancel
} = require('../../utils/wishes');
const { getSummary } = require('../../utils/points');

function timeShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  const p = n => String(n).padStart(2, '0');
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

Page({
  data: {
    myName: '',
    balance: 0,
    stats: {},        // 顶部统计：{ total, redeemable, pendingShip, received }
    ongoing: [],      // 进行中核销单（pending/shipped，双方可见）
    theirWishes: [],  // 对方的心愿（open，可定价）
    myWishes: [],     // 我的心愿（open，可核销/待定价）
    history: [],      // 历史核销单（received/cancelled）
    loading: false,
    busy: false,
    showRedeemSuccess: false,  // 核销成功凭证弹层
    redeemCode: '',
    redeemPoints: 0,
    refreshing: false          // 手动刷新中
  },

  onShow() {
    this.loadData();
  },

  // silent=true 时静默刷新（不显示全屏 loading）
  loadData(silent) {
    if (this.data.loading) return Promise.resolve();
    const myName = app.globalData.nickName;
    if (!silent) this.setData({ loading: true, myName });
    else this.setData({ myName });

    const fetchPoints = () => getAll(
      (limit) => db.collection('points_records').where({ nickName: myName }).orderBy('_id', 'desc').limit(limit)
    ).catch(err => {
      if (err && err.errCode === -502005) return [];
      throw err;
    });

    return Promise.all([fetchWishes(), fetchRedemptions(), fetchPoints()])
      .then(([wishes, reds, records]) => {
        const balance = getSummary(records).balance;
        const wishMap = {};
        wishes.forEach(w => { wishMap[w._id] = w; });

        // 进行中：pending/shipped，最新在前
        const ongoing = reds
          .filter(r => r.status === 'pending' || r.status === 'shipped')
          .map(r => ({
            ...r,
            meta: RED_LABEL[r.status],
            timeShort: timeShort(r.createTime),
            wish: wishMap[r.wishId] || null,
            canShip: canShip(r, myName),
            canReceive: canReceive(r, myName),
            canCancel: canCancel(r, myName)
          }))
          .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

        // 心愿状态 tag：未定价 → 待定价；已定价 → 待核销
        const wishStatus = w => (w.points == null
          ? { statusText: '待定价', statusClass: 'pricing' }
          : { statusText: '待核销', statusClass: 'ready' });

        // 对方的心愿：未核销，最新在前
        const theirWishes = wishes
          .filter(w => w.status === 'open' && w.nickName !== myName)
          .map(w => ({
            ...w,
            canPrice: canPrice(w, myName),
            ...wishStatus(w)
          }))
          .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

        // 我的心愿：未核销，最新在前
        const myWishes = wishes
          .filter(w => w.status === 'open' && w.nickName === myName)
          .map(w => ({
            ...w,
            canRedeem: canRedeem(w, myName),
            lowBalance: balance < (w.points || 0),   // 余额不足置灰
            ...wishStatus(w)
          }))
          .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

        // 历史：终态核销单，最新在前
        const history = reds
          .filter(r => r.status === 'received' || r.status === 'cancelled')
          .map(r => ({ ...r, meta: RED_LABEL[r.status], timeShort: timeShort(r.createTime) }))
          .sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

        // 顶部统计
        const stats = {
          total: wishes.length,                                    // 心愿总数（双方）
          redeemable: myWishes.filter(w => w.points > 0).length,   // 我可核销（已定价）
          pendingShip: reds.filter(r => r.status === 'pending').length,  // 待发货
          received: reds.filter(r => r.status === 'received').length     // 已完成
        };

        this.setData({ balance, stats, ongoing, theirWishes, myWishes, history, loading: false });
      })
      .catch(err => {
        console.error('加载心愿单失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 手动刷新：静默重载，避免退出重进
  refreshData() {
    if (this.data.loading || this.data.refreshing) return;
    this.setData({ refreshing: true });
    this.loadData(true).finally(() => this.setData({ refreshing: false }));
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/wishlist/add/add' });
  },

  closeRedeemSuccess() {
    this.setData({ showRedeemSuccess: false });
  },

  // ===== 对方：定价 / 改价 =====

  onPrice(e) {
    const wish = e.currentTarget.dataset.wish;
    if (this.data.busy) return;
    const isPriced = wish.points != null && wish.points > 0;
    wx.showModal({
      title: isPriced ? '修改核销积分' : '为心愿定价',
      content: '',   // editable 模式下 content 会预填进输入框，提示放 placeholderText
      editable: true,
      placeholderText: isPriced
        ? `当前 ${wish.points} 分，改为多少？（正整数）`
        : `「${wish.title}」需要多少积分？（正整数）`,
      success: (res) => {
        if (!res.confirm) return;
        const val = String(res.content || '').trim();
        if (!/^[1-9]\d*$/.test(val)) {
          wx.showToast({ title: '请输入正整数', icon: 'none' });
          return;
        }
        this.runBusy(() => priceWish(wish, app.globalData.nickName, parseInt(val, 10)))
          .then(() => wx.showToast({ title: isPriced ? '已修改' : '定价成功', icon: 'success' }))
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  // ===== 我：核销 =====

  onRedeem(e) {
    const wish = e.currentTarget.dataset.wish;
    if (this.data.busy) return;
    if (this.data.balance < wish.points) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认核销',
      content: `将花费 ${wish.points} 积分兑换「${wish.title}」，生成取货凭证？`,
      success: (res) => {
        if (!res.confirm) return;
        this.runBusy(() => redeemWish(wish, app.globalData.nickName))
          .then(({ redId, code }) => {
            // 自定义凭证弹层：凭证码大字 + 扣分信息分行展示
            this.setData({ showRedeemSuccess: true, redeemCode: code, redeemPoints: wish.points });
          })
          .catch(err => {
            console.error('核销失败', err);
            wx.showToast({ title: '核销失败，请重试', icon: 'none' });
          });
      }
    });
  },

  // ===== 对方/我：发货 / 收货 / 取消 =====

  onShip(e) {
    const red = e.currentTarget.dataset.red;
    if (this.data.busy) return;
    wx.showModal({
      title: '确认发货',
      content: `凭证 ${red.code}，确认已发货？`,
      success: (res) => {
        if (!res.confirm) return;
        this.runBusy(() => shipRedemption(red, app.globalData.nickName))
          .then(() => wx.showToast({ title: '已发货', icon: 'success' }))
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  onReceive(e) {
    const red = e.currentTarget.dataset.red;
    if (this.data.busy) return;
    wx.showModal({
      title: '确认收货',
      content: `收到「${red.wishTitle}」了？确认后心愿完成。`,
      success: (res) => {
        if (!res.confirm) return;
        this.runBusy(() => receiveRedemption(red, app.globalData.nickName))
          .then(() => wx.showToast({ title: '收货成功 🎉', icon: 'success' }))
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  onCancel(e) {
    const red = e.currentTarget.dataset.red;
    if (this.data.busy) return;
    wx.showModal({
      title: '取消核销',
      content: `将退回 ${red.wishPoints} 积分，心愿恢复为可核销。确定取消？`,
      success: (res) => {
        if (!res.confirm) return;
        this.runBusy(() => cancelRedemption(red, app.globalData.nickName))
          .then(() => wx.showToast({ title: '已取消，积分已退回', icon: 'success' }))
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      }
    });
  },

  // ===== 我：长按心愿 → 编辑页（可修改/删除）=====

  onEditWish(e) {
    const wish = e.currentTarget.dataset.wish;
    if (this.data.busy) return;
    wx.navigateTo({ url: '/pages/wishlist/add/add?id=' + wish._id });
  },

  // 统一 busy 锁：串行执行 → 刷新
  runBusy(promiseFn) {
    if (this.data.busy) return Promise.reject(new Error('busy'));
    this.setData({ busy: true });
    return promiseFn()
      .then(res => { this.loadData(); return res; })
      .catch(err => {
        if (!/无权/.test(err.message)) console.error('[wishlist] 操作失败', err);
        throw err;
      })
      .finally(() => this.setData({ busy: false }));
  }
});
