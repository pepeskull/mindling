// Shared activity policy; eligibility and atomic writes remain in existing reducers.
export const ACTIVITY_XP=Object.freeze({TALK:3,TEACH:5,DEEP_TRAINING:10});
export const XP=Object.freeze({concept:ACTIVITY_XP.TEACH,understanding:ACTIVITY_XP.DEEP_TRAINING,correction:3,daily:100});
export function activityReward(activity){return ACTIVITY_XP[activity]??0;}

export function dailyXPEarned(history,now){
  const day=Math.floor(now/86400000);
  return history.reduce((total,event)=>event?.day===day&&Number.isFinite(event.xp)&&event.xp>0?total+event.xp:total,0);
}

export function cappedXPAward(nominal,history,now){
  return Math.min(nominal,Math.max(0,XP.daily-dailyXPEarned(history,now)));
}
