// ============================================================================
// MODULE 06 // HIERARCHY, INSPECTOR UI SYNC, SHORTCUTS & STUDIO BOOT (V7.4.2)
// ============================================================================

window.groupSelectedLayers = function() {
    const valid = window.selectedIds.map(id => window.layers.find(l => l.id === id)).filter(l => l && !l.isFolder);
    if (valid.length < 1) return alert('Select 1 or more layers to group!');

    const fId = 'folder_' + Date.now();
    const count = window.layers.filter(l => l.isFolder).length + 1;
    const fObj = window.createLayerObject({ id: fId, name: `FOLDER_${count}`, isFolder: true, type: 'folder' });

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
    window.layers.push(fObj);
    window.selectSingleLayer(fId);
    if (window.saveHistoryState) window.saveHistoryState();
};

window.ungroupSelectedFolder = function() {
    const item = window.getPrimarySelectedItem();
    if (!item) return;
    const folder = item.isFolder ? item : window.layers.find(l => l.id === item.parentId);
    if (!folder || !folder.isFolder) return;

    const children = window.layers.filter(l => l.parentId === folder.id);
    children.forEach(ch => {
        ch.parentId = null;
        if (ch.mesh) {
            window.scene.attach(ch.mesh);
            ch.pos = [
                parseFloat(ch.mesh.position.x.toFixed(3)),
                parseFloat(ch.mesh.position.y.toFixed(3)),
                parseFloat(ch.mesh.position.z.toFixed(3))
            ];
        }
    });
    if (window.transformControl) window.transformControl.detach();
    if (window.scene && folder.mesh) window.scene.remove(folder.mesh);
    
    const slot = window.getActiveTargetSlot();
    slot.layers = window.layers.filter(l => l.id !== folder.id);
    window.layers = slot.layers;
    window.selectedIds = children.map(c => c.id);
    window.updateSelectionState();
    if (window.saveHistoryState) window.saveHistoryState();
};

window.selectSingleLayer = function(id) {
    window.selectedIds = id ? [id] : [];
    window.lastClickedId = id;
    window.updateSelectionState();
};

window.handleLayerClick = function(id, ev) {
    if (ev && (ev.ctrlKey || ev.metaKey)) {
        if (window.selectedIds.includes(id)) window.selectedIds = window.selectedIds.filter(x => x !== id);
        else window.selectedIds.push(id);
        window.lastClickedId = id;
    } else if (ev && ev.shiftKey && window.lastClickedId) {
        const all = window.layers.map(l => l.id);
        const s = all.indexOf(window.lastClickedId), e = all.indexOf(id);
        if (s !== -1 && e !== -1) window.selectedIds = all.slice(Math.min(s, e), Math.max(s, e) + 1);
    } else {
        window.selectedIds = [id];
        window.lastClickedId = id;
    }
    window.updateSelectionState();
};

window.updateSelectionState = function() {
    window.renderLayerList();
    const primary = window.getPrimarySelectedItem();

    if (!primary) {
        if (window.transformControl) window.transformControl.detach();
        document.getElementById('inspectorEmpty').style.display = 'block';
        document.getElementById('inspectorControls').style.display = 'none';
        document.getElementById('inspectorFocusBtn').style.display = 'none';
        return;
    }

    document.getElementById('inspectorEmpty').style.display = 'none';
    document.getElementById('inspectorControls').style.display = 'block';
    document.getElementById('inspectorFocusBtn').style.display = 'inline-block';
    document.getElementById('inpLocalFile').value = '';

    if (primary.mesh && window.transformControl) window.transformControl.attach(primary.mesh);
    window.refreshInspectorUI();
    if (window.refreshKeyframeDiamonds) window.refreshKeyframeDiamonds();
};

