// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 1 OF 2)
// ============================================================================

const container = document.getElementById('viewport-container');
const canvas = document.getElementById('webgl-canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0c);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
camera.position.set(0, -1.1, 1.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.localClippingEnabled = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight.position.set(2, 2, 4);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(4, 40, 0x383632, 0x1e1d1a);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.position.z = -0.005;
scene.add(gridHelper);

// Stage Reference Group (Swaps between Print Floor, 3D Toy .glb, and Face AR Mannequin)
const stageReferenceGroup = new THREE.Group();
scene.add(stageReferenceGroup);

// 1A. Default Print Target Plane
const placeholderCanvas = document.createElement('canvas');
placeholderCanvas.width = 512; placeholderCanvas.height = 512;
const pCtx = placeholderCanvas.getContext('2d');
pCtx.fillStyle = '#181816'; pCtx.fillRect(0, 0, 512, 512);
pCtx.strokeStyle = '#ff4f00'; pCtx.lineWidth = 10; pCtx.strokeRect(5, 5, 502, 502);
pCtx.fillStyle = '#ffb800'; pCtx.font = 'bold 24px monospace'; pCtx.textAlign = 'center';
pCtx.fillText('PRINT TARGET FLOOR [Z=0]', 256, 240);
pCtx.fillStyle = '#9c988e'; pCtx.font = '15px monospace';
pCtx.fillText('Upload or Paste Print Link in MOD-01', 256, 275);

const defaultTargetTex = new THREE.CanvasTexture(placeholderCanvas);
const targetMat = new THREE.MeshBasicMaterial({ map: defaultTargetTex, side: THREE.DoubleSide });
const targetMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), targetMat);
stageReferenceGroup.add(targetMesh);

// 1B. 3D Face AR Reference Head Mannequin (Built procedurally with Anchor Guide Dots!)
const faceMannequinGroup = new THREE.Group();
faceMannequinGroup.visible = false;
(function buildFaceMannequin() {
    const headMat = new THREE.MeshStandardMaterial({ color: 0x383632, roughness: 0.6, metalness: 0.1 });
    const headGeo = new THREE.SphereGeometry(0.36, 32, 24);
    headGeo.scale(0.82, 1.08, 0.9);
    const headMesh = new THREE.Mesh(headGeo, headMat);
    faceMannequinGroup.add(headMesh);

    // Nose Bridge & Tip
    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), headMat);
    noseMesh.rotation.x = Math.PI / 2;
    noseMesh.position.set(0, 0.02, 0.34);
    faceMannequinGroup.add(noseMesh);

    // Ears (Left & Right for Earring / Jhumka alignment)
    const earGeo = new THREE.SphereGeometry(0.07, 16, 12);
    earGeo.scale(0.4, 1.0, 0.6);
    const leftEar = new THREE.Mesh(earGeo, headMat);
    leftEar.position.set(-0.31, 0, 0.02);
    const rightEar = new THREE.Mesh(earGeo, headMat);
    rightEar.position.set(0.31, 0, 0.02);
    faceMannequinGroup.add(leftEar, rightEar);

    // Neck cylinder (for Necklaces)
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.35, 20), headMat);
    neckMesh.position.set(0, -0.42, -0.04);
    faceMannequinGroup.add(neckMesh);

    // Glowing Cyan Anchor Marker Dots
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const anchors = [
        [0, 0.08, 0.33],    // 168: Nose Bridge (Glasses)
        [0, 0.28, 0.28],    // 10: Forehead (Bindi / Hat)
        [-0.32, -0.05, 0.04], // 234: Left Ear
        [0.32, -0.05, 0.04],  // 454: Right Ear
        [0, -0.36, 0.14],   // 152: Chin / Neck
        [0, -0.04, 0.36]    // 1: Nose Tip / Mouth
    ];
    anchors.forEach(pos => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), dotMat);
        d.position.set(...pos);
        faceMannequinGroup.add(d);
    });
})();
stageReferenceGroup.add(faceMannequinGroup);

