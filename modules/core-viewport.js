// ============================================================================
// NIZHALI V7 // MODULE 01: CORE 3D VIEWPORT, V6 SLATE GRID, GIZMOS & UNDO/REDO
// ============================================================================

export class CoreViewport {
  constructor(canvasEl, onSelectCallback, onTransformChangeCallback) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d');
    this.onSelect = onSelectCallback;
    this.onTransformChange = onTransformChangeCallback;

    this.camera = { x: 0, y: 0, zoom: 1.0, pitch: 18, yaw: -24 };
    this.gizmoMode = 'translate';
    this.isSpacePanning = false;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Undo / Redo Command Stack
    this.undoStack = [];
    this.redoStack = [];

    // Scene Graph (Folders + Layers)
    this.nodes = [
      {
        id: 'grp-portal',
        name: 'PORTAL_GROUP',
        type: 'folder',
        parentId: null,
        visible: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        opacity: 1.0
      },
      {
        id: 'lyr-hero-vid',
        name: '01_HERO_VIDEO.MP4',
        type: 'video',
        parentId: 'grp-portal',
        visible: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        opacity: 1.0,
        portalMode: 'frame',
        portalDepth: -0.5,
        chromaMode: 'off',
        chromaThreshold: 0.35,
        loopPreset: 'none'
      },
      {
        id: 'lyr-fg-mesh',
        name: '02_FG_MODEL.GLB',
        type: 'model3d',
        parentId: 'grp-portal',
        visible: true,
        position: { x: 0.4, y: 0.2, z: 0.35 },
        rotation: { x: 0, y: 15, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        opacity: 1.0,
        portalMode: 'none',
        portalDepth: 0,
        chromaMode: 'off',
        chromaThreshold: 0.35,
        loopPreset: 'float'
      }
    ];

    this.selectedId = 'lyr-hero-vid';
    this.pointCloudPreview = [];
    this.lastFrameTime = performance.now();
    this.fps = 60;

    this._bindEvents();
    this.resize();
    requestAnimationFrame(() => this.renderLoop());
  }

