// ============================================================================
// MODULE 05 // UNDO/REDO HISTORY, PROJECT.JSON SAVE/LOAD & MULTI-TARGET EXPORT (V7.4.2)
// ============================================================================

window.undoStack = [];
window.undoPtr = -1;
window.busyRestore = false;

window.saveHistoryState = function() {
    if (window.busyRestore) return;
    const snap = JSON.stringify(window.buildProjectPayload());
    if (window.undoPtr >= 0 && window.undoStack[window.undoPtr] === snap) return;
    window.undoStack = window.undoStack.slice(0, window.undoPtr + 1);
    window.undoStack.push(snap);
    if (window.undoStack.length > 40) window.undoStack.shift(); else window.undoPtr++;
    const uBtn = document.getElementById('btn-undo');
    const rBtn = document.getElementById('btn-redo');
    if (uBtn) uBtn.disabled = (window.undoPtr <= 0);
    if (rBtn) rBtn.disabled = (window.undoPtr >= window.undoStack.length - 1);
};

window.undo = function() {
    if (window.undoPtr > 0) {
        window.undoPtr--;
        window.applyProjectPayload(JSON.parse(window.undoStack[window.undoPtr]));
    }
};

window.redo = function() {
    if (window.undoPtr < window.undoStack.length - 1) {
        window.undoPtr++;
        window.applyProjectPayload(JSON.parse(window.undoStack[window.undoPtr]));
    }
};

window.buildProjectPayload = function() {
    return {
        version: '7.4', 
        mindUrl: window.projectState.mindUrl || document.getElementById('mindUrlInput')?.value.trim(),
        global: {
            autoLight: document.getElementById('globalAutoLight')?.checked ?? true,
            autoAudio: document.getElementById('globalAutoAudio')?.checked ?? false,
            lossBehavior: document.getElementById('globalLossBehavior')?.value ?? 'fade',
            lossHoldTime: parseFloat(document.getElementById('globalLossTime')?.value) || 0.35,
            maxTrack: parseInt(document.getElementById('globalMaxTrack')?.value) || 1
        },
        activeTargetIndex: window.projectState.activeTargetIndex,
        targetIndexMap: window.projectState.targetIndexMap || [],
        targets: window.projectState.targets.map(t => ({
            id: t.id,
            name: t.name,
            mode: t.mode,
            targetImageUrl: t.targetImageUrl,
            targetAspect: t.targetAspect,
            toyGlbUrl: t.toyGlbUrl,
            toyOccluder: t.toyOccluder,
            toyPnpPoints: t.toyPnpPoints || [],
            faceOccluder: t.faceOccluder,
            customDuration: parseFloat(document.getElementById('customDurationInput')?.value) || 5.0,
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
                keyframes: l.keyframes,
                playbackRule: l.playbackRule || 'loop',
                delay: l.delay || 0,
                blendMode: l.blendMode || 'normal'
            }))
        }))
    };
};

