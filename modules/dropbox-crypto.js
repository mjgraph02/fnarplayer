// ============================================================================
// MODULE 05 // UNDO/REDO HISTORY, PROJECT.JSON SAVE/LOAD & CLIENT LINK EXPORT
// ============================================================================

let undoStack = [];
let undoPtr = -1;
let busyRestore = false;

window.saveHistoryState = function() {
    if (busyRestore) return;
    const snap = JSON.stringify(buildProjectPayload());
    if (undoPtr >= 0 && undoStack[undoPtr] === snap) return;
    undoStack = undoStack.slice(0, undoPtr + 1);
    undoStack.push(snap);
    if (undoStack.length > 40) undoStack.shift(); else undoPtr++;
    const uBtn = document.getElementById('btn-undo');
    const rBtn = document.getElementById('btn-redo');
    if (uBtn) uBtn.disabled = (undoPtr <= 0);
    if (rBtn) rBtn.disabled = (undoPtr >= undoStack.length - 1);
};

window.undo = function() {
    if (undoPtr > 0) {
        undoPtr--;
        applyProjectPayload(JSON.parse(undoStack[undoPtr]));
    }
};

window.redo = function() {
    if (undoPtr < undoStack.length - 1) {
        undoPtr++;
        applyProjectPayload(JSON.parse(undoStack[undoPtr]));
    }
};

function buildProjectPayload() {
    return {
        version: '7.2',
        mindUrl: projectState.mindUrl || document.getElementById('mindUrlInput').value.trim(),
        activeTargetIndex: projectState.activeTargetIndex,
        targetIndexMap: projectState.targetIndexMap || [],
        targets: projectState.targets.map(t => ({
            id: t.id,
            name: t.name,
            mode: t.mode,
            targetImageUrl: t.targetImageUrl,
            targetAspect: t.targetAspect,
            toyGlbUrl: t.toyGlbUrl,
            toyOccluder: t.toyOccluder,
            toyPnpPoints: t.toyPnpPoints || [],
            faceOccluder: t.faceOccluder,
            customDuration: parseFloat(document.getElementById('customDurationInput').value) || 5.0,
            layers: t.layers.map(l => ({
                id: l.id,
                name: l.name,
                isFolder: l.isFolder,
                isMaskPlane: l.isMaskPlane,
                showMaskGuide: l.showMaskGuide,
                parentId: l.parentId,
                faceAnchorId: l.faceAnchorId,
                type: l.type,
                url: l.url,
                pos: [...l.pos],
                scale: [...l.scale],
                rot: [...l.rot],
                opacity: l.opacity,
                clipSource: l.clipSource,
                chromaEnabled: l.chromaEnabled,
                color: l.color,
                similarity: l.similarity,
                smoothness: l.smoothness,
                animPreset: l.animPreset,
                animSpeed: l.animSpeed,
                animAmp: l.animAmp,
                keyframes: l.keyframes
            }))
        }))
    };
}

function applyProjectPayload(data) {
    busyRestore = true;
    transformControl.detach();
    layers.forEach(l => {
        if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
        if (l.videoEl) { l.videoEl.pause(); l.videoEl.remove(); }
    });

    projectState.mindUrl = data.mindUrl || '';
    document.getElementById('mindUrlInput').value = projectState.mindUrl;
    projectState.targetIndexMap = data.targetIndexMap || [];

    projectState.targets = (data.targets || []).map((tData, idx) => {
        const slot = createDefaultTargetSlot(tData.mode || 'image', idx);
        Object.assign(slot, tData);
        slot.layers = [];
        const savedLayers = tData.layers || [];
        savedLayers.filter(s => s.isFolder).forEach(s => slot.layers.push(createLayerObject(s)));
        savedLayers.filter(s => !s.isFolder).forEach(s => {
            const l = createLayerObject(s);
            if (l.parentId) {
                const pf = slot.layers.find(f => f.id === l.parentId);
                if (pf && pf.mesh) pf.mesh.add(l.mesh);
            }
            if (l.url && !l.isMaskPlane) applyMediaToLayer(l, cleanDropbox(l.url), l.url, true);
            slot.layers.push(l);
        });
        slot.layers.forEach(l => { if (l.mesh && l.mesh.parent === scene) scene.remove(l.mesh); });
        return slot;
    });

    switchTargetSlot(data.activeTargetIndex || 0);
    const uBtn = document.getElementById('btn-undo');
    const rBtn = document.getElementById('btn-redo');
    if (uBtn) uBtn.disabled = (undoPtr <= 0);
    if (rBtn) rBtn.disabled = (undoPtr >= undoStack.length - 1);
    busyRestore = false;
}