window.refreshInspectorUI = function() {
    const l = window.getPrimarySelectedItem();
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

        const propPlayback = document.getElementById('propPlayback');
        if (propPlayback) propPlayback.value = l.playbackRule || 'loop';
        
        const propDelay = document.getElementById('propDelay');
        if (propDelay) propDelay.value = l.delay || 0;
        
        const propBlend = document.getElementById('propBlend');
        if (propBlend) propBlend.value = l.blendMode || 'normal';

        const clipSel = document.getElementById('clipSourceSelect');
        let opts = '<option value="none">None (Unclipped)</option><option value="target">🕳️ Target Frame Bounds</option>';
        window.layers.filter(m => m.isMaskPlane).forEach(mp => {
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

    window.populateInspectorNumbers(l);
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
    const l = window.getPrimarySelectedItem();
    if (!l) return;
    l.name = document.getElementById('inpName').value;
    window.renderLayerList();
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
    if (window.updateLayerClippingAndOpacity) window.updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
};

window.syncEffectsFromInputs = function() {
    const l = window.getPrimarySelectedItem();
    if (!l || l.isFolder || l.isMaskPlane) return;

    l.clipSource = document.getElementById('clipSourceSelect').value;
    l.animPreset = document.getElementById('animPreset').value;
    document.getElementById('animParamsBox').style.display = (l.animPreset !== 'none') ? 'block' : 'none';

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
    if (window.updateLayerClippingAndOpacity) window.updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
    window.renderLayerList();
};

window.handleLocalFile = function(e) {
    const file = e.target.files[0];
    const l = window.getPrimarySelectedItem();
    if (!file || !l) return;
    l.localBlobUrl = URL.createObjectURL(file);
    if (window.applyMediaToLayer) window.applyMediaToLayer(l, l.localBlobUrl, file.name);
    if (window.saveHistoryState) window.saveHistoryState();
};

let urlFetchTimer = null;
window.handleDropboxUrl = function() {
    const l = window.getPrimarySelectedItem();
    if (!l) return;
    l.url = document.getElementById('inpUrl').value.trim();
    clearTimeout(urlFetchTimer);
    if (l.url) {
        urlFetchTimer = setTimeout(() => {
            if (window.applyMediaToLayer) window.applyMediaToLayer(l, window.cleanDropbox(l.url), l.url);
            if (window.saveHistoryState) window.saveHistoryState();
        }, 400);
    }
};

window.deleteSelectedLayers = function() {
    if (!window.selectedIds || window.selectedIds.length === 0) return;
    if (window.transformControl) window.transformControl.detach();
    
    window.selectedIds.forEach(id => {
        const l = window.layers.find(x => x.id === id);
        if (!l) return;
        if (l.isFolder) {
            window.layers.filter(c => c.parentId === l.id).forEach(ch => {
                ch.parentId = null;
                if (ch.mesh && window.scene) window.scene.attach(ch.mesh);
            });
        }
        if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
        if (l.videoEl) { l.videoEl.pause(); l.videoEl.remove(); }
    });
    
    const slot = window.getActiveTargetSlot();
    slot.layers = window.layers.filter(l => !window.selectedIds.includes(l.id));
    window.layers = slot.layers;
    window.selectedIds = window.layers.length ? [window.layers[window.layers.length - 1].id] : [];
    if (window.updateMasterDuration) window.updateMasterDuration();
    window.updateSelectionState();
    if (window.saveHistoryState) window.saveHistoryState();
};

window.renderLayerList = function() {
    const list = document.getElementById('layerList');
    if (!window.layers || window.layers.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:10px; padding:6px 0;">NO LAYERS IN TARGET</div>';
        return;
    }
    list.innerHTML = '';
    window.layers.filter(l => !l.parentId).forEach(item => {
        appendHierarchyRow(list, item, false);
        if (item.isFolder) {
            window.layers.filter(ch => ch.parentId === item.id).forEach(child => appendHierarchyRow(list, child, true));
        }
    });
};

function appendHierarchyRow(containerEl, l, isChild) {
    const item = document.createElement('div');
    const isPrimary = (window.selectedIds[window.selectedIds.length - 1] === l.id);
    const isMulti = window.selectedIds.includes(l.id);
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
        window.selectSingleLayer(l.id);
        if (window.focusSelectedLayer) window.focusSelectedLayer();
    };

    rightGroup.appendChild(zBadge);
    rightGroup.appendChild(findBtn);
    item.appendChild(titleSpan);
    item.appendChild(rightGroup);
    item.onclick = (e) => window.handleLayerClick(l.id, e);
    containerEl.appendChild(item);
}

// Gizmo, Camera Presets & Keyboard Shortcuts
window.spaceHeld = false;

window.addEventListener('load', () => {
    if (window.transformControl) {
        window.transformControl.addEventListener('dragging-changed', (ev) => {
            if (window.orbit) window.orbit.enabled = !ev.value;
            if (!ev.value) {
                if (window.autoKeyEnabled && window.addKeyframeForGroup) window.addKeyframeForGroup('transform');
                if (window.saveHistoryState) window.saveHistoryState();
            }
        });

        window.transformControl.addEventListener('change', () => {
            const active = window.getPrimarySelectedItem();
            if (!active || !active.mesh) return;
            const m = active.mesh;
            active.pos = [+m.position.x.toFixed(3), +m.position.y.toFixed(3), +m.position.z.toFixed(3)];
            active.scale = [+m.scale.x.toFixed(3), +m.scale.y.toFixed(3), +m.scale.z.toFixed(3)];
            active.rot = [
                +THREE.MathUtils.radToDeg(m.rotation.x).toFixed(1),
                +THREE.MathUtils.radToDeg(m.rotation.y).toFixed(1),
                +THREE.MathUtils.radToDeg(m.rotation.z).toFixed(1)
            ];
            window.populateInspectorNumbers(active);
            window.renderLayerList();
        });
    }

    // Raycast Selection on Canvas
    window.picker = new THREE.Raycaster();
    window.ptr = new THREE.Vector2();
    window.pStart = { x: 0, y: 0 };

    if (window.canvas) {
        window.canvas.addEventListener('pointerdown', (e) => { window.pStart = { x: e.clientX, y: e.clientY }; });
        window.canvas.addEventListener('pointerup', (e) => {
            if (window.spaceHeld || Math.hypot(e.clientX - window.pStart.x, e.clientY - window.pStart.y) > 5) return;
            const r = window.canvas.getBoundingClientRect();
            window.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            window.picker.setFromCamera(window.ptr, window.camera);
            const targets = window.layers.filter(l => !l.isFolder && l.mesh && l.mesh.visible).map(l => l.mesh);
            const hits = window.picker.intersectObjects(targets, true);
            if (hits.length) {
                let node = hits[0].object;
                while (node.parent && !node.userData.layerId) node = node.parent;
                if (node.userData.layerId) window.handleLayerClick(node.userData.layerId, e);
            }
        });
    }
});

window.setGizmoMode = (m) => {
    if (window.transformControl) window.transformControl.setMode(m);
    ['translate', 'rotate', 'scale'].forEach(k => {
        const b = document.getElementById('gizmo-' + k);
        if (b) b.classList.toggle('active', k === m);
    });
};

window.setCameraPreset = (view) => {
    if (!window.camera || !window.orbit) return;
    window.camAnim = null;
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
    const item = window.getPrimarySelectedItem();
    if (!item || !item.mesh) {
        window.camAnim = {
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
    window.camAnim = {
        progress: 0, startPos: window.camera.position.clone(), startTarget: window.orbit.target.clone(),
        endTarget: center, endPos: center.clone().add(offset)
    };
};

window.addEventListener('keydown', (ev) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        return ev.shiftKey ? window.redo() : window.undo();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'g') {
        ev.preventDefault();
        return window.groupSelectedLayers();
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    if (ev.code === 'Space' && !window.spaceHeld && window.container && window.orbit) {
        ev.preventDefault();
        window.spaceHeld = true;
        window.container.classList.add('space-pan');
        window.orbit.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
    const k = ev.key.toLowerCase();
    if (k === 'w') window.setGizmoMode('translate');
    if (k === 'e') window.setGizmoMode('rotate');
    if (k === 'r') window.setGizmoMode('scale');
    if (k === 'f') { ev.preventDefault(); window.focusSelectedLayer(); }
});

window.addEventListener('keyup', (ev) => {
    if (ev.code === 'Space' && window.container && window.orbit) {
        window.spaceHeld = false;
        window.container.classList.remove('space-pan');
        window.orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
});

window.addEventListener('resize', () => {
    if (window.camera && window.container && window.renderer) {
        window.camera.aspect = window.container.clientWidth / window.container.clientHeight;
        window.camera.updateProjectionMatrix();
        window.renderer.setSize(window.container.clientWidth, window.container.clientHeight);
    }
});
