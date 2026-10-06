// ============================================================================
// PLAYER MODULE 01 // TRUE-COLOR SHADER, 3D PORTAL OCCLUDER & CONTACT SHADOWS
// ============================================================================

window.NizhaliPlayer = window.NizhaliPlayer || {
    ambientTint: { r: 1.0, g: 1.0, b: 1.0 },
    autoLightEnabled: true,
    targetFadeMultipliers: {} // { targetIdx: 1.0 } for smooth loss fade
};

// 1. Custom Three.js ShaderMaterial (True-Color Linear Pass-Through + Ambient Light Tint)
window.createNizhaliShaderMaterial = function(tex, cfg) {
    const THREE = AFRAME.THREE;
    const isChroma = (cfg.t === 'chroma');
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: {
            src: { value: tex },
            hasTex: { value: tex ? 1.0 : 0.0 },
            color: { value: new THREE.Color(cfg.c || '#00ff00') },
            similarity: { value: cfg.sim ?? 0.38 },
            smoothness: { value: cfg.sm ?? 0.08 },
            enableChroma: { value: isChroma ? 1.0 : 0.0 },
            opacity: { value: cfg.op ?? 1.0 },
            ambientTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
            useClip: { value: 0.0 },
            invRefMat: { value: new THREE.Matrix4() },
            halfBounds: { value: new THREE.Vector2(0.5, 0.5) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            #else
            precision mediump float;
            #endif
            uniform sampler2D src;
            uniform float hasTex;
            uniform vec3 color;
            uniform float similarity;
            uniform float smoothness;
            uniform float enableChroma;
            uniform float opacity;
            uniform vec3 ambientTint;
            uniform float useClip;
            uniform mat4 invRefMat;
            uniform vec2 halfBounds;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                if (hasTex < 0.5) discard;
                if (useClip > 0.5) {
                    vec4 localPos = invRefMat * vec4(vWorldPos, 1.0);
                    if (abs(localPos.x) > halfBounds.x || abs(localPos.y) > halfBounds.y) discard;
                }
                vec4 texColor = texture2D(src, vUv);
                vec3 litRgb = texColor.rgb * ambientTint;
                if (enableChroma > 0.5) {
                    float Y1 = 0.2989 * texColor.r + 0.5866 * texColor.g + 0.1145 * texColor.b;
                    float Y2 = 0.2989 * color.r + 0.5866 * color.g + 0.1145 * color.b;
                    float d = distance(vec2(texColor.r - Y1, texColor.b - Y1), vec2(color.r - Y2, color.b - Y2));
                    float b = smoothstep(similarity, similarity + max(smoothness, 0.001), d);
                    if (b * opacity < 0.01) discard;
                    gl_FragColor = vec4(litRgb * b, texColor.a * b * opacity);
                } else {
                    if (texColor.a * opacity < 0.01) discard;
                    gl_FragColor = vec4(litRgb, texColor.a * opacity);
                }
            }
        `
    });
};

// 2. 3D Portal Depth-Mask Frame at Z=0 (Hides -Z layers outside the print window)
window.createPortalWindowFrame = function(halfW, halfH) {
    const THREE = AFRAME.THREE;
    const group = new THREE.Group();

    const outerShape = new THREE.Shape();
    const pad = 4.0;
    outerShape.moveTo(-pad, -pad);
    outerShape.lineTo( pad, -pad);
    outerShape.lineTo( pad,  pad);
    outerShape.lineTo(-pad,  pad);
    outerShape.closePath();

    const holePath = new THREE.Path();
    holePath.moveTo(-halfW, -halfH);
    holePath.lineTo( halfW, -halfH);
    holePath.lineTo( halfW,  halfH);
    holePath.lineTo(-halfW,  halfH);
    holePath.closePath();
    outerShape.holes.push(holePath);

    const ringGeo = new THREE.ShapeGeometry(outerShape);
    const occluderMat = new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, occluderMat);
    ringMesh.renderOrder = -1;
    group.add(ringMesh);

    return group;
};

// 3. Soft Contact Shadow Plane at Z=0 for +Z Floating Layers (Option B)
window.createContactShadowMesh = function(width, height) {
    const THREE = AFRAME.THREE;
    const geo = new THREE.PlaneGeometry(width * 1.05, height * 1.05);
    const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            shadowOpacity: { value: 0.38 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            precision mediump float;
            varying vec2 vUv;
            uniform float shadowOpacity;
            void main() {
                vec2 d = (vUv - 0.5) * 2.0;
                float dist = length(d);
                float alpha = smoothstep(1.0, 0.2, dist) * shadowOpacity;
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
            }
        `
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    return mesh;
};

// 4. Per-Layer Transform, Keyframe, Lighting & Portal Clipping Controller
AFRAME.registerComponent('nizhali-layer', {
    schema: {
        configJson: { type: 'string', default: '{}' },
        targetIndex: { type: 'number', default: 0 },
        targetAspect: { type: 'number', default: 1.0 },
        masterDuration: { type: 'number', default: 0.0 }
    },
    init: function() {
        const THREE = AFRAME.THREE;
        this.cfg = JSON.parse(decodeURIComponent(this.data.configJson));
        this.startTime = performance.now();
        this.invRefMat = new THREE.Matrix4();
        this.el.sceneEl.renderer.localClippingEnabled = true;
        this.el.object3D.renderOrder = 2 + (this.cfg.p ? Math.round((this.cfg.p[2] + 2) * 10) : 2);

        // Optional Contact Shadow on Z=0 print surface when enabled in Creator (cfg.sh === true)
        if (this.cfg.sh && this.cfg.p && this.cfg.p[2] > 0.02) {
            const targetRoot = document.getElementById(`target-root-${this.data.targetIndex}`);
            if (targetRoot) {
                this.shadowMesh = window.createContactShadowMesh(1, this.data.targetAspect);
                targetRoot.object3D.add(this.shadowMesh);
            }
        }
    },
    evalKf: function(param, baseVal, t) {
        const kfs = this.cfg.kf && this.cfg.kf[param];
        if (!kfs || kfs.length === 0) return baseVal;
        if (kfs.length === 1 || t <= kfs[0].t) return kfs[0].v;
        if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
        for (let i = 0; i < kfs.length - 1; i++) {
            if (t >= kfs[i].t && t <= kfs[i + 1].t) {
                const span = kfs[i + 1].t - kfs[i].t;
                const r = span > 0.0001 ? (t - kfs[i].t) / span : 0;
                const sr = r * r * (3 - 2 * r);
                return kfs[i].v + (kfs[i + 1].v - kfs[i].v) * sr;
            }
        }
        return baseVal;
    },
    tick: function(time) {
        const THREE = AFRAME.THREE;
        const c = this.cfg;
        const rawElapsed = (time - this.startTime) / 1000;
        const dur = this.data.masterDuration;
        const t = dur > 0 ? (rawElapsed % dur) : rawElapsed;

        let px = this.evalKf('posX', c.p[0], t);
        let py = this.evalKf('posY', c.p[1], t);
        let pz = this.evalKf('posZ', c.p[2], t);
        let sx = this.evalKf('scaleX', c.s[0], t);
        let sy = this.evalKf('scaleY', c.s[1], t);
        let sz = this.evalKf('scaleZ', c.s[2], t);
        let rx = this.evalKf('rotX', c.r[0], t);
        let ry = this.evalKf('rotY', c.r[1], t);
        let rz = this.evalKf('rotZ', c.r[2], t);
        let op = this.evalKf('opacity', c.op ?? 1.0, t);
        let spd = this.evalKf('animSpeed', c.as ?? 1.0, t);
        let amp = this.evalKf('animAmp', c.aa ?? 1.0, t);
        let sim = this.evalKf('similarity', c.sim ?? 0.38, t);
        let sm  = this.evalKf('smoothness', c.sm ?? 0.08, t);

        if (c.ap && c.ap !== 'none') {
            const phase = t * spd * 2.2;
            if (c.ap === 'float') pz += Math.sin(phase) * 0.06 * amp;
            else if (c.ap === 'spinY') ry = (ry + t * 60 * spd) % 360;
            else if (c.ap === 'spinZ') rz = (rz + t * 60 * spd) % 360;
            else if (c.ap === 'pulse') {
                const f = 1 + Math.sin(phase * 1.5) * 0.12 * amp;
                sx *= f; sy *= f; sz *= f;
            } else if (c.ap === 'wiggle') {
                rz += Math.sin(phase * 2.5) * 8 * amp;
                rx += Math.cos(phase * 2.0) * 5 * amp;
            } else if (c.ap === 'fadeIn') {
                const d = dur > 0 ? dur : 3.0;
                op *= Math.min(1, (t * spd) / (d * 0.4));
            } else if (c.ap === 'fadeOut') {
                const d = dur > 0 ? dur : 3.0;
                op *= Math.max(0, 1 - (t * spd) / d);
            }
        }

        // Apply Smooth Loss-of-Tracking Fade Multiplier
        const fadeMult = window.NizhaliPlayer.targetFadeMultipliers[this.data.targetIndex] ?? 1.0;
        const effectiveOp = op * fadeMult;

        const obj = this.el.object3D;
        obj.position.set(px, py, pz);
        obj.scale.set(sx, sy, sz);
        obj.rotation.set(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz)
        );

        // Update Contact Shadow position at Z=0 if enabled
        if (this.shadowMesh) {
            this.shadowMesh.position.set(px, py - 0.02, 0.001);
            const distScale = Math.max(0.5, 1.0 - pz * 0.6);
            this.shadowMesh.scale.set(sx * distScale, sy * distScale, 1);
            this.shadowMesh.material.uniforms.shadowOpacity.value = Math.max(0, (0.42 - pz * 0.5) * effectiveOp);
        }

        const cs = c.cs;
        let useLocalClip = false;
        let halfW = 0.5;
        let halfH = this.data.targetAspect / 2;

        if (cs && cs !== 'none') {
            const tIdx = this.data.targetIndex;
            let refEl = document.getElementById(`target-root-${tIdx}`);
            if (cs !== 'target') {
                const maskEl = document.getElementById(`mask-${tIdx}-${cs}`);
                if (maskEl) {
                    refEl = maskEl;
                    halfW = 0.5;
                    halfH = 0.5;
                }
            }
            if (refEl && refEl.object3D) {
                refEl.object3D.updateMatrixWorld(true);
                this.invRefMat.copy(refEl.object3D.matrixWorld).invert();
                useLocalClip = (pz >= -0.01);
            }
        }

        const tint = window.NizhaliPlayer.autoLightEnabled
            ? window.NizhaliPlayer.ambientTint
            : { r: 1.0, g: 1.0, b: 1.0 };

        obj.traverse(child => {
            if (child.isMesh && child.material) {
                if (child.material.uniforms && child.material.uniforms.opacity) {
                    child.material.uniforms.opacity.value = effectiveOp;
                    child.material.uniforms.similarity.value = sim;
                    child.material.uniforms.smoothness.value = sm;
                    child.material.uniforms.ambientTint.value.set(tint.r, tint.g, tint.b);
                    child.material.uniforms.useClip.value = useLocalClip ? 1.0 : 0.0;
                    if (useLocalClip) {
                        child.material.uniforms.invRefMat.value.copy(this.invRefMat);
                        child.material.uniforms.halfBounds.value.set(halfW, halfH);
                    }
                } else {
                    child.material.transparent = true;
                    child.material.opacity = effectiveOp;
                }
            }
        });
    }
});