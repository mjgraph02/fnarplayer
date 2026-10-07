// ============================================================================
// MODULE 03 // 4-PLANE PORTAL CLIPPING, CHROMA SHADER & MEDIA LAYER BUILDER (V7.4)
// ============================================================================

function computeClippingPlanesForSource(clipSourceId) {
    if (!clipSourceId || clipSourceId === 'none') return null;
    const slot = getActiveTargetSlot();
    let refMatrix = targetMesh.matrixWorld;
    let halfW = 0.5;
    let halfH = (slot && slot.targetAspect ? slot.targetAspect : 1.0) / 2;

    if (clipSourceId !== 'target') {
        const maskLayer = layers.find(l => l.id === clipSourceId && l.isMaskPlane);
        if (!maskLayer || !maskLayer.mesh) return null;
        maskLayer.mesh.updateMatrixWorld(true);
        refMatrix = maskLayer.mesh.matrixWorld;
        halfW = 0.5; halfH = 0.5;
    } else {
        targetMesh.updateMatrixWorld(true);
    }

    return [
        new THREE.Plane(new THREE.Vector3( 1,  0, 0), halfW).applyMatrix4(refMatrix),
        new THREE.Plane(new THREE.Vector3(-1,  0, 0), halfW).applyMatrix4(refMatrix),
        new THREE.Plane(new THREE.Vector3( 0,  1, 0), halfH).applyMatrix4(refMatrix),
        new THREE.Plane(new THREE.Vector3( 0, -1, 0), halfH).applyMatrix4(refMatrix)
    ];
}

function updateLayerClippingAndOpacity(layer, effectiveOpacity) {
    if (!layer.mesh || layer.isFolder || layer.isMaskPlane) return;
    const planes = computeClippingPlanesForSource(layer.clipSource);

    layer.mesh.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.clippingPlanes = planes;
            child.material.transparent = true;

            // V7.4: Apply Optical Blend Modes to Studio Viewport Preview
            if (layer.blendMode === 'screen') {
                child.material.blending = THREE.CustomBlending;
                child.material.blendEquation = THREE.AddEquation;
                child.material.blendSrc = THREE.OneFactor;
                child.material.blendDst = THREE.OneMinusSrcColorFactor;
            } else if (layer.blendMode === 'multiply') {
                child.material.blending = THREE.MultiplyBlending;
            } else if (layer.blendMode === 'additive') {
                child.material.blending = THREE.AdditiveBlending;
            } else {
                child.material.blending = THREE.NormalBlending;
            }
            child.material.needsUpdate = true;

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

function createChromaMaterial(texture, hexColor, similarity, smoothness, enabled) {
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
        vertexShader: [
            'varying vec2 vUv;',
            'varying vec3 vWorldPos;',
            'void main() {',
            '  vUv = uv;',
            '  vec4 wp = modelMatrix * vec4(position, 1.0);',
            '  vWorldPos = wp.xyz;',
            '  gl_Position = projectionMatrix * viewMatrix * wp;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform sampler2D src;',
            'uniform vec3 color;',
            'uniform float similarity;',
            'uniform float smoothness;',
            'uniform float enableChroma;',
            'uniform float opacity;',
            'uniform float useClip;',
            'uniform vec4 clipP0, clipP1, clipP2, clipP3;',
            'varying vec2 vUv;',
            'varying vec3 vWorldPos;',
            'void main() {',
            '  if (useClip > 0.5) {',
            '    if (dot(vWorldPos, clipP0.xyz) + clipP0.w < 0.0) discard;',
            '    if (dot(vWorldPos, clipP1.xyz) + clipP1.w < 0.0) discard;',
            '    if (dot(vWorldPos, clipP2.xyz) + clipP2.w < 0.0) discard;',
            '    if (dot(vWorldPos, clipP3.xyz) + clipP3.w < 0.0) discard;',
            '  }',
            '  vec4 texColor = texture2D(src, vUv);',
            '  if (enableChroma > 0.5) {',
            '    float Y1 = 0.2989 * texColor.r + 0.5866 * texColor.g + 0.1145 * texColor.b;',
            '    float Y2 = 0.2989 * color.r + 0.5866 * color.g + 0.1145 * color.b;',
            '    float d = distance(vec2(texColor.r - Y1, texColor.b - Y1), vec2(color.r - Y2, color.b - Y2));',
            '    float b = smoothstep(similarity, similarity + max(smoothness, 0.001), d);',
            '    if (b * opacity < 0.01) discard;',
            '    gl_FragColor = vec4(texColor.rgb * b, texColor.a * b * opacity);',
            '  } else {',
            '    if (texColor.a * opacity < 0.01) discard;',
            '    gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);',
            '  }',
            '}'
        ].join('\n')
    });
}

function createPlaceholderTexture(label, isMask = false) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = isMask ? 'rgba(0, 210, 255, 0.18)' : 'rgba(24, 24, 22, 0.9)';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = isMask ? '#00d2ff' : '#ff4f00';
    ctx.lineWidth = 10;
    if (isMask) ctx.setLineDash([18, 10]);
    ctx.strokeRect(5, 5, 502, 502);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 256, 240);
    ctx.fillStyle = isMask ? '#00d2ff' : '#ffb800';
    ctx.font = '15px monospace';
    ctx.fillText(isMask ? 'INVISIBLE PORTAL CLIP WINDOW' : 'PASTE MEDIA LINK IN MOD-04', 256, 280);
    return new THREE.CanvasTexture(c);
}

