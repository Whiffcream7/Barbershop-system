function getOrder(query, columns, defaultKey) {
  const key = columns[query.sort] ? query.sort : defaultKey;
  const dir = query.order === 'desc' ? 'DESC' : 'ASC';
  const sql = columns[key].split(',').map(c => `${c.trim()} ${dir}`).join(', ');
  return { key, dir: dir.toLowerCase(), sql };
}

module.exports = { getOrder };