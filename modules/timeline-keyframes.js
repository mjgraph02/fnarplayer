// ============================================================================
// MODULE 03 // MASTER TIMELINE, KEYFRAME DIAMONDS & HERMITE INTERPOLATION
// ============================================================================

import { StudioState, getPrimarySelectedItem, transformControl, saveHistoryState, showToast } from './core-viewport.js';
import { updateLayerClippingAndOpacity } from './portal-clipping.js';

export const ANIMATABLE_PARAMS = [
    'posX', 'posY', 'posZ', 'scaleX', 'scaleY', 'scaleZ',
    'rotX', 'rotY', 'rotZ', 'opacity', 'animSpeed', 'animAmp', 'similarity', 'smoothness'
];

export function updateMasterDuration() {
    let maxMediaDur = 0;
    let hasAnyAnimationOrKeyframes = false;

    StudioState.layers.forEach(l => {
        if (l.duration && l.duration > maxMediaDur) maxMediaDur = l.duration;
        if (l.animPreset && l.animPreset !== 'none') hasAnyAnimationOrKeyframes = true;
        if (l.keyframes) {
            for (const k in l.keyframes) {
                if (l.keyframes[k] && l.keyframes[k].length > 0) hasAnyAnimationOrKeyframes = true;
            }
        }
    });

    const customDur = parseFloat(document.getElementById('customDurationInput').value) || 5.0;
    const modeBadge = document.getElementById('durationModeBadge');
    const scrubber = document.getElementById('masterTimelineScrubber');

    if (maxMediaDur > 0) {
        StudioState.masterDuration = parseFloat(maxMediaDur.toFixed(2));
        modeBadge.textContent = `Mode: Synced to Video (${StudioState.masterDuration}s)`;
        modeBadge.style.color = '#00d66c';
    } else if (hasAnyAnimationOrKeyframes) {
        StudioState.masterDuration = customDur;
        modeBadge.textContent = `Mode: Custom Loop (${StudioState.masterDuration}s)`;
        modeBadge.style.color = '#ffb800';
    } else {
        StudioState.masterDuration = 0;
        modeBadge.textContent = `Mode: Static Scene (0s)`;
        modeBadge.style.color = '#9c9b94';
    }

    scrubber.max = Math.max(StudioState.masterDuration, customDur);
    renderKeyframeMarkers();
}

export function getParamBaseValue(layer, param) {
    if (param === 'posX') return layer.pos[0];
    if (param === 'posY') return layer.pos[1];
    if (param === 'posZ') return layer.pos[2];
    if (param === 'scaleX') return layer.scale[0];
    if (param === 'scaleY') return layer.scale[1];
    if (param === 'scaleZ') return layer.scale[2];
    if (param === 'rotX') return layer.rot[0];
    if (param === 'rotY') return layer.rot[1];
    if (param === 'rotZ') return layer.rot[2];
    if (param === 'opacity') return layer.opacity ?? 1.0;
    if (param === 'animSpeed') return layer.animSpeed ?? 1.0;
    if (param === 'animAmp') return layer.animAmp ?? 1.0;
    if (param === 'similarity') return layer.similarity ?? 0.38;
    if (param === 'smoothness') return layer.smoothness ?? 0.08;
    return 0;
}

export function setParamBaseValue(layer, param, val) {
    if (param === 'posX') layer.pos[0] = val;
    else if (param === 'posY') layer.pos[1] = val;
    else if (param === 'posZ') layer.pos[2] = val;
    else if (param === 'scaleX') layer.scale[0] = val;
    else if (param === 'scaleY') layer.scale[1] = val;
    else if (param === 'scaleZ') layer.scale[2] = val;
    else if (param === 'rotX') layer.rot[0] = val;
    else if (param === 'rotY') layer.rot[1] = val;
    else if (param === 'rotZ') layer.rot[2] = val;
    else if (param === 'opacity') layer.opacity = val;
    else if (param === 'animSpeed') layer.animSpeed = val;
    else if (param === 'animAmp') layer.animAmp = val;
    else if (param === 'similarity') layer.similarity = val;
    else if (param === 'smoothness') layer.smoothness = val;
}

