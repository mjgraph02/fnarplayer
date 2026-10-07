// ============================================================================
// MODULE 04 // KEYFRAME AUTOMATION, TIMELINE SCRUBBER & RENDER LOOP (V7.4)
// ============================================================================

const ANIMATABLE_PARAMS = [
    'posX', 'posY', 'posZ',
    'scaleX', 'scaleY', 'scaleZ',
    'rotX', 'rotY', 'rotZ',
    'opacity', 'animSpeed', 'animAmp',
    'similarity', 'smoothness'
];

window.updateMasterDuration = function() {
    let maxMediaDur = 0;
    let hasAnim = false;

    window.layers.forEach(l => {
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
        window.masterDuration = parseFloat(maxMediaDur.toFixed(2));
        badge.textContent = `VIDEO SYNC ${window.masterDuration}s`;
    } else if (hasAnim) {
        window.masterDuration = customDur;
        badge.textContent = `LOOP ${window.masterDuration}s`;
    } else {
        window.masterDuration = 0;
        badge.textContent = `STATIC 0s`;
    }
    scrubber.max = Math.max(window.masterDuration, customDur);
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

window.setParamBaseValue = function(l, p, v) {
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
};

// V7.4: Dynamic Easing Calculator
function getEasingFactor(r) {
    const easeType = document.getElementById('keyframeEasingSelect')?.value || 'ease';
    if (easeType === 'linear') return r;
    if (easeType === 'easeIn') return r * r;
    if (easeType === 'easeOut') return r * (2 - r);
    return r * r * (3 - 2 * r); // Default 'ease' (Smoothstep)
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
            const sr = getEasingFactor(r); // Applied V7.4 Easing
            return kfs[i].v + (kfs[i + 1].v - kfs[i].v) * sr;
        }
    }
    return base;
}

window.toggleParamKeyframe = function(p) {
    const l = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    if (!l) return;
    if (!l.keyframes) l.keyframes = {};
    if (!l.keyframes[p]) l.keyframes[p] = [];
    const t = parseFloat(window.masterTime.toFixed(2));
    const v = getParamBaseValue(l, p);
    const idx = l.keyframes[p].findIndex(k => Math.abs(k.t - t) < 0.05);
    if (idx !== -1) l.keyframes[p][idx].v = v;
    else {
        l.keyframes[p].push({ t, v });
        l.keyframes[p].sort((a, b) => a.t - b.t);
    }
    window.updateMasterDuration();
    if (window.refreshKeyframeDiamonds) window.refreshKeyframeDiamonds();
    if (window.saveHistoryState) window.saveHistoryState();
    if (window.showToast) window.showToast(`◆ Keyframed ${p} @ ${t}s`);
};

window.addKeyframeForGroup = function(group) {
    const l = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    if (!l || group !== 'transform') return;
    ['posX', 'posY', 'posZ', 'scaleX', 'scaleY', 'scaleZ', 'rotX', 'rotY', 'rotZ'].forEach(p => {
        if (!l.keyframes) l.keyframes = {};
        if (!l.keyframes[p]) l.keyframes[p] = [];
        const t = parseFloat(window.masterTime.toFixed(2));
        const v = getParamBaseValue(l, p);
        const idx = l.keyframes[p].findIndex(k => Math.abs(k.t - t) < 0.05);
        if (idx !== -1) l.keyframes[p][idx].v = v;
        else {
            l.keyframes[p].push({ t, v });
            l.keyframes[p].sort((a, b) => a.t - b.t);
        }
    });
    window.updateMasterDuration();
    if (window.refreshKeyframeDiamonds) window.refreshKeyframeDiamonds();
    if (window.showToast) window.showToast(`◆ Keyframed Transform @ ${window.masterTime.toFixed(2)}s`);
};

window.toggleAutoKey = function() {
    window.autoKeyEnabled = !window.autoKeyEnabled;
    const btn = document.getElementById('autoKeyBtn');
    if (btn) {
        btn.textContent = window.autoKeyEnabled ? '🔴 AUTO-KEY: ON' : '🔴 AUTO-KEY: OFF';
        btn.style.background = window.autoKeyEnabled ? 'var(--te-red)' : '';
        btn.style.color = window.autoKeyEnabled ? '#fff' : '';
    }
};