// 1C. 3D Toy Photogrammetry Target Holder (e.g., zoro_scan.glb)
const toyTargetHolder = new THREE.Group();
toyTargetHolder.visible = false;
stageReferenceGroup.add(toyTargetHolder);

// OrbitControls & TransformControls
const orbit = new THREE.OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.screenSpacePanning = true;

const transformControl = new THREE.TransformControls(camera, renderer.domElement);
transformControl.setSize(0.85);
scene.add(transformControl);

// ============================================================================
// 2. MULTI-TARGET PROJECT STATE MANAGEMENT (PRINT, 3D TOY .GLB, FACE AR)
// ============================================================================
let projectState = {
    projectName: 'Nizhali_Project_01',
    mindUrl: '',
    activeTargetIndex: 0,
    targets: []
};

let layers = [];       // Active pointer to current target's layers
let selectedIds = [];
let lastClickedId = null;
let autoKeyEnabled = false;
let masterTime = 0;
let masterDuration = 0;
let masterPlaying = true;

const FACE_ANCHOR_COORDS = {
    '168': [0, 0.08, 0.33],
    '10':  [0, 0.28, 0.28],
    '234': [-0.32, -0.05, 0.04],
    '454': [0.32, -0.05, 0.04],
    '152': [0, -0.36, 0.14],
    '1':   [0, -0.04, 0.36]
};

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
        toyPnpPoints: [], // Extracted 3D (X,Y,Z) surface feature coordinates for 3D Toy Tracking!
        faceOccluder: true,
        customDuration: 5.0,
        layers: []
    };
}

window.addNewTargetSlot = function(mode = 'image') {
    const newSlot = createDefaultTargetSlot(mode, projectState.targets.length);
    projectState.targets.push(newSlot);
    switchTargetSlot(projectState.targets.length - 1);
    saveHistoryState();
    showToast(`➕ Created Target Slot: ${newSlot.name} [${mode.toUpperCase()}]`);
};

window.switchTargetSlot = function(index) {
    if (index < 0 || index >= projectState.targets.length) return;

    // Detach gizmo & hide old target's layer meshes from scene
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

    // Re-attach current target's meshes to scene
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
    updateMasterDuration();
    updateSelectionState();
};

function getActiveTargetSlot() {
    return projectState.targets[projectState.activeTargetIndex];
}

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
            // Default placeholder pedestal until user loads zoro_scan.glb
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

// ============================================================================
// 3. 3D TOY (.GLB) LOADER, 3D PNP POINT SAMPLER & MULTI-ANGLE TURNTABLE COMPILER
// ============================================================================
function loadToyGlbIntoSlot(slot, srcUrl) {
    showToast('⏳ Loading 3D Toy Photogrammetry Scan (.glb)...');
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(srcUrl, (gltf) => {
        const model = gltf.scene;
        // Auto-center & normalize height to 1.0 unit at (0,0,0) so turntable & AR match 1:1!
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

        // Sample 3D PnP surface coordinates from the toy mesh geometry for 6DoF pose lock!
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
    applyTransformAndEffectsImmediate(layer);
    populateInspectorNumbers(layer);
    showToast(`👤 Snapped "${layer.name}" to Face Anchor #${anchorId}`);
};
// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 2)
// ============================================================================

function cleanDropbox(u) {
    if (!u) return '';
    const d1 = ['www', 'dropbox', 'com'].join('.');
    const d2 = ['dl', 'dropboxusercontent', 'com'].join('.');
    return u.trim().replace(d1, d2).replace('dropbox.com', d2).replace(/[?&]dl=[01]/g, '');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

// Target Print Image Loader (File or Cloud Link)
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

    // Hide grids, gizmos, and layers so we capture pure high-contrast toy views
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

// Universal 4-Plane 3D Clipping (Works at both +Z and -Z!)
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
// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 3A — LAYERS & KEYFRAMES)
// ============================================================================

function getPrimarySelectedItem() {
    if (selectedIds.length === 0) return null;
    return layers.find(l => l.id === selectedIds[selectedIds.length - 1]) || null;
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
        rot: [0, 0, 0]
    });
    layers.push(layer);
    selectSingleLayer(id);
    updateMasterDuration();
    saveHistoryState();
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
    selectSingleLayer(id);
    saveHistoryState();
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
            updateMasterDuration();
            refreshInspectorUI();
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
            updateMasterDuration();
            refreshInspectorUI();
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

            updateMasterDuration();
            if (selectedIds.includes(layer.id)) transformControl.attach(wrapper);
            refreshInspectorUI();
            if (!silent) showToast('🧊 3D .glb Mesh Loaded');
        });
    }
}
// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 3B — TIMELINE & INSPECTOR)
// ============================================================================

