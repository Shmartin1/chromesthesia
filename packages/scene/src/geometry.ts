import {
  BufferGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';

/** Parametric surfaces: vertices store longitudinal position, cross-section and strand number.
 * Curves and surface normals are evaluated on the GPU; no per-frame buffer uploads. */
function strands(count: number, lengthSegments: number, widthSegments: number) {
  const vertices: number[] = [],
    indices: number[] = [];
  for (let lane = 0; lane < count; lane++) {
    const offset = vertices.length / 3;
    for (let u = 0; u <= lengthSegments; u++) {
      for (let v = 0; v <= widthSegments; v++)
        vertices.push(u / lengthSegments, v / widthSegments, lane);
    }
    for (let u = 0; u < lengthSegments; u++) {
      for (let v = 0; v < widthSegments; v++) {
        const a = offset + u * (widthSegments + 1) + v,
          b = a + widthSegments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 7);
  return geometry;
}

export function createGeometries() {
  return {
    orb: new SphereGeometry(0.83, 64, 40),
    tube: strands(1, 112, 24),
    neon: strands(5, 128, 8),
    wisp: strands(9, 112, 8),
    flame: strands(15, 112, 6),
    halo: new PlaneGeometry(3.8, 3.8),
  };
}
