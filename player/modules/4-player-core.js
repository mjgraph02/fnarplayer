// ============================================================================
// PLAYER MODULE 04 // TUNED ONE-EURO TRACKING, FAST CAMERA & SMOOTH LOSS FADE
// ============================================================================

import '../../vendor/mindar-image-aframe.prod.js';

const statusPill = document.getElementById('status-pill');
const topHud = document.getElementById('player-hud-top');
const btnAudio = document.getElementById('btn-audio');
const brandLoader = document.getElementById('brand-loader');
const brandLogo = document.getElementById('brand-logo');
const brandTitle = document.getElementById('brand-title');
const brandStatus = document.getElementById('brand-status');
const brandProgress = document.getElementById('brand-progress');

let allVideosByTarget = {};
let targetLossTimers = {};
let isMuted = true;
let activeTargetsCount = 0;

function setLoaderProgress(pct, msg) {
    if (brandProgress) brandProgress.style.width = `${pct}%`;
    if (msg && brandStatus) brandStatus.textContent = msg;
}

function applyWhiteLabelBranding(b) {
    if (!b) return;
    if (b.accent) {
        document.documentElement.style.setProperty('--accent', b.accent);
    }
    if (b.title && brandTitle) {
        brandTitle.textContent = b.title;
        document.title = b.title;
    }
    if (b.text && brandStatus) {
        brandStatus.textContent = b.text;
    }
    if (b.logo && brandLogo) {
        brandLogo.src = cleanStorageUrl(b.logo);
        brandLogo.style.display = 'block';
    }
}

function cleanStorageUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    if (clean.includes('dropbox.com')) {
        clean = clean.replace('www.dropbox.com', 'dl.dropboxusercontent.com')
                     .replace('dropbox.com', 'dl.dropboxusercontent.com')
                     .replace(/[?&]dl=[01]/g, '');
    }
    return clean;
}

function normalizeProjectJson(projData) {
    const rawTargets = projData.targets || [];
    const targets = rawTargets.map((t, idx) => {
        const rawLayers = t.layers || [];
        const masks = rawLayers.filter(l => l.isMaskPlane).map(m => ({
            id: m.id, p: m.pos || [0,0,0], s: m.scale || [1,1,1], r: m.rot || [0,0,0]
        }));
        const mediaLayers = rawLayers.filter(l => !l.isFolder && !l.isMaskPlane).map(l => ({
            t: l.chromaEnabled ? 'chroma' : (l.type || 'video'),
            u: cleanStorageUrl(l.url),
            p: l.pos || [0,0,0],
            s: l.scale || [1,1,1],
            r: l.rot || [0,0,0],
            op: l.opacity ?? 1.0,
            cs: l.clipSource || 'none',
            sh: l.contactShadow ?? false,
            c: l.color || '#00ff00',
            sim: l.similarity ?? 0.38,
            sm: l.smoothness ?? 0.08,
            ap: l.animPreset || 'none',
            as: l.animSpeed ?? 1.0,
            aa: l.animAmp ?? 1.0,
            kf: l.keyframes || {}
        }));
        return {
            idx: idx,
            name: t.name || `Target ${idx + 1}`,
            ta: t.targetAspect || 1.0,
            dur: t.customDuration || 0,
            al: t.autoLight ?? true,
            sf: t.smoothFade ?? true,
            ht: t.lossHoldTime ?? 0.35,
            masks,
            l: mediaLayers
        };
    });
    return {
        m: cleanStorageUrl(projData.mindUrl),
        mt: projData.maxTrack || 1,
        brand: projData.branding || null,
        targets
    };
}