window.onParamEdit = function(p) {
    const l = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    if (!l) return;
    const paramKey = (p === 'chromaSim') ? 'similarity' : ((p === 'chromaSmooth') ? 'smoothness' : p);
    const map = {
        posX: 'posX', posY: 'posY', posZ: 'posZ',
        scaleX: 'scaleX', scaleY: 'scaleY', scaleZ: 'scaleZ',
        rotX: 'rotX', rotY: 'rotY', rotZ: 'rotZ',
        opacity: 'inpOpacity', animSpeed: 'animSpeed', animAmp: 'animAmp',
        similarity: 'chromaSim', smoothness: 'chromaSmooth'
    };
    const el = document.getElementById(map[paramKey]);
    if (!el) return;
    const v = parseFloat(el.value) || 0;

    const isScaleParam = (paramKey === 'scaleX' || paramKey === 'scaleY' || paramKey === 'scaleZ');
    const lockXYZ = document.getElementById('uniformScaleToggle')?.checked;

    if (isScaleParam && lockXYZ) {
        l.scale = [v, v, v];
        document.getElementById('scaleX').value = v;
        document.getElementById('scaleY').value = v;
        document.getElementById('scaleZ').value = v;
        ['scaleX', 'scaleY', 'scaleZ'].forEach(sp => {
            if (window.autoKeyEnabled || (l.keyframes && l.keyframes[sp] && l.keyframes[sp].length > 0)) {
                window.toggleParamKeyframe(sp);
            }
        });
    } else {
        window.setParamBaseValue(l, paramKey, v);
        if (window.autoKeyEnabled || (l.keyframes && l.keyframes[paramKey] && l.keyframes[paramKey].length > 0)) {
            window.toggleParamKeyframe(paramKey);
        }
    }

    if (paramKey === 'opacity') { const o = document.getElementById('opacityVal'); if (o) o.textContent = v.toFixed(2); }
    if (paramKey === 'animSpeed') { const s = document.getElementById('animSpeedVal'); if (s) s.textContent = v; }
    if (paramKey === 'animAmp') { const a = document.getElementById('animAmpVal'); if (a) a.textContent = v; }
    if (paramKey === 'similarity') { const sm = document.getElementById('simVal'); if (sm) sm.textContent = v; }
    if (paramKey === 'smoothness') { const smt = document.getElementById('smoothVal'); if (smt) smt.textContent = v; }

    if (window.applyTransformAndEffectsImmediate) window.applyTransformAndEffectsImmediate(l);
    if (window.renderLayerList) window.renderLayerList();
};

window.renderKeyframeMarkers = function() {
    const track = document.getElementById('keyframeTrack');
    if (!track) return;
    track.innerHTML = '';
    const l = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    if (!l || !l.keyframes) return;

    const maxT = Math.max(window.masterDuration, parseFloat(document.getElementById('customDurationInput')?.value) || 5.0);
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
        m.onclick = (e) => { e.stopPropagation(); window.scrubMasterTimeline(t); };
        m.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            pList.forEach(p => { l.keyframes[p] = l.keyframes[p].filter(k => Math.abs(k.t - t) > 0.05); });
            window.updateMasterDuration(); 
            if (window.refreshKeyframeDiamonds) window.refreshKeyframeDiamonds();
            if (window.saveHistoryState) window.saveHistoryState();
        };
        track.appendChild(m);
    });
};

window.refreshKeyframeDiamonds = function() {
    const l = window.getPrimarySelectedItem ? window.getPrimarySelectedItem() : null;
    ANIMATABLE_PARAMS.forEach(p => {
        const btn = document.getElementById('kf-' + p);
        if (btn) btn.classList.toggle('has-kf', !!(l && l.keyframes && l.keyframes[p] && l.keyframes[p].length));
    });
    if (window.renderKeyframeMarkers) window.renderKeyframeMarkers();
};

window.toggleMasterPlay = function() {
    window.masterPlaying = !window.masterPlaying;
    const btn = document.getElementById('masterPlayBtn');
    if (btn) btn.textContent = window.masterPlaying ? '⏸ PAUSE' : '▶️ PLAY';
    window.layers.forEach(l => {
        if (l.videoEl) {
            if (window.masterPlaying) l.videoEl.play().catch(() => {});
            else l.videoEl.pause();
        }
    });
};

