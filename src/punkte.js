// cantcodecad – runde Punkte (Skizzenpunkte, Drehpunkt beim Orbit, Lager-Marken) statt der Quadrate, die
// THREE.PointsMaterial zeichnet. Scheibe mit weich geglättetem Rand aus gl_PointCoord; Größe in CSS-Pixeln.
//   art 'voll': ganz in der Farbe · 'ring': weiß gefüllt mit farbigem Rand (normale Skizzenpunkte) ·
//   'rand': farbig mit weißem Rand (Drehpunkt, gewählte Punkte – heben sich auf jedem Untergrund ab)
import * as THREE from 'three';

export function punktMaterial(color, size, art = 'voll') {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      farbe: { value: new THREE.Color(color) },
      groesse: { value: size * (window.devicePixelRatio || 1) },
      art: { value: art === 'ring' ? 1 : art === 'rand' ? 2 : 0 }
    },
    vertexShader: `uniform float groesse;
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = groesse; }`,
    fragmentShader: `uniform vec3 farbe; uniform float art; uniform float groesse;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0), px = 2.0 / max(groesse, 1.0);
        float a = 1.0 - smoothstep(1.0 - px, 1.0, r);
        if (a <= 0.0) discard;
        float rand = 1.0 - 2.5 * px; // Rand etwa 1,5 Pixel innerhalb der Glättung
        vec3 col = farbe;
        if (art > 0.5 && art < 1.5) col = mix(vec3(1.0), farbe, smoothstep(rand - px, rand, r));
        if (art > 1.5) col = mix(farbe, vec3(1.0), smoothstep(rand - px, rand, r));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false
  });
  m.color = m.uniforms.farbe.value; // wie PointsMaterial: material.color.setHex(…) färbt um (Hervorhebung)
  return m;
}
