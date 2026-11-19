export const ORBIT_GREY = '#92999f';
const palette = ['#89cfff','#a798ff','#5cdddb','#ff967a','#95d6a0','#e0bef0','#f6cb7b','#91ecbb','#7fa7f9','#ec9bca','#f4a669'];
const fraction = value => value - Math.floor(value);
const cycle = (time, duration, offset) => fraction(time / duration + offset);
export const streamColor = (index, selected) => index === selected ? palette[index] : ORBIT_GREY;

export function orbitFrame(time, paths, selected) {
  const nodes = [], digits = [];
  paths.forEach(({ startX, startY, endX, endY, outputX, width }, index) => {
    const middle = (startX + endX) / 2;
    const color = streamColor(index, selected);
    for (let i = 0; i < 2 + index % 4; i++) {
      const t = cycle(time, 3.1 + index * .23 + i * .19, index * .271 + i * .381);
      const s = 1 - t;
      nodes.push({ index, color, x:s**3*startX+3*s*t*middle+t**3*endX,
        y:s*s*(1+2*t)*startY+t*t*(3-2*t)*endY, radius:1.5 + i*.48,
        opacity:.24 + Math.sin(Math.PI*t)*.56 });
    }
    for (let i = 0; i < 3 + index % 3; i++) {
      const t = cycle(time, 3.4 + index * .13 + i * .47, index*.433 + i*.293);
      const drift = Math.sin(index * 4.81 + i * 2.59) * width * .24;
      digits.push({ index, color, x:outputX+t*width,
        y:endY+t*drift+Math.sin(t*4+i+index)*12*t,
        digit:String((index+i+Math.floor(time/(3.4+index*.13+i*.47)+index*.433+i*.293))%2),
        size:8 + (i+index)%7, opacity:Math.sin(Math.PI*t) * (1-t) * .85 });
    }
  });
  return { nodes, digits };
}
