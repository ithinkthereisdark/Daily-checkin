// miniprogram/utils/emoji.js
const db = wx.cloud.database();
const { getAll } = require('./db');

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
        // 已有数据，使用 getAll 突破 20 条限制
        return getAll((limit) =>
          db.collection('emoji_library').where({ nickName }).orderBy('_id', 'desc').limit(limit)
        );
      }
      // 首次使用——seed 预设
      const batch = PRESET_EMOJIS.map(emoji => ({
        emoji,
        nickName,
        createTime: new Date()
      }));
      return Promise.all(batch.map(data =>
        db.collection('emoji_library').add({ data })
      )).then(() =>
        getAll((limit) =>
          db.collection('emoji_library').where({ nickName }).orderBy('_id', 'desc').limit(limit)
        )
      );
    })
    .then(data => {
      // getAll 返回 _id desc，这里按 createTime asc 排序后提取 emoji
      return data
        .sort((a, b) => (a.createTime || 0) - (b.createTime || 0))
        .map(item => item.emoji);
    })
    .catch(err => {
      console.error('Load emoji_library failed:', err);
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
        // 已有数据，使用 getAll 突破 20 条限制
        return getAll((limit) =>
          db.collection('categories').where({ nickName }).orderBy('_id', 'desc').limit(limit)
        );
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
        getAll((limit) =>
          db.collection('categories').where({ nickName }).orderBy('_id', 'desc').limit(limit)
        )
      );
    })
    .then(data => data)
    .catch(err => {
      console.error('Load categories failed:', err);
      return PRESET_CATEGORIES.map((c, i) => ({ ...c, isPreset: true, _id: 'fallback_' + i }));
    });
}

module.exports = {
  PRESET_EMOJIS,
  PRESET_CATEGORIES,
  ensureEmojiLibrary,
  ensureCategories
};
