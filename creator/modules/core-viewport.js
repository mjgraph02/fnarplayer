// ============================================================================
// MODULE 01 // CORE THREE.JS VIEWPORT, STAGE REFERENCES & PROJECT STATE (V7.4.1 FIX)
// ============================================================================

window.container = document.getElementById('viewport-container');
window.canvas = document.getElementById('webgl-canvas');

window.scene = new THREE.Scene();
window.scene.background = new THREE.Color(0x0d0d0c);

window.camera = new THREE.PerspectiveCamera(45, window.container.clientWidth / window.container.clientHeight, 0.01, 100);
window.camera.position.set(0, -1.1, 1.5);

window.renderer = new THREE.WebGLRenderer({ canvas: window.canvas, antialias: true, preserveDrawingBuffer: true });
window.renderer.setSize(window.container.clientWidth, window.container.clientHeight);
window.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
window.renderer.outputEncoding = THREE.sRGBEncoding;
window.renderer.localClippingEnabled = true;

window.ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
window.scene.add(window.ambientLight);
window.dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
window.dirLight.position.set(2, 2, 4);
window.scene.add(window.dirLight);

window.gridHelper = new THREE.GridHelper(4, 40, 0x383632, 0x1e1d1a);
window.gridHelper.rotation.x = Math.PI / 2;
window.gridHelper.position.z = -0.005;
window.scene.add(window.gridHelper);

// Stage Reference Group (Swaps between Print Floor, 3D Toy .glb, and Face AR Mannequin)
window.stageReferenceGroup = new THREE.Group();
window.scene.add(window.stageReferenceGroup);

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

window.defaultTargetTex = new THREE.CanvasTexture(placeholderCanvas);
window.targetMat = new THREE.MeshBasicMaterial({ map: window.defaultTargetTex, side: THREE.DoubleSide });
window.targetMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), window.targetMat);
window.stageReferenceGroup.add(window.targetMesh);

// 1B. 3D Face AR Reference Head Mannequin (Built procedurally with Anchor Guide Dots!)
window.faceMannequinGroup = new THREE.Group();
window.faceMannequinGroup.visible = false;
(function buildFaceMannequin() {
    const headMat = new THREE.MeshStandardMaterial({ color: 0x383632, roughness: 0.6, metalness: 0.1 });
    const headGeo = new THREE.SphereGeometry(0.36, 32, 24);
    headGeo.scale(0.82, 1.08, 0.9);
    const headMesh = new THREE.Mesh(headGeo, headMat);
    window.faceMannequinGroup.add(headMesh);

    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), headMat);
    noseMesh.rotation.x = Math.PI / 2;
    noseMesh.position.set(0, 0.02, 0.34);
    window.faceMannequinGroup.add(noseMesh);

    const earGeo = new THREE.SphereGeometry(0.07, 16, 12);
    earGeo.scale(0.4, 1.0, 0.6);
    const leftEar = new THREE.Mesh(earGeo, headMat);
    leftEar.position.set(-0.31, 0, 0.02);
    const rightEar = new THREE.Mesh(earGeo, headMat);
    rightEar.position.set(0.31, 0, 0.02);
    window.faceMannequinGroup.add(leftEar, rightEar);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.35, 20), headMat);
    neckMesh.position.set(0, -0.42, -0.04);
    window.faceMannequinGroup.add(neckMesh);

    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const anchors = [
        [0, 0.08, 0.33],      // 168: Nose Bridge (Glasses)
        [0, 0.28, 0.28],      // 10: Forehead (Bindi / Hat)
        [-0.32, -0.05, 0.04], // 234: Left Ear
        [0.32, -0.05, 0.04],  // 454: Right Ear
        [0, -0.36, 0.14],     // 152: Chin / Neck
        [0, -0.04, 0.36]      // 1: Nose Tip / Mouth
    ];
    anchors.forEach(pos => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), dotMat);
        d.position.set(...pos);
        window.faceMannequinGroup.add(d);
    });
})();
window.stageReferenceGroup.add(window.faceMannequinGroup);

// 1C. 3D Toy Photogrammetry Target Holder
window.toyTargetHolder = new THREE.Group();
window.toyTargetHolder.visible = false;
window.stageReferenceGroup.add(window.toyTargetHolder);

// OrbitControls & TransformControls
window.orbit = new THREE.OrbitControls(window.camera, window.renderer.domElement);
window.orbit.enableDamping = true;
window.orbit.dampingFactor = 0.08;
window.orbit.screenSpacePanning = true;

window.transformControl = new THREE.TransformControls(window.camera, window.renderer.domElement);
window.transformControl.setSize(0.85);
window.transformControl.setTranslationSnap(0.05); 
window.transformControl.setRotationSnap(THREE.MathUtils.degToRad(5)); 
window.transformControl.setScaleSnap(0.05);
window.scene.add(window.transformControl);

// Shared Studio Project State
window.projectState = {
    projectName: 'Nizhali_Project_01',
    mindUrl: '',
    activeTargetIndex: 0,
    targetIndexMap: [],
    targets: []
};

window.layers = [];
window.selectedIds = [];
window.lastClickedId = null;
window.autoKeyEnabled = false;
window.masterTime = 0;
window.masterDuration = 0;
window.masterPlaying = true;
window.camAnim = null;
window.magneticSnapEnabled = true;

window.FACE_ANCHOR_COORDS = {
    '168': [0, 0.08, 0.33],
    '10':  [0, 0.28, 0.28],
    '234': [-0.32, -0.05, 0.04],
    '454': [0.32, -0.05, 0.04],
    '152': [0, -0.36, 0.14],
    '1':   [0, -0.04, 0.36]
};

window.cleanDropbox = function(u) {
    if (!u) return '';
    const d1 = ['www', 'dropbox', 'com'].join('.');
    const d2 = ['dl', 'dropboxusercontent', 'com'].join('.');
    return u.trim().replace(d1, d2).replace('dropbox.com', d2).replace(/[?&]dl=[01]/g, '');
};

window.showToast = function(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
};

window.getActiveTargetSlot = function() {
    return window.projectState.targets[window.projectState.activeTargetIndex];
};

window.getPrimarySelectedItem = function() {
    if (window.selectedIds.length === 0) return null;
    return window.layers.find(l => l.id === window.selectedIds[window.selectedIds.length - 1]) || null;
};

window.toggleMagneticSnap = function() {
    window.magneticSnapEnabled = !window.magneticSnapEnabled;
    const btn = document.getElementById('btn-snap-toggle');
    if (btn) btn.classList.toggle('active', window.magneticSnapEnabled);

    if (window.magneticSnapEnabled) {
        window.transformControl.setTranslationSnap(0.05);
        window.transformControl.setRotationSnap(THREE.MathUtils.degToRad(5));
        window.transformControl.setScaleSnap(0.05);
        window.showToast('🧲 Magnetic Snapping: ON');
    } else {
        window.transformControl.setTranslationSnap(null);
        window.transformControl.setRotationSnap(null);
        window.transformControl.setScaleSnap(null);
        window.showToast('🧲 Magnetic Snapping: OFF');
    }
};

// BOOT SEQUENCE: Wait for window load so functions from other files exist!
window.addEventListener('load', () => {
    if (window.addNewTargetSlot) window.addNewTargetSlot('image');
    if (window.animate) window.animate();
});
