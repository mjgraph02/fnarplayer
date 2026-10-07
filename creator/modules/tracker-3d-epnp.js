// ============================================================================
// MODULE 02 // MULTI-TARGET SLOTS, 3D TOY PNP SCANNER & TURNTABLE COMPILER (V7.4)
// ============================================================================

window.createDefaultTargetSlot = function(mode, index) {
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
};

window.addNewTargetSlot = function(mode = 'image') {
    if (!window.projectState) return;
    const newSlot = window.createDefaultTargetSlot(mode, window.projectState.targets.length);
    window.projectState.targets.push(newSlot);
    window.switchTargetSlot(window.projectState.targets.length - 1);
    if (window.saveHistoryState) window.saveHistoryState();
    if (window.showToast) window.showToast(`➕ Created Target Slot: ${newSlot.name} [${mode.toUpperCase()}]`);
};

window.switchTargetSlot = function(index) {
    if (!window.projectState || index < 0 || index >= window.projectState.targets.length) return;

    if (window.transformControl) window.transformControl.detach();
    if (window.layers && window.layers.length) {
        window.layers.forEach(l => {
            if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
            if (l.videoEl) l.videoEl.pause();
        });
    }

    window.projectState.activeTargetIndex = index;
    const slot = window.getActiveTargetSlot();
    window.layers = slot.layers;
    window.selectedIds = [];

    window.layers.filter(l => l.isFolder).forEach(f => { if (f.mesh && window.scene) window.scene.add(f.mesh); });
    window.layers.filter(l => !l.isFolder).forEach(l => {
        if (!l.mesh) return;
        if (l.parentId) {
            const pFolder = window.layers.find(f => f.id === l.parentId);
            if (pFolder && pFolder.mesh) pFolder.mesh.add(l.mesh);
            else if (window.scene) window.scene.add(l.mesh);
        } else {
            if (window.scene) window.scene.add(l.mesh);
        }
    });

    updateStageForTargetMode(slot);
    window.renderTargetTabs();
    if (window.updateMasterDuration) window.updateMasterDuration();
    if (window.updateSelectionState) window.updateSelectionState();
};

function updateStageForTargetMode(slot) {
    const nameInput = document.getElementById('targetSlotName');
    if (nameInput) nameInput.value = slot.name;
    
    const badge = document.getElementById('activeTargetBadge');
    if (badge) badge.textContent = slot.mode.toUpperCase();

    const printBox = document.getElementById('targetModePrintBox');
    if (printBox) printBox.style.display = (slot.mode === 'image') ? 'block' : 'none';
    
    const toyBox = document.getElementById('targetModeToyBox');
    if (toyBox) toyBox.style.display = (slot.mode === 'toy3d') ? 'block' : 'none';
    
    const faceBox = document.getElementById('targetModeFaceBox');
    if (faceBox) faceBox.style.display = (slot.mode === 'face')  ? 'block' : 'none';

    if (window.targetMesh) window.targetMesh.visible = (slot.mode === 'image');
    if (window.toyTargetHolder) window.toyTargetHolder.visible = (slot.mode === 'toy3d');
    if (window.faceMannequinGroup) window.faceMannequinGroup.visible = (slot.mode === 'face');

    if (slot.mode === 'image') {
        const urlInp = document.getElementById('targetImgUrlInput');
        if (urlInp) urlInp.value = slot.targetImageUrl || '';
        
        if (window.targetMesh && window.targetMat) {
            if (slot.targetImageEl) {
                const tex = new THREE.Texture(slot.targetImageEl);
                tex.encoding = THREE.sRGBEncoding;
                tex.needsUpdate = true;
                window.targetMesh.geometry.dispose();
                window.targetMesh.geometry = new THREE.PlaneGeometry(1, slot.targetAspect || 1);
                window.targetMat.map = tex;
                window.targetMat.needsUpdate = true;
            } else {
                window.targetMesh.geometry.dispose();
                window.targetMesh.geometry = new THREE.PlaneGeometry(1, 1);
                window.targetMat.map = window.defaultTargetTex;
                window.targetMat.needsUpdate = true;
            }
        }
    } else if (slot.mode === 'toy3d') {
        const toyUrlInp = document.getElementById('toyGlbUrlInput');
        if (toyUrlInp) toyUrlInp.value = slot.toyGlbUrl || '';
        
        const occToggle = document.getElementById('toyOccluderToggle');
        if (occToggle) occToggle.checked = !!slot.toyOccluder;
        
        if (window.toyTargetHolder) {
            while (window.toyTargetHolder.children.length) window.toyTargetHolder.remove(window.toyTargetHolder.children[0]);
            if (slot.toyMesh) {
                window.toyTargetHolder.add(slot.toyMesh);
            } else {
                const ped = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.28, 0.32, 0.65, 24),
                    new THREE.MeshStandardMaterial({ color: 0xff4f00, wireframe: true })
                );
                ped.position.set(0, 0, 0.325);
                ped.rotation.x = Math.PI / 2;
                window.toyTargetHolder.add(ped);
            }
        }
    } else if (slot.mode === 'face') {
        const fOccToggle = document.getElementById('faceOccluderToggle');
        if (fOccToggle) fOccToggle.checked = !!slot.faceOccluder;
    }
}

