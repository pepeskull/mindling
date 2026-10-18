import { MODEL_CATALOG, TRANSFORMERS_RUNTIME } from './model-catalog.js';
import { MEMORY_MODELS } from './memory-intelligence-config.js';

const CACHE_NAME = 'mindling-ai-lab-assets-v1';
const MODEL_PREFIXES = MODEL_CATALOG.flatMap(model => (model.components || [model]).map(part =>
  `https://huggingface.co/${part.repo}/resolve/${part.revision}/`)).concat(
  [MEMORY_MODELS.embedding, MEMORY_MODELS.analysis].map(model => `https://huggingface.co/${model.repo}/resolve/${model.revision}/`));
const RUNTIME_PREFIXES = [
  TRANSFORMERS_RUNTIME.url,
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/',
];

const allowed = url => [...MODEL_PREFIXES, ...RUNTIME_PREFIXES].some(prefix => url.startsWith(prefix));

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !allowed(event.request.url)) return;
  let cacheWrite = Promise.resolve();
  const responsePromise = (async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cacheWrite = cache.put(event.request, response.clone()).catch(() => {});
    return response;
  })();
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise.then(() => cacheWrite));
});

self.addEventListener('message', event => {
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (event.data?.kind === 'LAB_CACHE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME); const keys = await cache.keys();
      reply({ cache: CACHE_NAME, urls: keys.map(key => key.url) });
    })());
  }
  if (event.data?.kind === 'LAB_CACHE_CLEAR') {
    event.waitUntil(caches.delete(CACHE_NAME).then(ok => reply({ ok })));
  }
});