const ANIMATABLE_PARAMS = ['posX', 'posY', 'posZ', 'scaleX', 'scaleY', 'scaleZ', 'rotX', 'rotY', 'rotZ', 'opacity', 'animSpeed', 'animAmp', 'similarity', 'smoothness'];

window.updateMasterDuration = function() {
    let maxMediaDur = 0;
    let hasAnim = false;

    layers.forEach(l => {
        if (l.duration && l.duration > maxMediaDur) maxMediaDur = l.duration;
        if (l.animPreset && l.animPreset !== 'none') hasAnim = true;
        if (l.keyframes) {
            for (const k in l.keyframes) {
                if (l.keyframes[k] && l.keyframes[k].length > 0) hasAnim = true;
            }
        }
    });

    const customDur = parseFloat(document.getElementById('customDurationInput').value) || 5.0;
    const badge = document.getElementById('durationModeBadge');
    const scrubber = document.getElementById('masterTimelineScrubber');

    if (maxMediaDur > 0) {
        masterDuration = parseFloat(maxMediaDur.toFixed(2));
        badge.textContent = `VIDEO SYNC ${masterDuration}s`;
    } else if (hasAnim) {
        masterDuration = customDur;
        badge.textContent = `LOOP ${masterDuration}s`;
    } else {
        masterDuration = 0;
        badge.textContent = `STATIC 0s`;
    }
    scrubber.max = Math.max(masterDuration, customDur);
    renderKeyframeMarkers();
};

function getParamBaseValue(l, p) {
    if (p === 'posX') return l.pos[0];
    if (p === 'posY') return l.pos[1];
    if (p === 'posZ') return l.pos[2];
    if (p === 'scaleX') return l.scale[0];
    if (p === 'scaleY') return l.scale[1];
    if (p === 'scaleZ') return l.scale[2];
    if (p === 'rotX') return l.rot[0];
    if (p === 'rotY') return l.rot[1];
    if (p === 'rotZ') return l.rot[2];
    if (p === 'opacity') return l.opacity ?? 1.0;
    if (p === 'animSpeed') return l.animSpeed ?? 1.0;
    if (p === 'animAmp') return l.animAmp ?? 1.0;
    if (p === 'similarity') return l.similarity ?? 0.38;
    if (p === 'smoothness') return l.smoothness ?? 0.08;
    return 0;
}

function setParamBaseValue(l, p, v) {
    if (p === 'posX') l.pos[0] = v;
    else if (p === 'posY') l.pos[1] = v;
    else if (p === 'posZ') l.pos[2] = v;
    else if (p === 'scaleX') l.scale[0] = v;
    else if (p === 'scaleY') l.scale[1] = v;
    else if (p === 'scaleZ') l.scale[2] = v;
    else if (p === 'rotX') l.rot[0] = v;
    else if (p === 'rotY') l.rot[1] = v;
    else if (p === 'rotZ') l.rot[2] = v;
    else if (p === 'opacity') l.opacity = v;
    else if (p === 'animSpeed') l.animSpeed = v;
    else if (p === 'animAmp') l.animAmp = v;
    else if (p === 'similarity') l.similarity = v;
    else if (p === 'smoothness') l.smoothness = v;
}

