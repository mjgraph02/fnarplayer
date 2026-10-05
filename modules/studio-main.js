// ============================================================================
// MODULE 06 // STUDIO MOTHERBOARD: LAYERS, INSPECTOR, HIERARCHY & RENDER LOOP
// ============================================================================

import {
    StudioState, getPrimarySelectedItem, showToast,
    scene, camera, renderer, transformControl,
    updateCameraAnimation, setGizmoMode, setCameraPreset, focusSelectedLayer,
    saveHistoryState, undo, redo, initViewportEvents
} from './core-viewport.js';

import {
    createChromaMaterial, updateLayerClippingAndOpacity
} from './portal-clipping.js';

import {
    updateMasterDuration, setParamBaseValue,
    toggleParamKeyframe, addKeyframeForGroup, toggleAutoKey,
    refreshKeyframeDiamonds, toggleMasterPlay, scrubMasterTimeline, evaluateSceneAtTime
} from './timeline-keyframes.js';

import {
    setTrackingMode, applyTargetImageSource, loadTargetFromUrl,
    compileMindInBrowser, loadToyReferenceFile, loadToyReferenceUrl,
    scanToyPointCloud, updateFaceAnchorGuide
} from './tracker-3d-epnp.js';

import {
    cleanDropbox, exportProject
} from './dropbox-crypto.js';

// Create Placeholder Canvas Texture for New Layers / Mask Planes
function createPlaceholderTexture(label, isMask = false) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = isMask ? 'rgba(0, 229, 255, 0.18)' : 'rgba(28, 28, 26, 0.9)';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = isMask ? '#00e5ff' : '#ff4f00';
    ctx.lineWidth = 10;
    if (isMask) ctx.setLineDash([20, 12]);
    ctx.strokeRect(5, 5, 502, 502);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 256, 240);
    ctx.fillStyle = isMask ? '#00e5ff' : '#ffb800';
    ctx.font = '15px monospace';
    ctx.fillText(isMask ? 'Invisible Clip Window on AR Output' : 'Paste .mp4 / .png / .glb Link →', 256, 280);
    return new THREE.CanvasTexture(c);
}