  _bindEvents() {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        this.isSpacePanning = true;
        this.canvas.style.cursor = 'grab';
      } else if (e.key.toLowerCase() === 'f') {
        this.focusSelected();
      } else if (e.key.toLowerCase() === 'w') {
        this.setGizmoMode('translate');
      } else if (e.key.toLowerCase() === 'e') {
        this.setGizmoMode('rotate');
      } else if (e.key.toLowerCase() === 'r') {
        this.setGizmoMode('scale');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.createGroupFromSelected();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePanning = false;
        this.canvas.style.cursor = 'default';
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      if (!this.isSpacePanning) {
        this.pushHistorySnapshot();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.dragStart = { x: e.clientX, y: e.clientY };

      if (this.isSpacePanning) {
        this.camera.x += dx;
        this.camera.y += dy;
        return;
      }

      const node = this.getSelectedNode();
      if (!node) return;

      if (this.gizmoMode === 'translate') {
        node.position.x = +(node.position.x + dx * 0.01).toFixed(2);
        node.position.y = +(node.position.y - dy * 0.01).toFixed(2);
      } else if (this.gizmoMode === 'rotate') {
        node.rotation.y = Math.round(node.rotation.y + dx * 0.5);
        node.rotation.x = Math.round(node.rotation.x + dy * 0.5);
      } else if (this.gizmoMode === 'scale') {
        const delta = +(dx * 0.005).toFixed(2);
        node.scale.x = Math.max(0.1, +(node.scale.x + delta).toFixed(2));
        node.scale.y = Math.max(0.1, +(node.scale.y + delta).toFixed(2));
        node.scale.z = Math.max(0.1, +(node.scale.z + delta).toFixed(2));
      }

      if (this.onTransformChange) this.onTransformChange(node);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      this.camera.zoom = Math.min(3.5, Math.max(0.35, this.camera.zoom * factor));
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  getSelectedNode() {
    return this.nodes.find((n) => n.id === this.selectedId) || null;
  }

  selectNode(id) {
    this.selectedId = id;
    const node = this.getSelectedNode();
    if (node && this.onSelect) this.onSelect(node);
  }

  setGizmoMode(mode) {
    this.gizmoMode = mode;
    document.querySelectorAll('[data-gizmo]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.gizmo === mode);
    });
  }

  focusSelected() {
    const node = this.getSelectedNode();
    if (!node) {
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.zoom = 1.0;
      return;
    }
    this.camera.x = -node.position.x * 80;
    this.camera.y = node.position.y * 80;
    this.camera.zoom = 1.15;
  }

  pushHistorySnapshot() {
    this.undoStack.push(JSON.stringify(this.nodes));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.nodes));
    this.nodes = JSON.parse(this.undoStack.pop());
    const node = this.getSelectedNode();
    if (node && this.onTransformChange) this.onTransformChange(node);
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.nodes));
    this.nodes = JSON.parse(this.redoStack.pop());
    const node = this.getSelectedNode();
    if (node && this.onTransformChange) this.onTransformChange(node);
  }

  createGroupFromSelected() {
    this.pushHistorySnapshot();
    const grpId = 'grp-' + Date.now().toString(36).slice(-4);
    const newGroup = {
      id: grpId,
      name: 'FOLDER_GRP_' + this.nodes.filter((n) => n.type === 'folder').length,
      type: 'folder',
      parentId: null,
      visible: true,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      opacity: 1.0
    };
    const current = this.getSelectedNode();
    if (current && current.type !== 'folder') {
      current.parentId = grpId;
    }
    this.nodes.unshift(newGroup);
    return newGroup;
  }

  renderLoop() {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastFrameTime);
    this.fps = Math.round(1000 / dt);
    this.lastFrameTime = now;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + this.camera.x, h / 2 + this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw 3D Perspective Floor Grid Plane
    this._drawPerspectiveGrid(ctx);

    // Draw Scene Nodes & 4-Plane Portal Bounds
    this.nodes.forEach((node) => {
      if (!node.visible || node.type === 'folder') return;
      this._drawNode(ctx, node, node.id === this.selectedId, now * 0.001);
    });

    // Draw 3D Toy Point Cloud Features if active
    if (this.pointCloudPreview.length > 0) {
      this._drawPointCloud(ctx, now * 0.001);
    }

    // Draw Interactive 3-Axis Hardware Gizmo on Selected Node
    const sel = this.getSelectedNode();
    if (sel) {
      this._drawGizmo(ctx, sel);
    }

    ctx.restore();
    requestAnimationFrame(() => this.renderLoop());
  }

  _drawPerspectiveGrid(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    const span = 280;
    const step = 28;
    for (let i = -span; i <= span; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, -span * 0.65);
      ctx.lineTo(i * 1.25, span * 0.65);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-span, i * 0.65);
      ctx.lineTo(span, i * 0.65);
      ctx.stroke();
    }
  }

  _drawNode(ctx, node, isSelected, timeSec) {
    let px = node.position.x * 90;
    let py = -node.position.y * 90;
    let pz = node.position.z * 50;

    if (node.loopPreset === 'float') {
      py += Math.sin(timeSec * 2.4) * 8;
    }

    const sx = node.scale.x * (1 + pz * 0.002);
    const sy = node.scale.y * (1 + pz * 0.002);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((node.rotation.z * Math.PI) / 180);
    ctx.scale(sx, sy);
    ctx.globalAlpha = node.opacity ?? 1.0;

    // 4-Plane Portal Stencil Visualization
    if (node.portalMode && node.portalMode !== 'none') {
      ctx.strokeStyle = '#00b862';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(-115, -75, 230, 150);
      ctx.setLineDash([]);
    }

    ctx.fillStyle = node.type === 'video' ? 'rgba(0, 102, 255, 0.22)' : 'rgba(255, 85, 0, 0.24)';
    ctx.strokeStyle = isSelected ? '#ff5500' : '#c8c5be';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.fillRect(-90, -56, 180, 112);
    ctx.strokeRect(-90, -56, 180, 112);

    ctx.fillStyle = '#f4f2ee';
    ctx.font = '10px monospace';
    ctx.fillText(node.name, -82, -38);
    ctx.fillStyle = '#f5b800';
    ctx.fillText(`Z:${node.position.z}m | ${node.portalMode.toUpperCase()}`, -82, 46);
    ctx.restore();
  }

  _drawPointCloud(ctx, timeSec) {
    ctx.save();
    this.pointCloudPreview.forEach((pt) => {
      const rx = pt.x * Math.cos(timeSec * 0.6) - pt.z * Math.sin(timeSec * 0.6);
      const ry = pt.y;
      ctx.fillStyle = pt.confidence > 0.8 ? '#00b862' : '#f5b800';
      ctx.fillRect(rx * 110 - 2, -ry * 110 - 2, 4, 4);
    });
    ctx.restore();
  }

  _drawGizmo(ctx, node) {
    const gx = node.position.x * 90;
    const gy = -node.position.y * 90;
    ctx.save();
    ctx.translate(gx, gy);

    // X Axis (Red/Orange)
    ctx.strokeStyle = '#ff5500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(58, 0);
    ctx.stroke();

    // Y Axis (Green)
    ctx.strokeStyle = '#00b862';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -58);
    ctx.stroke();

    // Z Axis / Mode Ring (Blue/Yellow)
    ctx.strokeStyle = '#0066ff';
    if (this.gizmoMode === 'rotate') {
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-34, 34);
      ctx.stroke();
    }

    ctx.restore();
  }
}