function evaluateKeyframedParam(l, p, t) {
    const base = getParamBaseValue(l, p);
    const kfs = l.keyframes && l.keyframes[p];
    if (!kfs || kfs.length === 0) return base;
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
    return base;
}

window.toggleParamKeyframe = function(p) {
    const l = getPrimarySelectedItem();
    if (!l) return;
    if (!l.keyframes) l.keyframes = {};
    if (!l.keyframes[p]) l.keyframes[p] = [];
    const t = parseFloat(masterTime.toFixed(2));
    const v = getParamBaseValue(l, p);
    const idx = l.keyframes[p].findIndex(k => Math.abs(k.t - t) < 0.05);
    if (idx !== -1) l.keyframes[p][idx].v = v;
    else {
        l.keyframes[p].push({ t, v });
        l.keyframes[p].sort((a, b) => a.t - b.t);
    }
    updateMasterDuration();
    refreshKeyframeDiamonds();
    saveHistoryState();
    showToast(`◆ Keyframed ${p} @ ${t}s`);
};

window.addKeyframeForGroup = function(group) {
    const l = getPrimarySelectedItem();
    if (!l || group !== 'transform') return;
    ['posX', 'posY', 'posZ', 'scaleX', 'scaleY', 'scaleZ', 'rotX', 'rotY', 'rotZ'].forEach(p => {
        if (!l.keyframes) l.keyframes = {};
        if (!l.keyframes[p]) l.keyframes[p] = [];
        const t = parseFloat(masterTime.toFixed(2));
        const v = getParamBaseValue(l, p);
        const idx = l.keyframes[p].findIndex(k => Math.abs(k.t - t) < 0.05);
        if (idx !== -1) l.keyframes[p][idx].v = v;
        else {
            l.keyframes[p].push({ t, v });
            l.keyframes[p].sort((a, b) => a.t - b.t);
        }
    });
    updateMasterDuration();
    refreshKeyframeDiamonds();
    showToast(`◆ Keyframed Transform @ ${masterTime.toFixed(2)}s`);
};

window.toggleAutoKey = function() {
    autoKeyEnabled = !autoKeyEnabled;
    const btn = document.getElementById('autoKeyBtn');
    btn.textContent = autoKeyEnabled ? '🔴 AUTO-KEY: ON' : '🔴 AUTO-KEY: OFF';
    btn.style.background = autoKeyEnabled ? 'var(--te-red)' : '';
    btn.style.color = autoKeyEnabled ? '#fff' : '';
};

window.onParamEdit = function(p) {
    const l = getPrimarySelectedItem();
    if (!l) return;
    const map = {
        posX: 'posX', posY: 'posY', posZ: 'posZ',
        scaleX: 'scaleX', scaleY: 'scaleY', scaleZ: 'scaleZ',
        rotX: 'rotX', rotY: 'rotY', rotZ: 'rotZ',
        opacity: 'inpOpacity', animSpeed: 'animSpeed', animAmp: 'animAmp',
        similarity: 'chromaSim', smoothness: 'chromaSmooth'
    };
    const el = document.getElementById(map[p]);
    if (!el) return;
    const v = parseFloat(el.value) || 0;
    setParamBaseValue(l, p, v);

    if (p === 'opacity') document.getElementById('opacityVal').textContent = v.toFixed(2);
    if (p === 'animSpeed') document.getElementById('animSpeedVal').textContent = v;
    if (p === 'animAmp') document.getElementById('animAmpVal').textContent = v;
    if (p === 'similarity') document.getElementById('simVal').textContent = v;
    if (p === 'smoothness') document.getElementById('smoothVal').textContent = v;

    if (autoKeyEnabled || (l.keyframes && l.keyframes[p] && l.keyframes[p].length > 0)) {
        toggleParamKeyframe(p);
    }
    applyTransformAndEffectsImmediate(l);
    renderLayerList();
};