window.renderTargetTabs = function() {
    const bar = document.getElementById('target-tabs-bar');
    if (!bar || !window.projectState) return;
    bar.innerHTML = '';
    window.projectState.targets.forEach((t, idx) => {
        const icon = t.mode === 'face' ? '👤' : (t.mode === 'toy3d' ? '🧸' : '🖼️');
        const btn = document.createElement('div');
        btn.className = 'target-tab' + (idx === window.projectState.activeTargetIndex ? ' active' : '');
        btn.innerHTML = `<span>${icon} ${t.name}</span>`;
        btn.onclick = () => window.switchTargetSlot(idx);

        if (window.projectState.targets.length > 1) {
            const del = document.createElement('span');
            del.textContent = '×';
            del.style.marginLeft = '6px';
            del.style.opacity = '0.7';
            del.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete target slot "${t.name}"?`)) {
                    window.projectState.targets.splice(idx, 1);
                    window.switchTargetSlot(Math.max(0, window.projectState.activeTargetIndex - 1));
                }
            };
            btn.appendChild(del);
        }
        bar.appendChild(btn);
    });
};

window.renameActiveTarget = function(val) {
    const slot = window.getActiveTargetSlot();
    if (!slot) return;
    slot.name = val;
    window.renderTargetTabs();
};

window.toggleStudioTheme = function() {
    document.body.classList.toggle('theme-light');
};

window.syncProjectMindUrl = function(val) {
    if (window.projectState) window.projectState.mindUrl = val.trim();
};

// 3D Toy (.glb) Loader & Surface Point Sampler
function loadToyGlbIntoSlot(slot, srcUrl) {
    if (window.showToast) window.showToast('⏳ Loading 3D Toy Photogrammetry Scan (.glb)...');
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

        if (window.toyTargetHolder) {
            while (window.toyTargetHolder.children.length) window.toyTargetHolder.remove(window.toyTargetHolder.children[0]);
            window.toyTargetHolder.add(wrapper);
        }
        if (window.showToast) window.showToast(`✅ 3D Toy Scan Loaded! Mapped ${slot.toyPnpPoints.length} 3D PnP Surface Anchors.`);
    }, undefined, () => {
        if (window.showToast) window.showToast('❌ Failed to load 3D Toy .glb. Check link permissions.');
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
    const slot = window.getActiveTargetSlot();
    if (!file || !slot) return;
    slot.toyLocalBlobUrl = URL.createObjectURL(file);
    loadToyGlbIntoSlot(slot, slot.toyLocalBlobUrl);
};

let toyUrlTimer = null;
window.loadToyTargetGlbUrl = function() {
    const slot = window.getActiveTargetSlot();
    if (!slot) return;
    const urlInp = document.getElementById('toyGlbUrlInput');
    if (!urlInp) return;
    slot.toyGlbUrl = urlInp.value.trim();
    clearTimeout(toyUrlTimer);
    if (slot.toyGlbUrl) {
        toyUrlTimer = setTimeout(() => loadToyGlbIntoSlot(slot, window.cleanDropbox ? window.cleanDropbox(slot.toyGlbUrl) : slot.toyGlbUrl), 400);
    }
};

window.syncToyOccluder = function() {
    const slot = window.getActiveTargetSlot();
    const toggle = document.getElementById('toyOccluderToggle');
    if (slot && toggle) slot.toyOccluder = toggle.checked;
};

window.syncFaceOccluder = function() {
    const slot = window.getActiveTargetSlot();
    const toggle = document.getElementById('faceOccluderToggle');
    if (slot && toggle) slot.faceOccluder = toggle.checked;
};

window.syncFaceAnchor = function() {
    const layer = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    if (!layer) return;
    const anchorId = document.getElementById('faceAnchorSelect').value;
    layer.faceAnchorId = anchorId;
    const coords = (window.FACE_ANCHOR_COORDS && window.FACE_ANCHOR_COORDS[anchorId]) ? window.FACE_ANCHOR_COORDS[anchorId] : [0, 0, 0];
    layer.pos = [...coords];
    if (window.applyTransformAndEffectsImmediate) window.applyTransformAndEffectsImmediate(layer);
    if (window.populateInspectorNumbers) window.populateInspectorNumbers(layer);
    if (window.showToast) window.showToast(`👤 Snapped "${layer.name}" to Face Anchor #${anchorId}`);
};

// Target Print Image Loader
window.applyTargetImageSource = function(srcUrl) {
    const slot = window.getActiveTargetSlot();
    if (!slot) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        slot.targetImageEl = img;
        slot.targetAspect = parseFloat((img.height / img.width).toFixed(4));
        if (window.targetMesh && window.targetMat) {
            const tex = new THREE.Texture(img);
            tex.encoding = THREE.sRGBEncoding;
            tex.needsUpdate = true;
            window.targetMesh.geometry.dispose();
            window.targetMesh.geometry = new THREE.PlaneGeometry(1, slot.targetAspect);
            window.targetMat.map = tex;
            window.targetMat.needsUpdate = true;
        }
        if (window.showToast) window.showToast('✅ Print Target Loaded on 3D Stage!');
    };
    img.src = srcUrl;
};

const tImgInp = document.getElementById('targetImgInput');
if (tImgInp) {
    tImgInp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) window.applyTargetImageSource(URL.createObjectURL(file));
    });
}

