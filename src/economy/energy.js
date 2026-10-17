// All mutations call these pure rules inside the existing gameplay transaction.
// Browser clocks are not trusted time; backwards clocks never grant credit.
export const ENERGY_MAX=10;
export const ENERGY_INTERVAL=12*60*1000;
const timestamp=now=>{if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid Energy time');return now;};
export function energyAt(input,now) {
  timestamp(now);
  if(input?.version>2)throw Error('Unsupported Energy version; data preserved');
  const balance=input?.remaining??ENERGY_MAX;
  if(!Number.isSafeInteger(balance)||balance<0)throw Error('Invalid saved Energy balance; data preserved');
  if(input?.version!==2){
    // Start the new clock now: never apply both a legacy refill and regeneration.
    return {version:2,remaining:balance,bonus:Math.max(0,balance-ENERGY_MAX),updatedAt:now};
  }
  if(!Number.isSafeInteger(input.bonus)||input.bonus<0||input.bonus>balance||!Number.isSafeInteger(input.updatedAt)||input.updatedAt<0)throw Error('Invalid saved Energy clock; data preserved');
  const next={...input},time=Math.max(now,input.updatedAt),base=balance-input.bonus;
  if(base>ENERGY_MAX)throw Error('Invalid normal Energy capacity');
  if(base===ENERGY_MAX){next.updatedAt=time;return next;}
  const earned=Math.min(ENERGY_MAX-base,Math.floor((time-input.updatedAt)/ENERGY_INTERVAL));
  next.remaining+=earned;
  next.updatedAt=base+earned===ENERGY_MAX?time:input.updatedAt+earned*ENERGY_INTERVAL;
  return next;
}
export function spendEnergy(input,cost,now){
  if(!Number.isSafeInteger(cost)||cost<=0)throw Error('Invalid Energy cost');
  const next=energyAt(input,now);
  if(next.remaining<cost)throw Error('Not enough Energy; wait for regeneration');
  // Use regenerating points first; paid/legacy excess stays explicitly accounted for.
  const base=next.remaining-next.bonus;
  next.bonus-=Math.max(0,cost-base);next.remaining-=cost;
  return next;
}
export function creditEnergy(input,amount,now){
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid Energy credit');
  const next=energyAt(input,now);next.bonus+=amount;next.remaining+=amount;return next;
}
export function energyProjection(input,now){
  const state=energyAt(input,now),base=state.remaining-state.bonus,full=base===ENERGY_MAX;
  const nextIn=full?0:Math.max(0,state.updatedAt+ENERGY_INTERVAL-now);
  return {...state,maximum:ENERGY_MAX,base,full,nextIn,fullIn:full?0:nextIn+(ENERGY_MAX-base-1)*ENERGY_INTERVAL};
}
export function energyLabel(input,now){
  const e=energyProjection(input,now),seconds=Math.ceil(e.nextIn/1000),minutes=Math.ceil(e.fullIn/60000);
  return {value:`${e.base} / ${ENERGY_MAX}${e.bonus?` + ${e.bonus} bonus`:''}`,bar:e.base,
    text:e.full?'Energy Full':`Next Energy in ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} · Fully recharged in ${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`};
}
