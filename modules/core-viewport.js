// ============================================================================
// MODULE 01 // CORE THREE.JS VIEWPORT, GIZMOS, CAMERA & UNDO/REDO
// ============================================================================

export const StudioState = {
    layers: [],
    selectedIds: [],
    lastClickedId: null,
    activeTrackingMode: 'print', // 'print' | 'toy' | 'face'
    currentTargetAspect: 1.0,
    toyGlbUrl: '',
    toyFeatureCount: 0,
    masterTime: 0,
    masterDuration: 0,
    masterPlaying: true,
    autoKeyEnabled: false,
    historyStack: [],
    historyIndex: -1,
    isRestoringHistory: false,
    onSelectionChanged: null,
    onLayerMoved: null,
    onAutoKeyTransform: null,
    onRestoreSnapshot: null
};

export function getPrimarySelectedItem() {
    if (StudioState.selectedIds.length === 0) return null;
    return StudioState.layers.find(l => l.id === StudioState.selectedIds[StudioState.selectedIds.length - 1]) || null;
}

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// Initialize Three.js Scene, Camera, Renderer, Controls
const container = document.getElementById('viewport-container');
const canvas = document.getElementById('webgl-canvas');

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0c);

export const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
camera.position.set(0, -1.1, 1.5);

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
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

export const orbit = new THREE.OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.screenSpacePanning = true;

export const transformControl = new THREE.TransformControls(camera, renderer.domElement);
transformControl.setSize(0.85);
scene.add(transformControl);

transformControl.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
    if (!event.value) {
        if (StudioState.autoKeyEnabled && StudioState.onAutoKeyTransform) {
            StudioState.onAutoKeyTransform();
        }
        saveHistoryState();
    }
});

transformControl.addEventListener('change', () => {
    const activeItem = getPrimarySelectedItem();
    if (!activeItem || !activeItem.mesh) return;

    activeItem.pos = [
        parseFloat(activeItem.mesh.position.x.toFixed(3)),
        parseFloat(activeItem.mesh.position.y.toFixed(3)),
        parseFloat(activeItem.mesh.position.z.toFixed(3))
    ];
    activeItem.scale = [
        parseFloat(activeItem.mesh.scale.x.toFixed(3)),
        parseFloat(activeItem.mesh.scale.y.toFixed(3)),
        parseFloat(activeItem.mesh.scale.z.toFixed(3))
    ];
    activeItem.rot = [
        parseFloat(THREE.MathUtils.radToDeg(activeItem.mesh.rotation.x).toFixed(1)),
        parseFloat(THREE.MathUtils.radToDeg(activeItem.mesh.rotation.y).toFixed(1)),
        parseFloat(THREE.MathUtils.radToDeg(activeItem.mesh.rotation.z).toFixed(1))
    ];
    if (StudioState.onLayerMoved) StudioState.onLayerMoved(activeItem);
});

// Camera Smooth Lerp & Presets
let camAnim = null;

export function updateCameraAnimation() {
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
}

export function setGizmoMode(mode) {
    transformControl.setMode(mode);
    document.getElementById('gizmo-translate').classList.toggle('active', mode === 'translate');
    document.getElementById('gizmo-rotate').classList.toggle('active', mode === 'rotate');
    document.getElementById('gizmo-scale').classList.toggle('active', mode === 'scale');
}

export function setCameraPreset(preset) {
    camAnim = null;
    orbit.target.set(0, 0, 0);
    if (preset === 'front') { camera.position.set(0, 0, 1.6); camera.up.set(0, 1, 0); }
    else if (preset === 'perspective') { camera.position.set(0.8, -1.1, 1.2); camera.up.set(0, 1, 0); }
    else if (preset === 'side') { camera.position.set(1.6, 0, 0.15); camera.up.set(0, 1, 0); }
    else if (preset === 'top') { camera.position.set(0, -1.6, 0.2); camera.up.set(0, 0, 1); }
    orbit.update();
}