let targetUrlTimer = null;
window.loadTargetFromUrl = function() {
    const slot = window.getActiveTargetSlot();
    const urlInp = document.getElementById('targetImgUrlInput');
    if (!slot || !urlInp) return;
    clearTimeout(targetUrlTimer);
    slot.targetImageUrl = urlInp.value.trim();
    if (slot.targetImageUrl) {
        targetUrlTimer = setTimeout(() => window.applyTargetImageSource(window.cleanDropbox ? window.cleanDropbox(slot.targetImageUrl) : slot.targetImageUrl), 400);
    }
};

// Multi-Target & 3D Toy Auto-Turntable Compiler (.mind)
async function captureToyTurntableViews(slot) {
    const anglesDeg = [0, -35, 35, -70, 70];
    const capturedImages = [];

    const prevGrid = window.gridHelper ? window.gridHelper.visible : false;
    const prevGizmo = window.transformControl ? window.transformControl.visible : false;
    
    if (window.gridHelper) window.gridHelper.visible = false;
    if (window.transformControl) window.transformControl.visible = false;
    if (window.layers) window.layers.forEach(l => { if (l.mesh) l.mesh.visible = false; });

    const savedPos = window.camera.position.clone();
    const savedTarget = window.orbit.target.clone();

    for (const deg of anglesDeg) {
        const rad = THREE.MathUtils.degToRad(deg);
        window.camera.position.set(Math.sin(rad) * 1.35, 0, Math.cos(rad) * 1.35);
        window.camera.lookAt(0, 0, 0);
        window.renderer.render(window.scene, window.camera);

        const dataUrl = window.canvas.toDataURL('image/png');
        const img = await new Promise(res => {
            const im = new Image();
            im.onload = () => res(im);
            im.src = dataUrl;
        });
        capturedImages.push({ img, angleY: deg });
    }

    window.camera.position.copy(savedPos);
    window.orbit.target.copy(savedTarget);
    window.orbit.update();
    
    if (window.gridHelper) window.gridHelper.visible = prevGrid;
    if (window.transformControl) window.transformControl.visible = prevGizmo;
    if (window.layers) {
        window.layers.forEach(l => {
            if (l.mesh) l.mesh.visible = l.isMaskPlane ? l.showMaskGuide : true;
        });
    }

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
    window.projectState.targetIndexMap = [];

    for (let i = 0; i < window.projectState.targets.length; i++) {
        const t = window.projectState.targets[i];
        if (t.mode === 'image') {
            if (!t.targetImageEl) {
                alert(`Please load an image for "${t.name}" before compiling!`);
                window.switchTargetSlot(i);
                return;
            }
            window.projectState.targetIndexMap.push({ slotId: t.id, mode: 'image', angleY: 0, mindIndex: compileQueue.length });
            compileQueue.push(t.targetImageEl);
        } else if (t.mode === 'toy3d') {
            if (!t.toyMesh) {
                alert(`Please load a 3D Toy .glb scan for "${t.name}" before compiling!`);
                window.switchTargetSlot(i);
                return;
            }
            window.switchTargetSlot(i);
            if (statusTxt) {
                statusTxt.style.display = 'block';
                statusTxt.textContent = `Capturing 5 turntable angles for ${t.name}...`;
            }
            const views = await captureToyTurntableViews(t);
            views.forEach(v => {
                window.projectState.targetIndexMap.push({ slotId: t.id, mode: 'toy3d', angleY: v.angleY, mindIndex: compileQueue.length });
                compileQueue.push(v.img);
            });
        }
    }

    if (compileQueue.length === 0) {
        alert('Face AR targets do not require a .mind file! You can save project.json or export directly.');
        return;
    }

    try {
        if (btn) btn.disabled = true;
        if (progWrap) progWrap.style.display = 'block';
        if (statusTxt) statusTxt.style.display = 'block';
        const compiler = new window.MINDAR.IMAGE.Compiler();
        await compiler.compileImageTargets(compileQueue, (p) => {
            const pct = Math.round(p);
            if (progBar) progBar.style.width = pct + '%';
            if (statusTxt) statusTxt.textContent = `COMPILING ${compileQueue.length} TARGET VIEWS: ${pct}%`;
        });
        const buffer = await compiler.exportData();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
        a.download = 'targets.mind';
        a.click();
        if (statusTxt) statusTxt.textContent = '✅ targets.mind downloaded! Upload to cloud & paste link below.';
        if (window.showToast) window.showToast('🎉 Multi-Target targets.mind compiled!');
    } catch (err) {
        if (statusTxt) statusTxt.textContent = '❌ Error: ' + err.message;
    } finally {
        if (btn) btn.disabled = false;
    }
};