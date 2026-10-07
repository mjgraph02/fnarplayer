// ============================================================================
// MODULE 06 // HIERARCHY, INSPECTOR UI SYNC, SHORTCUTS & STUDIO BOOT (V7.4)
// ============================================================================

window.groupSelectedLayers = function() {
    const valid = selectedIds.map(id => layers.find(l => l.id === id)).filter(l => l && !l.isFolder);
    if (valid.length < 1) return alert('Select 1 or more layers to group!');

    const fId = 'folder_' + Date.now();
    const count = layers.filter(l => l.isFolder).length + 1;
    const fObj = createLayerObject({ id: fId, name: `FOLDER_${count}`, isFolder: true, type: 'folder' });

    valid.forEach(ch => {
        ch.parentId = fId;
        if (ch.mesh) {
            fObj.mesh.attach(ch.mesh);
            ch.pos = [
                parseFloat(ch.mesh.position.x.toFixed(3)),
                parseFloat(ch.mesh.position.y.toFixed(3)),
                parseFloat(ch.mesh.position.z.toFixed(3))
            ];
        }
    });
    layers.push(fObj);
    selectSingleLayer(fId);
    if (window.saveHistoryState) saveHistoryState();
};

window.ungroupSelectedFolder = function() {
    const item = getPrimarySelectedItem();
    if (!item) return;
    const folder = item.isFolder ? item : layers.find(l => l.id === item.parentId);
    if (!folder || !folder.isFolder) return;

    const children = layers.filter(l => l.parentId === folder.id);
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
    const slot = getActiveTargetSlot();
    slot.layers = layers.filter(l => l.id !== folder.id);
    layers = slot.layers;
    selectedIds = children.map(c => c.id);
    updateSelectionState();
    if (window.saveHistoryState) saveHistoryState();
};

window.selectSingleLayer = function(id) {
    selectedIds = id ? [id] : [];
    lastClickedId = id;
    updateSelectionState();
};

window.handleLayerClick = function(id, ev) {
    if (ev && (ev.ctrlKey || ev.metaKey)) {
        if (selectedIds.includes(id)) selectedIds = selectedIds.filter(x => x !== id);
        else selectedIds.push(id);
        lastClickedId = id;
    } else if (ev && ev.shiftKey && lastClickedId) {
        const all = layers.map(l => l.id);
        const s = all.indexOf(lastClickedId), e = all.indexOf(id);
        if (s !== -1 && e !== -1) selectedIds = all.slice(Math.min(s, e), Math.max(s, e) + 1);
    } else {
        selectedIds = [id];
        lastClickedId = id;
    }
    updateSelectionState();
};

window.updateSelectionState = function() {
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
    if (window.refreshKeyframeDiamonds) refreshKeyframeDiamonds();
};

