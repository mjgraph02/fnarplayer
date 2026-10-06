// ============================================================================
// MODULE 02 // MULTI-TARGET SLOTS, 3D TOY PNP SCANNER & TURNTABLE COMPILER
// ============================================================================

function createDefaultTargetSlot(mode, index) {
    const labelMap = { image: 'Print', toy3d: '3D Toy', face: 'Face AR' };
    return {
        id: 'target_' + Date.now() + '_' + index,
        name: `${labelMap[mode] || 'Target'} ${index + 1}`,
        mode: mode, // 'image' | 'toy3d' | 'face'
        targetImageUrl: '',
        targetAspect: 1.0,
        targetImageEl: null,
        toyGlbUrl: '',
        toyLocalBlobUrl: '',
        toyOccluder: true,
        toyMesh: null,
        toyPnpPoints: [],
        faceOccluder: true,
        customDuration: 5.0,
        layers: []
    };
}

window.addNewTargetSlot = function(mode = 'image') {
    const newSlot = createDefaultTargetSlot(mode, projectState.targets.length);
    projectState.targets.push(newSlot);
    switchTargetSlot(projectState.targets.length - 1);
    if (window.saveHistoryState) saveHistoryState();
    showToast(`➕ Created Target Slot: ${newSlot.name} [${mode.toUpperCase()}]`);
};

window.switchTargetSlot = function(index) {
    if (index < 0 || index >= projectState.targets.length) return;

    transformControl.detach();
    if (layers && layers.length) {
        layers.forEach(l => {
            if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
            if (l.videoEl) l.videoEl.pause();
        });
    }

    projectState.activeTargetIndex = index;
    const slot = getActiveTargetSlot();
    layers = slot.layers;
    selectedIds = [];

    layers.filter(l => l.isFolder).forEach(f => { if (f.mesh) scene.add(f.mesh); });
    layers.filter(l => !l.isFolder).forEach(l => {
        if (!l.mesh) return;
        if (l.parentId) {
            const pFolder = layers.find(f => f.id === l.parentId);
            if (pFolder && pFolder.mesh) pFolder.mesh.add(l.mesh);
            else scene.add(l.mesh);
        } else {
            scene.add(l.mesh);
        }
    });

    updateStageForTargetMode(slot);
    renderTargetTabs();
    if (window.updateMasterDuration) updateMasterDuration();
    if (window.updateSelectionState) updateSelectionState();
};

function updateStageForTargetMode(slot) {
    document.getElementById('targetSlotName').value = slot.name;
    document.getElementById('activeTargetBadge').textContent = slot.mode.toUpperCase();

    document.getElementById('targetModePrintBox').style.display = (slot.mode === 'image') ? 'block' : 'none';
    document.getElementById('targetModeToyBox').style.display   = (slot.mode === 'toy3d') ? 'block' : 'none';
    document.getElementById('targetModeFaceBox').style.display  = (slot.mode === 'face')  ? 'block' : 'none';

    targetMesh.visible = (slot.mode === 'image');
    toyTargetHolder.visible = (slot.mode === 'toy3d');
    faceMannequinGroup.visible = (slot.mode === 'face');

    if (slot.mode === 'image') {
        document.getElementById('targetImgUrlInput').value = slot.targetImageUrl || '';
        if (slot.targetImageEl) {
            const tex = new THREE.Texture(slot.targetImageEl);
            tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            targetMesh.geometry.dispose();
            targetMesh.geometry = new THREE.PlaneGeometry(1, slot.targetAspect || 1);
            targetMat.map = tex;
            targetMat.needsUpdate = true;
        } else {
            targetMesh.geometry.dispose();
            targetMesh.geometry = new THREE.PlaneGeometry(1, 1);
            targetMat.map = defaultTargetTex;
            targetMat.needsUpdate = true;
        }
    } else if (slot.mode === 'toy3d') {
        document.getElementById('toyGlbUrlInput').value = slot.toyGlbUrl || '';
        document.getElementById('toyOccluderToggle').checked = !!slot.toyOccluder;
        while (toyTargetHolder.children.length) toyTargetHolder.remove(toyTargetHolder.children[0]);
        if (slot.toyMesh) {
            toyTargetHolder.add(slot.toyMesh);
        } else {
            const ped = new THREE.Mesh(
                new THREE.CylinderGeometry(0.28, 0.32, 0.65, 24),
                new THREE.MeshStandardMaterial({ color: 0xff4f00, wireframe: true })
            );
            ped.position.set(0, 0, 0.325);
            ped.rotation.x = Math.PI / 2;
            toyTargetHolder.add(ped);
        }
    } else if (slot.mode === 'face') {
        document.getElementById('faceOccluderToggle').checked = !!slot.faceOccluder;
    }
}

