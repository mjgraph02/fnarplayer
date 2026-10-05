// ============================================================================
// NIZHALI V7 // MODULE 06: CREATOR STUDIO MASTER CONTROLLER
// ============================================================================

import { CoreViewport } from './core-viewport.js';
import { Tracker3DEPnP } from './tracker-3d-epnp.js';
import { TimelineKeyframes } from './timeline-keyframes.js';
import { PortalClippingEngine } from './portal-clipping.js';
import { DropboxCryptoVault } from './dropbox-crypto.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('studio-canvas');
  const tracker = new Tracker3DEPnP();

  const syncInspectorToNode = (node) => {
    if (!node) return;
    document.getElementById('selected-layer-id').textContent = node.name;
    document.getElementById('inp-pos-x').value = node.position.x;
    document.getElementById('inp-pos-y').value = node.position.y;
    document.getElementById('inp-pos-z').value = node.position.z;
    document.getElementById('inp-rot-x').value = node.rotation.x;
    document.getElementById('inp-rot-y').value = node.rotation.y;
    document.getElementById('inp-rot-z').value = node.rotation.z;
    document.getElementById('inp-scl-x').value = node.scale.x;
    document.getElementById('inp-scl-y').value = node.scale.y;
    document.getElementById('inp-scl-z').value = node.scale.z;
    document.getElementById('inp-opacity').value = node.opacity ?? 1;
    if (node.portalMode) document.getElementById('sel-portal-mode').value = node.portalMode;
    if (node.loopPreset) document.getElementById('sel-loop-preset').value = node.loopPreset;
  };

  const viewport = new CoreViewport(canvas, syncInspectorToNode, syncInspectorToNode);

  const timeline = new TimelineKeyframes((timeSec) => {
    document.getElementById('timecode-display').textContent = timeline.formatTimecode(timeSec);
    const pct = Math.min(100, (timeSec / timeline.duration) * 100);
    const playhead = document.getElementById('playhead-line');
    if (playhead) {
      playhead.style.left = `calc(145px + (100% - 145px) * ${pct / 100})`;
    }
  });

  // Mode Switch Tabs (01 PRINT / 02 3D TOY / 03 FACE AR)
  document.querySelectorAll('#tracking-mode-tabs .hw-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tracking-mode-tabs .hw-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      tracker.activeMode = btn.dataset.mode;
      document.getElementById('hud-mode-readout').textContent = `MODE: ${btn.textContent}`;
    });
  });

  // Gizmo Toolbar Buttons
  document.querySelectorAll('[data-gizmo]').forEach((btn) => {
    btn.addEventListener('click', () => viewport.setGizmoMode(btn.dataset.gizmo));
  });

  document.getElementById('btn-reset-cam').addEventListener('click', () => viewport.focusSelected());
  document.getElementById('btn-undo').addEventListener('click', () => viewport.undo());
  document.getElementById('btn-redo').addEventListener('click', () => viewport.redo());

  // 3D Toy Point-Cloud Surface Scanner
  document.getElementById('btn-scan-glb').addEventListener('click', () => {
    const scanRes = tracker.extractGlbPointCloud(140);
    viewport.pointCloudPreview = scanRes.points;
    document.getElementById('scanner-status').textContent =
      `EXTRACTED ${scanRes.pointCount} 3D SURFACE DESCRIPTORS (${scanRes.solver})`;
  });

  document.getElementById('btn-test-flow').addEventListener('click', () => {
    const pose = tracker.solveEPnPPose(tracker.toySurfacePoints, [1, 2, 3, 4]);
    document.getElementById('scanner-status').textContent = pose.locked
      ? `6DoF LOCKED // REPROJ ERR: ${pose.reprojectionError}px`
      : 'SCANNING FOR 3D TOY SURFACE...';
  });

  // Compile .mind Target
  document.getElementById('btn-compile-mind').addEventListener('click', () => {
    const compiled = tracker.compileMindTarget(`TARGET_0${tracker.compiledTargets.length}`);
    const li = document.createElement('li');
    li.className = 'layer-item';
    li.innerHTML = `<span>[0${tracker.compiledTargets.length - 1}] ${compiled.name}</span><span class="status-badge">${compiled.keypoints} PTS</span>`;
    document.getElementById('target-list').appendChild(li);
    document.getElementById('project-status').textContent = '.MIND READY';
  });

  // Timeline Transport
  document.getElementById('btn-tl-play').addEventListener('click', () => timeline.play());
  document.getElementById('btn-tl-stop').addEventListener('click', () => timeline.stop());
  document.getElementById('btn-add-keyframe').addEventListener('click', () => {
    const sel = viewport.getSelectedNode();
    if (!sel) return;
    const kf = timeline.addKeyframe(sel, 'position');
    const lane = document.getElementById('lane-position');
    const diamond = document.createElement('div');
    diamond.className = 'keyframe-diamond active';
    diamond.style.left = `${(kf.time / timeline.duration) * 100}%`;
    lane.appendChild(diamond);
  });

  // Inspector Numeric Inputs
  const bindNum = (id, applyFn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const node = viewport.getSelectedNode();
      if (node) applyFn(node, parseFloat(el.value) || 0);
    });
  };

  bindNum('inp-pos-x', (n, v) => (n.position.x = v));
  bindNum('inp-pos-y', (n, v) => (n.position.y = v));
  bindNum('inp-pos-z', (n, v) => (n.position.z = v));
  bindNum('inp-rot-x', (n, v) => (n.rotation.x = v));
  bindNum('inp-rot-y', (n, v) => (n.rotation.y = v));
  bindNum('inp-rot-z', (n, v) => (n.rotation.z = v));
  bindNum('inp-scl-x', (n, v) => (n.scale.x = v));
  bindNum('inp-scl-y', (n, v) => (n.scale.y = v));
  bindNum('inp-scl-z', (n, v) => (n.scale.z = v));
  bindNum('inp-opacity', (n, v) => (n.opacity = v));

  document.getElementById('sel-portal-mode').addEventListener('change', (e) => {
    const node = viewport.getSelectedNode();
    if (node) node.portalMode = e.target.value;
  });

  document.getElementById('sel-loop-preset').addEventListener('change', (e) => {
    const node = viewport.getSelectedNode();
    if (node) node.loopPreset = e.target.value;
  });

  // AES-256 Encryption & Project JSON Export
  document.getElementById('btn-encrypt-link').addEventListener('click', async () => {
    const raw = document.getElementById('inp-raw-link').value;
    const key = document.getElementById('inp-aes-key').value;
    const dom = document.getElementById('inp-domain-lock').value;
    const cipher = await DropboxCryptoVault.encryptLinkPayload(raw, key, dom);
    document.getElementById('cipher-output').textContent = cipher;
  });

  const exportProjectJson = () => {
    const payload = {
      version: 'NIZHALI_V7',
      exportedAt: new Date().toISOString(),
      trackingMode: tracker.activeMode,
      targets: tracker.compiledTargets,
      toyPointCloudCount: tracker.toySurfacePoints.length,
      portalClippingPlanes: PortalClippingEngine.compute4ClippingPlanes(1.6, 0.9),
      encryptedStream: document.getElementById('cipher-output').textContent,
      sceneNodes: viewport.nodes,
      keyframes: timeline.keyframes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project.json';
    a.click();
    document.getElementById('project-status').textContent = 'EXPORTED V7';
  };

  document.getElementById('btn-save-json').addEventListener('click', exportProjectJson);
  document.getElementById('btn-export-project').addEventListener('click', exportProjectJson);
});
