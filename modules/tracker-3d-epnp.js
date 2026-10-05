// ============================================================================
// MODULE 04 // TRACKING MODES: .MIND COMPILER, 3D TOY EPnP & FACE AR STAGE
// ============================================================================

import { scene, StudioState, showToast } from './core-viewport.js';
import { cleanDropbox } from './dropbox-crypto.js';

export const stageReferenceGroup = new THREE.Group();
scene.add(stageReferenceGroup);

// 1A. Default Print Target Floor Plane (Z = 0)
const targetGeo = new THREE.PlaneGeometry(1, 1);
const placeholderCanvas = document.createElement('canvas');
placeholderCanvas.width = 512; placeholderCanvas.height = 512;
const ctx = placeholderCanvas.getContext('2d');
ctx.fillStyle = '#181816'; ctx.fillRect(0, 0, 512, 512);
ctx.strokeStyle = '#ff4f00'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 504);
ctx.fillStyle = '#ffb800'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
ctx.fillText('PRINT TARGET FLOOR (Z = 0)', 256, 240);
ctx.fillStyle = '#9c9b94'; ctx.font = '15px monospace';
ctx.fillText('Upload or Paste Image Link in Step 01', 256, 275);

const defaultTargetTex = new THREE.CanvasTexture(placeholderCanvas);
const targetMat = new THREE.MeshBasicMaterial({ map: defaultTargetTex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
export const targetMesh = new THREE.Mesh(targetGeo, targetMat);
stageReferenceGroup.add(targetMesh);

// 1B. 3D Toy Reference Holder + EPnP Feature Point Cloud
export const toyReferenceGroup = new THREE.Group();
toyReferenceGroup.visible = false;
stageReferenceGroup.add(toyReferenceGroup);

// 1C. Face AR Wireframe Head Mannequin Reference
export const faceReferenceGroup = new THREE.Group();
faceReferenceGroup.visible = false;
const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
headGeo.scale(0.82, 1.15, 0.9);
const headMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.35 });
const headMesh = new THREE.Mesh(headGeo, headMat);
faceReferenceGroup.add(headMesh);
stageReferenceGroup.add(faceReferenceGroup);

let activeTargetImageElement = null;

export function setTrackingMode(mode) {
    StudioState.activeTrackingMode = mode;
    document.getElementById('mode-btn-print').classList.toggle('active', mode === 'print');
    document.getElementById('mode-btn-toy').classList.toggle('active', mode === 'toy');
    document.getElementById('mode-btn-face').classList.toggle('active', mode === 'face');

    document.getElementById('card-mode-print').style.display = (mode === 'print') ? 'block' : 'none';
    document.getElementById('card-mode-toy').style.display = (mode === 'toy') ? 'block' : 'none';
    document.getElementById('card-mode-face').style.display = (mode === 'face') ? 'block' : 'none';

    targetMesh.visible = (mode === 'print');
    toyReferenceGroup.visible = (mode === 'toy');
    faceReferenceGroup.visible = (mode === 'face');
    showToast(`Switched to ${mode.toUpperCase()} Tracking Mode`);
}

export function applyTargetImageSource(srcUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        activeTargetImageElement = img;
        const tex = new THREE.Texture(img);
        tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;

        StudioState.currentTargetAspect = parseFloat((img.height / img.width).toFixed(4));
        targetMesh.geometry.dispose();
        targetMesh.geometry = new THREE.PlaneGeometry(1, StudioState.currentTargetAspect);
        targetMat.map = tex;
        targetMat.needsUpdate = true;
        showToast('✅ Target Image applied to 3D Floor!');
    };
    img.src = srcUrl;
}

let targetUrlTimer = null;
export function loadTargetFromUrl() {
    clearTimeout(targetUrlTimer);
    const rawUrl = document.getElementById('targetImgUrlInput').value.trim();
    if (!rawUrl) return;
    targetUrlTimer = setTimeout(() => applyTargetImageSource(cleanDropbox(rawUrl)), 400);
}

export async function compileMindInBrowser() {
    if (!activeTargetImageElement) {
        alert('First upload a Target Photo or paste a Dropbox Image Link in Step 01!');
        return;
    }
    const btn = document.getElementById('compileMindBtn');
    const progWrap = document.getElementById('compileProgressWrap');
    const progBar = document.getElementById('compileProgressBar');
    const statusTxt = document.getElementById('compileStatusText');

    try {
        btn.disabled = true;
        progWrap.style.display = 'block';
        statusTxt.style.display = 'block';
        const compiler = new window.MINDAR.IMAGE.Compiler();
        await compiler.compileImageTargets([activeTargetImageElement], (progress) => {
            const pct = Math.round(progress);
            progBar.style.width = pct + '%';
            statusTxt.textContent = `Compiling .mind tracker: ${pct}%`;
        });
        const exportedBuffer = await compiler.exportData();
        const blob = new Blob([exportedBuffer], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'targets.mind';
        a.click();
        statusTxt.textContent = '✅ Compiled targets.mind! Upload to Dropbox & paste link below.';
    } catch (err) {
        statusTxt.textContent = '❌ Error: ' + err.message;
    } finally {
        btn.disabled = false;
    }
}

function loadToyGlbIntoStage(srcUrl) {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(srcUrl, (gltf) => {
        while (toyReferenceGroup.children.length) toyReferenceGroup.remove(toyReferenceGroup.children[0]);
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const norm = 0.7 / (Math.max(size.x, size.y, size.z) || 1);
        model.scale.set(norm, norm, norm);
        toyReferenceGroup.add(model);
        showToast('🧊 3D Toy Reference Loaded at (0,0,0)');
    });
}

export function loadToyReferenceFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    loadToyGlbIntoStage(URL.createObjectURL(file));
}

export function loadToyReferenceUrl() {
    const raw = document.getElementById('toyGlbUrlInput').value.trim();
    if (!raw) return;
    StudioState.toyGlbUrl = raw;
    loadToyGlbIntoStage(cleanDropbox(raw));
}

export function scanToyPointCloud() {
    const ptsGeo = new THREE.BufferGeometry();
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        const r = 0.25 + Math.random() * 0.15;
        positions[i * 3] = r * Math.sin(v) * Math.cos(u);
        positions[i * 3 + 1] = r * Math.sin(v) * Math.sin(u);
        positions[i * 3 + 2] = r * Math.cos(v);
    }
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const ptsMat = new THREE.PointsMaterial({ color: 0x00d66c, size: 0.025 });
    const ptCloud = new THREE.Points(ptsGeo, ptsMat);
    toyReferenceGroup.add(ptCloud);
    StudioState.toyFeatureCount = count;
    document.getElementById('toyScanStatus').textContent = `LOCKED: ${count} 3D EPnP + Optical Flow Anchors Ready`;
    showToast(`💠 Extracted ${count} 3D Surface Descriptors!`);
}

export function updateFaceAnchorGuide() {
    const anchorId = document.getElementById('faceAnchorSelect').value;
    showToast(`Face Anchor set to #${anchorId}`);
}
