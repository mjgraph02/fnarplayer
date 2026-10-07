// ============================================================================
// CREATOR MODULE // CORE VIEWPORT & LAYER MANAGER
// ============================================================================

(function() {
    let activeLayerId = null;

    // 1. ADD NEW LAYER TO STATE
    function createLayer(type) {
        const id = 'layer_' + Date.now();
        const layerCount = window.NizhaliProject.targets[0].layers.length + 1;
        
        const newLayer = {
            id: id,
            name: `${type.toUpperCase()} ${layerCount}`,
            type: type, // video, image, model, folder
            url: "",
            transform: {
                pos: { x:0, y:0, z:0 },
                rot: { x:0, y:0, z:0 },
                scale: { x:1, y:1, z:1 }
            },
            playback: { rule: "loop", delay: 0 },
            render: { blendMode: "normal", chromaKey: false }
        };
        
        window.NizhaliProject.targets[0].layers.unshift(newLayer); // Add to top of list
        window.autoSaveProject();
        
        selectLayer(id);
    }

    // 2. RENDER THE UI (SIDEBAR LIST & VIEWPORT CANVAS)
    function refreshUI() {
        const listEl = document.getElementById('layer-list');
        const viewportEl = document.getElementById('core-viewport');
        const layers = window.NizhaliProject.targets[0].layers;

        listEl.innerHTML = '';
        
        if (layers.length === 0) {
            viewportEl.innerHTML = `<div class="viewport-placeholder" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);"><h2>Drop a target image to begin</h2></div>`;
            document.getElementById('prop-empty-state').style.display = 'block';
            document.getElementById('layer-settings').style.display = 'none';
            return;
        }

        viewportEl.innerHTML = ''; // Clear canvas

        layers.forEach((layer) => {
            // A. Sidebar List Item
            const li = document.createElement('li');
            li.style.padding = "10px";
            li.style.marginBottom = "6px";
            li.style.backgroundColor = layer.id === activeLayerId ? "var(--border)" : "var(--bg-main)";
            li.style.border = layer.id === activeLayerId ? "1px solid var(--accent)" : "1px solid var(--border)";
            li.style.borderRadius = "var(--border-radius)";
            li.style.cursor = "pointer";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            
            const icon = layer.type === 'video' ? '🎥' : layer.type === 'image' ? '🖼️' : layer.type === 'folder' ? '📁' : '🧊';
            li.innerHTML = `
                <span style="font-weight: ${layer.id === activeLayerId ? 'bold' : 'normal'}; color: ${layer.id === activeLayerId ? 'var(--accent)' : 'inherit'};">${icon} ${layer.name}</span> 
                <button class="btn-icon" data-delete="${layer.id}" title="Delete Layer" style="color:#ff4444; font-size: 11px;">✖</button>
            `;
            
            li.onclick = (e) => {
                if(!e.target.dataset.delete) selectLayer(layer.id);
            };
            listEl.appendChild(li);

            // B. Center Viewport Element (Visual Representation)
            if (layer.type !== 'folder') {
                const vis = document.createElement('div');
                vis.style.position = 'absolute';
                
                // Map the abstract coordinates to visual pixels for the 2D stage
                // Base coordinate (0,0) is center. Scale translates directly.
                vis.style.left = `calc(50% + ${layer.transform.pos.x * 100}px)`;
                vis.style.top = `calc(50% - ${layer.transform.pos.y * 100}px)`; // -y because browser Y goes down
                vis.style.transform = `translate(-50%, -50%) scale(${layer.transform.scale.x}) rotate(${layer.transform.rot.z}deg)`;
                
                vis.style.border = layer.id === activeLayerId ? "2px solid var(--accent)" : "1px dashed rgba(255,255,255,0.3)";
                vis.style.backgroundColor = layer.id === activeLayerId ? "rgba(0, 255, 136, 0.1)" : "rgba(255, 255, 255, 0.05)";
                vis.style.padding = "40px";
                vis.style.borderRadius = "8px";
                vis.style.cursor = "grab";
                vis.style.display = "flex";
                vis.style.alignItems = "center";
                vis.style.justifyContent = "center";
                vis.style.fontSize = "24px";
                
                vis.innerHTML = icon;
                vis.onclick = () => selectLayer(layer.id);
                
                // Keep selected layer on top
                vis.style.zIndex = layer.id === activeLayerId ? 100 : 10;
                
                viewportEl.appendChild(vis);
            }
        });

        // Delete Layer Logic
        document.querySelectorAll('button[data-delete]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const idToRemove = e.target.dataset.delete;
                window.NizhaliProject.targets[0].layers = window.NizhaliProject.targets[0].layers.filter(l => l.id !== idToRemove);
                if(activeLayerId === idToRemove) activeLayerId = null;
                window.autoSaveProject();
                refreshUI();
            }
        });
    }

    // 3. SELECT ACTIVE LAYER & FILL RIGHT SIDEBAR
    function selectLayer(id) {
        activeLayerId = id;
        refreshUI(); // Highlight in list and viewport

        const layer = window.NizhaliProject.targets[0].layers.find(l => l.id === id);
        if(!layer) return;

        document.getElementById('prop-empty-state').style.display = 'none';
        document.getElementById('layer-settings').style.display = 'block';

        // Populate properties
        document.getElementById('prop-url').value = layer.url || "";
        document.getElementById('prop-playback').value = layer.playback.rule;
        document.getElementById('prop-delay').value = layer.playback.delay;
        
        document.getElementById('prop-scale-x').value = layer.transform.scale.x;
        document.getElementById('prop-scale-y').value = layer.transform.scale.y;
        document.getElementById('prop-scale-z').value = layer.transform.scale.z;
        
        document.getElementById('prop-pos-x').value = layer.transform.pos.x;
        document.getElementById('prop-pos-y').value = layer.transform.pos.y;
        document.getElementById('prop-pos-z').value = layer.transform.pos.z;

        document.getElementById('prop-rot-x').value = layer.transform.rot.x;
        document.getElementById('prop-rot-y').value = layer.transform.rot.y;
        document.getElementById('prop-rot-z').value = layer.transform.rot.z;

        document.getElementById('prop-blend').value = layer.render.blendMode;
        document.getElementById('prop-chroma').checked = layer.render.chromaKey;
        
        // Hide playback rules if it's an image
        document.getElementById('prop-playback-group').style.display = layer.type === 'video' ? 'block' : 'none';
    }

    // 4. BIND UI LISTENERS TO UPDATE STATE
    function bindEvents() {
        document.getElementById('btn-add-video')?.addEventListener('click', () => createLayer('video'));
        document.getElementById('btn-add-image')?.addEventListener('click', () => createLayer('image'));
        document.getElementById('btn-add-model')?.addEventListener('click', () => createLayer('model'));
        document.getElementById('btn-add-folder')?.addEventListener('click', () => createLayer('folder'));

        const propIds = [
            'prop-url', 'prop-playback', 'prop-delay', 
            'prop-scale-x', 'prop-scale-y', 'prop-scale-z',
            'prop-pos-x', 'prop-pos-y', 'prop-pos-z',
            'prop-rot-x', 'prop-rot-y', 'prop-rot-z',
            'prop-blend', 'prop-chroma'
        ];
        
        propIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    if (!activeLayerId) return;
                    const layer = window.NizhaliProject.targets[0].layers.find(l => l.id === activeLayerId);
                    if (!layer) return;

                    // Write properties to state
                    if(id === 'prop-url') layer.url = el.value;
                    if(id === 'prop-playback') layer.playback.rule = el.value;
                    if(id === 'prop-delay') layer.playback.delay = parseFloat(el.value) || 0;
                    if(id === 'prop-scale-x') layer.transform.scale.x = parseFloat(el.value) || 1;
                    if(id === 'prop-scale-y') layer.transform.scale.y = parseFloat(el.value) || 1;
                    if(id === 'prop-scale-z') layer.transform.scale.z = parseFloat(el.value) || 1;
                    if(id === 'prop-pos-x') layer.transform.pos.x = parseFloat(el.value) || 0;
                    if(id === 'prop-pos-y') layer.transform.pos.y = parseFloat(el.value) || 0;
                    if(id === 'prop-pos-z') layer.transform.pos.z = parseFloat(el.value) || 0;
                    if(id === 'prop-rot-x') layer.transform.rot.x = parseFloat(el.value) || 0;
                    if(id === 'prop-rot-y') layer.transform.rot.y = parseFloat(el.value) || 0;
                    if(id === 'prop-rot-z') layer.transform.rot.z = parseFloat(el.value) || 0;
                    if(id === 'prop-blend') layer.render.blendMode = el.value;
                    if(id === 'prop-chroma') layer.render.chromaKey = el.checked;

                    // If scale is locked visually via the button, enforce uniform scaling
                    const lockBtn = document.getElementById('btn-lock-scale');
                    if (lockBtn && lockBtn.style.opacity !== '0.4' && id.startsWith('prop-scale-')) {
                        const val = parseFloat(el.value) || 1;
                        layer.transform.scale.x = val;
                        layer.transform.scale.y = val;
                        layer.transform.scale.z = val;
                        document.getElementById('prop-scale-x').value = val;
                        document.getElementById('prop-scale-y').value = val;
                        document.getElementById('prop-scale-z').value = val;
                    }

                    window.autoSaveProject();
                    refreshUI(); // Update viewport instantly so changes are visible
                });
            }
        });
    }

    // 5. INIT
    window.addEventListener('DOMContentLoaded', () => {
        // Slight delay ensures the autosave loaded correctly from studio-main.js first
        setTimeout(() => {
            bindEvents();
            refreshUI();
            
            // If layers exist from a loaded save, select the first one by default
            if(window.NizhaliProject.targets[0].layers.length > 0) {
                selectLayer(window.NizhaliProject.targets[0].layers[0].id);
            }
        }, 150); 
    });

})();