export function createLayerObject(cfg) {
    const layer = {
        id: cfg.id,
        name: cfg.name,
        isFolder: !!cfg.isFolder,
        isMaskPlane: !!cfg.isMaskPlane,
        showMaskGuide: cfg.showMaskGuide !== undefined ? cfg.showMaskGuide : true,
        parentId: cfg.parentId || null,
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
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        layer.mesh = new THREE.Mesh(geo, mat);
        layer.mesh.userData.layerId = layer.id;
        layer.mesh.visible = layer.showMaskGuide;
    } else {
        const tex = createPlaceholderTexture(layer.name, false);
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = createChromaMaterial(tex, layer.color, layer.similarity, layer.smoothness, false);
        layer.mesh = new THREE.Mesh(geo, mat);
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

function addMediaLayer() {
    const id = 'layer_' + Date.now();
    const count = StudioState.layers.filter(l => !l.isFolder && !l.isMaskPlane).length + 1;
    const layer = createLayerObject({
        id,
        name: `Layer ${count}`,
        type: 'video',
        pos: [0, 0, 0], scale: [1, 1, 1], rot: [0, 0, 0]
    });
    StudioState.layers.push(layer);
    selectSingleLayer(id);
    updateMasterDuration();
    saveHistoryState();
    showToast(`➕ Added "${layer.name}" at (0, 0, 0)`);
}

function addClipMaskPlane() {
    const id = 'mask_' + Date.now();
    const count = StudioState.layers.filter(l => l.isMaskPlane).length + 1;
    const maskLayer = createLayerObject({
        id,
        name: `✂️ Clip Mask Plane ${count}`,
        isMaskPlane: true,
        type: 'mask',
        pos: [0, 0, 0], scale: [1, 1, 1], rot: [0, 0, 0]
    });
    StudioState.layers.push(maskLayer);
    selectSingleLayer(id);
    saveHistoryState();
    showToast(`✂️ Added "${maskLayer.name}" — Assign any layer to clip inside it!`);
}

function syncMaskPlaneGuide() {
    const layer = getPrimarySelectedItem();
    if (!layer || !layer.isMaskPlane) return;
    layer.showMaskGuide = document.getElementById('maskGuideToggle').checked;
    if (layer.mesh) layer.mesh.visible = layer.showMaskGuide;
}

function detectMediaType(urlOrFilename) {
    const clean = urlOrFilename.split('?')[0].toLowerCase();
    if (clean.endsWith('.glb') || clean.endsWith('.gltf')) return 'glb';
    if (clean.endsWith('.png') || clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.webp')) return 'image';
    return 'video';
}

function applyMediaToLayer(layer, mediaSourceUrl, fileHint = '', silent = false) {
    if (!mediaSourceUrl || layer.isFolder || layer.isMaskPlane) return;
    layer.type = detectMediaType(fileHint || layer.url || mediaSourceUrl);

    const parentContainer = (layer.parentId && StudioState.layers.find(l => l.id === layer.parentId)?.mesh) || scene;

    if (layer.videoEl) { layer.videoEl.pause(); layer.videoEl.remove(); layer.videoEl = null; }
    if (layer.mixer) { layer.mixer.stopAllAction(); layer.mixer = null; layer.clips = []; }

    if (layer.type === 'video') {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = mediaSourceUrl;
        vid.loop = true;
        vid.muted = true;
        vid.playsInline = true;
        layer.videoEl = vid;
        if (StudioState.masterPlaying) vid.play().catch(() => {});

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
                const aspect = vid.videoHeight / vid.videoWidth;
                layer.mesh.geometry.dispose();
                layer.mesh.geometry = new THREE.PlaneGeometry(1, aspect);
            }
            updateMasterDuration();
            refreshInspectorUI();
            if (!silent) showToast('🎬 Video loaded & synced to Master Timeline!');
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
            updateMasterDuration();
            refreshInspectorUI();
            if (!silent) showToast('🖼️ Image loaded!');
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
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const normScale = 0.5 / maxDim;
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

            updateMasterDuration();
            if (StudioState.selectedIds.includes(layer.id)) transformControl.attach(wrapper);
            refreshInspectorUI();
            if (!silent) showToast('🧊 3D .glb Model loaded!');
        });
    }
}

function groupSelectedLayers() {
    const validTargets = StudioState.selectedIds
        .map(id => StudioState.layers.find(l => l.id === id))
        .filter(l => l && !l.isFolder);

    if (validTargets.length < 1) {
        alert('Ctrl+Click or Shift+Click layers in the Hierarchy to group them!');
        return;
    }

    const folderId = 'folder_' + Date.now();
    const count = StudioState.layers.filter(l => l.isFolder).length + 1;
    const folderObj = createLayerObject({
        id: folderId,
        name: `📁 Folder Group ${count}`,
        isFolder: true,
        type: 'folder',
        pos: [0, 0, 0], scale: [1, 1, 1], rot: [0, 0, 0]
    });

    validTargets.forEach(child => {
        child.parentId = folderId;
        if (child.mesh) {
            folderObj.mesh.attach(child.mesh);
            child.pos = [
                parseFloat(child.mesh.position.x.toFixed(3)),
                parseFloat(child.mesh.position.y.toFixed(3)),
                parseFloat(child.mesh.position.z.toFixed(3))
            ];
        }
    });

    StudioState.layers.push(folderObj);
    selectSingleLayer(folderId);
    saveHistoryState();
    showToast(`📁 Grouped into "${folderObj.name}"`);
}

function ungroupSelectedFolder() {
    const item = getPrimarySelectedItem();
    if (!item) return;
    const folder = item.isFolder ? item : StudioState.layers.find(l => l.id === item.parentId);
    if (!folder || !folder.isFolder) return;

    const children = StudioState.layers.filter(l => l.parentId === folder.id);
    children.forEach(ch => {
        ch.parentId = null;
        if (ch.mesh) {
            scene.attach(ch.mesh);
            ch.pos = [
                parseFloat(ch.mesh.position.x.toFixed(3)),
                parseFloat(ch.mesh.position.y.toFixed(3)),
                parseFloat(ch.mesh.position.z.toFixed(3))
            ];
        }
    });

    transformControl.detach();
    scene.remove(folder.mesh);
    StudioState.layers = StudioState.layers.filter(l => l.id !== folder.id);
    StudioState.selectedIds = children.map(c => c.id);
    updateSelectionState();
    saveHistoryState();
}

