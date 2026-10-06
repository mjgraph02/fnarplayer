// ============================================================================
// PLAYER MODULE 03 // SNAPCHAT GESTURE RECORDER & 60FPS COMPOSITOR
// ============================================================================

(function() {
    let isRecording = false;
    let isLocked = false;
    let pressTimer = null;
    let recordStartTime = 0;
    let progressAnimFrame = null;
    const MAX_RECORD_SEC = 30.0;

    let touchStartY = 0;
    let touchStartX = 0;
    let currentZoom = 1.0;

    let mediaRecorder = null;
    let recordedChunks = [];
    let compCanvas = null;
    let compCtx = null;
    let compAnimFrame = null;
    let audioContext = null;
    let audioDest = null;

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

    function getWebGlCanvas() {
        const sceneEl = document.getElementById('ar-scene');
        return sceneEl ? sceneEl.canvas : document.querySelector('canvas');
    }

    function getCameraVideo() {
        const vids = document.querySelectorAll('body > video');
        for (let v of vids) {
            if (v.srcObject || v.videoWidth > 0) return v;
        }
        return null;
    }

    // High-Res Single Snapshot
    function capturePhoto() {
        if (navigator.vibrate) navigator.vibrate(35);
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!camVideo || !glCanvas) return;

        const w = glCanvas.width || window.innerWidth;
        const h = glCanvas.height || window.innerHeight;
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = w;
        snapCanvas.height = h;
        const snapCtx = snapCanvas.getContext('2d');

        // Draw camera video with cover crop
        const vAspect = (camVideo.videoWidth && camVideo.videoHeight) ? camVideo.videoWidth / camVideo.videoHeight : w / h;
        const cAspect = w / h;
        let dw = w, dh = h, dx = 0, dy = 0;
        if (vAspect > cAspect) {
            dw = h * vAspect;
            dx = -(dw - w) / 2;
        } else {
            dh = w / vAspect;
            dy = -(dh - h) / 2;
        }
        snapCtx.drawImage(camVideo, dx, dy, dw, dh);
        snapCtx.drawImage(glCanvas, 0, 0, w, h);

        snapCanvas.toBlob(blob => {
            showPreview(blob, 'image');
        }, 'image/jpeg', 0.95);
    }

    // 60fps Video Compositor Loop
    function startCompositor(camVideo, glCanvas) {
        if (!compCanvas) {
            compCanvas = document.createElement('canvas');
            compCtx = compCanvas.getContext('2d', { alpha: false });
        }
        compCanvas.width = glCanvas.width || window.innerWidth;
        compCanvas.height = glCanvas.height || window.innerHeight;

        const w = compCanvas.width;
        const h = compCanvas.height;

        function loop() {
            if (!isRecording) return;
            const vAspect = (camVideo.videoWidth && camVideo.videoHeight) ? camVideo.videoWidth / camVideo.videoHeight : w / h;
            const cAspect = w / h;
            let dw = w, dh = h, dx = 0, dy = 0;
            if (vAspect > cAspect) {
                dw = h * vAspect;
                dx = -(dw - w) / 2;
            } else {
                dh = w / vAspect;
                dy = -(dh - h) / 2;
            }
            compCtx.drawImage(camVideo, dx, dy, dw, dh);
            compCtx.drawImage(glCanvas, 0, 0, w, h);
            compAnimFrame = requestAnimationFrame(loop);
        }
        loop();
    }

    function startVideoRecording() {
        if (isRecording) return;
        isRecording = true;
        recordedChunks = [];
        if (navigator.vibrate) navigator.vibrate(60);

        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!camVideo || !glCanvas) return;

        startCompositor(camVideo, glCanvas);
        const canvasStream = compCanvas.captureStream(60);

        // Capture live audio from layers
        try {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') audioContext.resume();
            audioDest = audioContext.createMediaStreamDestination();
            const mediaVids = document.querySelectorAll('video:not(body > video)');
            mediaVids.forEach(v => {
                try {
                    const src = audioContext.createMediaElementSource(v);
                    src.connect(audioDest);
                    src.connect(audioContext.destination);
                } catch(e) {}
            });
            const audioTracks = audioDest.stream.getAudioTracks();
            if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
        } catch(e) {}

        const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
        let chosenMime = '';
        for (let m of mimeTypes) {
            if (MediaRecorder.isTypeSupported(m)) { chosenMime = m; break; }
        }

        try {
            mediaRecorder = new MediaRecorder(canvasStream, chosenMime ? { mimeType: chosenMime } : {});
        } catch(err) {
            mediaRecorder = new MediaRecorder(canvasStream);
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            cancelAnimationFrame(compAnimFrame);
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/mp4' });
            showPreview(blob, 'video');
        };

        mediaRecorder.start(250);
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
        cancelAnimationFrame(progressAnimFrame);
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);

        shutterWrap.classList.remove('recording');
        lockPill.classList.remove('active', 'locked');
        ringFill.style.strokeDashoffset = '238.76';
        if (gestureHint) gestureHint.style.opacity = '1';

        resetZoom();

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    function setZoom(val) {
        currentZoom = Math.min(2.5, Math.max(1.0, val));
        const cam = document.querySelector('a-camera');
        if (cam && cam.components.camera) {
            cam.components.camera.camera.zoom = currentZoom;
            cam.components.camera.camera.updateProjectionMatrix();
        }
        zoomInd.textContent = `${currentZoom.toFixed(1)}x`;
        zoomInd.classList.add('visible');
    }

    function resetZoom() {
        setZoom(1.0);
        setTimeout(() => zoomInd.classList.remove('visible'), 600);
    }

    // Touch & Pointer Gesture Engine
    function onTouchStart(e) {
        const touch = e.touches ? e.touches[0] : e;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        pressTimer = setTimeout(() => {
            pressTimer = null;
            startVideoRecording();
        }, 300);
    }

    function onTouchMove(e) {
        if (!isRecording) return;
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - touchStartX;
        const dy = touchStartY - touch.clientY; // positive = dragged upward

        // Swipe Left to Lock Hands-Free
        if (dx < -45 && !isLocked) {
            isLocked = true;
            lockPill.classList.add('locked');
            if (navigator.vibrate) navigator.vibrate(30);
        }

        // Swipe Up/Down to Zoom
        if (dy > 20) {
            const zoomVal = 1.0 + (dy - 20) / 120;
            setZoom(zoomVal);
        }
    }

    function onTouchEnd() {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            capturePhoto();
            return;
        }

        if (isRecording && !isLocked) {
            stopVideoRecording();
        }
    }

    shutterBtn.addEventListener('pointerdown', onTouchStart);
    window.addEventListener('pointermove', onTouchMove);
    window.addEventListener('pointerup', () => {
        if (isRecording && isLocked) {
            // Tap locked button to stop
            shutterBtn.onclick = () => {
                stopVideoRecording();
                shutterBtn.onclick = null;
            };
        } else {
            onTouchEnd();
        }
    });

    // Preview, Share & Direct Download
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
        }
        previewBox.appendChild(previewEl);

        const ext = (type === 'image') ? 'jpg' : (blob.type.includes('mp4') ? 'mp4' : 'webm');
        const filename = `Nizhali_${Date.now()}.${ext}`;

        btnDownload.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
        };

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], filename, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
                btnShare.style.display = 'block';
                btnShare.onclick = async () => {
                    try {
                        await navigator.share({
                            title: 'Nizhali AR Capture',
                            files: [file]
                        });
                    } catch(e) {}
                };
            }
        }

        btnDiscard.onclick = () => {
            previewModal.style.display = 'none';
            previewBox.innerHTML = '';
            URL.revokeObjectURL(url);
        };

        previewModal.style.display = 'flex';
    }
})();