async function bootNizhaliPlayer() {
    try {
        setLoaderProgress(15, 'Initializing AR Engine...');
        while (!AFRAME.systems['mindar-image-system'] && !AFRAME.components['mindar-image']) {
            await new Promise(r => setTimeout(r, 40));
        }

        const params = new URLSearchParams(window.location.search);
        let mindUrl = '';
        let maxTrack = 1;
        let targetsList = [];

        if (params.get('scene')) {
            let token = params.get('scene');
            let jsonStr = '';
            if (token.startsWith('AES_') && window.CryptoJS) {
                const bytes = window.CryptoJS.AES.decrypt(token.slice(4), 'NIZHALI_V7_KEY');
                jsonStr = bytes.toString(window.CryptoJS.enc.Utf8);
            } else {
                jsonStr = decodeURIComponent(atob(token));
            }
            const decoded = JSON.parse(jsonStr);
            mindUrl = cleanStorageUrl(decoded.m);
            maxTrack = decoded.mt || 1;
            if (decoded.brand) applyWhiteLabelBranding(decoded.brand);

            if (decoded.targets && Array.isArray(decoded.targets)) {
                targetsList = decoded.targets.map((t, idx) => ({
                    idx: t.idx ?? idx,
                    name: t.name || `Print ${idx + 1}`,
                    ta: t.ta || 1.0,
                    dur: t.dur || 0,
                    al: t.al ?? true,
                    sf: t.sf ?? true,
                    ht: t.ht ?? 0.35,
                    masks: t.masks || [],
                    l: (t.l || []).map(item => ({ ...item, u: cleanStorageUrl(item.u) }))
                }));
            } else {
                targetsList = [{
                    idx: 0,
                    name: 'Print 1',
                    ta: decoded.ta || 1.0,
                    dur: decoded.dur || 0,
                    al: true,
                    sf: true,
                    ht: 0.35,
                    masks: decoded.masks || [],
                    l: (decoded.l || []).map(item => ({ ...item, u: cleanStorageUrl(item.u) }))
                }];
            }
        } else if (params.get('project')) {
            setLoaderProgress(25, 'Fetching Project Configuration...');
            const pUrl = cleanStorageUrl(decodeURIComponent(params.get('project')));
            const pRes = await fetch(pUrl);
            if (!pRes.ok) throw new Error('Could not load project.json');
            const projData = await pRes.json();
            const norm = normalizeProjectJson(projData);
            mindUrl = norm.m;
            maxTrack = norm.mt;
            targetsList = norm.targets;
            if (norm.brand) applyWhiteLabelBranding(norm.brand);
        } else if (params.get('projectData')) {
            const projData = JSON.parse(decodeURIComponent(atob(params.get('projectData'))));
            const norm = normalizeProjectJson(projData);
            mindUrl = norm.m;
            maxTrack = norm.mt;
            targetsList = norm.targets;
            if (norm.brand) applyWhiteLabelBranding(norm.brand);
        }

        if (!mindUrl || targetsList.length === 0) {
            setLoaderProgress(0, '❌ Missing .mind link or targets in URL');
            statusPill.textContent = '❌ Missing Target Data';
            return;
        }

        if (window.initLightingEngine) {
            window.initLightingEngine(targetsList[0].al ?? true);
        }

        setLoaderProgress(55, 'Loading AR Target...');
        const checkRes = await fetch(mindUrl);
        if (!checkRes.ok) throw new Error(`Target .mind error (${checkRes.status})`);
        const mindBuffer = await checkRes.arrayBuffer();
        const localMindBlobUrl = URL.createObjectURL(new Blob([mindBuffer]));

        setLoaderProgress(85, 'Starting Camera...');

        let allTargetsHtml = '';
        targetsList.forEach((tSlot, tIdx) => {
            allVideosByTarget[tIdx] = [];
            window.NizhaliPlayer.targetFadeMultipliers[tIdx] = 1.0;
            let childrenHtml = '';

            (tSlot.masks || []).forEach(m => {
                childrenHtml += `<a-entity id="mask-${tIdx}-${m.id}" position="${m.p.join(' ')}" scale="${m.s.join(' ')}" rotation="${m.r.join(' ')}"></a-entity>`;
            });

            (tSlot.l || []).forEach((l, lIdx) => {
                const posStr = (l.p || [0,0,0]).join(' ');
                const scaleStr = (l.s || [1,1,1]).join(' ');
                const rotStr = (l.r || [0,0,0]).join(' ');
                const encodedCfg = encodeURIComponent(JSON.stringify(l));
                const compAttr = `nizhali-layer="configJson: ${encodedCfg}; targetIndex: ${tIdx}; targetAspect: ${tSlot.ta || 1.0}; masterDuration: ${tSlot.dur || 0}"`;
                const entId = `ent-${tIdx}-${lIdx}`;

                if (l.t === 'glb') {
                    childrenHtml += `<a-gltf-model id="${entId}" src="${l.u}" position="${posStr}" scale="${scaleStr}" rotation="${rotStr}" ${compAttr}></a-gltf-model>`;
                } else {
                    childrenHtml += `<a-entity id="${entId}" position="${posStr}" scale="${scaleStr}" rotation="${rotStr}" ${compAttr}></a-entity>`;
                }
            });

            allTargetsHtml += `
                <a-entity id="target-root-${tIdx}" mindar-image-target="targetIndex: ${tIdx}">
                    ${childrenHtml}
                </a-entity>
            `;
        });

        window.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2.0);

        // Balanced One-Euro Filter: filterMinCF: 0.001 (kills stationary perspective jitter)
        // filterBeta: 0.15 (15x faster motion response without high-frequency homography jumping)
        const sceneWrapper = document.createElement('div');
        sceneWrapper.style.width = '100%';
        sceneWrapper.style.height = '100%';
        sceneWrapper.innerHTML = `
            <a-scene
                id="ar-scene"
                mindar-image="imageTargetSrc: ${localMindBlobUrl}; maxTrack: ${maxTrack}; autoStart: true; uiLoading: no; uiError: no; uiScanning: yes; filterMinCF: 0.001; filterBeta: 0.15; warmupTolerance: 2; missTolerance: 4;"
                renderer="colorManagement: false, physicallyCorrectLights: false, alpha: true, antialias: true, powerPreference: high-performance, preserveDrawingBuffer: true"
                vr-mode-ui="enabled: false"
                device-orientation-permission-ui="enabled: false"
                embedded>
                <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
                ${allTargetsHtml}
            </a-scene>
        `;
        document.body.appendChild(sceneWrapper);

        const sceneEl = document.getElementById('ar-scene');
        const THREE = AFRAME.THREE;

        targetsList.forEach((tSlot, tIdx) => {
            const targetRootEl = document.getElementById(`target-root-${tIdx}`);
            const tAspect = tSlot.ta || 1.0;

            const needsTargetPortalOccluder = (tSlot.l || []).some(l => l.cs === 'target' && l.p && l.p[2] < -0.01);
            if (needsTargetPortalOccluder && targetRootEl) {
                targetRootEl.object3D.add(window.createPortalWindowFrame(0.5, tAspect / 2));
            }

            (tSlot.masks || []).forEach(m => {
                const usedByDeepLayer = (tSlot.l || []).some(l => l.cs === m.id && l.p && l.p[2] < -0.01);
                const maskEl = document.getElementById(`mask-${tIdx}-${m.id}`);
                if (usedByDeepLayer && maskEl) {
                    maskEl.object3D.add(window.createPortalWindowFrame(0.5, 0.5));
                }
            });

            (tSlot.l || []).forEach((l, lIdx) => {
                const ent = document.getElementById(`ent-${tIdx}-${lIdx}`);
                if (!ent) return;

                if (l.t === 'video' || l.t === 'chroma') {
                    const vid = document.createElement('video');
                    vid.crossOrigin = 'anonymous';
                    vid.src = l.u;
                    vid.loop = true;
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.setAttribute('playsinline', '');
                    vid.setAttribute('webkit-playsinline', '');
                    vid.preload = 'auto';
                    allVideosByTarget[tIdx].push(vid);

                    const vidTex = new THREE.VideoTexture(vid);
                    vidTex.minFilter = THREE.LinearFilter;
                    vidTex.magFilter = THREE.LinearFilter;

                    const mat = window.createNizhaliShaderMaterial(vidTex, l);
                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, tAspect), mat);
                    mesh.renderOrder = 2 + lIdx;
                    ent.object3D.add(mesh);

                    vid.addEventListener('loadedmetadata', () => {
                        if (vid.videoWidth && vid.videoHeight) {
                            mesh.geometry.dispose();
                            mesh.geometry = new THREE.PlaneGeometry(1, vid.videoHeight / vid.videoWidth);
                        }
                    });
                    vid.load();
                } else if (l.t === 'image') {
                    const mat = window.createNizhaliShaderMaterial(null, l);
                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
                    mesh.renderOrder = 10 + lIdx;
                    ent.object3D.add(mesh);

                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const tex = new THREE.Texture(img);
                        tex.minFilter = THREE.LinearFilter;
                        tex.magFilter = THREE.LinearFilter;
                        tex.needsUpdate = true;
                        if (img.naturalWidth && img.naturalHeight) {
                            mesh.geometry.dispose();
                            mesh.geometry = new THREE.PlaneGeometry(1, img.naturalHeight / img.naturalWidth);
                        }
                        mat.uniforms.src.value = tex;
                        mat.uniforms.hasTex.value = 1.0;
                    };
                    img.src = l.u;
                }
            });

            // Target Lock-On Event
            targetRootEl.addEventListener('targetFound', () => {
                if (targetLossTimers[tIdx]) {
                    clearInterval(targetLossTimers[tIdx]);
                    targetLossTimers[tIdx] = null;
                }
                window.NizhaliPlayer.targetFadeMultipliers[tIdx] = 1.0;
                targetRootEl.object3D.visible = true;

                if (navigator.vibrate) navigator.vibrate(40);

                if (tSlot.al !== undefined) {
                    window.NizhaliPlayer.autoLightEnabled = tSlot.al;
                    const btnLight = document.getElementById('btn-light');
                    if (btnLight) btnLight.classList.toggle('active', tSlot.al);
                }

                activeTargetsCount++;
                statusPill.style.opacity = '1';
                statusPill.textContent = `🎯 ${tSlot.name}`;
                topHud.classList.add('dimmed');
                setTimeout(() => {
                    if (activeTargetsCount > 0) statusPill.style.opacity = '0';
                }, 1200);

                const vids = allVideosByTarget[tIdx] || [];
                vids.forEach(vid => {
                    vid.muted = isMuted;
                    vid.play().catch(() => {
                        vid.muted = true;
                        isMuted = true;
                        vid.play().catch(() => {});
                    });
                });
                if (vids.length > 0) btnAudio.style.display = 'flex';
            });

            // Target Lost Event
            targetRootEl.addEventListener('targetLost', () => {
                activeTargetsCount = Math.max(0, activeTargetsCount - 1);
                const vids = allVideosByTarget[tIdx] || [];

                if (tSlot.sf && (tSlot.ht ?? 0.35) > 0) {
                    targetRootEl.object3D.visible = true;
                    const steps = 10;
                    const stepMs = ((tSlot.ht ?? 0.35) * 1000) / steps;
                    let curStep = 0;
                    targetLossTimers[tIdx] = setInterval(() => {
                        curStep++;
                        window.NizhaliPlayer.targetFadeMultipliers[tIdx] = Math.max(0, 1.0 - (curStep / steps));
                        if (curStep >= steps) {
                            clearInterval(targetLossTimers[tIdx]);
                            targetLossTimers[tIdx] = null;
                            targetRootEl.object3D.visible = false;
                            vids.forEach(vid => vid.pause());
                        }
                    }, stepMs);
                } else {
                    vids.forEach(vid => vid.pause());
                }

                if (activeTargetsCount === 0) {
                    topHud.classList.remove('dimmed');
                    statusPill.style.opacity = '1';
                    statusPill.textContent = '📷 Scan Print';
                }
            });
        });

        sceneEl.addEventListener('arReady', () => {
            setLoaderProgress(100, 'Ready!');
            setTimeout(() => brandLoader.classList.add('loaded'), 200);
            statusPill.textContent = '📷 Scan Print';
        });

    } catch (err) {
        setLoaderProgress(0, '❌ ' + err.message);
        statusPill.textContent = '❌ ' + err.message;
    }
}

function toggleAudio() {
    isMuted = !isMuted;
    Object.values(allVideosByTarget).flat().forEach(vid => {
        vid.muted = isMuted;
    });
    btnAudio.textContent = isMuted ? '🔇' : '🔊';
    btnAudio.classList.toggle('active', !isMuted);
}

btnAudio.addEventListener('click', toggleAudio);
window.addEventListener('load', bootNizhaliPlayer);