// ============================================================================
// NIZHALI V7 // MODULE 03: MASTER TIMELINE KEYFRAME ANIMATOR & VIDEO TRANSPORT
// ============================================================================

export class TimelineKeyframes {
  constructor(onTickCallback) {
    this.onTick = onTickCallback;
    this.isPlaying = false;
    this.currentTime = 0.0;
    this.duration = 10.0;
    this.loop = true;
    this.lastStamp = 0;

    // Keyframe map by nodeId -> track -> [{ time, value }]
    this.keyframes = {
      'lyr-hero-vid': {
        position: [
          { time: 1.0, value: { x: 0, y: 0, z: 0 } },
          { time: 5.0, value: { x: 0, y: 0.25, z: -0.2 } }
        ],
        rotation: [{ time: 2.5, value: { x: 0, y: 0, z: 0 } }],
        scale: [],
        opacity: [
          { time: 0.0, value: 1.0 },
          { time: 9.0, value: 1.0 }
        ]
      }
    };
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastStamp = performance.now();
    requestAnimationFrame((ts) => this._step(ts));
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0.0;
    if (this.onTick) this.onTick(this.currentTime);
  }

  addKeyframe(node, track = 'position') {
    if (!node) return null;
    if (!this.keyframes[node.id]) {
      this.keyframes[node.id] = { position: [], rotation: [], scale: [], opacity: [] };
    }
    const kfList = this.keyframes[node.id][track];
    const snapshotVal =
      track === 'opacity'
        ? node.opacity
        : { ...node[track] };

    const entry = { time: +this.currentTime.toFixed(2), value: snapshotVal };
    kfList.push(entry);
    kfList.sort((a, b) => a.time - b.time);
    return entry;
  }

  formatTimecode(sec) {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const frames = Math.floor((sec % 1) * 30);
    return `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }

  _step(ts) {
    if (!this.isPlaying) return;
    const dt = (ts - this.lastStamp) / 1000;
    this.lastStamp = ts;
    this.currentTime += dt;

    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.currentTime = 0.0;
      } else {
        this.currentTime = this.duration;
        this.isPlaying = false;
      }
    }

    if (this.onTick) this.onTick(this.currentTime);
    if (this.isPlaying) {
      requestAnimationFrame((nextTs) => this._step(nextTs));
    }
  }
}