window.scrubMasterTimeline = function(val) {
    window.masterTime = parseFloat(val) || 0;
    window.masterPlaying = false;
    const btn = document.getElementById('masterPlayBtn');
    if (btn) btn.textContent = '▶️ PLAY';
    window.layers.forEach(l => {
        if (l.videoEl && l.duration > 0) { l.videoEl.pause(); l.videoEl.currentTime = window.masterTime % l.duration; }
        if (l.mixer && l.duration > 0) l.mixer.setTime(window.masterTime % l.duration);
    });
    evaluateSceneAtTime(window.masterTime, true);
};

const clock = new THREE.Clock();

function evaluateSceneAtTime(t, updateUI = false) {
    window.layers.forEach(l => {
        if (!l.mesh) return;
        const dragging = (window.transformControl && window.transformControl.dragging && window.selectedIds.includes(l.id));

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
                const d = window.masterDuration > 0 ? window.masterDuration : 3.0;
                op *= Math.min(1, (t * spd) / (d * 0.4));
            } else if (l.animPreset === 'fadeOut') {
                const d = window.masterDuration > 0 ? window.masterDuration : 3.0;
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
            if (window.updateLayerClippingAndOpacity) window.updateLayerClippingAndOpacity(l, op);
        }

        if (updateUI && window.getPrimarySelectedItem && window.getPrimarySelectedItem()?.id === l.id) {
            const elPosX = document.getElementById('posX'); if (elPosX) elPosX.value = parseFloat(px.toFixed(3));
            const elPosY = document.getElementById('posY'); if (elPosY) elPosY.value = parseFloat(py.toFixed(3));
            const elPosZ = document.getElementById('posZ'); if (elPosZ) elPosZ.value = parseFloat(pz.toFixed(3));
            const elScaleX = document.getElementById('scaleX'); if (elScaleX) elScaleX.value = parseFloat(sx.toFixed(3));
            const elScaleY = document.getElementById('scaleY'); if (elScaleY) elScaleY.value = parseFloat(sy.toFixed(3));
            const elScaleZ = document.getElementById('scaleZ'); if (elScaleZ) elScaleZ.value = parseFloat(sz.toFixed(3));
            const elRotX = document.getElementById('rotX'); if (elRotX) elRotX.value = parseFloat(rx.toFixed(1));
            const elRotY = document.getElementById('rotY'); if (elRotY) elRotY.value = parseFloat(ry.toFixed(1));
            const elRotZ = document.getElementById('rotZ'); if (elRotZ) elRotZ.value = parseFloat(rz.toFixed(1));
            const elOp = document.getElementById('inpOpacity'); if (elOp) elOp.value = op;
            const elOpVal = document.getElementById('opacityVal'); if (elOpVal) elOpVal.textContent = op.toFixed(2);
        }
    });
}

window.animate = function() {
    requestAnimationFrame(window.animate);
    const delta = clock.getDelta();

    if (window.masterPlaying && window.masterDuration > 0) {
        window.masterTime = (window.masterTime + delta) % window.masterDuration;
        const scrubber = document.getElementById('masterTimelineScrubber');
        if (scrubber && document.activeElement !== scrubber) scrubber.value = window.masterTime;
    }

    window.layers.forEach(l => { if (l.mixer && window.masterPlaying) l.mixer.update(delta); });
    evaluateSceneAtTime(window.masterTime, false);

    const disp = document.getElementById('masterTimeDisplay');
    if (disp) {
        disp.textContent = window.masterDuration > 0
            ? `${window.masterTime.toFixed(2)}s / ${window.masterDuration.toFixed(2)}s`
            : `00.00s / 00.00s [STATIC]`;
    }

    if (window.camAnim) {
        window.camAnim.progress += 0.12;
        if (window.camAnim.progress >= 1) {
            window.camera.position.copy(window.camAnim.endPos);
            window.orbit.target.copy(window.camAnim.endTarget);
            window.camAnim = null;
        } else {
            window.camera.position.lerpVectors(window.camAnim.startPos, window.camAnim.endPos, window.camAnim.progress);
            window.orbit.target.lerpVectors(window.camAnim.startTarget, window.camAnim.endTarget, window.camAnim.progress);
        }
    }

    if (window.orbit) window.orbit.update();
    if (window.renderer && window.scene && window.camera) window.renderer.render(window.scene, window.camera);
};