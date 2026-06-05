/**
 * 分页拉取云数据库集合的全部数据，突破默认 20 条限制。
 *
 * 使用游标分页（cursor-based pagination）代替 .skip()，因为微信云数据库的 .skip()
 * 必须配合 .orderBy() 使用，且 orderBy 字段需要是唯一索引字段才能保证分页正确。
 * 本项目使用 _id（数据库自动生成，全局唯一）作为游标，可靠且无额外索引要求。
 *
 * @param {Function} queryFn — 签名 (limit) => db.collection('xxx').where(...).orderBy('_id', 'desc').limit(limit)
 * @returns {Promise<Array>} 全量数据数组（按 _id 降序，即最新在前）
 *
 * 用法:
 *   const all = await getAll((limit) =>
 *     db.collection('checkins').where({ nickName }).orderBy('_id', 'desc').limit(limit)
 *   );
 */
// 微信云数据库小程序端单次查询上限为 20 条（默认值）。
// 必须与 DB 实际返回数量一致，否则 getAll 的分页循环会提前退出。
const MAX_LIMIT = 20;
const db = wx.cloud.database();

function getAll(queryFn) {
  let all = [];
  let lastId = null;

  function loop() {
    let query = queryFn(MAX_LIMIT);
    // 从第二页开始，使用 _id 游标：只查询游标之前的记录
    if (lastId) {
      query = query.where({ _id: db.command.lt(lastId) });
    }
    return query.get().then(res => {
      if (res.data.length === 0) return all;
      all = all.concat(res.data);
      if (res.data.length === MAX_LIMIT) {
        lastId = res.data[res.data.length - 1]._id;
        return loop();
      }
      return all;
    });
  }

  return loop();
}

module.exports = { getAll, MAX_LIMIT };
