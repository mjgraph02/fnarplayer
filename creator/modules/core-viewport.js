// ============================================================================
// MODULE 01 // CORE THREE.JS VIEWPORT, STAGE REFERENCES & PROJECT STATE
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

    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), headMat);
    noseMesh.rotation.x = Math.PI / 2;
    noseMesh.position.set(0, 0.02, 0.34);
    faceMannequinGroup.add(noseMesh);

    const earGeo = new THREE.SphereGeometry(0.07, 16, 12);
    earGeo.scale(0.4, 1.0, 0.6);
    const leftEar = new THREE.Mesh(earGeo, headMat);
    leftEar.position.set(-0.31, 0, 0.02);
    const rightEar = new THREE.Mesh(earGeo, headMat);
    rightEar.position.set(0.31, 0, 0.02);
    faceMannequinGroup.add(leftEar, rightEar);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.35, 20), headMat);
    neckMesh.position.set(0, -0.42, -0.04);
    faceMannequinGroup.add(neckMesh);

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
        faceMannequinGroup.add(d);
    });
})();
stageReferenceGroup.add(faceMannequinGroup);

// 1C. 3D Toy Photogrammetry Target Holder
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
// V7.4: Initialize with Magnetic Snapping enabled by default
transformControl.setTranslationSnap(0.05); 
transformControl.setRotationSnap(THREE.MathUtils.degToRad(5)); 
transformControl.setScaleSnap(0.05);
scene.add(transformControl);

// Shared Studio Project State
let projectState = {
    projectName: 'Nizhali_Project_01',
    mindUrl: '',
    activeTargetIndex: 0,
    targetIndexMap: [],
    targets: []
};

let layers = [];
let selectedIds = [];
let lastClickedId = null;
let autoKeyEnabled = false;
let masterTime = 0;
let masterDuration = 0;
let masterPlaying = true;
let camAnim = null;
let magneticSnapEnabled = true;

const FACE_ANCHOR_COORDS = {
    '168': [0, 0.08, 0.33],
    '10':  [0, 0.28, 0.28],
    '234': [-0.32, -0.05, 0.04],
    '454': [0.32, -0.05, 0.04],
    '152': [0, -0.36, 0.14],
    '1':   [0, -0.04, 0.36]
};

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

function getActiveTargetSlot() {
    return projectState.targets[projectState.activeTargetIndex];
}

function getPrimarySelectedItem() {
    if (selectedIds.length === 0) return null;
    return layers.find(l => l.id === selectedIds[selectedIds.length - 1]) || null;
}

// V7.4: Magnetic Snapping Toggle Hook
window.toggleMagneticSnap = function() {
    magneticSnapEnabled = !magneticSnapEnabled;
    const btn = document.getElementById('btn-snap-toggle');
    if (btn) btn.classList.toggle('active', magneticSnapEnabled);

    if (magneticSnapEnabled) {
        transformControl.setTranslationSnap(0.05);
        transformControl.setRotationSnap(THREE.MathUtils.degToRad(5));
        transformControl.setScaleSnap(0.05);
        showToast('🧲 Magnetic Snapping: ON');
    } else {
        transformControl.setTranslationSnap(null);
        transformControl.setRotationSnap(null);
        transformControl.setScaleSnap(null);
        showToast('🧲 Magnetic Snapping: OFF');
    }
};