window.refreshInspectorUI = function() {
    const l = getPrimarySelectedItem();
    if (!l) return;

    document.getElementById('inpName').value = l.name;
    document.getElementById('maskPlaneCard').style.display = l.isMaskPlane ? 'block' : 'none';
    if (l.isMaskPlane) document.getElementById('maskGuideToggle').checked = l.showMaskGuide;

    const isMedia = (!l.isFolder && !l.isMaskPlane);
    document.getElementById('mediaSourceCard').style.display = isMedia ? 'block' : 'none';
    document.getElementById('appearanceCard').style.display  = isMedia ? 'block' : 'none';
    document.getElementById('effectsCard').style.display     = isMedia ? 'block' : 'none';

    if (isMedia) {
        document.getElementById('inpUrl').value = l.url;
        document.getElementById('inpOpacity').value = l.opacity ?? 1.0;
        document.getElementById('opacityVal').textContent = (l.opacity ?? 1.0).toFixed(2);

        // V7.4 UI Bindings
        const propPlayback = document.getElementById('propPlayback');
        if (propPlayback) propPlayback.value = l.playbackRule || 'loop';
        
        const propDelay = document.getElementById('propDelay');
        if (propDelay) propDelay.value = l.delay || 0;
        
        const propBlend = document.getElementById('propBlend');
        if (propBlend) propBlend.value = l.blendMode || 'normal';

        const clipSel = document.getElementById('clipSourceSelect');
        let opts = '<option value="none">None (Unclipped)</option><option value="target">🕳️ Target Frame Bounds</option>';
        layers.filter(m => m.isMaskPlane).forEach(mp => {
            opts += `<option value="${mp.id}">✂️ ${mp.name}</option>`;
        });
        clipSel.innerHTML = opts;
        clipSel.value = l.clipSource || 'none';

        const glbRow = document.getElementById('glbClipRow');
        const glbSel = document.getElementById('glbClipSelect');
        if (l.type === 'glb' && l.clips && l.clips.length > 0) {
            glbRow.style.display = 'block';
            glbSel.innerHTML = l.clips.map((c, idx) => `<option value="${idx}">${c.name || ('Clip ' + (idx + 1))}</option>`).join('');
        } else {
            glbRow.style.display = 'none';
        }

        document.getElementById('animPreset').value = l.animPreset || 'none';
        document.getElementById('animParamsBox').style.display = (l.animPreset && l.animPreset !== 'none') ? 'block' : 'none';
        document.getElementById('animSpeed').value = l.animSpeed ?? 1.0;
        document.getElementById('animAmp').value = l.animAmp ?? 1.0;
        document.getElementById('animSpeedVal').textContent = l.animSpeed ?? 1.0;
        document.getElementById('animAmpVal').textContent = l.animAmp ?? 1.0;

        const chromaSec = document.getElementById('chromaEffectSection');
        chromaSec.style.display = (l.type === 'video' || l.type === 'image') ? 'block' : 'none';
        document.getElementById('chromaToggle').checked = !!l.chromaEnabled;
        document.getElementById('chromaParamsBox').style.display = l.chromaEnabled ? 'block' : 'none';
        document.getElementById('chromaColor').value = l.color || '#00ff00';
        document.getElementById('chromaSim').value = l.similarity ?? 0.38;
        document.getElementById('chromaSmooth').value = l.smoothness ?? 0.08;
        document.getElementById('simVal').textContent = l.similarity ?? 0.38;
        document.getElementById('smoothVal').textContent = l.smoothness ?? 0.08;
    }

    populateInspectorNumbers(l);
};

window.populateInspectorNumbers = function(l) {
    document.getElementById('posX').value = l.pos[0];
    document.getElementById('posY').value = l.pos[1];
    document.getElementById('posZ').value = l.pos[2];
    document.getElementById('scaleX').value = l.scale[0];
    document.getElementById('scaleY').value = l.scale[1];
    document.getElementById('scaleZ').value = l.scale[2];
    document.getElementById('rotX').value = l.rot[0];
    document.getElementById('rotY').value = l.rot[1];
    document.getElementById('rotZ').value = l.rot[2];
};

window.syncUIFromInspector = function() {
    const l = getPrimarySelectedItem();
    if (!l) return;
    l.name = document.getElementById('inpName').value;
    renderLayerList();
};

window.applyTransformAndEffectsImmediate = function(l) {
    if (!l || !l.mesh) return;
    l.mesh.position.set(...l.pos);
    l.mesh.scale.set(...l.scale);
    l.mesh.rotation.set(
        THREE.MathUtils.degToRad(l.rot[0]),
        THREE.MathUtils.degToRad(l.rot[1]),
        THREE.MathUtils.degToRad(l.rot[2])
    );
    if (window.updateLayerClippingAndOpacity) updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
};

window.syncEffectsFromInputs = function() {
    const l = getPrimarySelectedItem();
    if (!l || l.isFolder || l.isMaskPlane) return;

    l.clipSource = document.getElementById('clipSourceSelect').value;
    l.animPreset = document.getElementById('animPreset').value;
    document.getElementById('animParamsBox').style.display = (l.animPreset !== 'none') ? 'block' : 'none';

    // V7.4 Playback and Blend Mapping
    if (document.getElementById('propPlayback')) l.playbackRule = document.getElementById('propPlayback').value;
    if (document.getElementById('propDelay')) l.delay = parseFloat(document.getElementById('propDelay').value) || 0;
    if (document.getElementById('propBlend')) l.blendMode = document.getElementById('propBlend').value;

    l.chromaEnabled = document.getElementById('chromaToggle').checked;
    document.getElementById('chromaParamsBox').style.display = l.chromaEnabled ? 'block' : 'none';
    l.color = document.getElementById('chromaColor').value;

    if (l.mesh && l.mesh.material && l.mesh.material.uniforms) {
        l.mesh.material.uniforms.enableChroma.value = l.chromaEnabled ? 1.0 : 0.0;
        l.mesh.material.uniforms.color.value.set(l.color);
    }
    if (window.updateLayerClippingAndOpacity) updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
    renderLayerList();
};