function selectSingleLayer(id) {
    StudioState.selectedIds = id ? [id] : [];
    StudioState.lastClickedId = id;
    updateSelectionState();
}

function handleLayerClick(id, event) {
    if (event && (event.ctrlKey || event.metaKey)) {
        if (StudioState.selectedIds.includes(id)) StudioState.selectedIds = StudioState.selectedIds.filter(x => x !== id);
        else StudioState.selectedIds.push(id);
        StudioState.lastClickedId = id;
    } else if (event && event.shiftKey && StudioState.lastClickedId) {
        const allIds = StudioState.layers.map(l => l.id);
        const s = allIds.indexOf(StudioState.lastClickedId);
        const e = allIds.indexOf(id);
        if (s !== -1 && e !== -1) {
            const [low, high] = s < e ? [s, e] : [e, s];
            StudioState.selectedIds = allIds.slice(low, high + 1);
        }
    } else {
        StudioState.selectedIds = [id];
        StudioState.lastClickedId = id;
    }
    updateSelectionState();
}

function updateSelectionState() {
    renderLayerList();
    const primary = getPrimarySelectedItem();

    if (!primary) {
        transformControl.detach();
        document.getElementById('inspectorEmpty').style.display = 'block';
        document.getElementById('inspectorControls').style.display = 'none';
        document.getElementById('inspectorFocusBtn').style.display = 'none';
        return;
    }

    document.getElementById('inspectorEmpty').style.display = 'none';
    document.getElementById('inspectorControls').style.display = 'block';
    document.getElementById('inspectorFocusBtn').style.display = 'inline-block';
    document.getElementById('inpLocalFile').value = '';

    if (primary.mesh) transformControl.attach(primary.mesh);
    refreshInspectorUI();
    refreshKeyframeDiamonds();
}

function populateInspectorNumbers(layer) {
    document.getElementById('posX').value = layer.pos[0];
    document.getElementById('posY').value = layer.pos[1];
    document.getElementById('posZ').value = layer.pos[2];
    document.getElementById('scaleX').value = layer.scale[0];
    document.getElementById('scaleY').value = layer.scale[1];
    document.getElementById('scaleZ').value = layer.scale[2];
    document.getElementById('rotX').value = layer.rot[0];
    document.getElementById('rotY').value = layer.rot[1];
    document.getElementById('rotZ').value = layer.rot[2];
}

