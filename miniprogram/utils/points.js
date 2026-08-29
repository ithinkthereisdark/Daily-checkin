// miniprogram/utils/points.js — 积分规则单点维护
const db = wx.cloud.database();
const { getAll } = require('./db');

// ===== 积分规则常量（修改分值只改这里）=====
const CHECKIN_POINTS = 1;          // 打卡基础分
const ACCOUNTING_POINTS = 1;       // 记账基础分
const CRIT_RATE_3 = 0.10;          // 10% 概率暴击 +3
const CRIT_AMOUNT_3 = 3;
const CRIT_RATE_5 = 0.05;          // 5% 概率暴击 +5
const CRIT_AMOUNT_5 = 5;
const COMPLETION_PER_DAY = 1;      // 任务完成奖励 = 打卡天数（含补打）× 该值

// 各动作在积分页的展示（action 是数据模型的一部分，'redeem' 为兑换预留）
const ACTION_META = {
  checkin:       { emoji: '✅', label: '打卡' },
  accounting:    { emoji: '💰', label: '记账' },
  task_complete: { emoji: '🎉', label: '任务完成' },
  crit:          { emoji: '⚡', label: '暴击' },
  revoke:        { emoji: '↩️', label: '撤销' },
  compensation:  { emoji: '🪙', label: '积分补偿' },
  redeem:        { emoji: '🎁', label: '兑换' }
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 互斥掷骰：r < 5% → +5，r < 10% → +3，否则 0
function rollCrit() {
  const r = Math.random();
  if (r < CRIT_RATE_5) return CRIT_AMOUNT_5;
  if (r < CRIT_RATE_3) return CRIT_AMOUNT_3;
  return 0;
}

// 写一条积分记录：best-effort，失败仅记日志，不影响主流程
function writeRecord(data) {
  return db.collection('points_records').add({ data })
    .catch(err => console.error('[points] write failed', err));
}

/**
 * 打卡加分（含暴击）。同步返回 {base, critExtra} 供调用方拼 toast；写库 fire-and-forget。
 * 补打不加分由调用方负责（不调用本函数）。
 */
function awardCheckin(actionId, nickName, date, note) {
  const critExtra = rollCrit();
  writeRecord({ action: 'checkin', actionId, points: CHECKIN_POINTS, date, note, nickName, createTime: new Date() });
  if (critExtra > 0) {
    // createTime +1ms：保证暴击记录排序时紧跟其打卡/记账记录
    writeRecord({ action: 'crit', actionId, points: critExtra, date, note, nickName, createTime: new Date(Date.now() + 1) });
  }
  return { base: CHECKIN_POINTS, critExtra };
}

/** 记账加分，同 awardCheckin 机制 */
function awardAccounting(actionId, nickName, date, note) {
  const critExtra = rollCrit();
  writeRecord({ action: 'accounting', actionId, points: ACCOUNTING_POINTS, date, note, nickName, createTime: new Date() });
  if (critExtra > 0) {
    // createTime +1ms：保证暴击记录排序时紧跟其打卡/记账记录
    writeRecord({ action: 'crit', actionId, points: critExtra, date, note, nickName, createTime: new Date(Date.now() + 1) });
  }
  return { base: ACCOUNTING_POINTS, critExtra };
}

/**
 * 任务完成奖励：打卡数（正常+补打全部计入）首次达到 targetCount 时，一次性发 打卡数×COMPLETION_PER_DAY 分。
 * 幂等：已有 task_complete 记录（actionId=taskId）则跳过，防止 完成→取消→再完成 重复发奖。
 */
function maybeAwardTaskCompletion(taskId, nickName, targetCount, taskName) {
  if (!targetCount || targetCount <= 0) return Promise.resolve();
  return getAll((limit) => db.collection('checkins').where({ taskId, nickName }).orderBy('_id', 'desc').limit(limit))
    .then(checkins => {
      const total = checkins.length; // 计数口径与打卡页一致：正常+补打全部计入
      if (total < targetCount) return;
      return db.collection('points_records')
        .where({ nickName, action: 'task_complete', actionId: taskId })
        .limit(1)
        .get()
        .then(res => {
          if (res.data.length > 0) return;
          return writeRecord({
            action: 'task_complete',
            actionId: taskId,
            points: total * COMPLETION_PER_DAY,
            date: todayStr(),
            note: taskName,
            nickName,
            createTime: new Date()
          });
        });
    })
    .catch(err => console.error('[points] task completion failed', err));
}

/**
 * 心愿核销扣分：写一条 action='redeem' 的负分记录。
 * 与 awardCheckin 不同：不吞错，返回真实 promise，供调用方在失败时回滚核销单。
 */
function awardRedeem(redemptionId, nickName, points, date, note) {
  return db.collection('points_records').add({
    data: { action: 'redeem', actionId: redemptionId, points: -points, date, note, nickName, createTime: new Date() }
  });
}

/**
 * 按 actionId 精确扣回：求和该来源的所有积分记录（含暴击），写一条负的 revoke 记录。
 * 和为 0（旧数据/补打/已撤销）→ no-op，不写 0 分记录。保证该来源净额恒为 0。
 */
function revokeByActionId(actionId, nickName) {
  return getAll((limit) => db.collection('points_records').where({ actionId, nickName }).orderBy('_id', 'desc').limit(limit))
    .then(records => {
      const total = records.reduce((s, r) => s + r.points, 0);
      if (total === 0) return;
      const base = records.find(r => r.action !== 'revoke');
      const note = base ? '撤销' + (ACTION_META[base.action] ? ACTION_META[base.action].label : '') : '撤销';
      return writeRecord({
        action: 'revoke',
        actionId,
        points: -total,
        date: todayStr(),
        note,
        nickName,
        createTime: new Date()
      });
    })
    .catch(err => console.error('[points] revoke failed', err));
}

/**
 * 一次性历史积分补偿：统计该用户所有没有积分记录的打卡/记账，打包写入一条补偿记录。
 * 幂等：records 中已有 compensation 记录则跳过；返回补偿的积分数（0 = 无需补偿）。
 * 集合未创建（-502005）按空数据对待，不影响另一类数据的统计。
 */
function maybeCompensateLegacyPoints(nickName, records) {
  if (records.some(r => r.action === 'compensation')) return Promise.resolve(0);
  const awardedIds = new Set(records.map(r => r.actionId));

  const safeGetAll = (queryFn) => getAll(queryFn).catch(err => {
    if (err && err.errCode === -502005) return [];
    throw err;
  });
  const countUncompensated = docs => docs.filter(d => !awardedIds.has(d._id)).length;

  return Promise.all([
    safeGetAll((limit) => db.collection('checkins').where({ nickName }).orderBy('_id', 'desc').limit(limit)),
    safeGetAll((limit) => db.collection('transactions').where({ nickName }).orderBy('_id', 'desc').limit(limit))
  ]).then(([checkins, transactions]) => {
    const checkinCount = countUncompensated(checkins);
    const txCount = countUncompensated(transactions);
    const total = checkinCount + txCount;
    if (total === 0) return 0;
    const parts = [];
    if (checkinCount > 0) parts.push(`打卡 ${checkinCount} 次`);
    if (txCount > 0) parts.push(`记账 ${txCount} 次`);
    return writeRecord({
      action: 'compensation',
      actionId: '',
      points: total,
      date: todayStr(),
      note: '历史记录补偿：' + parts.join(' + '),
      nickName,
      createTime: new Date()
    }).then(() => total);
  }).catch(err => {
    console.error('[points] compensation failed', err);
    return 0;
  });
}

/** 由积分页全部记录计算头部汇总（今日/本月为净积分，撤销扣回也计入） */
function getSummary(records) {
  const today = todayStr();
  const monthKey = today.slice(0, 7);
  let balance = 0, todayNet = 0, monthNet = 0;
  records.forEach(r => {
    balance += r.points;
    if (r.date === today) todayNet += r.points;
    if (r.date.startsWith(monthKey)) monthNet += r.points;
  });
  return { balance, todayNet, monthNet };
}

module.exports = {
  CHECKIN_POINTS,
  ACCOUNTING_POINTS,
  ACTION_META,
  awardCheckin,
  awardAccounting,
  awardRedeem,
  maybeAwardTaskCompletion,
  revokeByActionId,
  maybeCompensateLegacyPoints,
  getSummary
};
