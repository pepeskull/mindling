import { renderFooterLinks } from '../src/ui/footer-links.js';
import { MindlingApp } from "../src/app/app.js";

renderFooterLinks();

let active = null;
let stopped = false;
async function startProduction() {
  if (stopped) return;
  active = new MindlingApp();
  await active.start();
}
async function start() {
  if (new URLSearchParams(location.search).get('stage-preview') === '1') {
    const demo = new URLSearchParams(location.search).get('preview-mode') === 'demo';
    const Preview = demo ? (await import('../src/preview/evolution-preview.js')).EvolutionPreview : (await import('../src/preview/sandbox/controller.js')).SandboxPreview;
    if (stopped) return;
    active = new Preview();
    await active.start();
  } else await startProduction();
}
function showStartupError() {
  const scene = document.querySelector('#scene');
  if (!scene.querySelector('.scene-error')) scene.insertAdjacentHTML('beforeend', '<p class="scene-error">The Neural Seed could not be rendered.</p>');
}
start().catch(showStartupError);
window.addEventListener('pagehide', () => { stopped = true; active?.destroy(); }, { once: true });
