// miniprogram/utils/wishes.js — 心愿单 + 核销状态机与权限（单点维护）
// 双人应用：redemptions 不存 provider，用「redeemer 之外的人」推导对方。
const db = wx.cloud.database();
const { getAll } = require('./db');
const { awardRedeem, revokeByActionId } = require('./points');

// 核销单状态
const RED_STATUS = {
  PENDING: 'pending',    // 已核销，待发货
  SHIPPED: 'shipped',    // 已发货，待收货
  RECEIVED: 'received',  // 已收货，完成（终态）
  CANCELLED: 'cancelled' // 已取消（发货前，终态）
};

const RED_LABEL = {
  pending: { emoji: '🕐', label: '待发货' },
  shipped: { emoji: '📦', label: '已发货' },
  received: { emoji: '✅', label: '已完成' },
  cancelled: { emoji: '↩️', label: '已取消' }
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 集合尚未创建（-502005）→ 按空数据处理
function safeGetAll(queryFn) {
  return getAll(queryFn).catch(err => {
    if (err && err.errCode === -502005) return [];
    throw err;
  });
}

// ===== 读取（双人应用：全量拉取，客户端 join 分区）=====

function fetchWishes() {
  return safeGetAll((limit) => db.collection('wishes').orderBy('_id', 'desc').limit(limit));
}

function fetchRedemptions() {
  return safeGetAll((limit) => db.collection('redemptions').orderBy('_id', 'desc').limit(limit));
}

// ===== 写入 =====

// 取货凭证码：时间戳36进制末4位 + 4位随机，如 M3X2-9K2X
function genCode() {
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().substr(2, 4);
  return t + '-' + r;
}

/** 添加心愿（提出者本人） */
function addWish(nickName, data) {
  return db.collection('wishes').add({
    data: {
      ...data,
      nickName,
      points: null,        // 未定价
      status: 'open',
      createTime: new Date()
    }
  });
}

/** B 为 A 的心愿定价/改价（只允许非提出者；正整数校验由页面负责） */
function priceWish(wish, myNickName, points) {
  if (wish.nickName === myNickName) return Promise.reject(new Error('不能给自己的心愿定价'));
  return db.collection('wishes').doc(wish._id).update({ data: { points } });
}

/**
 * A 核销心愿：先建核销单(pending+凭证码) → 心愿置 redeemed（锁死防重复核销）
 * → 扣分（awardRedeem 不吞错）。任一步失败回滚：扣分失败 → 单置 cancelled + 心愿回 open。
 * 返回 { redId, code }，页面展示凭证码。
 */
function redeemWish(wish, myNickName) {
  const points = wish.points;
  if (wish.nickName !== myNickName) return Promise.reject(new Error('只能核销自己的心愿'));
  if (!points || points <= 0) return Promise.reject(new Error('心愿尚未定价'));

  const code = genCode();
  return db.collection('redemptions').add({
    data: {
      wishId: wish._id,
      wishTitle: wish.title,
      wishPoints: points,
      wishNickName: wish.nickName,
      redeemer: myNickName,
      code,
      status: RED_STATUS.PENDING,
      createTime: new Date(),
      shipTime: null,
      receiveTime: null,
      cancelTime: null
    }
  }).then(res => {
    return db.collection('wishes').doc(wish._id).update({ data: { status: 'redeemed' } })
      .then(() => res._id)
      .catch(err => {
        // 心愿置态失败 → 删除核销单回滚
        db.collection('redemptions').doc(res._id).remove()
          .catch(e => console.error('[wishes] rollback redemption failed', e));
        throw err;
      });
  }).then(redId => {
    return awardRedeem(redId, myNickName, points, todayStr(), wish.title)
      .then(() => ({ redId, code }))
      .catch(err => {
        // 扣分失败 → 回滚：单置 cancelled + 心愿回 open，再抛出
        db.collection('redemptions').doc(redId).update({ data: { status: RED_STATUS.CANCELLED, cancelTime: new Date() } })
          .catch(e => console.error('[wishes] rollback cancel failed', e));
        db.collection('wishes').doc(wish._id).update({ data: { status: 'open' } })
          .catch(e => console.error('[wishes] rollback wish failed', e));
        throw err;
      });
  });
}

/** 对方发货（pending → shipped） */
function shipRedemption(red, myNickName) {
  if (red.status !== RED_STATUS.PENDING || myNickName === red.redeemer) {
    return Promise.reject(new Error('无权操作'));
  }
  return db.collection('redemptions').doc(red._id).update({
    data: { status: RED_STATUS.SHIPPED, shipTime: new Date() }
  });
}

/** 核销人收货（shipped → received，终态） */
function receiveRedemption(red, myNickName) {
  if (red.status !== RED_STATUS.SHIPPED || myNickName !== red.redeemer) {
    return Promise.reject(new Error('无权操作'));
  }
  return db.collection('redemptions').doc(red._id).update({
    data: { status: RED_STATUS.RECEIVED, receiveTime: new Date() }
  });
}

/**
 * 核销人发货前取消（pending → cancelled，终态）：单置 cancelled → 心愿回 open
 * → revokeByActionId 退分（求和 -N → 写 +N revoke 记录，净额 0；幂等）。
 * revoke 失败仅日志（与全库 best-effort 积分语义一致）。
 */
function cancelRedemption(red, myNickName) {
  if (red.status !== RED_STATUS.PENDING || myNickName !== red.redeemer) {
    return Promise.reject(new Error('无权操作'));
  }
  return db.collection('redemptions').doc(red._id).update({
    data: { status: RED_STATUS.CANCELLED, cancelTime: new Date() }
  }).then(() => db.collection('wishes').doc(red.wishId).update({ data: { status: 'open' } }))
    .then(() => revokeByActionId(red._id, myNickName));
}

// ===== 权限纯函数（页面渲染按钮时调用）=====

/** 对方可定价/改价：open 且非提出者（已定价也可修改） */
function canPrice(wish, me) {
  return wish.status === 'open' && wish.nickName !== me;
}
/** 提出者可核销：open 且已定价（余额判断在页面） */
function canRedeem(wish, me) {
  return wish.status === 'open' && wish.points > 0 && wish.nickName === me;
}
/** 对方可发货 */
function canShip(red, me) {
  return red.status === RED_STATUS.PENDING && red.redeemer !== me;
}
/** 核销人可收货 */
function canReceive(red, me) {
  return red.status === RED_STATUS.SHIPPED && red.redeemer === me;
}
/** 核销人可取消（发货前） */
function canCancel(red, me) {
  return red.status === RED_STATUS.PENDING && red.redeemer === me;
}

module.exports = {
  RED_STATUS,
  RED_LABEL,
  fetchWishes,
  fetchRedemptions,
  addWish,
  priceWish,
  redeemWish,
  shipRedemption,
  receiveRedemption,
  cancelRedemption,
  canPrice,
  canRedeem,
  canShip,
  canReceive,
  canCancel
};
