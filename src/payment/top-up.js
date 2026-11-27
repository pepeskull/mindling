import qrcode from '../preview/vendor/qrcode.js';
import {energyAt,energyLabel} from '../economy/energy.js';
import {paymentFailureMessage,pendingPayments} from './payment-client.js';

const spendable=(mind,time=Date.now())=>energyAt(mind.energy,time).remaining;
const ACCOUNT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function decimal(units,decimals){
  const padded=units.padStart(decimals+1,'0');
  return decimals?padded.slice(0,-decimals)+'.'+padded.slice(-decimals):padded;
}

function validSession(value){
  if(value?.cluster!=='mainnet'||!/^[a-f0-9]{48}$/.test(value.id)||!ACCOUNT.test(value.address)||
     !/^[1-9]\d{0,19}$/.test(value.units)||!Number.isInteger(value.decimals)||value.decimals<0||value.decimals>9||
     !Number.isSafeInteger(value.expiresAt))return false;
  if(value.qrPayload==null)return true;
  const link=new URL('/api/mindling/pay',location.origin);
  link.searchParams.set('session',value.id);
  return link.protocol==='https:'&&value.qrPayload==='solana:'+encodeURIComponent(link.href);
}

export class TopUp {
  constructor(client,signal){
    this.client=client;
    this.button=document.querySelector('[data-energy-wallet]');
    this.recovery=document.querySelector('[data-payment-recovery]');
    this.button.addEventListener('click',()=>void this.open(),{signal});
    this.recovery.addEventListener('click',()=>void this.open(true),{signal});
    signal.addEventListener('abort',()=>this.dialog?.close(),{once:true});
  }
  update(mind){
    if(this.identity!==mind.id){this.dialog?.close();this.identity=mind.id;}
    const address=mind.paymentWalletAddress;
    const alive=mind.life.lifeState==='ALIVE';
    const ready=mind.paymentWalletVersion===1&&ACCOUNT.test(address||'');
    const eligible=alive&&ready&&spendable(mind)<=0;
    const label=eligible?'TOP UP':ACCOUNT.test(address||'')?address.slice(0,5)+'…'+address.slice(-5):
      'Wallet unavailable';
    this.button.disabled=!eligible;
    this.button.classList.toggle('energy-wallet-ready',eligible);
    this.button.setAttribute('aria-label',eligible?'Top up Energy':label);
    this.button.querySelector('span').textContent=label;
    this.recovery.hidden=!pendingPayments(mind).length;
  }

