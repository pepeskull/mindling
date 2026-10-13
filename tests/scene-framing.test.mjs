import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFraming, morphologyRadius } from '../src/renderer/scene-framing.js';
import { generateStage } from '../src/preview/evolution-model.js';

test('shared preview framing bounds seven stages, portrait, landscape and zoom extremes', () => {
  const radius = Math.max(...Array.from({ length:7 },(_,i)=>morphologyRadius(generateStage(i+1))));
  for(const [width,height,reference] of [[806,620,1000],[374,500,844],[300,180,390],[1200,720,1100]]) {
    for(const modelRadius of [1.5,radius,4.2]) for(const zoom of [.72,1,1.48]) {
      const fit=previewFraming(width,height,reference,modelRadius,zoom);
      assert.ok(fit.unit>0 && fit.zoom>0);
      assert.ok(fit.unit*fit.zoom*modelRadius <= Math.min(width,height)*.460001);
    }
    assert.ok(previewFraming(width,height,reference,radius,.72).zoom < previewFraming(width,height,reference,radius,1.48).zoom);
  }
});
