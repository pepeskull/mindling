import { LIFE_RULES } from '../../life/life-system.js';
export const PREVIEW_LIFE=Object.freeze({decayMultiplier:.25,collapseStrain:28,criticalStrain:21});
const HOUR=3600000;
export function condition(life){if(life.lifeState==='DECEASED')return 'NEURAL COLLAPSE';if((life.strain||0)>=21||life.attributes.health<=15)return 'CRITICAL';if((life.strain||0)>=12||Math.min(...Object.values(life.attributes))<70)return 'STRAINED';return Math.min(...Object.values(life.attributes))>=90?'HEALTHY':'STABLE';}
// A fixed hourly grid makes split advances and reloads equivalent. Only the injected
// virtual clock advances physiology; wall time, network failures and hidden tabs do not.
export function advancePreviewLife(state){
  const m=state.mind;if(!m||m.life.lifeState==='DECEASED')return state;
  const life=m.life;life.strain??=0;
  while(life.lastAt+HOUR<=state.now){
    for(const [name,rate] of Object.entries(LIFE_RULES.decayPerHour))life.attributes[name]=Math.max(0,life.attributes[name]-rate*PREVIEW_LIFE.decayMultiplier);
    const a=life.attributes;
    const physical=Math.max(0,20-a.nutrition)/20+Math.max(0,15-a.rest)/15,abandonment=Math.max(0,15-a.wellbeing)/15;
    a.health=Math.max(0,a.health-.28*PREVIEW_LIFE.decayMultiplier*physical*(1+abandonment));
    life.strain+=(100-a.nutrition+100-a.rest+100-a.wellbeing)/100;
    life.lastAt+=HOUR;
    if(life.strain>=PREVIEW_LIFE.collapseStrain||a.health===0){life.lifeState='DECEASED';life.deathAt=life.lastAt;
      if(!state.tombstones.some(t=>t.id===m.id))state.tombstones.push({id:m.id,at:life.deathAt,reason:'NEURAL_COLLAPSE'});break;}
  }
  return state;
}
export function carePreview(input,type){
  const s=structuredClone(input),m=s.mind,rule=LIFE_RULES.care[type];
  if(!m||m.life.lifeState!=='ALIVE'||s.tombstones.some(t=>t.id===m.id))throw Error('A deceased identity cannot be revived');
  if(!rule)throw Error('Unknown care action');const life=m.life;
  if(life.care[type]!=null&&s.now-life.care[type]<rule.cooldownHours*HOUR)throw Error('Care cooldown is still active');
  const target=type==='NOURISH'?'nutrition':type==='REST'?'rest':'health';
  if(life.attributes[target]>=100&&!(life.strain>0))throw Error('No care needed');
  for(const [key,gain] of [['nutrition',rule.nutritionGain],['rest',rule.restGain],['health',rule.healthGain],['wellbeing',rule.wellbeingGain]])if(gain)life.attributes[key]=Math.min(100,life.attributes[key]+gain);
  life.strain=Math.max(0,(life.strain||0)-(type==='CARE'?6:type==='REST'?4:3));life.care[type]=s.now;return s;
}
