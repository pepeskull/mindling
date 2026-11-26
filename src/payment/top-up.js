import qrcode from '../preview/vendor/qrcode.js';

function decimal(units,decimals){
  const padded=units.padStart(decimals+1,'0');
  return decimals ? padded.slice(0,-decimals)+'.'+padded.slice(-decimals) : padded;
}

export class TopUp {
  constructor(client,signal){
    this.client=client;
    this.button=document.querySelector('.energy-panel .coming-soon');
    this.button.addEventListener('click',()=>void this.open(),{signal});
    signal.addEventListener('abort',()=>this.dialog?.close(),{once:true});
  }
  enable(id){
    if(this.identity===id)return;
    this.dialog?.close();
    this.identity=id;
    this.button.disabled=false;
    this.button.textContent='Top-up';
    this.client.request({action:'payment-current'}).then(({session})=>{if(this.identity===id)this.label(session);}).catch(()=>{});
  }
  label(session){
    const address=session?.address;
    if(address&&session.expiresAt>Date.now()&&!session.receipt){
      this.button.textContent=address.slice(0,5)+'…'+address.slice(-5);
      this.button.setAttribute('aria-label','Energy top-up · '+address);
    }else{
      this.button.textContent='Top-up';
      this.button.removeAttribute('aria-label');
    }
  }
  async open(){
    if(this.dialog||this.client.app.state?.mind?.life?.lifeState!=='ALIVE')return;
    const dialog=document.createElement('dialog');
    this.dialog=dialog;
    dialog.className='sandbox-wallet glass-panel';
    dialog.setAttribute('aria-labelledby','top-up-title');
    dialog.innerHTML=`<h2 id="top-up-title">Energy top-up</h2><p>Solana Mainnet · MIND</p>
      <p data-quote></p><label>Deposit wallet <input readonly data-address></label>
      <div data-qr aria-label="Solana Pay QR code"></div>
      <p data-status role="status">Preparing a payment session…</p>
      <div class="sandbox-wallet-actions"><button type="button" data-check disabled>Check payment</button>
      <button type="button" data-new hidden>New payment session</button>
      <button type="button" data-close>Close</button></div>`;
    const find=selector=>dialog.querySelector(selector);
    const check=find('[data-check]'),newSession=find('[data-new]'),status=find('[data-status]');
    let session;
    const render=value=>{
      if(this.dialog!==dialog)return;
      session=value;
      this.label(session);
      find('[data-address]').value=value.address;
      find('[data-quote]').textContent=`${decimal(value.units,value.decimals)} MIND · $1.99`;
      const past=value.expiresAt<=Date.now();
      newSession.hidden=!past&&!value.receipt;
      check.disabled=Boolean(value.receipt);
      if(past||value.receipt){
        find('[data-qr]').replaceChildren();
        status.textContent=value.receipt?'This payment was credited.':'Quote expired. You can still check an earlier payment.';
        return;
      }
      const link=new URL('/api/mindling/pay',location.origin);
      link.searchParams.set('session',value.id);
      if(link.protocol!=='https:'){
        status.textContent='An HTTPS address is required for mobile wallet scanning.';
        return;
      }
      const qr=qrcode(0,'M');
      qr.addData('solana:'+encodeURIComponent(link.href));
      qr.make();
      find('[data-qr]').innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
      status.textContent='Scan with a Solana Pay wallet on Mainnet.';
    };
    async function load(client,fresh){
      newSession.disabled=true;
      try {
        const current=fresh?null:(await client.request({action:'payment-current'})).session;
        const value=current|| (await client.request({action:'payment-create',fresh})).session;
        if(value?.cluster!=='mainnet'||!/^[a-f0-9]{48}$/.test(value.id)||
           !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.address)||!/^\d{1,20}$/.test(value.units)||
           !Number.isInteger(value.decimals)||value.decimals<0||value.decimals>9)throw Error('The payment session could not be validated.');
        render(value);
      }catch(error){status.textContent=error.message;}
      finally{newSession.disabled=false;}
    }
    check.addEventListener('click',async()=>{
      check.disabled=true;
      status.textContent='Checking for a finalized payment…';
      try{
        await this.client.request({action:'payment-check',id:session.id});
        this.label(null);
        dialog.close();
      }catch(error){status.textContent=error.message;check.disabled=false;}
    });
    newSession.addEventListener('click',()=>void load(this.client,true));
    find('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{dialog.remove();if(this.dialog===dialog)this.dialog=null;},{once:true});
    document.body.append(dialog);
    dialog.showModal();
    await load(this.client,false);
  }
}
