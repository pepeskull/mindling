'use strict';

const PREFIX = 'mindling:{energy-v1-mainnet}:'; // Preserve existing payment keys.
const WAKE_CHANNEL=PREFIX+'payment-work';
const COMPARE = `
local previous = redis.call('MGET',unpack(KEYS))
for i,key in ipairs(KEYS) do
  if (previous[i] or '') ~= ARGV[i*2-1] then return 0 end
end
`;
const CAS = COMPARE+`
local updated = {}
local removed = {}
for i,key in ipairs(KEYS) do
  local prior = ARGV[i*2-1]
  local next = ARGV[i*2]
  if prior ~= next then
    if next == '' then
      table.insert(removed,key)
    else
      table.insert(updated,key)
      table.insert(updated,next)
    end
  end
end
if #updated > 0 then redis.call('MSET',unpack(updated)) end
if #removed > 0 then redis.call('DEL',unpack(removed)) end
if ARGV[#KEYS*2+1] ~= '' then redis.call('PUBLISH',ARGV[#KEYS*2+1],'work') end
return 1
`;

const VERIFY=COMPARE+'return 1 -- read-only compare';

const REPLAY_RATE = `
-- mindling-replay-rate
local n = redis.call('INCR',KEYS[2])
if n == 1 then redis.call('EXPIRE',KEYS[2],ARGV[3]) end
if n > tonumber(ARGV[2]) then return -1 end
if redis.call('SET',KEYS[1],'true','NX','PX',ARGV[1]) then return 1 end
return 0
`;

function failure(code, status = 409) {
  return Object.assign(new Error(code), {code, status});
}

function redisStore({url, token, fetcher = fetch} = {}) {
  if (!url || !token || !url.startsWith('https://')) throw failure('PAYMENT_UNAVAILABLE', 503);
  let syncToken;
  async function command(parts) {
    try {
      const response = await fetcher(url, {
        method: 'POST',
        redirect: 'error',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
          ...(syncToken?{'upstash-sync-token':syncToken}:{})},
        body: JSON.stringify(parts),
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();
      if (!response.ok || !Object.hasOwn(data, 'result') || data.error) throw Error('Redis command failed');
      syncToken=response.headers.get('upstash-sync-token')||syncToken;
      return data.result;
    } catch {
      throw failure('LEDGER_UNAVAILABLE', 503);
    }
  }
  const decode = value => value == null ? null : JSON.parse(value);
  return {
    async listen(onEvent,signal) {
      const subscribe=new URL('/subscribe/'+encodeURIComponent(WAKE_CHANNEL),url);
      const response=await fetcher(subscribe,{
        method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'text/event-stream'},signal
      });
      if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)
        throw failure('PAYMENT_RECOVERY_UNAVAILABLE',503);
      const decoder=new TextDecoder();
      let pending='';
      for await(const bytes of response.body){
        pending+=decoder.decode(bytes,{stream:true});
        const lines=pending.split('\n');
        pending=lines.pop();
        if(pending.length>1024)throw failure('PAYMENT_RECOVERY_UNAVAILABLE',503);
        for(const raw of lines){
          const line=raw.trimEnd();
          if(line.startsWith('data: subscribe,'+WAKE_CHANNEL+','))onEvent('ready');
          const prefix='data: message,'+WAKE_CHANNEL+',';
          if(line===prefix+'work')onEvent('work');
          if(line.startsWith(prefix)&&/^probe:[a-f0-9]{24}$/.test(line.slice(prefix.length)))
            onEvent(line.slice(prefix.length));
        }
      }
      throw failure('PAYMENT_RECOVERY_UNAVAILABLE',503);
    },
    async probeWake(probe) {
      return await command(['EVAL',"return redis.call('PUBLISH',ARGV[1],ARGV[2])",0,WAKE_CHANNEL,probe]);
    },
    async get(key) {
      return decode(await command(['GET',PREFIX + key]));
    },
    async getMany(keys) {
      return (await command(['MGET',...keys.map(key=>PREFIX+key)])).map(decode);
    },
    async claimSession(key, ttl, rateKey, maximum, seconds) {
      const slot=Math.floor(Date.now()/1000/seconds);
      const result=await command(['EVAL',REPLAY_RATE,2,PREFIX+key,PREFIX+'rate:'+rateKey+':'+slot,ttl,maximum,seconds*2]);
      if(result===-1)throw failure('RATE_LIMITED',429);
      return result===1;
    },
    async heartbeat(key, value) {
      return await command(['SET',PREFIX+key,JSON.stringify(value),'EX',120])==='OK';
    },
    async rate(key, maximum, seconds) {
      const slot=Math.floor(Date.now()/1000/seconds);
      const source="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
      const count=await command(['EVAL',source,1,PREFIX+'rate:'+key+':'+slot,seconds*2]);
      if(count>maximum)throw failure('RATE_LIMITED',429);
    },
    async createChallenge(key, record, ttl=120000) {
      return await command(['SET', PREFIX + key, JSON.stringify(record), 'NX', 'PX', ttl]) === 'OK';
    },
    async consumeChallenge(key) {
      return decode(await command(['GETDEL', PREFIX + key]));
    },
    async pendingWork(cursor='0'){
      const [next,keys]=await command(['SCAN',cursor,'MATCH',PREFIX+'*-work:*','COUNT','40']);
      const jobs=keys.flatMap(key=>{
        const name=key.slice(PREFIX.length);
        const match=/^(verify|sweep)-work:([a-f0-9]{48})$/.exec(name);
        return match?[{kind:match[1],id:match[2]}]:[];
      });
      return {cursor:String(next),jobs};
    },
    async pending(prefix,cursor = '0') {
      if(!['sweep-work:','verify-work:'].includes(prefix))throw failure('INVALID_QUEUE');
      const [next, keys] = await command(['SCAN', cursor, 'MATCH', PREFIX + prefix + '*', 'COUNT', '40']);
      return {cursor:String(next), keys:keys.map(key => key.slice(PREFIX.length+prefix.length))};
    },
    async change(keys, mutate, {verifyRead=true,wake=false}={}) {
      if (new Set(keys).size !== keys.length) throw Error('Duplicate ledger key');
      const names = keys.map(key => PREFIX + key);
      for (let attempt = 0; attempt < 8; attempt++) {
        const raw = await command(['MGET', ...names]);
        const previous = raw.map(decode);
        const {writes, result} = mutate(previous);
        if(writes&&writes.length!==keys.length)throw Error('Incomplete ledger write');
        const next=writes?.map(value=>value==null?'':JSON.stringify(value));
        const changed=Boolean(next?.some((value,index)=>value!==(raw[index]??'')));
        if(!changed&&!verifyRead)return result;
        const args=raw.flatMap((value,index)=>[value??'',next?.[index]??'']);
        if(await command(['EVAL',changed?CAS:VERIFY,names.length,...names,...args,wake?WAKE_CHANNEL:''])===1)return result;
      }
      throw failure('LEDGER_BUSY', 503);
    }
  };
}

module.exports = {redisStore, failure};
