// ============================================================================
// MODULE 04 // KEYFRAME AUTOMATION, TIMELINE SCRUBBER & RENDER LOOP
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
    if (window.saveHistoryState) saveHistoryState();
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
            if (autoKeyEnabled || (l.keyframes && l.keyframes[sp] && l.keyframes[sp].length > 0)) {
                toggleParamKeyframe(sp);
            }
        });
    } else {
        setParamBaseValue(l, paramKey, v);
        if (autoKeyEnabled || (l.keyframes && l.keyframes[paramKey] && l.keyframes[paramKey].length > 0)) {
            toggleParamKeyframe(paramKey);
        }
    }

    if (paramKey === 'opacity') document.getElementById('opacityVal').textContent = v.toFixed(2);
    if (paramKey === 'animSpeed') document.getElementById('animSpeedVal').textContent = v;
    if (paramKey === 'animAmp') document.getElementById('animAmpVal').textContent = v;
    if (paramKey === 'similarity') document.getElementById('simVal').textContent = v;
    if (paramKey === 'smoothness') document.getElementById('smoothVal').textContent = v;

    if (window.applyTransformAndEffectsImmediate) applyTransformAndEffectsImmediate(l);
    if (window.renderLayerList) renderLayerList();
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
            updateMasterDuration(); refreshKeyframeDiamonds();
            if (window.saveHistoryState) saveHistoryState();
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

const clock = new THREE.Clock();

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