window.handleLocalFile = function(e) {
    const file = e.target.files[0];
    const l = getPrimarySelectedItem();
    if (!file || !l) return;
    l.localBlobUrl = URL.createObjectURL(file);
    if (window.applyMediaToLayer) applyMediaToLayer(l, l.localBlobUrl, file.name);
    if (window.saveHistoryState) saveHistoryState();
};

let urlFetchTimer = null;
window.handleDropboxUrl = function() {
    const l = getPrimarySelectedItem();
    if (!l) return;
    l.url = document.getElementById('inpUrl').value.trim();
    clearTimeout(urlFetchTimer);
    if (l.url) {
        urlFetchTimer = setTimeout(() => {
            if (window.applyMediaToLayer) applyMediaToLayer(l, window.cleanDropbox(l.url), l.url);
            if (window.saveHistoryState) saveHistoryState();
        }, 400);
    }
};

window.deleteSelectedLayers = function() {
    if (selectedIds.length === 0) return;
    transformControl.detach();
    selectedIds.forEach(id => {
        const l = layers.find(x => x.id === id);
        if (!l) return;
        if (l.isFolder) {
            layers.filter(c => c.parentId === l.id).forEach(ch => {
                ch.parentId = null;
                if (ch.mesh) scene.attach(ch.mesh);
            });
        }
        if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
        if (l.videoEl) { l.videoEl.pause(); l.videoEl.remove(); }
    });
    const slot = getActiveTargetSlot();
    slot.layers = layers.filter(l => !selectedIds.includes(l.id));
    layers = slot.layers;
    selectedIds = layers.length ? [layers[layers.length - 1].id] : [];
    if (window.updateMasterDuration) updateMasterDuration();
    updateSelectionState();
    if (window.saveHistoryState) saveHistoryState();
};

window.renderLayerList = function() {
    const list = document.getElementById('layerList');
    if (!layers || layers.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:10px; padding:6px 0;">NO LAYERS IN TARGET</div>';
        return;
    }
    list.innerHTML = '';
    layers.filter(l => !l.parentId).forEach(item => {
        appendHierarchyRow(list, item, false);
        if (item.isFolder) {
            layers.filter(ch => ch.parentId === item.id).forEach(child => appendHierarchyRow(list, child, true));
        }
    });
};

function appendHierarchyRow(containerEl, l, isChild) {
    const item = document.createElement('div');
    const isPrimary = (selectedIds[selectedIds.length - 1] === l.id);
    const isMulti = selectedIds.includes(l.id);
    item.className = 'layer-item' + (isPrimary ? ' active' : (isMulti ? ' multi-selected' : '')) + (isChild ? ' child-layer' : '');

    const icon = l.isFolder ? '📁 ' : (l.isMaskPlane ? '✂️ ' : (l.type === 'glb' ? '🧊 ' : (l.type === 'image' ? '🖼️ ' : '🎬 ')));
    const titleSpan = document.createElement('span');
    titleSpan.textContent = icon + l.name;

    const rightGroup = document.createElement('div');
    const zBadge = document.createElement('small');
    zBadge.textContent = `Z:${l.pos[2]}`;

    const findBtn = document.createElement('button');
    findBtn.className = 'mini-btn';
    findBtn.textContent = '🎯';
    findBtn.onclick = (e) => {
        e.stopPropagation();
        selectSingleLayer(l.id);
        if (window.focusSelectedLayer) focusSelectedLayer();
    };

    rightGroup.appendChild(zBadge);
    rightGroup.appendChild(findBtn);
    item.appendChild(titleSpan);
    item.appendChild(rightGroup);
    item.onclick = (e) => handleLayerClick(l.id, e);
    containerEl.appendChild(item);
}

// Gizmo, Camera Presets & Keyboard Shortcuts
let spaceHeld = false;

transformControl.addEventListener('dragging-changed', (ev) => {
    if (window.orbit) window.orbit.enabled = !ev.value;
    if (!ev.value) {
        if (autoKeyEnabled && window.addKeyframeForGroup) addKeyframeForGroup('transform');
        if (window.saveHistoryState) saveHistoryState();
    }
});