function createLayerObject(cfg) {
    const layer = {
        id: cfg.id,
        name: cfg.name,
        isFolder: !!cfg.isFolder,
        isMaskPlane: !!cfg.isMaskPlane,
        showMaskGuide: cfg.showMaskGuide !== undefined ? cfg.showMaskGuide : true,
        parentId: cfg.parentId || null,
        faceAnchorId: cfg.faceAnchorId || '168',
        type: cfg.type || (cfg.isMaskPlane ? 'mask' : 'video'),
        url: cfg.url || '',
        localBlobUrl: cfg.localBlobUrl || '',
        pos: cfg.pos ? [...cfg.pos] : [0, 0, 0],
        scale: cfg.scale ? [...cfg.scale] : [1, 1, 1],
        rot: cfg.rot ? [...cfg.rot] : [0, 0, 0],
        opacity: cfg.opacity !== undefined ? cfg.opacity : 1.0,
        clipSource: cfg.clipSource || 'none',
        chromaEnabled: !!cfg.chromaEnabled,
        color: cfg.color || '#00ff00',
        similarity: cfg.similarity ?? 0.38,
        smoothness: cfg.smoothness ?? 0.08,
        animPreset: cfg.animPreset || 'none',
        animSpeed: cfg.animSpeed ?? 1.0,
        animAmp: cfg.animAmp ?? 1.0,
        keyframes: cfg.keyframes ? JSON.parse(JSON.stringify(cfg.keyframes)) : {},
        
        // V7.4 NEW PROPERTIES
        playbackRule: cfg.playbackRule || 'loop',
        delay: cfg.delay || 0,
        blendMode: cfg.blendMode || 'normal',

        mesh: null,
        videoEl: null,
        mixer: null,
        clips: [],
        activeAction: null,
        duration: 0
    };

    if (layer.isFolder) {
        const grp = new THREE.Group();
        grp.userData.layerId = layer.id;
        layer.mesh = grp;
    } else if (layer.isMaskPlane) {
        const tex = createPlaceholderTexture(layer.name, true);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        layer.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        layer.mesh.userData.layerId = layer.id;
        layer.mesh.visible = layer.showMaskGuide;
    } else {
        const tex = createPlaceholderTexture(layer.name, false);
        const mat = createChromaMaterial(tex, layer.color, layer.similarity, layer.smoothness, false);
        layer.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        layer.mesh.userData.layerId = layer.id;
    }

    layer.mesh.position.set(...layer.pos);
    layer.mesh.scale.set(...layer.scale);
    layer.mesh.rotation.set(
        THREE.MathUtils.degToRad(layer.rot[0]),
        THREE.MathUtils.degToRad(layer.rot[1]),
        THREE.MathUtils.degToRad(layer.rot[2])
    );

    scene.add(layer.mesh);
    return layer;
}

window.addMediaLayer = function() {
    const slot = getActiveTargetSlot();
    const id = 'layer_' + Date.now();
    const count = layers.filter(l => !l.isFolder && !l.isMaskPlane).length + 1;
    const defaultPos = (slot && slot.mode === 'face') ? [...FACE_ANCHOR_COORDS['168']] : [0, 0, 0];

    const layer = createLayerObject({
        id,
        name: `LAYER_${count}`,
        type: 'video',
        pos: defaultPos,
        scale: [1, 1, 1],
        rot: [0, 0, 0],
        playbackRule: 'loop',
        delay: 0,
        blendMode: 'normal'
    });
    layers.push(layer);
    if (window.selectSingleLayer) selectSingleLayer(id);
    if (window.updateMasterDuration) updateMasterDuration();
    if (window.saveHistoryState) saveHistoryState();
    showToast(`➕ Added ${layer.name} at (${defaultPos.join(', ')})`);
};

window.addClipMaskPlane = function() {
    const id = 'mask_' + Date.now();
    const count = layers.filter(l => l.isMaskPlane).length + 1;
    const maskLayer = createLayerObject({
        id,
        name: `MASK_PLANE_${count}`,
        isMaskPlane: true,
        type: 'mask',
        pos: [0, 0, 0],
        scale: [1, 1, 1],
        rot: [0, 0, 0]
    });
    layers.push(maskLayer);
    if (window.selectSingleLayer) selectSingleLayer(id);
    if (window.saveHistoryState) saveHistoryState();
    showToast(`✂️ Added ${maskLayer.name}`);
};

window.syncMaskPlaneGuide = function() {
    const layer = getPrimarySelectedItem();
    if (!layer || !layer.isMaskPlane) return;
    layer.showMaskGuide = document.getElementById('maskGuideToggle').checked;
    if (layer.mesh) layer.mesh.visible = layer.showMaskGuide;
};