function refreshInspectorUI() {
    const layer = getPrimarySelectedItem();
    if (!layer) return;

    document.getElementById('inpName').value = layer.name;
    document.getElementById('maskPlaneCard').style.display = layer.isMaskPlane ? 'block' : 'none';
    if (layer.isMaskPlane) {
        document.getElementById('maskGuideToggle').checked = layer.showMaskGuide;
    }

    const isRegularMedia = (!layer.isFolder && !layer.isMaskPlane);
    document.getElementById('mediaSourceCard').style.display = isRegularMedia ? 'block' : 'none';
    document.getElementById('appearanceCard').style.display = isRegularMedia ? 'block' : 'none';
    document.getElementById('effectsCard').style.display = isRegularMedia ? 'block' : 'none';

    if (isRegularMedia) {
        document.getElementById('inpUrl').value = layer.url;
        document.getElementById('inpOpacity').value = layer.opacity ?? 1.0;
        document.getElementById('opacityVal').textContent = (layer.opacity ?? 1.0).toFixed(2);

        const clipSel = document.getElementById('clipSourceSelect');
        const maskPlanes = StudioState.layers.filter(m => m.isMaskPlane);
        let optsHtml = `
            <option value="none">None (Bleed Freely Outside Frame)</option>
            <option value="target">🕳️ Target Image Bounds (Portal Window)</option>
        `;
        maskPlanes.forEach(mp => {
            optsHtml += `<option value="${mp.id}">✂️ ${mp.name}</option>`;
        });
        clipSel.innerHTML = optsHtml;
        clipSel.value = layer.clipSource || 'none';

        document.getElementById('animPreset').value = layer.animPreset || 'none';
        document.getElementById('animParamsBox').style.display = (layer.animPreset && layer.animPreset !== 'none') ? 'block' : 'none';
        document.getElementById('animSpeed').value = layer.animSpeed ?? 1.0;
        document.getElementById('animAmp').value = layer.animAmp ?? 1.0;
        document.getElementById('animSpeedVal').textContent = layer.animSpeed ?? 1.0;
        document.getElementById('animAmpVal').textContent = layer.animAmp ?? 1.0;

        const chromaSec = document.getElementById('chromaEffectSection');
        chromaSec.style.display = (layer.type === 'video' || layer.type === 'image') ? 'block' : 'none';
        document.getElementById('chromaToggle').checked = !!layer.chromaEnabled;
        document.getElementById('chromaParamsBox').style.display = layer.chromaEnabled ? 'block' : 'none';
        document.getElementById('chromaColor').value = layer.color || '#00ff00';
        document.getElementById('chromaSim').value = layer.similarity ?? 0.38;
        document.getElementById('chromaSmooth').value = layer.smoothness ?? 0.08;
    }

    populateInspectorNumbers(layer);
}

function syncUIFromInspector() {
    const layer = getPrimarySelectedItem();
    if (!layer) return;
    layer.name = document.getElementById('inpName').value;
    renderLayerList();
}

function applyTransformAndEffectsImmediate(layer) {
    if (!layer || !layer.mesh) return;
    layer.mesh.position.set(...layer.pos);
    layer.mesh.scale.set(...layer.scale);
    layer.mesh.rotation.set(
        THREE.MathUtils.degToRad(layer.rot[0]),
        THREE.MathUtils.degToRad(layer.rot[1]),
        THREE.MathUtils.degToRad(layer.rot[2])
    );
    updateLayerClippingAndOpacity(layer, layer.opacity ?? 1.0);
}

function onParamEdit(param) {
    const layer = getPrimarySelectedItem();
    if (!layer) return;

    const inputMap = {
        posX: 'posX', posY: 'posY', posZ: 'posZ',
        scaleX: 'scaleX', scaleY: 'scaleY', scaleZ: 'scaleZ',
        rotX: 'rotX', rotY: 'rotY', rotZ: 'rotZ',
        opacity: 'inpOpacity', animSpeed: 'animSpeed', animAmp: 'animAmp',
        similarity: 'chromaSim', smoothness: 'chromaSmooth'
    };
    const el = document.getElementById(inputMap[param]);
    if (!el) return;
    const val = parseFloat(el.value) || 0;
    setParamBaseValue(layer, param, val);

    if (param === 'opacity') document.getElementById('opacityVal').textContent = val.toFixed(2);
    if (param === 'animSpeed') document.getElementById('animSpeedVal').textContent = val;
    if (param === 'animAmp') document.getElementById('animAmpVal').textContent = val;
    if (param === 'similarity') document.getElementById('simVal').textContent = val;
    if (param === 'smoothness') document.getElementById('smoothVal').textContent = val;

    if (StudioState.autoKeyEnabled || (layer.keyframes && layer.keyframes[param] && layer.keyframes[param].length > 0)) {
        toggleParamKeyframe(param);
    }

    applyTransformAndEffectsImmediate(layer);
    renderLayerList();
}