export function evaluateKeyframedParam(layer, param, t) {
    const baseVal = getParamBaseValue(layer, param);
    if (!layer.keyframes || !layer.keyframes[param] || layer.keyframes[param].length === 0) return baseVal;
    const kfs = layer.keyframes[param];
    if (kfs.length === 1 || t <= kfs[0].t) return kfs[0].v;
    if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;

    for (let i = 0; i < kfs.length - 1; i++) {
        if (t >= kfs[i].t && t <= kfs[i + 1].t) {
            const span = kfs[i + 1].t - kfs[i].t;
            const ratio = span > 0.0001 ? (t - kfs[i].t) / span : 0;
            const smoothRatio = ratio * ratio * (3 - 2 * ratio);
            return kfs[i].v + (kfs[i + 1].v - kfs[i].v) * smoothRatio;
        }
    }
    return baseVal;
}

export function toggleParamKeyframe(param) {
    const layer = getPrimarySelectedItem();
    if (!layer) return;
    if (!layer.keyframes) layer.keyframes = {};
    if (!layer.keyframes[param]) layer.keyframes[param] = [];

    const t = parseFloat(StudioState.masterTime.toFixed(2));
    const val = getParamBaseValue(layer, param);

    const existingIdx = layer.keyframes[param].findIndex(k => Math.abs(k.t - t) < 0.05);
    if (existingIdx !== -1) {
        layer.keyframes[param][existingIdx].v = val;
        showToast(`◆ Updated ${param} keyframe at ${t}s`);
    } else {
        layer.keyframes[param].push({ t, v: val });
        layer.keyframes[param].sort((a, b) => a.t - b.t);
        showToast(`◆ Added ${param} keyframe at ${t}s`);
    }

    updateMasterDuration();
    refreshKeyframeDiamonds();
    saveHistoryState();
}

export function addKeyframeForGroup(group) {
    const layer = getPrimarySelectedItem();
    if (!layer) return;
    if (group === 'transform') {
        ['posX', 'posY', 'posZ', 'scaleX', 'scaleY', 'scaleZ', 'rotX', 'rotY', 'rotZ'].forEach(p => {
            if (!layer.keyframes) layer.keyframes = {};
            if (!layer.keyframes[p]) layer.keyframes[p] = [];
            const t = parseFloat(StudioState.masterTime.toFixed(2));
            const val = getParamBaseValue(layer, p);
            const idx = layer.keyframes[p].findIndex(k => Math.abs(k.t - t) < 0.05);
            if (idx !== -1) layer.keyframes[p][idx].v = val;
            else {
                layer.keyframes[p].push({ t, v: val });
                layer.keyframes[p].sort((a, b) => a.t - b.t);
            }
        });
        updateMasterDuration();
        refreshKeyframeDiamonds();
        showToast(`◆ Keyframed Transform at ${StudioState.masterTime.toFixed(2)}s`);
    }
}

export function toggleAutoKey() {
    StudioState.autoKeyEnabled = !StudioState.autoKeyEnabled;
    const btn = document.getElementById('autoKeyBtn');
    btn.textContent = StudioState.autoKeyEnabled ? '🔴 Auto-Key: ON' : '🔴 Auto-Key: OFF';
    btn.classList.toggle('autokey-on', StudioState.autoKeyEnabled);
}

