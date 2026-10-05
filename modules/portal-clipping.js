// ============================================================================
// MODULE 02 // UNIVERSAL 4-PLANE 3D PORTAL CLIPPING & YCrCb CHROMA KEY SHADER
// ============================================================================

import { StudioState } from './core-viewport.js';
import { targetMesh } from './tracker-3d-epnp.js';

export function computeClippingPlanesForSource(clipSourceId) {
    if (!clipSourceId || clipSourceId === 'none') return null;

    let refMatrix = targetMesh.matrixWorld;
    let halfW = 0.5;
    let halfH = StudioState.currentTargetAspect / 2;

    if (clipSourceId !== 'target') {
        const maskLayer = StudioState.layers.find(l => l.id === clipSourceId && l.isMaskPlane);
        if (!maskLayer || !maskLayer.mesh) return null;
        maskLayer.mesh.updateMatrixWorld(true);
        refMatrix = maskLayer.mesh.matrixWorld;
        halfW = 0.5;
        halfH = 0.5;
    } else {
        targetMesh.updateMatrixWorld(true);
    }

    const pLeft   = new THREE.Plane(new THREE.Vector3( 1,  0, 0), halfW).applyMatrix4(refMatrix);
    const pRight  = new THREE.Plane(new THREE.Vector3(-1,  0, 0), halfW).applyMatrix4(refMatrix);
    const pBottom = new THREE.Plane(new THREE.Vector3( 0,  1, 0), halfH).applyMatrix4(refMatrix);
    const pTop    = new THREE.Plane(new THREE.Vector3( 0, -1, 0), halfH).applyMatrix4(refMatrix);

    return [pLeft, pRight, pBottom, pTop];
}

export function updateLayerClippingAndOpacity(layer, effectiveOpacity) {
    if (!layer.mesh || layer.isFolder || layer.isMaskPlane) return;
    const planes = computeClippingPlanesForSource(layer.clipSource);

    layer.mesh.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.clippingPlanes = planes;
            child.material.clipIntersection = false;
            child.material.transparent = true;

            if (child.material.uniforms && child.material.uniforms.opacity) {
                child.material.uniforms.opacity.value = effectiveOpacity;
                if (planes) {
                    child.material.uniforms.useClip.value = 1.0;
                    child.material.uniforms.clipP0.value.set(planes[0].normal.x, planes[0].normal.y, planes[0].normal.z, planes[0].constant);
                    child.material.uniforms.clipP1.value.set(planes[1].normal.x, planes[1].normal.y, planes[1].normal.z, planes[1].constant);
                    child.material.uniforms.clipP2.value.set(planes[2].normal.x, planes[2].normal.y, planes[2].normal.z, planes[2].constant);
                    child.material.uniforms.clipP3.value.set(planes[3].normal.x, planes[3].normal.y, planes[3].normal.z, planes[3].constant);
                } else {
                    child.material.uniforms.useClip.value = 0.0;
                }
            } else {
                child.material.opacity = effectiveOpacity;
            }
        }
    });
}

export function createChromaMaterial(texture, hexColor, similarity, smoothness, enabled) {
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
            src: { value: texture },
            color: { value: new THREE.Color(hexColor) },
            similarity: { value: similarity },
            smoothness: { value: smoothness },
            enableChroma: { value: enabled ? 1.0 : 0.0 },
            opacity: { value: 1.0 },
            useClip: { value: 0.0 },
            clipP0: { value: new THREE.Vector4() },
            clipP1: { value: new THREE.Vector4() },
            clipP2: { value: new THREE.Vector4() },
            clipP3: { value: new THREE.Vector4() }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D src;
            uniform vec3 color;
            uniform float similarity;
            uniform float smoothness;
            uniform float enableChroma;
            uniform float opacity;
            uniform float useClip;
            uniform vec4 clipP0;
            uniform vec4 clipP1;
            uniform vec4 clipP2;
            uniform vec4 clipP3;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                if (useClip > 0.5) {
                    if (dot(vWorldPos, clipP0.xyz) + clipP0.w < 0.0) discard;
                    if (dot(vWorldPos, clipP1.xyz) + clipP1.w < 0.0) discard;
                    if (dot(vWorldPos, clipP2.xyz) + clipP2.w < 0.0) discard;
                    if (dot(vWorldPos, clipP3.xyz) + clipP3.w < 0.0) discard;
                }
                vec4 texColor = texture2D(src, vUv);
                if (enableChroma > 0.5) {
                    float Y1 = 0.2989 * texColor.r + 0.5866 * texColor.g + 0.1145 * texColor.b;
                    float Cr1 = texColor.r - Y1;
                    float Cb1 = texColor.b - Y1;
                    float Y2 = 0.2989 * color.r + 0.5866 * color.g + 0.1145 * color.b;
                    float Cr2 = color.r - Y2;
                    float Cb2 = color.b - Y2;
                    float blend = smoothstep(similarity, similarity + max(smoothness, 0.001), distance(vec2(Cr1, Cb1), vec2(Cr2, Cb2)));
                    if (blend * opacity < 0.01) discard;
                    gl_FragColor = vec4(texColor.rgb * blend, texColor.a * blend * opacity);
                } else {
                    if (texColor.a * opacity < 0.01) discard;
                    gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);
                }
            }
        `
    });
}