function renderKeyframeMarkers() {
    const track = document.getElementById('keyframeTrack');
    track.innerHTML = '';
    const l = getPrimarySelectedItem();
    if (!l || !l.keyframes) return;

    const maxT = Math.max(masterDuration, parseFloat(document.getElementById('customDurationInput').value) || 5.0);
    const times = new Map();
    for (const p in l.keyframes) {
        (l.keyframes[p] || []).forEach(kf => {
            const k = kf.t.toFixed(2);
            if (!times.has(k)) times.set(k, []);
            times.get(k).push(p);
        });
    }

    times.forEach((pList, tStr) => {
        const t = parseFloat(tStr);
        const m = document.createElement('div');
        m.className = 'kf-marker';
        m.style.left = Math.min(99, Math.max(1, (t / maxT) * 100)) + '%';
        m.title = `${tStr}s [${pList.join(', ')}]`;
        m.onclick = (e) => { e.stopPropagation(); scrubMasterTimeline(t); };
        m.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            pList.forEach(p => { l.keyframes[p] = l.keyframes[p].filter(k => Math.abs(k.t - t) > 0.05); });
            updateMasterDuration(); refreshKeyframeDiamonds(); saveHistoryState();
        };
        track.appendChild(m);
    });
}

function refreshKeyframeDiamonds() {
    const l = getPrimarySelectedItem();
    ANIMATABLE_PARAMS.forEach(p => {
        const btn = document.getElementById('kf-' + p);
        if (btn) btn.classList.toggle('has-kf', !!(l && l.keyframes && l.keyframes[p] && l.keyframes[p].length));
    });
    renderKeyframeMarkers();
}

window.toggleMasterPlay = function() {
    masterPlaying = !masterPlaying;
    document.getElementById('masterPlayBtn').textContent = masterPlaying ? '⏸ PAUSE' : '▶️ PLAY';
    layers.forEach(l => {
        if (l.videoEl) {
            if (masterPlaying) l.videoEl.play().catch(() => {});
            else l.videoEl.pause();
        }
    });
};

window.scrubMasterTimeline = function(val) {
    masterTime = parseFloat(val) || 0;
    masterPlaying = false;
    document.getElementById('masterPlayBtn').textContent = '▶️ PLAY';
    layers.forEach(l => {
        if (l.videoEl && l.duration > 0) { l.videoEl.pause(); l.videoEl.currentTime = masterTime % l.duration; }
        if (l.mixer && l.duration > 0) l.mixer.setTime(masterTime % l.duration);
    });
    evaluateSceneAtTime(masterTime, true);
};
// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 3C — LOOP & SELECTION)
// ============================================================================

const clock = new THREE.Clock();
let camAnim = null;