function syncEffectsFromInputs() {
    const layer = getPrimarySelectedItem();
    if (!layer || layer.isFolder || layer.isMaskPlane) return;

    layer.clipSource = document.getElementById('clipSourceSelect').value;
    layer.animPreset = document.getElementById('animPreset').value;
    document.getElementById('animParamsBox').style.display = (layer.animPreset !== 'none') ? 'block' : 'none';

    layer.chromaEnabled = document.getElementById('chromaToggle').checked;
    document.getElementById('chromaParamsBox').style.display = layer.chromaEnabled ? 'block' : 'none';
    layer.color = document.getElementById('chromaColor').value;

    if (layer.mesh && layer.mesh.material && layer.mesh.material.uniforms) {
        layer.mesh.material.uniforms.enableChroma.value = layer.chromaEnabled ? 1.0 : 0.0;
        layer.mesh.material.uniforms.color.value.set(layer.color);
    }
    updateLayerClippingAndOpacity(layer, layer.opacity ?? 1.0);
    renderLayerList();
}

function handleLocalFile(e) {
    const file = e.target.files[0];
    const layer = getPrimarySelectedItem();
    if (!file || !layer) return;
    layer.localBlobUrl = URL.createObjectURL(file);
    applyMediaToLayer(layer, layer.localBlobUrl, file.name);
    saveHistoryState();
}

let urlFetchTimer = null;
function handleDropboxUrl() {
    const layer = getPrimarySelectedItem();
    if (!layer) return;
    layer.url = document.getElementById('inpUrl').value.trim();
    clearTimeout(urlFetchTimer);
    if (layer.url) {
        urlFetchTimer = setTimeout(() => {
            applyMediaToLayer(layer, cleanDropbox(layer.url), layer.url);
            saveHistoryState();
        }, 400);
    }
}

function deleteSelectedLayers() {
    if (StudioState.selectedIds.length === 0) return;
    transformControl.detach();

    StudioState.selectedIds.forEach(id => {
        const layer = StudioState.layers.find(l => l.id === id);
        if (!layer) return;
        if (layer.isFolder) {
            StudioState.layers.filter(c => c.parentId === layer.id).forEach(ch => {
                ch.parentId = null;
                if (ch.mesh) scene.attach(ch.mesh);
            });
        }
        if (layer.mesh && layer.mesh.parent) layer.mesh.parent.remove(layer.mesh);
        if (layer.videoEl) { layer.videoEl.pause(); layer.videoEl.remove(); }
    });

    StudioState.layers = StudioState.layers.filter(l => !StudioState.selectedIds.includes(l.id));
    StudioState.selectedIds = StudioState.layers.length ? [StudioState.layers[StudioState.layers.length - 1].id] : [];
    updateMasterDuration();
    updateSelectionState();
    saveHistoryState();
}

function renderLayerList() {
    const list = document.getElementById('layerList');
    if (StudioState.layers.length === 0) {
        list.innerHTML = '<div style="color:#666; font-size:11px; padding:6px 0;">No layers added yet.</div>';
        return;
    }
    list.innerHTML = '';
    StudioState.layers.filter(l => !l.parentId).forEach(item => {
        appendHierarchyRow(list, item, false);
        if (item.isFolder) {
            StudioState.layers.filter(ch => ch.parentId === item.id).forEach(child => appendHierarchyRow(list, child, true));
        }
    });
}

function appendHierarchyRow(containerEl, l, isChild) {
    const item = document.createElement('div');
    const isPrimary = (StudioState.selectedIds[StudioState.selectedIds.length - 1] === l.id);
    const isMulti = StudioState.selectedIds.includes(l.id);
    item.className = 'layer-item' + (isPrimary ? ' active' : (isMulti ? ' multi-selected' : '')) + (isChild ? ' child-layer' : '');

    const icon = l.isFolder ? '' : (l.isMaskPlane ? '' : (l.type === 'glb' ? '🧊 ' : (l.type === 'image' ? '🖼️ ' : '🎬 ')));
    const titleSpan = document.createElement('span');
    titleSpan.textContent = icon + l.name;
    titleSpan.style.flex = '1';

    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';

    const zBadge = document.createElement('small');
    const isClipped = (l.clipSource && l.clipSource !== 'none');
    zBadge.style.color = isClipped ? '#00e5ff' : '#ffb800';
    zBadge.textContent = `${isClipped ? '✂ ' : ''}Z:${l.pos[2]}`;

    const findBtn = document.createElement('button');
    findBtn.className = 'layer-focus-btn';
    findBtn.textContent = '🎯';
    findBtn.onclick = (e) => {
        e.stopPropagation();
        selectSingleLayer(l.id);
        focusSelectedLayer();
    };

    rightGroup.appendChild(zBadge);
    rightGroup.appendChild(findBtn);
    item.appendChild(titleSpan);
    item.appendChild(rightGroup);
    item.onclick = (e) => handleLayerClick(l.id, e);
    containerEl.appendChild(item);
}