export function focusSelectedLayer() {
    const layer = getPrimarySelectedItem();
    if (!layer || !layer.mesh) {
        camAnim = {
            progress: 0, startPos: camera.position.clone(), startTarget: orbit.target.clone(),
            endTarget: new THREE.Vector3(0, 0, 0), endPos: new THREE.Vector3(0, -0.9, 1.4)
        };
        return;
    }
    const box = new THREE.Box3().setFromObject(layer.mesh);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center); box.getSize(size);
    const fitDistance = Math.max(size.x, size.y, size.z, 0.4) * 1.65;
    const dir = camera.position.clone().sub(orbit.target);
    if (dir.lengthSq() < 0.01) dir.set(0, -0.5, 1);
    dir.normalize();

    camAnim = {
        progress: 0, startPos: camera.position.clone(), startTarget: orbit.target.clone(),
        endTarget: center, endPos: center.clone().add(dir.multiplyScalar(fitDistance))
    };
    showToast(`🎯 Focused on "${layer.name}"`);
}

// Undo / Redo Snapshot Engine
export function saveHistoryState() {
    if (StudioState.isRestoringHistory) return;
    const snap = JSON.stringify({
        selectedIds: StudioState.selectedIds,
        layers: StudioState.layers.map(l => ({
            id: l.id, name: l.name, isFolder: l.isFolder, isMaskPlane: l.isMaskPlane,
            showMaskGuide: l.showMaskGuide, parentId: l.parentId, type: l.type, url: l.url,
            localBlobUrl: l.localBlobUrl || '', pos: [...l.pos], scale: [...l.scale], rot: [...l.rot],
            opacity: l.opacity, clipSource: l.clipSource, chromaEnabled: l.chromaEnabled,
            color: l.color, similarity: l.similarity, smoothness: l.smoothness,
            animPreset: l.animPreset, animSpeed: l.animSpeed, animAmp: l.animAmp,
            keyframes: l.keyframes
        }))
    });
    if (StudioState.historyIndex >= 0 && StudioState.historyStack[StudioState.historyIndex] === snap) return;
    StudioState.historyStack = StudioState.historyStack.slice(0, StudioState.historyIndex + 1);
    StudioState.historyStack.push(snap);
    if (StudioState.historyStack.length > 50) StudioState.historyStack.shift();
    else StudioState.historyIndex++;

    document.getElementById('btn-undo').disabled = (StudioState.historyIndex <= 0);
    document.getElementById('btn-redo').disabled = (StudioState.historyIndex >= StudioState.historyStack.length - 1);
}

export function undo() {
    if (StudioState.historyIndex <= 0) return;
    StudioState.historyIndex--;
    if (StudioState.onRestoreSnapshot) StudioState.onRestoreSnapshot(StudioState.historyStack[StudioState.historyIndex]);
    showToast('↩ Undo');
}

export function redo() {
    if (StudioState.historyIndex >= StudioState.historyStack.length - 1) return;
    StudioState.historyIndex++;
    if (StudioState.onRestoreSnapshot) StudioState.onRestoreSnapshot(StudioState.historyStack[StudioState.historyIndex]);
    showToast('↪ Redo');
}

// Spacebar Pan, Raycaster & Resize Listeners
let isSpacePressed = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let downPos = { x: 0, y: 0 };

export function initViewportEvents(handleLayerClickFn, groupSelectedFn) {
    window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT');

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelectedFn(); return; }

        if (isTyping) return;

        if (e.code === 'Space' && !isSpacePressed) {
            e.preventDefault();
            isSpacePressed = true;
            container.classList.add('space-pan');
            orbit.mouseButtons.LEFT = THREE.MOUSE.PAN;
            return;
        }

        const key = e.key.toLowerCase();
        if (key === 'w') setGizmoMode('translate');
        if (key === 'e') setGizmoMode('rotate');
        if (key === 'r') setGizmoMode('scale');
        if (key === 'f') { e.preventDefault(); focusSelectedLayer(); }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpacePressed = false;
            container.classList.remove('space-pan');
            orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        }
    });

    canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
        if (isSpacePressed || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const meshes = StudioState.layers.filter(l => !l.isFolder && l.mesh && l.mesh.visible).map(l => l.mesh);
        const intersects = raycaster.intersectObjects(meshes, true);

        if (intersects.length > 0) {
            let hitObj = intersects[0].object;
            while (hitObj.parent && !hitObj.userData.layerId) hitObj = hitObj.parent;
            if (hitObj.userData.layerId) handleLayerClickFn(hitObj.userData.layerId, e);
        }
    });

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}
