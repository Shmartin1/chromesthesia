import '@vitejs/plugin-react/preamble';
import { createRoot } from 'react-dom/client';
import { emptyScene, mapFeatures, type FeatureFrame, type SceneFrame } from '@chromesthesia/core';
import { defaultProfile } from '@chromesthesia/profiles';
import { SynestheticScene } from '@chromesthesia/scene';

const frame = { current: emptyScene() };
const root = createRoot(document.getElementById('root')!);
export function showScene(scene: SceneFrame, reducedMotion = true) {
  frame.current = scene;
  root.render(<SynestheticScene frame={frame} reducedMotion={reducedMotion} />);
}
export function show(features: FeatureFrame) {
  showScene(mapFeatures(features, defaultProfile));
}
showScene(frame.current);
