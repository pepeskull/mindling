export const NEUTRAL_COLOR='#92959b'; // Existing secondary text tone for unassigned areas.
export const colors=['#81dfd1','#b8a2ed','#79bccc','#d0c58e','#a6d4ba','#a0b3e4'];

export const areaColor=id=>{let hash=0;for(const char of id)hash=(hash*31+char.codePointAt(0))>>>0;return colors[hash%colors.length];};
