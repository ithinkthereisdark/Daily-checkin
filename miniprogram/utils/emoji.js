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
        // 已有数据（可能是旧版自定义分类或已 seed），直接返回
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