function renderTargetTabs() {
    const bar = document.getElementById('target-tabs-bar');
    bar.innerHTML = '';
    projectState.targets.forEach((t, idx) => {
        const icon = t.mode === 'face' ? '👤' : (t.mode === 'toy3d' ? '🧸' : '🖼️');
        const btn = document.createElement('div');
        btn.className = 'target-tab' + (idx === projectState.activeTargetIndex ? ' active' : '');
        btn.innerHTML = `<span>${icon} ${t.name}</span>`;
        btn.onclick = () => switchTargetSlot(idx);

        if (projectState.targets.length > 1) {
            const del = document.createElement('span');
            del.textContent = '×';
            del.style.marginLeft = '6px';
            del.style.opacity = '0.7';
            del.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete target slot "${t.name}"?`)) {
                    projectState.targets.splice(idx, 1);
                    switchTargetSlot(Math.max(0, projectState.activeTargetIndex - 1));
                }
            };
            btn.appendChild(del);
        }
        bar.appendChild(btn);
    });
}

window.renameActiveTarget = function(val) {
    const slot = getActiveTargetSlot();
    if (!slot) return;
    slot.name = val;
    renderTargetTabs();
};

window.toggleStudioTheme = function() {
    document.body.classList.toggle('theme-light');
};

window.syncProjectMindUrl = function(val) {
    projectState.mindUrl = val.trim();
};

// 3D Toy (.glb) Loader & Surface Point Sampler
function loadToyGlbIntoSlot(slot, srcUrl) {
    showToast('⏳ Loading 3D Toy Photogrammetry Scan (.glb)...');
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(srcUrl, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 0.85 / maxDim;

        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        model.scale.set(scale, scale, scale);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        slot.toyMesh = wrapper;
        slot.toyPnpPoints = sample3DSurfacePointsFromMesh(wrapper, 48);

        while (toyTargetHolder.children.length) toyTargetHolder.remove(toyTargetHolder.children[0]);
        toyTargetHolder.add(wrapper);
        showToast(`✅ 3D Toy Scan Loaded! Mapped ${slot.toyPnpPoints.length} 3D PnP Surface Anchors.`);
    }, undefined, () => {
        showToast('❌ Failed to load 3D Toy .glb. Check link permissions.');
    });
}

function sample3DSurfacePointsFromMesh(rootGroup, maxPoints = 48) {
    const pts = [];
    rootGroup.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    rootGroup.traverse(child => {
        if (child.isMesh && child.geometry && child.geometry.attributes.position) {
            const posAttr = child.geometry.attributes.position;
            const step = Math.max(1, Math.floor(posAttr.count / maxPoints));
            for (let i = 0; i < posAttr.count && pts.length < maxPoints; i += step) {
                v.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
                pts.push([parseFloat(v.x.toFixed(4)), parseFloat(v.y.toFixed(4)), parseFloat(v.z.toFixed(4))]);
            }
        }
    });
    return pts;
}

window.loadToyTargetGlbFile = function(e) {
    const file = e.target.files[0];
    const slot = getActiveTargetSlot();
    if (!file || !slot) return;
    slot.toyLocalBlobUrl = URL.createObjectURL(file);
    loadToyGlbIntoSlot(slot, slot.toyLocalBlobUrl);
};

let toyUrlTimer = null;
window.loadToyTargetGlbUrl = function() {
    const slot = getActiveTargetSlot();
    if (!slot) return;
    slot.toyGlbUrl = document.getElementById('toyGlbUrlInput').value.trim();
    clearTimeout(toyUrlTimer);
    if (slot.toyGlbUrl) {
        toyUrlTimer = setTimeout(() => loadToyGlbIntoSlot(slot, cleanDropbox(slot.toyGlbUrl)), 400);
    }
};

window.syncToyOccluder = function() {
    const slot = getActiveTargetSlot();
    if (slot) slot.toyOccluder = document.getElementById('toyOccluderToggle').checked;
};

window.syncFaceOccluder = function() {
    const slot = getActiveTargetSlot();
    if (slot) slot.faceOccluder = document.getElementById('faceOccluderToggle').checked;
};

window.syncFaceAnchor = function() {
    const layer = getPrimarySelectedItem();
    if (!layer) return;
    const anchorId = document.getElementById('faceAnchorSelect').value;
    layer.faceAnchorId = anchorId;
    const coords = FACE_ANCHOR_COORDS[anchorId] || [0, 0, 0];
    layer.pos = [...coords];
    if (window.applyTransformAndEffectsImmediate) applyTransformAndEffectsImmediate(layer);
    if (window.populateInspectorNumbers) populateInspectorNumbers(layer);
    showToast(`👤 Snapped "${layer.name}" to Face Anchor #${anchorId}`);
};

// Target Print Image Loader
function applyTargetImageSource(srcUrl) {
    const slot = getActiveTargetSlot();
    if (!slot) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        slot.targetImageEl = img;
        slot.targetAspect = parseFloat((img.height / img.width).toFixed(4));
        const tex = new THREE.Texture(img);
        tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;
        targetMesh.geometry.dispose();
        targetMesh.geometry = new THREE.PlaneGeometry(1, slot.targetAspect);
        targetMat.map = tex;
        targetMat.needsUpdate = true;
        showToast('✅ Print Target Loaded on 3D Stage!');
    };
    img.src = srcUrl;
}

document.getElementById('targetImgInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) applyTargetImageSource(URL.createObjectURL(file));
});

let targetUrlTimer = null;
window.loadTargetFromUrl = function() {
    const slot = getActiveTargetSlot();
    if (!slot) return;
    clearTimeout(targetUrlTimer);
    slot.targetImageUrl = document.getElementById('targetImgUrlInput').value.trim();
    if (slot.targetImageUrl) {
        targetUrlTimer = setTimeout(() => applyTargetImageSource(cleanDropbox(slot.targetImageUrl)), 400);
    }
};

// Multi-Target & 3D Toy Auto-Turntable Compiler (.mind)
async function captureToyTurntableViews(slot) {
    const anglesDeg = [0, -35, 35, -70, 70];
    const capturedImages = [];

    const prevGrid = gridHelper.visible;
    const prevGizmo = transformControl.visible;
    gridHelper.visible = false;
    transformControl.visible = false;
    layers.forEach(l => { if (l.mesh) l.mesh.visible = false; });

    const savedPos = camera.position.clone();
    const savedTarget = orbit.target.clone();

    for (const deg of anglesDeg) {
        const rad = THREE.MathUtils.degToRad(deg);
        camera.position.set(Math.sin(rad) * 1.35, 0, Math.cos(rad) * 1.35);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);

        const dataUrl = canvas.toDataURL('image/png');
        const img = await new Promise(res => {
            const im = new Image();
            im.onload = () => res(im);
            im.src = dataUrl;
        });
        capturedImages.push({ img, angleY: deg });
    }

    camera.position.copy(savedPos);
    orbit.target.copy(savedTarget);
    orbit.update();
    gridHelper.visible = prevGrid;
    transformControl.visible = prevGizmo;
    layers.forEach(l => {
        if (l.mesh) l.mesh.visible = l.isMaskPlane ? l.showMaskGuide : true;
    });

    return capturedImages;
}

