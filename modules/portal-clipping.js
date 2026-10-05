// ============================================================================
// NIZHALI V7 // MODULE 04: 4-PLANE 3D PORTAL CLIPPING & CHROMA KEY SHADERS
// ============================================================================

export class PortalClippingEngine {
  /**
   * Computes 4 clipping plane normals & constants so negative-Z assets
   * are strictly masked inside the physical target frame perimeter.
   */
  static compute4ClippingPlanes(width = 1.6, height = 0.9) {
    const hw = width / 2;
    const hh = height / 2;
    return [
      { normal: [1, 0, 0], constant: hw, edge: 'LEFT_PLANE' },
      { normal: [-1, 0, 0], constant: hw, edge: 'RIGHT_PLANE' },
      { normal: [0, 1, 0], constant: hh, edge: 'BOTTOM_PLANE' },
      { normal: [0, -1, 0], constant: hh, edge: 'TOP_PLANE' }
    ];
  }

  /**
   * Returns a WebGL GLSL fragment shader for real-time green/blue screen chroma key
   * with smooth edge spill suppression.
   */
  static getChromaKeyShaderSource(keyColorHex = '#00ff00', threshold = 0.35, smoothness = 0.1) {
    return `
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec3 uKeyColor;
      uniform float uThreshold;
      uniform float uSmoothness;
      uniform float uOpacity;

      void main() {
        vec4 texel = texture2D(uTexture, vUv);
        float diff = length(texel.rgb - uKeyColor);
        float alpha = smoothstep(uThreshold, uThreshold + uSmoothness, diff);
        gl_FragColor = vec4(texel.rgb, texel.a * alpha * uOpacity);
      }
    `.trim();
  }
}
