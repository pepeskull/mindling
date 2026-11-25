export const LOOKS = {
  soft:     { surface:0xbcbcbc, emissive:.26, alpha:1, glow:.17, radius:1.07, detail:.31, fibers:.22, core:.42 },
  synapses: { surface:0x777777, emissive:.10, alpha:.67, glow:.08, radius:.87, detail:.11, fibers:.12, core:.17 },
  activity: { surface:0xb5b5b5, emissive:.24, alpha:1, glow:.14, radius:1.08, detail:.25, fibers:.22, core:.35 },
  xray:     { surface:0xa9a9a9, emissive:.16, alpha:.11, glow:.08, radius:.88, detail:.21, fibers:.27, core:.13 }
};

export const ACTIVITIES = {
  idle:     { label:'Idle', color:'#14B8A6', duration:4.8, trail:.12, beads:1 },
  talk:     { label:'Talk', color:'#38BDF8', duration:1.9, trail:.31, beads:2 },
  teach:    { label:'Teach', color:'#22C55E', duration:2.3, trail:.33, beads:1 },
  deep:     { label:'Deep Training', color:'#F59E0B', duration:2.8, trail:.42, beads:3 },
  research: { label:'Research', color:'#9CA3AF', duration:3.3, trail:.43, beads:3 },
  recall:   { label:'Memory Recall', color:'#EAB308', duration:1.65, trail:.32, beads:2 }
};

export function activityFrame(events,time,reduced,edges){
  return events.flatMap(event=>{
    const kind=ACTIVITIES[event.key],edge=edges.get(event.synapseId);
    if(!edge)return [];
    const age=(time-event.start)/(reduced?.95:kind.duration);
    if(age<0||age>=1)return [];
    const travel=reduced?.72:Math.min(1,age/.84);
    const envelope=reduced?.85:Math.min(1,age/.12,(1-age)/.16);
    return [{...event,...kind,edge,travel,head:Math.max(0,envelope),flash:reduced?envelope:Math.max(0,1-Math.abs(travel-.84)*7)*envelope}];
  });
}

export const ACTIVITY_KEYS=new Set(['talk','teach','deep','research','recall']);