window.saveProjectJsonFile = function() {
    const jsonStr = JSON.stringify(buildProjectPayload(), null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }));
    link.download = 'project.json';
    link.click();
    showToast('💾 Downloaded project.json! Upload to client folder.');
};

window.loadProjectJsonFile = function() {
    document.getElementById('projectJsonInput').click();
};

window.handleProjectJsonUpload = function(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            applyProjectPayload(JSON.parse(e.target.result));
            saveHistoryState();
            showToast('📂 Loaded project.json into Studio!');
        } catch (err) {
            alert('Invalid project.json file');
        }
    };
    reader.readAsText(f);
};

window.exportProject = function() {
    const projUrl = document.getElementById('projectJsonUrlInput').value.trim();
    const base = window.location.origin + window.location.pathname.replace('creator.html', '');
    let finalLink = '';

    if (projUrl) {
        finalLink = `${base}?project=${encodeURIComponent(projUrl)}`;
    } else {
        const slot = getActiveTargetSlot();
        const mind = projectState.mindUrl || document.getElementById('mindUrlInput').value.trim();
        const mediaLayers = layers.filter(l => !l.isFolder && !l.isMaskPlane);

        const exportedMasks = layers.filter(l => l.isMaskPlane).map(m => {
            m.mesh.updateMatrixWorld(true);
            const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
            m.mesh.matrixWorld.decompose(wp, wq, ws);
            const we = new THREE.Euler().setFromQuaternion(wq);
            return {
                id: m.id,
                p: [+wp.x.toFixed(3), +wp.y.toFixed(3), +wp.z.toFixed(3)],
                s: [+ws.x.toFixed(3), +ws.y.toFixed(3), +ws.z.toFixed(3)],
                r: [+THREE.MathUtils.radToDeg(we.x).toFixed(1), +THREE.MathUtils.radToDeg(we.y).toFixed(1), +THREE.MathUtils.radToDeg(we.z).toFixed(1)]
            };
        });

        const exportedLayers = mediaLayers.map(l => {
            l.mesh.updateMatrixWorld(true);
            const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
            l.mesh.matrixWorld.decompose(wp, wq, ws);
            const we = new THREE.Euler().setFromQuaternion(wq);
            return {
                t: l.chromaEnabled ? 'chroma' : l.type,
                u: l.url,
                p: [+wp.x.toFixed(3), +wp.y.toFixed(3), +wp.z.toFixed(3)],
                s: [+ws.x.toFixed(3), +ws.y.toFixed(3), +ws.z.toFixed(3)],
                r: [+THREE.MathUtils.radToDeg(we.x).toFixed(1), +THREE.MathUtils.radToDeg(we.y).toFixed(1), +THREE.MathUtils.radToDeg(we.z).toFixed(1)],
                op: l.opacity ?? 1.0,
                cs: l.clipSource || 'none',
                c: l.color,
                sim: l.similarity,
                sm: l.smoothness,
                ap: l.animPreset || 'none',
                as: l.animSpeed ?? 1.0,
                aa: l.animAmp ?? 1.0,
                kf: l.keyframes || {}
            };
        });

        const sceneObj = {
            v: 7,
            m: mind,
            ta: slot ? slot.targetAspect : 1.0,
            dur: masterDuration,
            masks: exportedMasks,
            l: exportedLayers
        };
        const b64 = btoa(encodeURIComponent(JSON.stringify(sceneObj)));
        finalLink = `${base}?scene=${encodeURIComponent(b64)}`;
    }

    const box = document.getElementById('export-box');
    box.style.display = 'block';
    box.innerHTML = `<b>V7 CLIENT LINK:</b><br><a href="${finalLink}" target="_blank" style="color:var(--te-green);">${finalLink}</a>`;
    showToast('⚡ Permanent V7 Link Ready!');
};