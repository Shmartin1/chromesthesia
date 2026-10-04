import '@vitejs/plugin-react/preamble';
import { createRoot } from 'react-dom/client';
import { emptyScene, mapFeatures, type FeatureFrame } from '@chromesthesia/core';
import { defaultProfile } from '@chromesthesia/profiles';
import { SynestheticScene } from '@chromesthesia/scene';

const frame = { current: emptyScene() };
export function show(features: FeatureFrame) {
  frame.current = mapFeatures(features, defaultProfile);
}
createRoot(document.getElementById('root')!).render(
  <SynestheticScene frame={frame} reducedMotion />,
);
