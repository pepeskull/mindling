import qrcode from '../vendor/qrcode.js';
import { quote,simulatePurchase } from './wallet.js';
export class TestWalletUI{
  constructor(controller){this.controller=controller;this.button=document.querySelector('.energy-panel .coming-soon');this.original={text:this.button.textContent,disabled:this.button.disabled,title:this.button.title};this.button.disabled=false;this.button.textContent=`TEST…${controller.state.player.id.slice(-5)}`;this.button.title='Test-only wallet simulator — no deposits';controller.listen(this.button,'click',()=>this.open());}
  open(){
    if(this.controller.external?.locked)return;
    if(this.dialog)return;this.events=new AbortController();const listen=(node,event,fn)=>node.addEventListener(event,fn,{signal:this.events.signal});const c=this.controller,s=c.state,payload=`mindling-preview:simulation:${s.player.id}`;
    this.dialog=document.createElement('dialog');this.dialog.className='sandbox-wallet glass-panel';
    this.dialog.innerHTML=`<h2>Test-only wallet</h2><p>No deposits, transfers or on-chain burns are enabled.</p><p>Network: simulated Solana environment · no RPC connection</p><label>Public deposit address <input readonly value="Unavailable — deposits disabled"></label><label>Test wallet identifier <input data-wallet-id readonly></label><div data-wallet-qr></div><p>The QR encodes a simulation identifier, not a Solana address. Never send assets here.</p><button data-copy-wallet>Copy test identifier</button><p data-test-balance></p><button data-quote>Simulate USD 1.99 quote</button><pre data-quote-info></pre><button data-buy disabled>Confirm simulated burn + 10 Energy</button><p role="status" data-wallet-status></p><button data-close-wallet>Close</button>`;
    document.body.append(this.dialog);this.dialog.querySelector('[data-wallet-id]').value=payload;
    const qr=qrcode(0,'M');qr.addData(payload);qr.make();this.dialog.querySelector('[data-wallet-qr]').innerHTML=qr.createSvgTag({cellSize:3,margin:12,scalable:true});
    this.dialog.querySelector('[data-test-balance]').textContent=`Test token units: ${s.player.wallet.balance} (6 decimals)`;
    const status=text=>{if(this.dialog)this.dialog.querySelector('[data-wallet-status]').textContent=text;};
    listen(this.dialog.querySelector('[data-copy-wallet]'),'click',async()=>{try{await navigator.clipboard.writeText(payload);status('Test identifier copied. This is not a deposit address.');}catch{status('Copy unavailable. Select and copy the identifier manually.');}});
    listen(this.dialog.querySelector('[data-quote]'),'click',()=>{try{this.quote=quote(c.state);this.dialog.querySelector('[data-quote-info]').textContent=`SIMULATION ONLY\nUSD 1.99 / fixed test price USD 0.10\n${this.quote.units} token units · 6 decimals\nTest fee: ${this.quote.feeLamports} lamports\nExpires: ${new Date(this.quote.expiresAt).toISOString()} (virtual time)\nNo on-chain transaction will occur.`;this.dialog.querySelector('[data-buy]').disabled=false;}catch(e){status(e.message);}});
    listen(this.dialog.querySelector('[data-buy]'),'click',()=>c.action(async()=>{try{await c.change(s=>simulatePurchase(s,this.quote,{confirmed:true}));}catch(error){status(error.message);throw error;}status('Simulated burn recorded; Energy credited once. No Solana transaction occurred.');this.dialog.querySelector('[data-buy]').disabled=true;this.dialog.querySelector('[data-test-balance]').textContent=`Test token units: ${c.state.player.wallet.balance} (6 decimals)`;}));
    listen(this.dialog.querySelector('[data-close-wallet]'),'click',()=>this.close());listen(this.dialog,'close',()=>this.close());this.dialog.showModal();
  }
  close(){this.events?.abort();const dialog=this.dialog;this.dialog=null;dialog?.remove();this.quote=null;}
  destroy(){this.close();this.button.textContent=this.original.text;this.button.disabled=this.original.disabled;this.button.title=this.original.title;}
}
