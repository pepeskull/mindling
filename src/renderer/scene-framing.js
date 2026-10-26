// The production seed uses a 36° perspective camera at z=5.8 and model scale
// 1.28. Preview has a smaller panel-free viewport: preserve that reference pixel
// scale where it fits, otherwise bound the projected geometry inside that viewport.
export const SEED_CAMERA = Object.freeze({ fov: 36, distance: 5.8, scale: 1.28 });
export function previewFraming(width, height, referenceHeight, radius, zoom = 1, { allowZoomOverflow=false } = {}) {
  const reference = referenceHeight * SEED_CAMERA.scale / (2 * Math.tan(SEED_CAMERA.fov * Math.PI / 360) * SEED_CAMERA.distance);
  const capacity = Math.min(width, height) * .46 / Math.max(.1, radius);
  // Reserve zoom-in headroom while keeping maximum zoom within the safe bounds.
  const unit = Math.min(reference, capacity / 1.2);
  return { unit, zoom: allowZoomOverflow?zoom:Math.min(zoom, capacity / unit), radius };
}

export function morphologyRadius(model) {
  let radius = 0;
  for (const node of model.nodes) radius = Math.max(radius, Math.hypot(...node.position) + node.radius * 4.8);
  for (const contour of model.contours || []) for (const point of contour) radius = Math.max(radius, Math.hypot(...point));
  return Math.max(.1, radius);
}
