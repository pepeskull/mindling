'use strict';

const PREFIX = 'mindling:{energy-v1-devnet}:';
const CHECK = `
for i,key in ipairs(KEYS) do
  if (redis.call('GET',key) or '') ~= ARGV[i*2-1] then return 0 end
end
`;
const CAS = CHECK + `
for i,key in ipairs(KEYS) do
  local value=ARGV[i*2]
  if value~='' then redis.call('SET',key,value) else redis.call('DEL',key) end
end
return 1
`;

const VERIFY = CHECK + 'return 1 -- read-only compare';

function failure(code, status = 409) {
  return Object.assign(new Error(code), {code, status});
}

function redisStore({url, token, fetcher = fetch} = {}) {
  if (!url || !token || !url.startsWith('https://')) throw failure('PAYMENT_UNAVAILABLE', 503);
  async function command(parts) {
    try {
      const response = await fetcher(url, {
        method: 'POST',
        redirect: 'error',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        body: JSON.stringify(parts),
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();
      if (!response.ok || !Object.hasOwn(data, 'result') || data.error) throw Error('Redis command failed');
      return data.result;
    } catch {
      throw failure('LEDGER_UNAVAILABLE', 503);
    }
  }
  const decode = value => value == null ? null : JSON.parse(value);
  return {
    async get(key) {
      return decode(await command(['GET',PREFIX + key]));
    },
    async rate(key, maximum, seconds) {
      const slot=Math.floor(Date.now()/1000/seconds);
      const source="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
      const count=await command(['EVAL',source,1,PREFIX+'rate:'+key+':'+slot,seconds*2]);
      if(count>maximum)throw failure('RATE_LIMITED',429);
    },
    async createChallenge(key, record) {
      return await command(['SET', PREFIX + key, JSON.stringify(record), 'NX', 'PX', 120000]) === 'OK';
    },
    async consumeChallenge(key) {
      return decode(await command(['GETDEL', PREFIX + key]));
    },
    async pendingSweeps(cursor = '0') {
      const [next, keys] = await command(['SCAN', cursor, 'MATCH', PREFIX + 'sweep-work:*', 'COUNT', '40']);
      return {cursor:String(next), keys:keys.map(key => key.slice(PREFIX.length))};
    },
    async change(keys, mutate) {
      if (new Set(keys).size !== keys.length) throw Error('Duplicate ledger key');
      const names = keys.map(key => PREFIX + key);
      for (let attempt = 0; attempt < 8; attempt++) {
        const raw = await command(['MGET', ...names]);
        const previous = raw.map(decode);
        const {writes, result} = mutate(previous);
        const args = raw.flatMap((value, index) => [
          value ?? '',
          writes?.[index] == null ? '' : JSON.stringify(writes[index])
        ]);
        if (await command(['EVAL', writes?CAS:VERIFY, names.length, ...names, ...args]) === 1) return result;
      }
      throw failure('LEDGER_BUSY', 503);
    }
  };
}

module.exports = {redisStore, failure};