window.compileProjectMindFile = async function() {
    if (!window.MINDAR || !window.MINDAR.IMAGE || !window.MINDAR.IMAGE.Compiler) {
        alert('MindAR Compiler is still initializing. Wait 2 seconds and click again.');
        return;
    }

    const btn = document.getElementById('compileMindBtn');
    const progWrap = document.getElementById('compileProgressWrap');
    const progBar = document.getElementById('compileProgressBar');
    const statusTxt = document.getElementById('compileStatusText');

    const compileQueue = [];
    projectState.targetIndexMap = [];

    for (let i = 0; i < projectState.targets.length; i++) {
        const t = projectState.targets[i];
        if (t.mode === 'image') {
            if (!t.targetImageEl) {
                alert(`Please load an image for "${t.name}" before compiling!`);
                switchTargetSlot(i);
                return;
            }
            projectState.targetIndexMap.push({ slotId: t.id, mode: 'image', angleY: 0, mindIndex: compileQueue.length });
            compileQueue.push(t.targetImageEl);
        } else if (t.mode === 'toy3d') {
            if (!t.toyMesh) {
                alert(`Please load a 3D Toy .glb scan for "${t.name}" before compiling!`);
                switchTargetSlot(i);
                return;
            }
            switchTargetSlot(i);
            statusTxt.style.display = 'block';
            statusTxt.textContent = `Capturing 5 turntable angles for ${t.name}...`;
            const views = await captureToyTurntableViews(t);
            views.forEach(v => {
                projectState.targetIndexMap.push({ slotId: t.id, mode: 'toy3d', angleY: v.angleY, mindIndex: compileQueue.length });
                compileQueue.push(v.img);
            });
        }
    }

    if (compileQueue.length === 0) {
        alert('Face AR targets do not require a .mind file! You can save project.json or export directly.');
        return;
    }

    try {
        btn.disabled = true;
        progWrap.style.display = 'block';
        statusTxt.style.display = 'block';
        const compiler = new window.MINDAR.IMAGE.Compiler();
        await compiler.compileImageTargets(compileQueue, (p) => {
            const pct = Math.round(p);
            progBar.style.width = pct + '%';
            statusTxt.textContent = `COMPILING ${compileQueue.length} TARGET VIEWS: ${pct}%`;
        });
        const buffer = await compiler.exportData();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
        a.download = 'targets.mind';
        a.click();
        statusTxt.textContent = '✅ targets.mind downloaded! Upload to cloud & paste link below.';
        showToast('🎉 Multi-Target targets.mind compiled!');
    } catch (err) {
        statusTxt.textContent = '❌ Error: ' + err.message;
    } finally {
        btn.disabled = false;
    }
};