export function renderKeyframeMarkers() {
    const track = document.getElementById('keyframeTrack');
    if (!track) return;
    track.innerHTML = '';
    const layer = getPrimarySelectedItem();
    if (!layer || !layer.keyframes) return;

    const maxT = Math.max(StudioState.masterDuration, parseFloat(document.getElementById('customDurationInput').value) || 5.0);
    const allTimes = new Map();

    for (const param in layer.keyframes) {
        (layer.keyframes[param] || []).forEach(kf => {
            const key = kf.t.toFixed(2);
            if (!allTimes.has(key)) allTimes.set(key, []);
            allTimes.get(key).push(param);
        });
    }

    allTimes.forEach((paramsList, timeStr) => {
        const t = parseFloat(timeStr);
        const pct = Math.min(99, Math.max(1, (t / maxT) * 100));
        const marker = document.createElement('div');
        marker.className = 'kf-marker';
        marker.style.left = pct + '%';
        marker.title = `${timeStr}s (${paramsList.join(', ')}) — Click to jump, Right-Click to delete`;

        marker.onclick = (e) => {
            e.stopPropagation();
            scrubMasterTimeline(t);
        };
        marker.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            for (const p of paramsList) {
                layer.keyframes[p] = layer.keyframes[p].filter(k => Math.abs(k.t - t) > 0.05);
            }
            updateMasterDuration();
            refreshKeyframeDiamonds();
            saveHistoryState();
            showToast(`🗑️ Deleted keyframe at ${timeStr}s`);
        };
        track.appendChild(marker);
    });
}

export function refreshKeyframeDiamonds() {
    const layer = getPrimarySelectedItem();
    ANIMATABLE_PARAMS.forEach(p => {
        const btn = document.getElementById('kf-' + p);
        if (!btn) return;
        const has = layer && layer.keyframes && layer.keyframes[p] && layer.keyframes[p].length > 0;
        btn.classList.toggle('has-kf', !!has);
    });
    renderKeyframeMarkers();
}

export function toggleMasterPlay() {
    StudioState.masterPlaying = !StudioState.masterPlaying;
    document.getElementById('masterPlayBtn').textContent = StudioState.masterPlaying ? '⏸ Pause' : '▶️ Play';
    StudioState.layers.forEach(l => {
        if (l.videoEl) {
            if (StudioState.masterPlaying) l.videoEl.play().catch(() => {});
            else l.videoEl.pause();
        }
    });
}

export function scrubMasterTimeline(val) {
    StudioState.masterTime = parseFloat(val) || 0;
    StudioState.masterPlaying = false;
    document.getElementById('masterPlayBtn').textContent = '▶️ Play';

    StudioState.layers.forEach(l => {
        if (l.videoEl && l.duration > 0) {
            l.videoEl.pause();
            l.videoEl.currentTime = StudioState.masterTime % l.duration;
        }
        if (l.mixer && l.activeAction && l.duration > 0) {
            l.mixer.setTime(StudioState.masterTime % l.duration);
        }
    });

    evaluateSceneAtTime(StudioState.masterTime, true);
}

export function evaluateSceneAtTime(t, updateUIInputs = false) {
    StudioState.layers.forEach(l => {
        if (!l.mesh) return;
        const isBeingDragged = (transformControl.dragging && StudioState.selectedIds.includes(l.id));

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
            const phase = t * spd * 2.2;
            if (l.animPreset === 'float') pz += Math.sin(phase) * 0.06 * amp;
            else if (l.animPreset === 'spinY') ry = (ry + t * 60 * spd) % 360;
            else if (l.animPreset === 'spinZ') rz = (rz + t * 60 * spd) % 360;
            else if (l.animPreset === 'pulse') {
                const f = 1 + Math.sin(phase * 1.5) * 0.12 * amp;
                sx *= f; sy *= f; sz *= f;
            } else if (l.animPreset === 'wiggle') {
                rz += Math.sin(phase * 2.5) * 8 * amp;
                rx += Math.cos(phase * 2.0) * 5 * amp;
            } else if (l.animPreset === 'fadeIn') {
                const dur = StudioState.masterDuration > 0 ? StudioState.masterDuration : 3.0;
                op *= Math.min(1, (t * spd) / (dur * 0.4));
            } else if (l.animPreset === 'fadeOut') {
                const dur = StudioState.masterDuration > 0 ? StudioState.masterDuration : 3.0;
                op *= Math.max(0, 1 - (t * spd) / dur);
            }
        }

        if (!isBeingDragged) {
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

        if (updateUIInputs && getPrimarySelectedItem()?.id === l.id) {
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