function evaluateSceneAtTime(t, updateUI = false) {
    layers.forEach(l => {
        if (!l.mesh) return;
        const dragging = (transformControl.dragging && selectedIds.includes(l.id));

        let px = evaluateKeyframedParam(l, 'posX', t);
        let py = evaluateKeyframedParam(l, 'posY', t);
        let pz = evaluateKeyframedParam(l, 'posZ', t);
        let sx = evaluateKeyframedParam(l, 'scaleX', t);
        let sy = evaluateKeyframedParam(l, 'scaleY', t);
        let sz = evaluateKeyframedParam(l, 'scaleZ', t);
        let rx = evaluateKeyframedParam(l, 'rotX', t);
        let ry = evaluateKeyframedParam(l, 'rotY', t);
        let rz = evaluateKeyframedParam(l, 'rotZ', t);
        let op = evaluateKeyframedParam(l, 'opacity', t);
        let spd = evaluateKeyframedParam(l, 'animSpeed', t);
        let amp = evaluateKeyframedParam(l, 'animAmp', t);
        let sim = evaluateKeyframedParam(l, 'similarity', t);
        let sm  = evaluateKeyframedParam(l, 'smoothness', t);

        if (!l.isFolder && !l.isMaskPlane && l.animPreset && l.animPreset !== 'none') {
            const ph = t * spd * 2.2;
            if (l.animPreset === 'float') pz += Math.sin(ph) * 0.06 * amp;
            else if (l.animPreset === 'spinY') ry = (ry + t * 60 * spd) % 360;
            else if (l.animPreset === 'spinZ') rz = (rz + t * 60 * spd) % 360;
            else if (l.animPreset === 'pulse') {
                const f = 1 + Math.sin(ph * 1.5) * 0.12 * amp;
                sx *= f; sy *= f; sz *= f;
            } else if (l.animPreset === 'wiggle') {
                rz += Math.sin(ph * 2.5) * 8 * amp;
                rx += Math.cos(ph * 2.0) * 5 * amp;
            } else if (l.animPreset === 'fadeIn') {
                const d = masterDuration > 0 ? masterDuration : 3.0;
                op *= Math.min(1, (t * spd) / (d * 0.4));
            } else if (l.animPreset === 'fadeOut') {
                const d = masterDuration > 0 ? masterDuration : 3.0;
                op *= Math.max(0, 1 - (t * spd) / d);
            }
        }

        if (!dragging) {
            l.mesh.position.set(px, py, pz);
            l.mesh.scale.set(sx, sy, sz);
            l.mesh.rotation.set(
                THREE.MathUtils.degToRad(rx),
                THREE.MathUtils.degToRad(ry),
                THREE.MathUtils.degToRad(rz)
            );
        }

        if (!l.isFolder && !l.isMaskPlane) {
            if (l.mesh.material && l.mesh.material.uniforms) {
                l.mesh.material.uniforms.similarity.value = sim;
                l.mesh.material.uniforms.smoothness.value = sm;
            }
            updateLayerClippingAndOpacity(l, op);
        }

        if (updateUI && getPrimarySelectedItem()?.id === l.id) {
            document.getElementById('posX').value = parseFloat(px.toFixed(3));
            document.getElementById('posY').value = parseFloat(py.toFixed(3));
            document.getElementById('posZ').value = parseFloat(pz.toFixed(3));
            document.getElementById('scaleX').value = parseFloat(sx.toFixed(3));
            document.getElementById('scaleY').value = parseFloat(sy.toFixed(3));
            document.getElementById('scaleZ').value = parseFloat(sz.toFixed(3));
            document.getElementById('rotX').value = parseFloat(rx.toFixed(1));
            document.getElementById('rotY').value = parseFloat(ry.toFixed(1));
            document.getElementById('rotZ').value = parseFloat(rz.toFixed(1));
            document.getElementById('inpOpacity').value = op;
            document.getElementById('opacityVal').textContent = op.toFixed(2);
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (masterPlaying && masterDuration > 0) {
        masterTime = (masterTime + delta) % masterDuration;
        const scrubber = document.getElementById('masterTimelineScrubber');
        if (document.activeElement !== scrubber) scrubber.value = masterTime;
    }

    layers.forEach(l => { if (l.mixer && masterPlaying) l.mixer.update(delta); });
    evaluateSceneAtTime(masterTime, false);

    const disp = document.getElementById('masterTimeDisplay');
    disp.textContent = masterDuration > 0
        ? `${masterTime.toFixed(2)}s / ${masterDuration.toFixed(2)}s`
        : `00.00s / 00.00s [STATIC]`;

    if (camAnim) {
        camAnim.progress += 0.12;
        if (camAnim.progress >= 1) {
            camera.position.copy(camAnim.endPos);
            orbit.target.copy(camAnim.endTarget);
            camAnim = null;
        } else {
            camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, camAnim.progress);
            orbit.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, camAnim.progress);
        }
    }

    orbit.update();
    renderer.render(scene, camera);
}

// Multi-Select & Folder Grouping
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
    saveHistoryState();
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
    saveHistoryState();
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
// ============================================================================
// NIZHALI V6 // MODULAR 3D WORKSTATION ENGINE (PART 3D — UI SYNC & SHORTCUTS)
// ============================================================================

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

function refreshInspectorUI() {
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

        const clipSel = document.getElementById('clipSourceSelect');
        let opts = '<option value="none">None (Unclipped)</option><option value="target">🕳️ Target Frame Bounds</option>';
        layers.filter(m => m.isMaskPlane).forEach(mp => {
            opts += `<option value="${mp.id}">✂️ ${mp.name}</option>`;
        });
        clipSel.innerHTML = opts;
        clipSel.value = l.clipSource || 'none';

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
    }

    populateInspectorNumbers(l);
}

