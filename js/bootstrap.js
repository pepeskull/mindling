import { renderFooterLinks } from '../src/ui/footer-links.js';
import { checkDesktop, showCompatibility } from '../src/platform/desktop.js';

renderFooterLinks();

// Retire only the two former model-asset caches and their workers. Player data
// lives in IndexedDB and is intentionally outside this cleanup.
async function retireExperimentalModelCaches() {
  if (navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.filter(registration => {
      const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '';
      return script.endsWith('/local-ai-cache.js') || script.endsWith('/ai-lab/lab-cache.js');
    }).map(registration => registration.unregister()));
  }
  if (globalThis.caches) await Promise.allSettled(['mindling-local-model-assets-v1', 'mindling-ai-lab-assets-v1'].map(name => caches.delete(name)));
}
void retireExperimentalModelCaches().catch(() => {});

let active = null;
let stopped = false;
async function startProduction() {
  if (stopped) return;
  const {MindlingApp}=await import('../src/app/app.js');
  if(stopped)return;
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
function showStartupError(error) {
  const scene = document.querySelector('#scene');
  if (!scene.querySelector('.scene-error')) {
    const message = document.createElement('p'); message.className = 'scene-error';
    message.textContent = error?.message || 'Mindling could not start. Your saved data has been preserved.';
    scene.append(message);
  }
}
const compatibility=checkDesktop();
if(compatibility.allowed)start().catch(showStartupError);else showCompatibility(compatibility);
window.addEventListener('pagehide', () => { stopped = true; active?.destroy(); }, { once: true });
