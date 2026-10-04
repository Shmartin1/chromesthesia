/** Shared, bounded dye currents. Spatial noise is seeded once per tracked sound;
 * time only advects the field, so changing frames never introduces random jitter. */
export const dyeFlow = `
float flowHash(float p) { return fract(sin(p*127.1+uSeed*311.7)*43758.5453); }
float flowNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p);
  f=f*f*f*(f*(f*6.0-15.0)+10.0);
  float a=flowHash(dot(cell,vec2(1.0,57.0)));
  float b=flowHash(dot(cell+vec2(1.0,0.0),vec2(1.0,57.0)));
  float c=flowHash(dot(cell+vec2(0.0,1.0),vec2(1.0,57.0)));
  float d=flowHash(dot(cell+vec2(1.0),vec2(1.0,57.0)));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y)*2.0-1.0;
}
vec3 dyeCurve(float u, float lane, float spread) {
  // Neighboring sheets share a current, then peel apart into unequal eddies.
  float branch=floor(lane/3.0), layer=mod(lane,3.0)-1.0;
  float a=flowHash(branch*7.0+1.0), b=flowHash(branch*7.0+2.0);
  float c=flowHash(branch*7.0+3.0), t=uPhase;
  float opening=0.72+0.28*(1.0-exp(-uPhase*0.8));
  float fan=smoothstep(0.08,0.85,u)*opening;
  float turn=smoothstep(0.28,1.0,u);
  float angle=(u*1.4+turn*(5.5+b*3.0))*(a>0.5?1.0:-1.0)+c*6.28+t*(0.28+b*0.16);
  angle+=layer*turn*(0.18+flowHash(lane+38.0)*0.25);
  float radius=(0.26+0.42*b)*fan*(1.0+0.12*sin(t*0.61+c*9.0));
  float current=flowNoise(vec2(u*2.7-t*0.22,branch*0.21+0.4));
  float fine=flowNoise(vec2(u*6.0-t*0.34,branch*0.32+4.0));
  vec3 p=vec3(
    fan*(a-0.5)*spread+sin(angle)*radius + current*(0.12+fan*0.27),
    (0.5-u)*(3.6+c*0.35)+fan*cos(angle)*radius*0.95-layer*turn*0.08,
    fan*(c-0.5)*0.85+cos(angle)*radius*0.7
  );
  p+=vec3(layer*0.075*fan,layer*0.045*turn,layer*0.09*fan);
  p.x+=fine*0.075*fan;
  p.y+=fine*0.06*fan;
  // Attacks send a small pressure bulge down the existing current.
  p.xz*=1.0+musicalPulse(u)*0.09*uMotion;
  return p;
}
`;