function populateInspectorNumbers(l) {
    document.getElementById('posX').value = l.pos[0];
    document.getElementById('posY').value = l.pos[1];
    document.getElementById('posZ').value = l.pos[2];
    document.getElementById('scaleX').value = l.scale[0];
    document.getElementById('scaleY').value = l.scale[1];
    document.getElementById('scaleZ').value = l.scale[2];
    document.getElementById('rotX').value = l.rot[0];
    document.getElementById('rotY').value = l.rot[1];
    document.getElementById('rotZ').value = l.rot[2];
}

window.syncUIFromInspector = function() {
    const l = getPrimarySelectedItem();
    if (!l) return;
    l.name = document.getElementById('inpName').value;
    renderLayerList();
};

function applyTransformAndEffectsImmediate(l) {
    if (!l || !l.mesh) return;
    l.mesh.position.set(...l.pos);
    l.mesh.scale.set(...l.scale);
    l.mesh.rotation.set(
        THREE.MathUtils.degToRad(l.rot[0]),
        THREE.MathUtils.degToRad(l.rot[1]),
        THREE.MathUtils.degToRad(l.rot[2])
    );
    updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
}

window.syncEffectsFromInputs = function() {
    const l = getPrimarySelectedItem();
    if (!l || l.isFolder || l.isMaskPlane) return;

    l.clipSource = document.getElementById('clipSourceSelect').value;
    l.animPreset = document.getElementById('animPreset').value;
    document.getElementById('animParamsBox').style.display = (l.animPreset !== 'none') ? 'block' : 'none';

    l.chromaEnabled = document.getElementById('chromaToggle').checked;
    document.getElementById('chromaParamsBox').style.display = l.chromaEnabled ? 'block' : 'none';
    l.color = document.getElementById('chromaColor').value;

    if (l.mesh && l.mesh.material && l.mesh.material.uniforms) {
        l.mesh.material.uniforms.enableChroma.value = l.chromaEnabled ? 1.0 : 0.0;
        l.mesh.material.uniforms.color.value.set(l.color);
    }
    updateLayerClippingAndOpacity(l, l.opacity ?? 1.0);
    renderLayerList();
};

window.handleLocalFile = function(e) {
    const file = e.target.files[0];
    const l = getPrimarySelectedItem();
    if (!file || !l) return;
    l.localBlobUrl = URL.createObjectURL(file);
    applyMediaToLayer(l, l.localBlobUrl, file.name);
    saveHistoryState();
};

let urlFetchTimer = null;
window.handleDropboxUrl = function() {
    const l = getPrimarySelectedItem();
    if (!l) return;
    l.url = document.getElementById('inpUrl').value.trim();
    clearTimeout(urlFetchTimer);
    if (l.url) {
        urlFetchTimer = setTimeout(() => {
            applyMediaToLayer(l, cleanDropbox(l.url), l.url);
            saveHistoryState();
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
    updateMasterDuration();
    updateSelectionState();
    saveHistoryState();
};

function renderLayerList() {
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
}

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
        focusSelectedLayer();
    };

    rightGroup.appendChild(zBadge);
    rightGroup.appendChild(findBtn);
    item.appendChild(titleSpan);
    item.appendChild(rightGroup);
    item.onclick = (e) => handleLayerClick(l.id, e);
    containerEl.appendChild(item);
}
