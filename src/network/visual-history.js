import {ActivityModel} from './activity-model.js';
export const blendActivity=(real,stored)=>real.map((value,i)=>Math.min(.94,1-(1-value)*(1-stored[i])));
// Samples are presentation only; never ingested into the real event model.
export class VisualHistory extends ActivityModel {
 constructor(real,playback){super();this.real=real;this.playback=playback;this.now=0;this.activeSince=Infinity;}
 resume(now){this.activeSince=now;}
 values(time){return blendActivity(this.real.values(time),time>=this.activeSince?this.playback.values(this.playback.time-(this.now-time)):[0,0,0]);}
 sample(now){if(now<this.now)this.resume(now);this.now=now;return super.sample(now);}
}
