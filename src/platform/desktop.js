// Compatibility UX, not device-proof access control. Never use viewport width alone.
export function desktopSupport({ua='',platform='',mobile=false,touch=0,coarse=false,fine=false,hover=false}={}){
  const handheld=/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(ua)||mobile;
  const ipad=/Mac/i.test(platform)&&touch>1;
  if(handheld||ipad)return {allowed:false,reason:'mobile-or-tablet'};
  const desktop=/Windows|Win32|Win64|Mac|Linux|X11|CrOS/i.test(platform+' '+ua);
  if(desktop&&fine&&hover)return {allowed:true,reason:'desktop-input'};
  if(touch>0&&coarse&&!fine)return {allowed:false,reason:'touch-only-device'};
  return {allowed:false,reason:'desktop-capabilities-unconfirmed'};
}
export function checkDesktop(){return desktopSupport({ua:navigator.userAgent,platform:navigator.userAgentData?.platform||navigator.platform,mobile:navigator.userAgentData?.mobile===true,touch:navigator.maxTouchPoints,coarse:matchMedia('(any-pointer: coarse)').matches,fine:matchMedia('(any-pointer: fine)').matches,hover:matchMedia('(any-hover: hover)').matches});}
export function showCompatibility(result){
  const app=document.querySelector('#app');app.hidden=true;
  const screen=document.createElement('main');screen.className='desktop-required';
  screen.innerHTML='<section aria-labelledby="compatibility-title"><div class="compatibility-neurons" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><p class="compatibility-brand">PLAY MINDLING</p><h1 id="compatibility-title">Your Mindling needs a bigger world.</h1><p>Play Mindling is currently designed for desktop and laptop computers.</p><p>Visit us from your computer to raise, train and evolve your own AI.</p><strong>DESKTOP EXPERIENCE REQUIRED</strong><p data-device-explanation></p></section>';
  screen.querySelector('[data-device-explanation]').textContent=result.reason==='desktop-capabilities-unconfirmed'?'We could not confirm desktop pointer and hover support in this browser. Your saved Mindling remains untouched.':'Mobile and tablet gameplay is unavailable. Your saved Mindling remains untouched.';
  document.body.append(screen);document.title='Desktop experience required · Play Mindling';
}