window.applyProjectPayload = function(data) {
    window.busyRestore = true;
    if (window.transformControl) window.transformControl.detach();
    if (window.layers) {
        window.layers.forEach(l => {
            if (l.mesh && l.mesh.parent) l.mesh.parent.remove(l.mesh);
            if (l.videoEl) { l.videoEl.pause(); l.videoEl.remove(); }
        });
    }

    window.projectState.mindUrl = data.mindUrl || '';
    const mindInp = document.getElementById('mindUrlInput');
    if (mindInp) mindInp.value = window.projectState.mindUrl;
    
    window.projectState.targetIndexMap = data.targetIndexMap || [];

    if (data.global) {
        const gLight = document.getElementById('globalAutoLight');
        if (gLight) gLight.checked = data.global.autoLight !== false;
        
        const gAudio = document.getElementById('globalAutoAudio');
        if (gAudio) gAudio.checked = !!data.global.autoAudio;
        
        const gLoss = document.getElementById('globalLossBehavior');
        if (gLoss) gLoss.value = data.global.lossBehavior || 'fade';
        
        const gLossTime = document.getElementById('globalLossTime');
        if (gLossTime) gLossTime.value = data.global.lossHoldTime ?? 0.35;
        
        const gMax = document.getElementById('globalMaxTrack');
        if (gMax) gMax.value = data.global.maxTrack || 1;
    }

    window.projectState.targets = (data.targets || []).map((tData, idx) => {
        const slot = window.createDefaultTargetSlot(tData.mode || 'image', idx);
        Object.assign(slot, tData);
        slot.layers = [];
        const savedLayers = tData.layers || [];
        savedLayers.filter(s => s.isFolder).forEach(s => slot.layers.push(window.createLayerObject(s)));
        savedLayers.filter(s => !s.isFolder).forEach(s => {
            const l = window.createLayerObject(s);
            if (l.parentId) {
                const pf = slot.layers.find(f => f.id === l.parentId);
                if (pf && pf.mesh) pf.mesh.add(l.mesh);
            }
            if (l.url && !l.isMaskPlane) window.applyMediaToLayer(l, window.cleanDropbox(l.url), l.url, true);
            slot.layers.push(l);
        });
        slot.layers.forEach(l => { if (l.mesh && l.mesh.parent === window.scene && window.scene) window.scene.remove(l.mesh); });
        return slot;
    });

    window.switchTargetSlot(data.activeTargetIndex || 0);
    const uBtn = document.getElementById('btn-undo');
    const rBtn = document.getElementById('btn-redo');
    if (uBtn) uBtn.disabled = (window.undoPtr <= 0);
    if (rBtn) rBtn.disabled = (window.undoPtr >= window.undoStack.length - 1);
    window.busyRestore = false;
};

window.saveProjectJsonFile = function() {
    const jsonStr = JSON.stringify(window.buildProjectPayload(), null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }));
    link.download = 'project.json';
    link.click();
    if (window.showToast) window.showToast('💾 Downloaded project.json! Upload to client folder.');
};

window.loadProjectJsonFile = function() {
    document.getElementById('projectJsonInput')?.click();
};

window.handleProjectJsonUpload = function(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            window.applyProjectPayload(JSON.parse(e.target.result));
            window.saveHistoryState();
            if (window.showToast) window.showToast('📂 Loaded project.json into Studio!');
        } catch (err) {
            alert('Invalid project.json file');
        }
    };
    reader.readAsText(f);
};

window.computeLayerExportTransform = function(l, slotLayers) {
    if (!l.parentId) {
        return {
            p: [+l.pos[0].toFixed(3), +l.pos[1].toFixed(3), +l.pos[2].toFixed(3)],
            s: [+l.scale[0].toFixed(3), +l.scale[1].toFixed(3), +l.scale[2].toFixed(3)],
            r: [+l.rot[0].toFixed(1), +l.rot[1].toFixed(1), +l.rot[2].toFixed(1)]
        };
    }
    const pf = slotLayers.find(f => f.id === l.parentId && f.isFolder);
    if (!pf) {
        return {
            p: [+l.pos[0].toFixed(3), +l.pos[1].toFixed(3), +l.pos[2].toFixed(3)],
            s: [+l.scale[0].toFixed(3), +l.scale[1].toFixed(3), +l.scale[2].toFixed(3)],
            r: [+l.rot[0].toFixed(1), +l.rot[1].toFixed(1), +l.rot[2].toFixed(1)]
        };
    }
    return {
        p: [+(pf.pos[0] + l.pos[0]).toFixed(3), +(pf.pos[1] + l.pos[1]).toFixed(3), +(pf.pos[2] + l.pos[2]).toFixed(3)],
        s: [+(pf.scale[0] * l.scale[0]).toFixed(3), +(pf.scale[1] * l.scale[1]).toFixed(3), +(pf.scale[2] * l.scale[2]).toFixed(3)],
        r: [+(pf.rot[0] + l.rot[0]).toFixed(1), +(pf.rot[1] + l.rot[1]).toFixed(1), +(pf.rot[2] + l.rot[2]).toFixed(1)]
    };
};

