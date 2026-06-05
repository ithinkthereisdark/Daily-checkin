/**
 * 分页拉取云数据库集合的全部数据，突破默认 20 条/单次 100 条的限制。
 *
 * ⚠️ 重要：微信云数据库的 .skip() 必须配合 .orderBy() 使用，否则 skip 不生效，
 * 每次都会返回相同的前 N 条数据，导致死循环或数据重复。
 *
 * @param {Function} queryFn — 签名 (limit, skip) => db.collection('xxx').where(...).orderBy(...).limit(limit).skip(skip)
 * @returns {Promise<Array>} 全量数据数组
 *
 * 用法:
 *   const all = await getAll((limit, skip) =>
 *     db.collection('checkins').where({ nickName }).orderBy('createTime', 'desc').limit(limit).skip(skip)
 *   );
 */
const MAX_LIMIT = 100;

function getAll(queryFn) {
  let all = [];
  let skip = 0;

  function loop() {
    return queryFn(MAX_LIMIT, skip).get().then(res => {
      all = all.concat(res.data);
      if (res.data.length === MAX_LIMIT) {
        skip += MAX_LIMIT;
        return loop();
      }
      return all;
    });
  }

  return loop();
}

module.exports = { getAll, MAX_LIMIT };