function restoreFromSnapshot(jsonSnap) {
    StudioState.isRestoringHistory = true;
    const state = JSON.parse(jsonSnap);
    transformControl.detach();

    StudioState.layers.forEach(l => {
        if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
        if (l.videoEl) { layer.videoEl?.pause(); l.videoEl.remove(); }
    });
    StudioState.layers = [];

    state.layers.filter(s => s.isFolder).forEach(s => StudioState.layers.push(createLayerObject(s)));
    state.layers.filter(s => !s.isFolder).forEach(s => {
        const l = createLayerObject(s);
        if (l.parentId) {
            const parentFolder = StudioState.layers.find(f => f.id === l.parentId);
            if (parentFolder && parentFolder.mesh) parentFolder.mesh.add(l.mesh);
        }
        const src = l.localBlobUrl || cleanDropbox(l.url);
        if (src && !l.isMaskPlane) applyMediaToLayer(l, src, l.url, true);
        StudioState.layers.push(l);
    });

    StudioState.selectedIds = state.selectedIds || [];
    updateMasterDuration();
    updateSelectionState();
    document.getElementById('btn-undo').disabled = (StudioState.historyIndex <= 0);
    document.getElementById('btn-redo').disabled = (StudioState.historyIndex >= StudioState.historyStack.length - 1);
    StudioState.isRestoringHistory = false;
}

// Wire Module Callbacks & Expose Global Handlers for HTML Buttons
StudioState.onLayerMoved = (activeItem) => {
    populateInspectorNumbers(activeItem);
    renderLayerList();
};
StudioState.onAutoKeyTransform = () => addKeyframeForGroup('transform');
StudioState.onRestoreSnapshot = restoreFromSnapshot;

Object.assign(window, {
    setTrackingMode, loadTargetFromUrl, compileMindInBrowser,
    loadToyReferenceFile, loadToyReferenceUrl, scanToyPointCloud, updateFaceAnchorGuide,
    addMediaLayer, addClipMaskPlane, groupSelectedLayers, ungroupSelectedFolder,
    undo, redo, setGizmoMode, focusSelectedLayer, setCameraPreset,
    syncUIFromInspector, saveHistoryState, syncMaskPlaneGuide,
    handleDropboxUrl, handleLocalFile, addKeyframeForGroup, toggleParamKeyframe,
    onParamEdit, syncEffectsFromInputs, updateMasterDuration, deleteSelectedLayers,
    exportProject: () => exportProject(selectSingleLayer),
    toggleMasterPlay, scrubMasterTimeline, toggleAutoKey
});

document.getElementById('targetImgInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) applyTargetImageSource(URL.createObjectURL(file));
});

// Master Render Loop
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (StudioState.masterPlaying && StudioState.masterDuration > 0) {
        StudioState.masterTime = (StudioState.masterTime + delta) % StudioState.masterDuration;
        const scrubber = document.getElementById('masterTimelineScrubber');
        if (document.activeElement !== scrubber) {
            scrubber.value = StudioState.masterTime;
        }
    }

    StudioState.layers.forEach(l => {
        if (l.mixer && StudioState.masterPlaying) l.mixer.update(delta);
    });

    evaluateSceneAtTime(StudioState.masterTime, false);

    const disp = document.getElementById('masterTimeDisplay');
    if (StudioState.masterDuration > 0) {
        disp.textContent = `${StudioState.masterTime.toFixed(2)}s / ${StudioState.masterDuration.toFixed(2)}s`;
    } else {
        disp.textContent = `0.00s / 0.00s (Static)`;
    }

    updateCameraAnimation();
    renderer.render(scene, camera);
}

initViewportEvents(handleLayerClick, groupSelectedLayers);
animate();
saveHistoryState();
