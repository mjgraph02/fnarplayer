// ============================================================================
// PLAYER MODULE 03 // SELF-HOSTED RECORDRTC & IOS STREAM KEEPALIVE HACK
// ============================================================================

(function() {
    let isRecording = false;
    let isLocked = false;
    let pressTimer = null;
    let isPressActive = false;
    let recordStartTime = 0;
    let progressAnimFrame = null;
    const MAX_RECORD_SEC = 30.0;

    let startX = 0, startY = 0, currentZoom = 1.0;

    let rtcRecorder = null;
    let compCanvas = null;
    let compCtx = null;
    let compAnimFrame = null;
    let dummyStreamVideo = null; // CRITICAL FOR IOS

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
        if (sceneEl && sceneEl.canvas) return sceneEl.canvas;
        if (sceneEl && sceneEl.renderer && sceneEl.renderer.domElement) return sceneEl.renderer.domElement;
        return document.querySelector('canvas.a-canvas') || document.querySelector('canvas');
    }

    function getCameraVideo() {
        const allVids = Array.from(document.querySelectorAll('video'));
        for (let v of allVids) { if (v.srcObject && v !== dummyStreamVideo) return v; }
        for (let v of allVids) { if (!v.src || v.parentElement === document.body) return v; }
        return null;
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
                dw = h * vAspect; dx = -(dw - w) / 2;
            } else {
                dh = w / vAspect; dy = -(dh - h) / 2;
            }
            try { ctx.drawImage(camVideo, dx, dy, dw, dh); } catch(e) {}
        }
        if (glCanvas) {
            try { ctx.drawImage(glCanvas, 0, 0, w, h); } catch(e) {}
        }
    }

    function capturePhoto() {
        if (navigator.vibrate) navigator.vibrate(35);
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!glCanvas && !camVideo) return;

        shutterBtn.style.transform = 'scale(0.82)';
        setTimeout(() => { shutterBtn.style.transform = ''; }, 140);

        const w = (glCanvas && glCanvas.width) ? glCanvas.width : window.innerWidth * (window.devicePixelRatio || 1);
        const h = (glCanvas && glCanvas.height) ? glCanvas.height : window.innerHeight * (window.devicePixelRatio || 1);

        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = w; snapCanvas.height = h;
        const snapCtx = snapCanvas.getContext('2d');
        drawCompositeFrame(snapCtx, w, h, camVideo, glCanvas);

        try {
            snapCanvas.toBlob(blob => {
                if (blob) showPreview(blob, 'image');
                else alert("Capture failed: Empty image data generated.");
            }, 'image/jpeg', 0.95);
        } catch (e) {
            alert("Security Block: Mobile browser prevented saving due to Cross-Origin textures.");
        }
    }

    function startVideoRecording() {
        if (isRecording) return;
        const camVideo = getCameraVideo();
        const glCanvas = getWebGlCanvas();
        if (!glCanvas && !camVideo) return;

        if (typeof RecordRTC === 'undefined') {
            alert("RecordRTC script is missing. Please ensure it is loaded in player.html.");
            return;
        }

        isRecording = true;
        if (navigator.vibrate) navigator.vibrate(55);

        if (!compCanvas) {
            compCanvas = document.createElement('canvas');
            compCtx = compCanvas.getContext('2d', { alpha: false });
        }
        const aspect = window.innerHeight / window.innerWidth;
        compCanvas.width = 720;
        compCanvas.height = Math.round(720 * aspect);
        const w = compCanvas.width, h = compCanvas.height;

        function loop() {
            if (!isRecording) return;
            drawCompositeFrame(compCtx, w, h, camVideo, glCanvas);
            compAnimFrame = requestAnimationFrame(loop);
        }
        loop();
        
        let canvasStream;
        try {
            canvasStream = compCanvas.captureStream(30); 
        } catch(e) {
            alert("Browser blocked video stream creation.");
            isRecording = false;
            return;
        }

        // IOS STREAM HACK: Force the browser to render the stream internally so it doesn't drop frames
        if (!dummyStreamVideo) {
            dummyStreamVideo = document.createElement('video');
            dummyStreamVideo.style.display = 'none';
            dummyStreamVideo.muted = true;
            dummyStreamVideo.playsInline = true;
            document.body.appendChild(dummyStreamVideo);
        }
        dummyStreamVideo.srcObject = canvasStream;
        dummyStreamVideo.play().catch(()=>{});

        rtcRecorder = RecordRTC(canvasStream, {
            type: 'video',
            mimeType: 'video/webm',
            videoBitsPerSecond: 2500000,
            disableLogs: true
        });

        rtcRecorder.startRecording();
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
        ringFill.style.strokeDashoffset = (238.76 * (1.0 - frac)).toString();

        if (frac >= 1.0) stopVideoRecording();
        else progressAnimFrame = requestAnimationFrame(updateProgress);
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

        if (dummyStreamVideo) dummyStreamVideo.pause();

        if (rtcRecorder) {
            rtcRecorder.stopRecording(function() {
                const blob = rtcRecorder.getBlob();
                if (!blob || blob.size === 0) {
                    capturePhoto(); // Fallback
                } else {
                    showPreview(blob, 'video');
                }
                rtcRecorder.destroy();
                rtcRecorder = null;
            });
        }
    }

    function setZoom(val) {
        currentZoom = Math.min(2.5, Math.max(1.0, val));
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

    function handlePointerDown(e) {
        if (e.cancelable) e.preventDefault(); 
        if (isRecording && isLocked) { stopVideoRecording(); return; }
        isPressActive = true;
        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => { pressTimer = null; if (isPressActive) startVideoRecording(); }, 260);
    }

    function handlePointerMove(e) {
        if (!isPressActive && !isRecording) return;
        const curX = e.clientX || (e.touches && e.touches[0].clientX);
        const curY = e.clientY || (e.touches && e.touches[0].clientY);
        const dx = curX - startX, dy = startY - curY;
        if (isRecording) {
            if (dx < -45 && !isLocked) {
                isLocked = true; lockPill.classList.add('locked');
                if (navigator.vibrate) navigator.vibrate(40);
            }
            if (dy > 15) setZoom(1.0 + (dy - 15) / 130);
            else if (dy <= 15 && currentZoom > 1.0) setZoom(1.0);
        }
    }

    function handlePointerUp(e) {
        if (!isPressActive) return;
        isPressActive = false;
        if (pressTimer) {
            clearTimeout(pressTimer); pressTimer = null; capturePhoto(); return;
        }
        if (isRecording && !isLocked) stopVideoRecording();
    }

    shutterWrap.style.touchAction = 'none';
    shutterWrap.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

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
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
        };

        btnShare.style.display = 'none';
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([blob], filename, { type: blob.type });
                if (navigator.canShare({ files: [file] })) {
                    btnShare.style.display = 'block';
                    btnShare.onclick = async () => {
                        try { await navigator.share({ title: 'Nizhali AR', files: [file] }); } 
                        catch (e) {}
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