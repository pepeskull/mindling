import { MindlingApp } from "../src/app/app.js";

let active = null;
let stopped = false;
async function startProduction() {
  if (stopped) return;
  active = new MindlingApp();
  await active.start();
}
async function start() {
  if (new URLSearchParams(location.search).get('stage-preview') === '1') {
    const { EvolutionPreview } = await import('../src/preview/evolution-preview.js');
    if (stopped) return;
    active = new EvolutionPreview({ onExit: () => {
      const url = new URL(location.href); url.searchParams.delete('stage-preview'); history.replaceState(null, '', url);
      startProduction().catch(showStartupError);
    } });
    await active.start();
  } else await startProduction();
}
function showStartupError() {
  const scene = document.querySelector('#scene');
  if (!scene.querySelector('.scene-error')) scene.insertAdjacentHTML('beforeend', '<p class="scene-error">The Neural Seed could not be rendered.</p>');
}
start().catch(showStartupError);
window.addEventListener('pagehide', () => { stopped = true; active?.destroy(); }, { once: true });