transformControl.addEventListener('change', () => {
    const active = getPrimarySelectedItem();
    if (!active || !active.mesh) return;
    const m = active.mesh;
    active.pos = [+m.position.x.toFixed(3), +m.position.y.toFixed(3), +m.position.z.toFixed(3)];
    active.scale = [+m.scale.x.toFixed(3), +m.scale.y.toFixed(3), +m.scale.z.toFixed(3)];
    active.rot = [
        +THREE.MathUtils.radToDeg(m.rotation.x).toFixed(1),
        +THREE.MathUtils.radToDeg(m.rotation.y).toFixed(1),
        +THREE.MathUtils.radToDeg(m.rotation.z).toFixed(1)
    ];
    populateInspectorNumbers(active);
    renderLayerList();
});

window.setGizmoMode = (m) => {
    transformControl.setMode(m);
    ['translate', 'rotate', 'scale'].forEach(k => {
        const b = document.getElementById('gizmo-' + k);
        if (b) b.classList.toggle('active', k === m);
    });
};

window.setCameraPreset = (view) => {
    if (!window.camera || !window.orbit) return;
    camAnim = null;
    window.orbit.target.set(0, 0, 0);
    const presets = {
        front: [0, 0, 1.6, 0, 1, 0],
        perspective: [0.8, -1.1, 1.2, 0, 1, 0],
        side: [1.6, 0, 0.15, 0, 1, 0],
        top: [0, -1.6, 0.2, 0, 0, 1]
    };
    const p = presets[view] || presets.front;
    window.camera.position.set(p[0], p[1], p[2]);
    window.camera.up.set(p[3], p[4], p[5]);
    window.orbit.update();
};

window.focusSelectedLayer = () => {
    const item = getPrimarySelectedItem();
    if (!item || !item.mesh) {
        camAnim = {
            progress: 0, startPos: window.camera.position.clone(), startTarget: window.orbit.target.clone(),
            endTarget: new THREE.Vector3(0, 0, 0), endPos: new THREE.Vector3(0, -0.9, 1.4)
        };
        return;
    }
    const bounds = new THREE.Box3().setFromObject(item.mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    const sz = bounds.getSize(new THREE.Vector3());
    const dist = Math.max(sz.x, sz.y, sz.z, 0.4) * 1.65;
    const offset = window.camera.position.clone().sub(window.orbit.target).normalize().multiplyScalar(dist);
    camAnim = {
        progress: 0, startPos: window.camera.position.clone(), startTarget: window.orbit.target.clone(),
        endTarget: center, endPos: center.clone().add(offset)
    };
};

window.addEventListener('keydown', (ev) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        return ev.shiftKey ? redo() : undo();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'g') {
        ev.preventDefault();
        return groupSelectedLayers();
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    if (ev.code === 'Space' && !spaceHeld && window.container && window.orbit) {
        ev.preventDefault();
        spaceHeld = true;
        window.container.classList.add('space-pan');
        window.orbit.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
    const k = ev.key.toLowerCase();
    if (k === 'w') setGizmoMode('translate');
    if (k === 'e') setGizmoMode('rotate');
    if (k === 'r') setGizmoMode('scale');
    if (k === 'f') { ev.preventDefault(); focusSelectedLayer(); }
});

window.addEventListener('keyup', (ev) => {
    if (ev.code === 'Space' && window.container && window.orbit) {
        spaceHeld = false;
        window.container.classList.remove('space-pan');
        window.orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
});

// Raycast Selection on Canvas
const picker = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let pStart = { x: 0, y: 0 };

if (window.canvas) {
    window.canvas.addEventListener('pointerdown', (e) => { pStart = { x: e.clientX, y: e.clientY }; });
    window.canvas.addEventListener('pointerup', (e) => {
        if (spaceHeld || Math.hypot(e.clientX - pStart.x, e.clientY - pStart.y) > 5) return;
        const r = window.canvas.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        picker.setFromCamera(ptr, window.camera);
        const targets = layers.filter(l => !l.isFolder && l.mesh && l.mesh.visible).map(l => l.mesh);
        const hits = picker.intersectObjects(targets, true);
        if (hits.length) {
            let node = hits[0].object;
            while (node.parent && !node.userData.layerId) node = node.parent;
            if (node.userData.layerId) handleLayerClick(node.userData.layerId, e);
        }
    });
}

window.addEventListener('resize', () => {
    if (window.camera && window.container && window.renderer) {
        window.camera.aspect = window.container.clientWidth / window.container.clientHeight;
        window.camera.updateProjectionMatrix();
        window.renderer.setSize(window.container.clientWidth, window.container.clientHeight);
    }
});

// Boot Nizhali Studio with 1 Default Print Target Slot
if (window.addNewTargetSlot) addNewTargetSlot('image');
if (window.animate) animate();