window.exportProject = function() {
    const projUrl = document.getElementById('projectJsonUrlInput')?.value.trim();
    const base = window.location.origin + window.location.pathname.replace('creator.html', '');
    let finalLink = '';

    if (projUrl) {
        finalLink = `${base}?project=${encodeURIComponent(projUrl)}`;
    } else {
        const mind = window.projectState.mindUrl || document.getElementById('mindUrlInput')?.value.trim();
        const customDur = parseFloat(document.getElementById('customDurationInput')?.value) || 5.0;

        const exportedTargets = window.projectState.targets.map((slot, tIdx) => {
            const slotLayers = slot.layers || [];
            const masks = slotLayers.filter(l => l.isMaskPlane).map(m => {
                const tr = window.computeLayerExportTransform(m, slotLayers);
                return { id: m.id, p: tr.p, s: tr.s, r: tr.r };
            });

            let slotMaxDur = 0;
            let slotHasAnim = false;
            slotLayers.forEach(l => {
                if (l.duration && l.duration > slotMaxDur) slotMaxDur = l.duration;
                if (l.animPreset && l.animPreset !== 'none') slotHasAnim = true;
                if (l.keyframes && Object.values(l.keyframes).some(arr => arr && arr.length > 0)) slotHasAnim = true;
            });
            const slotDur = slotMaxDur > 0 ? +slotMaxDur.toFixed(2) : (slotHasAnim ? customDur : 0);

            const mediaLayers = slotLayers.filter(l => !l.isFolder && !l.isMaskPlane).map(l => {
                const tr = window.computeLayerExportTransform(l, slotLayers);
                return {
                    t: l.chromaEnabled ? 'chroma' : l.type,
                    u: l.url,
                    p: tr.p,
                    s: tr.s,
                    r: tr.r,
                    op: l.opacity ?? 1.0,
                    cs: l.clipSource || 'none',
                    c: l.color,
                    sim: l.similarity,
                    sm: l.smoothness,
                    ap: l.animPreset || 'none',
                    as: l.animSpeed ?? 1.0,
                    aa: l.animAmp ?? 1.0,
                    kf: l.keyframes || {},
                    pr: l.playbackRule || 'loop',
                    dl: l.delay || 0,
                    bm: l.blendMode || 'normal'
                };
            });

            return {
                idx: tIdx,
                name: slot.name,
                mode: slot.mode || 'image',
                ta: slot.targetAspect || 1.0,
                dur: slotDur,
                masks: masks,
                l: mediaLayers
            };
        });

        const sceneObj = {
            v: 7.4,
            m: mind,
            g: {
                al: document.getElementById('globalAutoLight')?.checked ?? true,
                aa: document.getElementById('globalAutoAudio')?.checked ?? false,
                lb: document.getElementById('globalLossBehavior')?.value ?? 'fade',
                lh: parseFloat(document.getElementById('globalLossTime')?.value) || 0.35,
                mt: parseInt(document.getElementById('globalMaxTrack')?.value) || 1
            },
            targets: exportedTargets
        };
        const b64 = btoa(encodeURIComponent(JSON.stringify(sceneObj)));
        finalLink = `${base}?scene=${encodeURIComponent(b64)}`;
    }

    const box = document.getElementById('export-box');
    if (box) {
        box.style.display = 'block';
        box.innerHTML = `<b>V7.4 MULTI-TARGET LINK:</b><br><a href="${finalLink}" target="_blank" style="color:var(--te-green);">${finalLink}</a>`;
    }
    if (window.showToast) window.showToast(`⚡ Exported ${window.projectState.targets.length} Target(s) to V7.4 Link!`);
};