function detectMediaType(str) {
    const s = str.split('?')[0].toLowerCase();
    if (s.endsWith('.glb') || s.endsWith('.gltf')) return 'glb';
    if (s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.webp')) return 'image';
    return 'video';
}

function applyMediaToLayer(layer, mediaSourceUrl, fileHint = '', silent = false) {
    if (!mediaSourceUrl || layer.isFolder || layer.isMaskPlane) return;
    layer.type = detectMediaType(fileHint || layer.url || mediaSourceUrl);
    const parentContainer = (layer.parentId && layers.find(l => l.id === layer.parentId)?.mesh) || scene;

    if (layer.videoEl) { layer.videoEl.pause(); layer.videoEl.remove(); layer.videoEl = null; }
    if (layer.mixer) { layer.mixer.stopAllAction(); layer.mixer = null; layer.clips = []; }

    if (layer.type === 'video') {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = mediaSourceUrl;
        vid.loop = true; vid.muted = true; vid.playsInline = true;
        layer.videoEl = vid;
        if (masterPlaying) vid.play().catch(() => {});

        const vidTex = new THREE.VideoTexture(vid);
        vidTex.minFilter = THREE.LinearFilter;
        vidTex.magFilter = THREE.LinearFilter;

        if (layer.mesh.isGroup) {
            transformControl.detach();
            parentContainer.remove(layer.mesh);
            layer.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
            layer.mesh.userData.layerId = layer.id;
            parentContainer.add(layer.mesh);
        }

        vid.addEventListener('loadedmetadata', () => {
            layer.duration = vid.duration || 0;
            if (vid.videoWidth && vid.videoHeight) {
                layer.mesh.geometry.dispose();
                layer.mesh.geometry = new THREE.PlaneGeometry(1, vid.videoHeight / vid.videoWidth);
            }
            if (window.updateMasterDuration) updateMasterDuration();
            if (window.refreshInspectorUI) refreshInspectorUI();
            if (!silent) showToast('🎬 Video Stream Locked');
        });

        layer.mesh.material = createChromaMaterial(vidTex, layer.color, layer.similarity, layer.smoothness, layer.chromaEnabled);

    } else if (layer.type === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const tex = new THREE.Texture(img);
            tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            const aspect = img.height / img.width;

            if (layer.mesh.isGroup) {
                transformControl.detach();
                parentContainer.remove(layer.mesh);
                layer.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, aspect), new THREE.MeshBasicMaterial());
                layer.mesh.userData.layerId = layer.id;
                parentContainer.add(layer.mesh);
            } else {
                layer.mesh.geometry.dispose();
                layer.mesh.geometry = new THREE.PlaneGeometry(1, aspect);
            }
            layer.mesh.material = createChromaMaterial(tex, layer.color, layer.similarity, layer.smoothness, layer.chromaEnabled);
            layer.duration = 0;
            if (window.updateMasterDuration) updateMasterDuration();
            if (window.refreshInspectorUI) refreshInspectorUI();
            if (!silent) showToast('🖼️ Image Texture Loaded');
        };
        img.src = mediaSourceUrl;

    } else if (layer.type === 'glb') {
        const loader = new THREE.GLTFLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(mediaSourceUrl, (gltf) => {
            transformControl.detach();
            parentContainer.remove(layer.mesh);

            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const normScale = 0.5 / (Math.max(size.x, size.y, size.z) || 1);
            model.scale.set(normScale, normScale, normScale);

            const wrapper = new THREE.Group();
            wrapper.add(model);
            wrapper.userData.layerId = layer.id;
            wrapper.position.set(...layer.pos);
            wrapper.scale.set(...layer.scale);
            wrapper.rotation.set(
                THREE.MathUtils.degToRad(layer.rot[0]),
                THREE.MathUtils.degToRad(layer.rot[1]),
                THREE.MathUtils.degToRad(layer.rot[2])
            );

            layer.mesh = wrapper;
            parentContainer.add(wrapper);

            if (gltf.animations && gltf.animations.length > 0) {
                layer.mixer = new THREE.AnimationMixer(model);
                layer.clips = gltf.animations;
                layer.activeAction = layer.mixer.clipAction(gltf.animations[0]);
                layer.activeAction.play();
                layer.duration = gltf.animations[0].duration || 0;
            } else {
                layer.duration = 0;
            }

            if (window.updateMasterDuration) updateMasterDuration();
            if (selectedIds.includes(layer.id)) transformControl.attach(wrapper);
            if (window.refreshInspectorUI) refreshInspectorUI();
            if (!silent) showToast('🧊 3D .glb Mesh Loaded');
        });
    }
}

window.changeGlbClip = function() {
    const layer = getPrimarySelectedItem();
    if (!layer || !layer.mixer || !layer.clips.length) return;
    const idx = parseInt(document.getElementById('glbClipSelect').value, 10) || 0;
    const clip = layer.clips[idx];
    if (!clip) return;
    layer.mixer.stopAllAction();
    layer.activeAction = layer.mixer.clipAction(clip);
    layer.activeAction.play();
    layer.duration = clip.duration || 0;
    if (window.updateMasterDuration) updateMasterDuration();
};