  async open(recoverOnly=false){
    const {app}=this.client,mind=app.state?.mind;
    if(this.dialog||!mind||
       (recoverOnly?!pendingPayments(mind).length:mind.life?.lifeState!=='ALIVE'||spendable(mind)>0||mind.paymentWalletVersion!==1))return;
    const opener=recoverOnly?this.recovery:this.button;
    const dialog=document.createElement('dialog');
    this.dialog=dialog;
    dialog.className='energy-top-up glass-panel';
    dialog.setAttribute('aria-labelledby','top-up-title');
    dialog.innerHTML=`
      <header><div><h2 id="top-up-title">Energy Top-up</h2><p>Recharge your Mindling</p></div>
        <button type="button" data-close aria-label="Close">×</button></header>
      <section class="top-up-balance" aria-label="Energy restoration">
        <div><span>Energy <strong data-balance></strong></span><strong>$1.99</strong></div>
        <progress aria-label="Current Energy toward capacity"></progress>
        <p>Restore your Energy to full capacity.</p>
      </section>
      <section class="top-up-payment" data-session hidden>
        <div class="top-up-amount"><div><span>Pay with $MIND</span><strong data-quote></strong></div>
          <span data-time></span></div>
        <div data-qr role="img" aria-label="Solana Pay QR code" hidden></div>
        <div class="top-up-network"><span>Solana Mainnet</span><span data-sponsored hidden>Sponsored network fee</span></div>
        <label for="top-up-address">Deposit wallet address</label>
        <div class="top-up-address"><textarea id="top-up-address" readonly rows="2" spellcheck="false" data-address></textarea>
          <button type="button" data-copy>Copy</button></div>
      </section>
      <label data-recovery-picker hidden>Payment to check <select data-recovery-session></select></label>
      <p data-status role="status">Preparing your payment session…</p>
      <div class="top-up-actions"><button type="button" data-new hidden>New quote</button>
        <button type="button" data-check hidden>Check payment</button></div>`;
    const find=selector=>dialog.querySelector(selector);
    const check=find('[data-check]'),fresh=find('[data-new]'),status=find('[data-status]');
    const qrBox=find('[data-qr]');
    let session,busy=false,checking=false;
    const picker=find('[data-recovery-session]');
    if(recoverOnly){
      for(const [index,id] of pendingPayments(mind).entries()){
        picker.add(new Option(index===0?'Most recent payment':`Earlier payment ${index}`,id));
      }
      find('[data-recovery-picker]').hidden=picker.options.length<2;
    }
    const active=()=>this.dialog===dialog&&dialog.open&&app.state?.mind?.id===mind.id;
    const updateTime=()=>{
      if(!active())return;
      const {value,maximum,bar}=energyLabel(app.state.mind.energy,Date.now());
      find('[data-balance]').textContent=value+' → '+maximum+' / '+maximum;
      find('progress').max=maximum;
      find('progress').value=bar;
      if(!session)return;
      const seconds=Math.max(0,Math.ceil((session.expiresAt-Date.now())/1000));
      find('[data-time]').textContent=session.receipt?'Credited':seconds?
        `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Quote expired';
      if(!qrBox.hidden){
        if(!seconds)status.textContent='The quote expired. Check an earlier payment or request a new quote.';
        else if(spendable(app.state.mind)>0)status.textContent='Energy has regenerated. You can still check this payment.';
      }
      qrBox.hidden=!seconds||!session.qrPayload||Boolean(session.receipt)||spendable(app.state.mind)>0;
      if(!seconds||!session.qrPayload||session.receipt)qrBox.replaceChildren();
      find('[data-sponsored]').hidden=qrBox.hidden||!session.sponsored;
      fresh.hidden=recoverOnly||spendable(app.state.mind)>0||seconds>0&&!session.receipt;
    };
    const load=async newQuote=>{
      if(busy||checking)return;
      busy=true;
      fresh.disabled=check.disabled=picker.disabled=true;
      status.textContent='Preparing your payment session…';
      try {
        const {session:value}=await this.client.request({action:'payment-open',fresh:newQuote,recoverOnly},mind);
        if(!validSession(value))throw Error('The payment session could not be validated.');
        await app.change(state=>{
          if(state.mind?.id!==mind.id)throw Error('The Mindling identity changed.');
          if(!state.mind.appliedPaymentReceipts?.[value.id]){
            const pending=pendingPayments(state.mind).filter(id=>id!==value.id);
            state.mind.paymentPending=value.id;
            state.mind.paymentPendingSessions=pending;
          }
          return state;
        },{preserveGameplay:true});
        if(!active())return;
        session=value;
        find('[data-address]').value=value.address;
        find('[data-quote]').textContent=decimal(value.units,value.decimals)+' MIND';
        find('[data-session]').hidden=false;
        check.hidden=false;
        if(value.qrPayload&&value.expiresAt>Date.now()){
          const qr=qrcode(0,'M');
          qr.addData(value.qrPayload);
          qr.make();
          qrBox.innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
        }
        status.textContent=value.receipt?'Check payment to apply the verified receipt.':
          value.expiresAt<=Date.now()?'Check an earlier payment or request a new quote.':
          value.qrPayload?'Scan with a Solana Pay wallet.':value.checkoutCode?paymentFailureMessage(value.checkoutCode):
            'Check your existing payment here.';
        updateTime();
      }catch(error){if(active())status.textContent=error.message;}
      finally{busy=false;fresh.disabled=check.disabled=picker.disabled=false;}
    };
    check.addEventListener('click',async()=>{
      if(!session||checking||busy)return;
      checking=true;
      check.disabled=fresh.disabled=picker.disabled=true;
      status.textContent='Checking for a finalized payment…';
      try {
        await this.client.request({action:'payment-check',id:session.id},mind);
        if(active()){
          dialog.close();
          app.dashboard.showPaymentStatus('Payment confirmed.');
        }
      }catch(error){if(active())status.textContent=error.message;}
      finally{checking=false;check.disabled=fresh.disabled=picker.disabled=false;}
    });
    find('[data-copy]').addEventListener('click',async()=>{
      if(!session)return;
      try {await navigator.clipboard.writeText(session.address);if(active())status.textContent='Deposit wallet address copied.';}
      catch {find('[data-address]').select();status.textContent='Copy the selected wallet address.';}
    });
    fresh.addEventListener('click',()=>void load(true));
    picker.addEventListener('change',()=>void load(false));
    find('[data-close]').addEventListener('click',()=>dialog.close());
    const timer=setInterval(updateTime,1000);
    dialog.addEventListener('close',()=>{
      clearInterval(timer);
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)dialog.remove();
      else setTimeout(()=>dialog.remove(),180);
      if(this.dialog===dialog){this.dialog=null;if(!opener.disabled&&!opener.hidden)opener.focus();}
    },{once:true});
    document.body.append(dialog);
    dialog.showModal();
    updateTime();
    await load(false);
  }
}
