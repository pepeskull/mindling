'use strict';

const {redisStore,failure}=require('./store.cjs');
const {authority,sha256}=require('./identity.cjs');
const {payments,encryption,depositWallets}=require('./payments.cjs');

const PAYMENT='/api/mindling/energy';
const clientKey=(req,prefix)=>{
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,80);
  return prefix+':'+sha256(ip);
};

function parse(req) {
  if(req.method!=='POST')throw failure('METHOD_NOT_ALLOWED',405);
  const text=typeof req.body==='string'?req.body:JSON.stringify(req.body??null);
  if(Buffer.byteLength(text)>8192)throw failure('REQUEST_TOO_LARGE',413);
  try {
    const body=JSON.parse(text);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.hasOwn(body,'cluster')||Object.hasOwn(body,'network'))throw Error();
    return body;
  }catch{throw failure('REQUEST_INVALID',400);}
}

function checkOrigin(req) {
  if(!req.headers.origin)return;
  try {
    if(new URL(req.headers.origin).host===String(req.headers['x-forwarded-host']||req.headers.host))return;
  }catch{}
  throw failure('ORIGIN_INVALID',403);
}

function safeCode(error) {
  return Number.isInteger(error?.status)&&error.status>=400&&error.status<=599&&
    /^[A-Z_]{1,60}$/.test(error.code||'')?error.code:null;
}

function runtimeFor(env=process.env) {
  if(!env.UPSTASH_REDIS_REST_URL?.startsWith('https://')||!env.UPSTASH_REDIS_REST_TOKEN)
    throw failure('PAYMENT_STORAGE_UNCONFIGURED',503);
  let keys,ticket;
  try{
    keys=encryption(env.ENCRYPTION_KEY);
    ticket=encryption(env.ENCRYPTION_KEY,'auth-ticket');
  }catch{throw failure('ENCRYPTION_UNAVAILABLE',503);}
  const store=redisStore({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN});
  const auth=authority(store,Date.now,ticket);
  const deposit=depositWallets(store,keys);
  let payment;
  return {store,auth,deposit,payment(){
    if(payment)return payment;
    if(!env.HELIUS_API_KEY)throw failure('PAYMENT_RPC_UNCONFIGURED',503);
    if(!env.MIND_TOKEN_MINT)throw failure('PAYMENT_MINT_UNCONFIGURED',503);
    if(!env.WALLET_PRIVATE_KEY)throw failure('PAYMENT_TREASURY_UNCONFIGURED',503);
    const {solanaAdapter}=require('./solana.cjs');
    try {
      const chain=solanaAdapter({apiKey:env.HELIUS_API_KEY,mintAddress:env.MIND_TOKEN_MINT,walletSecret:env.WALLET_PRIVATE_KEY});
      payment=payments(store,chain,keys,{deposit,requireWorker:true});
      return payment;
    }catch(error){throw safeCode(error)?error:failure('PAYMENT_CONFIGURATION_INVALID',503);}
  }};
}

function paymentHandler(options={}) {
  return async(req,res)=>{
    try{
      const body=parse(req);
      checkOrigin(req);
      res.setHeader('Cache-Control','no-store');
      if(!['challenge','payment-wallet','payment-open','payment-check'].includes(body.action))
        throw failure('REQUEST_INVALID',400);
      const runtime=await (options.runtime||runtimeFor)();
      const {store,auth,deposit}=runtime;
      if(body.action==='challenge'){
        await store.rate(clientKey(req,'challenge'),90,60);
        return res.status(200).json(await auth.challenge(body.publicKey,true));
      }
      const {fingerprint,operation}=await auth.verify(req.headers,PAYMENT,body,clientKey(req,'authenticated'));
      if(operation!==null)throw failure('INVALID_OPERATION',400);
      if(body.action==='payment-wallet')return res.status(200).json({wallet:await deposit.ensure(fingerprint)});
      if(body.action==='payment-check'){
        await store.rate('payment-check:'+fingerprint,12,60);
        return res.status(200).json(await runtime.payment().check(fingerprint,body.id));
      }
      await store.rate(clientKey(req,'payment-open'),12,60);
      const localOrigin=req.headers.origin;
      if(typeof localOrigin!=='string'||!localOrigin.startsWith('https://'))throw failure('PAYMENT_HTTPS_REQUIRED',400);
      const session=await runtime.payment().open(fingerprint,{fresh:body.fresh===true,
        recoverOnly:body.recoverOnly===true,recoveryId:body.id});
      const link=new URL('/api/mindling/pay',localOrigin);
      link.searchParams.set('session',session.id);
      return res.status(200).json({session:{...session,qrPayload:session.payable?'solana:'+encodeURIComponent(link.href):null}});
    }catch(error){
      const code=safeCode(error);
      if(!res.writableEnded&&!res.destroyed)return res.status(code?error.status:503).json({error:{code:code||'PAYMENT_UNAVAILABLE'}});
    }
  };
}

function walletHandler(options={}) {
  return async(req,res)=>{
    try{
      res.setHeader('Access-Control-Allow-Origin','*');
      if(req.method==='OPTIONS'){
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Content-Type');
        return res.status(204).end();
      }
      if(!['GET','POST'].includes(req.method))throw failure('METHOD_NOT_ALLOWED',405);
      const runtime=await (options.runtime||runtimeFor)();
      await runtime.store.rate(clientKey(req,'wallet-checkout'),12,60);
      if(req.method==='GET')return res.status(200).json({label:'Play Mindling · Mainnet'});
      const body=parse(req);
      if(Object.keys(body).length!==1||!Object.hasOwn(body,'account'))throw failure('INVALID_WALLET',400);
      return res.status(200).json(await runtime.payment().wallet(req.query?.session,body.account));
    }catch(error){
      const code=safeCode(error);
      if(!res.writableEnded&&!res.destroyed)return res.status(code?error.status:503).json({message:code||'Payment temporarily unavailable'});
    }
  };
}

module.exports={paymentHandler,walletHandler,runtimeFor};
