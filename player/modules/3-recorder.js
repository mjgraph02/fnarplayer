// ============================================================================
// PLAYER MODULE 03 // SNAPCHAT GESTURE RECORDER & 60FPS COMPOSITOR
// ============================================================================

(function() {
    let isRecording = false;
    let isLocked = false;
    let pressTimer = null;
    let isPressActive = false;
    let recordStartTime = 0;
    let progressAnimFrame = null;
    const MAX_RECORD_SEC = 30.0;

    let startX = 0;
    let startY = 0;
    let currentZoom = 1.0;

    let mediaRecorder = null;
    let recordedChunks = [];
    let compCanvas = null;
    let compCtx = null;
    let compAnimFrame = null;
    let audioContext = null;
    let audioDest = null;
    let connectedVideos = new WeakSet();

    const shutterWrap = document.getElementById('shutter-wrap');
    const shutterBtn = document.getElementById('shutter-btn');
    const ringFill = document.getElementById('rec-ring-fill');
    const lockPill = document.getElementById('lock-target');
    const zoomInd = document.getElementById('zoom-indicator');
    const gestureHint = document.getElementById('gesture-hint');

    const previewModal = document.getElementById('preview-modal');
    const previewBox = document.getElementById('preview-media-box');
    const btnDiscard = document.getElementById('btn-discard');
    const btnDownload = document.getElementById('btn-download');
    const btnShare = document.getElementById('btn-share');

    // Reliably locate the A-Frame WebGL canvas
    function getWebGlCanvas() {
        const sceneEl = document.getElementById('ar-scene');
        if (sceneEl && sceneEl.canvas) return sceneEl.canvas;
        if (sceneEl && sceneEl.renderer && sceneEl.renderer.domElement) return sceneEl.renderer.domElement;
        return document.querySelector('canvas.a-canvas') || document.querySelector('canvas');
    }

    // Reliably locate the live MindAR camera <video> feed
    function getCameraVideo() {
        const allVids = Array.from(document.querySelectorAll('video'));
        // 1. Prefer any video with an active MediaStream (camera srcObject)
        for (let v of allVids) {
            if (v.srcObject) return v;
        }
        // 2. Fallback: direct child of body or video without a remote http src
        for (let v of allVids) {
            if (!v.src || v.parentElement === document.body) return v;
        }
        return allVids[0] || null;
    }

    function drawCompositeFrame(ctx, w, h, camVideo, glCanvas) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (camVideo && camVideo.readyState >= 2) {
            const vw = camVideo.videoWidth || w;
            const vh = camVideo.videoHeight || h;
            const vAspect = vw / vh;
            const cAspect = w / h;
            let dw = w, dh = h, dx = 0, dy = 0;
            if (vAspect > cAspect) {
                dw = h * vAspect;
                dx = -(dw - w) / 2;
            } else {
                dh = w / vAspect;
                dy = -(dh - h) / 2;
            }
            ctx.drawImage(camVideo, dx, dy, dw, dh);
        }

        if (glCanvas) {
            ctx.drawImage(glCanvas, 0, 0, w, h);
        }
    }

    // High-Res Single Snapshot
    function capturePhoto() {
        if (navigator.vibrate) navigator.vibrate(35);
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!glCanvas && !camVideo) return;

        // Visual flash feedback on shutter button
        shutterBtn.style.transform = 'scale(0.82)';
        setTimeout(() => { shutterBtn.style.transform = ''; }, 140);

        const w = (glCanvas && glCanvas.width) ? glCanvas.width : window.innerWidth * (window.devicePixelRatio || 1);
        const h = (glCanvas && glCanvas.height) ? glCanvas.height : window.innerHeight * (window.devicePixelRatio || 1);

        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = w;
        snapCanvas.height = h;
        const snapCtx = snapCanvas.getContext('2d');

        drawCompositeFrame(snapCtx, w, h, camVideo, glCanvas);

        snapCanvas.toBlob(blob => {
            if (blob) showPreview(blob, 'image');
        }, 'image/jpeg', 0.95);
    }

    // 60fps Video Compositor Loop
    function startCompositor(camVideo, glCanvas) {
        if (!compCanvas) {
            compCanvas = document.createElement('canvas');
            compCtx = compCanvas.getContext('2d', { alpha: false });
        }
        // Keep recording resolution crisp & smooth on mobile (720p max width)
        const aspect = window.innerHeight / window.innerWidth;
        compCanvas.width = 720;
        compCanvas.height = Math.round(720 * aspect);

        const w = compCanvas.width;
        const h = compCanvas.height;

        function loop() {
            if (!isRecording) return;
            drawCompositeFrame(compCtx, w, h, camVideo, glCanvas);
            compAnimFrame = requestAnimationFrame(loop);
        }
        loop();
    }

    function startVideoRecording() {
        if (isRecording) return;
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!glCanvas && !camVideo) return;

        isRecording = true;
        recordedChunks = [];
        if (navigator.vibrate) navigator.vibrate(55);

        startCompositor(camVideo, glCanvas);
        const canvasStream = compCanvas.captureStream(30);

        // Capture live audio from AR video layers if unmuted
        try {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') audioContext.resume();
            if (!audioDest) audioDest = audioContext.createMediaStreamDestination();

            const allVids = Array.from(document.querySelectorAll('video'));
            allVids.forEach(v => {
                if (v !== camVideo && !v.srcObject && !connectedVideos.has(v)) {
                    try {
                        const src = audioContext.createMediaElementSource(v);
                        src.connect(audioDest);
                        src.connect(audioContext.destination);
                        connectedVideos.add(v);
                    } catch (e) {}
                }
            });
            const audioTracks = audioDest.stream.getAudioTracks();
            if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
        } catch (e) {}

        const mimeTypes = [
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        let chosenMime = '';
        if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
            for (let m of mimeTypes) {
                if (MediaRecorder.isTypeSupported(m)) {
                    chosenMime = m;
                    break;
                }
            }
        }

        try {
            mediaRecorder = chosenMime
                ? new MediaRecorder(canvasStream, { mimeType: chosenMime, videoBitsPerSecond: 4500000 })
                : new MediaRecorder(canvasStream);
        } catch (err) {
            mediaRecorder = new MediaRecorder(canvasStream);
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            cancelAnimationFrame(compAnimFrame);
            const blob = new Blob(recordedChunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'video/mp4' });
            if (blob.size > 0) showPreview(blob, 'video');
        };

        mediaRecorder.start(200);
        recordStartTime = performance.now();
        shutterWrap.classList.add('recording');
        if (gestureHint) gestureHint.style.opacity = '0';
        lockPill.classList.add('active');

        updateProgress();
    }

    function updateProgress() {
        if (!isRecording) return;
        const elapsed = (performance.now() - recordStartTime) / 1000;
        const frac = Math.min(1.0, elapsed / MAX_RECORD_SEC);
        const totalLen = 238.76;
        ringFill.style.strokeDashoffset = (totalLen * (1.0 - frac)).toString();

        if (frac >= 1.0) {
            stopVideoRecording();
        } else {
            progressAnimFrame = requestAnimationFrame(updateProgress);
        }
    }

    function stopVideoRecording() {
        if (!isRecording) return;
        isRecording = false;
        isLocked = false;
        isPressActive = false;
        cancelAnimationFrame(progressAnimFrame);
        if (navigator.vibrate) navigator.vibrate([35, 50, 35]);

        shutterWrap.classList.remove('recording');
        lockPill.classList.remove('active', 'locked');
        ringFill.style.strokeDashoffset = '238.76';
        if (gestureHint) gestureHint.style.opacity = '1';

        resetZoom();

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch (e) {}
        }
    }

    function setZoom(val) {
        currentZoom = Math.min(2.5, Math.max(1.0, val));
        // Zoom both camera video and 3D AR scene smoothly together
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        const scaleStr = currentZoom > 1.01 ? `scale(${currentZoom.toFixed(3)})` : '';
        if (camVideo) camVideo.style.transform = scaleStr;
        if (glCanvas) glCanvas.style.transform = scaleStr;

        zoomInd.textContent = `${currentZoom.toFixed(1)}x`;
        zoomInd.classList.add('visible');
    }

    function resetZoom() {
        currentZoom = 1.0;
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (camVideo) camVideo.style.transform = '';
        if (glCanvas) glCanvas.style.transform = '';
        zoomInd.textContent = '1.0x';
        setTimeout(() => zoomInd.classList.remove('visible'), 500);
    }

    // Unified Mobile Touch + Desktop Mouse Gesture Handlers
    function getCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function handleDown(e) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        // If already locked in hands-free recording, tapping stops recording!
        if (isRecording && isLocked) {
            stopVideoRecording();
            return;
        }

        isPressActive = true;
        const pt = getCoords(e);
        startX = pt.x;
        startY = pt.y;

        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            pressTimer = null;
            if (isPressActive) {
                startVideoRecording();
            }
        }, 260);
    }

    function handleMove(e) {
        if (!isPressActive && !isRecording) return;
        const pt = getCoords(e);
        const dx = pt.x - startX;
        const dy = startY - pt.y; // positive = finger slid UP

        if (isRecording) {
            // Slide Left to Lock Hands-Free
            if (dx < -45 && !isLocked) {
                isLocked = true;
                lockPill.classList.add('locked');
                if (navigator.vibrate) navigator.vibrate(40);
            }
            // Slide Up/Down to Zoom
            if (dy > 15) {
                const zoomVal = 1.0 + (dy - 15) / 130;
                setZoom(zoomVal);
            } else if (dy <= 15 && currentZoom > 1.0) {
                setZoom(1.0);
            }
        }
    }

    function handleUp(e) {
        if (!isPressActive) return;
        if (e && e.cancelable) e.preventDefault();
        isPressActive = false;

        // Quick tap (< 260ms) -> Photo Snapshot
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            capturePhoto();
            return;
        }

        // Released finger while recording (and not locked) -> Stop Video
        if (isRecording && !isLocked) {
            stopVideoRecording();
        }
    }

    // Bind both Touch and Mouse events cleanly
    shutterWrap.addEventListener('touchstart', handleDown, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp, { passive: false });

    shutterWrap.addEventListener('mousedown', handleDown);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    // Preview, Share & Direct Download Modal
    function showPreview(blob, type) {
        previewBox.innerHTML = '';
        const url = URL.createObjectURL(blob);
        let previewEl;

        if (type === 'image') {
            previewEl = document.createElement('img');
            previewEl.src = url;
        } else {
            previewEl = document.createElement('video');
            previewEl.src = url;
            previewEl.autoplay = true;
            previewEl.loop = true;
            previewEl.controls = true;
            previewEl.playsInline = true;
            previewEl.setAttribute('playsinline', '');
        }
        previewBox.appendChild(previewEl);

        const ext = (type === 'image') ? 'jpg' : (blob.type.includes('mp4') ? 'mp4' : 'webm');
        const filename = `Nizhali_${Date.now()}.${ext}`;

        btnDownload.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        };

        btnShare.style.display = 'none';
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([blob], filename, { type: blob.type });
                if (navigator.canShare({ files: [file] })) {
                    btnShare.style.display = 'block';
                    btnShare.onclick = async () => {
                        try {
                            await navigator.share({
                                title: 'Nizhali AR Capture',
                                files: [file]
                            });
                        } catch (e) {}
                    };
                }
            } catch (e) {}
        }

        btnDiscard.onclick = () => {
            previewModal.style.display = 'none';
            previewBox.innerHTML = '';
            URL.revokeObjectURL(url);
        };

        previewModal.style.display = 'flex';
    }
})();