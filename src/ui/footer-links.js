import { SITE_LINKS } from '../config/site-links.js';
export function officialLink(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function renderFooterLinks(root = document, links = SITE_LINKS) {
  for (const [key, label] of [['x','X'],['docs','DOCS']]) {
    const previous = root.querySelector(`[data-footer-link="${key}"]`);
    if (!previous) continue;
    const href = key==='docs'&&links[key]==='/docs'?'/docs':officialLink(links[key]);
    const node = root.createElement(href ? 'a' : 'span');
    node.dataset.footerLink = key; node.textContent = label;
    if (href) {node.href=href;if(href.startsWith('https:')){node.target='_blank';node.rel='noopener noreferrer';}}
    else { node.setAttribute('aria-disabled', 'true'); node.title = `Official ${label} destination is not configured`; }
    previous.replaceWith(node);
  }
}
