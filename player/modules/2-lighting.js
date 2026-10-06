// ============================================================================
// PLAYER MODULE 02 // REAL-WORLD AMBIENT LIGHTING ESTIMATION ENGINE
// ============================================================================

(function() {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 16;
    sampleCanvas.height = 16;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    let targetR = 1.0, targetG = 1.0, targetB = 1.0;
    let currentR = 1.0, currentG = 1.0, currentB = 1.0;
    let cameraVideoEl = null;
    let sampleInterval = null;

    function findCameraVideo() {
        if (cameraVideoEl && cameraVideoEl.readyState >= 2) return cameraVideoEl;
        const vids = document.querySelectorAll('body > video');
        for (let v of vids) {
            if (v.srcObject || v.videoWidth > 0) {
                cameraVideoEl = v;
                return cameraVideoEl;
            }
        }
        return null;
    }

    function estimateRoomLighting() {
        if (!window.NizhaliPlayer.autoLightEnabled) return;
        const video = findCameraVideo();
        if (!video || video.readyState < 2) return;

        try {
            sampleCtx.drawImage(video, 0, 0, 16, 16);
            const imgData = sampleCtx.getImageData(0, 0, 16, 16).data;
            let sumR = 0, sumG = 0, sumB = 0;
            const totalPixels = 16 * 16;

            for (let i = 0; i < imgData.length; i += 4) {
                sumR += imgData[i];
                sumG += imgData[i + 1];
                sumB += imgData[i + 2];
            }

            const avgR = (sumR / totalPixels) / 255;
            const avgG = (sumG / totalPixels) / 255;
            const avgB = (sumB / totalPixels) / 255;

            // Perceived luminance (Rec. 709)
            const luma = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;

            // Map luma to a balanced brightness range (0.55 = dim room, 1.25 = bright room)
            const intensity = Math.min(1.25, Math.max(0.55, 0.45 + luma * 1.1));

            // Calculate subtle color temperature shift (warm indoor vs cool daylight)
            const avgGray = (avgR + avgG + avgB) / 3 || 0.001;
            const normR = Math.min(1.2, Math.max(0.8, avgR / avgGray));
            const normG = Math.min(1.2, Math.max(0.8, avgG / avgGray));
            const normB = Math.min(1.2, Math.max(0.8, avgB / avgGray));

            targetR = intensity * (0.8 + normR * 0.2);
            targetG = intensity * (0.8 + normG * 0.2);
            targetB = intensity * (0.8 + normB * 0.2);
        } catch (e) {
            // Video stream not ready yet
        }
    }

    // Smoothly interpolate lighting values every frame for seamless transitions
    function stepLightingLerp() {
        requestAnimationFrame(stepLightingLerp);
        if (!window.NizhaliPlayer.autoLightEnabled) {
            currentR += (1.0 - currentR) * 0.1;
            currentG += (1.0 - currentG) * 0.1;
            currentB += (1.0 - currentB) * 0.1;
        } else {
            currentR += (targetR - currentR) * 0.08;
            currentG += (targetG - currentG) * 0.08;
            currentB += (targetB - currentB) * 0.08;
        }
        window.NizhaliPlayer.ambientTint.r = currentR;
        window.NizhaliPlayer.ambientTint.g = currentG;
        window.NizhaliPlayer.ambientTint.b = currentB;
    }

    window.initLightingEngine = function(defaultEnabled = true) {
        window.NizhaliPlayer.autoLightEnabled = defaultEnabled;
        const btnLight = document.getElementById('btn-light');
        if (btnLight) {
            btnLight.classList.toggle('active', defaultEnabled);
            btnLight.onclick = () => {
                window.NizhaliPlayer.autoLightEnabled = !window.NizhaliPlayer.autoLightEnabled;
                btnLight.classList.toggle('active', window.NizhaliPlayer.autoLightEnabled);
            };
        }

        if (!sampleInterval) {
            sampleInterval = setInterval(estimateRoomLighting, 250);
            stepLightingLerp();
        }
    };
})();