// ============================================================================
// CREATOR MODULE // STUDIO MAIN (CORE STATE & AUTOSAVE)
// ============================================================================

(function() {
    window.NizhaliProject = {
        version: "7.4",
        projectName: "Untitled Project",
        global: {
            theme: "default",          
            trackerType: "image",      
            autoLight: true,           
            autoAudio: false,          
            maxTrack: 1,               
            lossBehavior: "fade",      
            lossHoldTime: 0.35,
            magnetSnap: true           // State for new alignment guide toggle
        },
        targets: [
            {
                id: "target_0",
                name: "Print 1",
                imageUrl: null,
                aspectRatio: 1.0,
                layers: [] 
            }
        ]
    };

    window.autoSaveProject = function() {
        const nameInput = document.getElementById('project-name');
        if (nameInput) window.NizhaliProject.projectName = nameInput.value;
        localStorage.setItem('nizhali_project_autosave', JSON.stringify(window.NizhaliProject));
    };

    function loadFromAutoSave() {
        const saved = localStorage.getItem('nizhali_project_autosave');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                window.NizhaliProject = { ...window.NizhaliProject, ...parsed };
                
                const nameInput = document.getElementById('project-name');
                if (nameInput) nameInput.value = window.NizhaliProject.projectName;
                
                const themeSelect = document.getElementById('theme-selector');
                if (themeSelect) {
                    themeSelect.value = window.NizhaliProject.global.theme || 'default';
                    document.body.setAttribute('data-theme', themeSelect.value);
                }

                const trackerSelect = document.getElementById('tracker-type-select');
                if (trackerSelect) trackerSelect.value = window.NizhaliProject.global.trackerType || 'image';

                const g = window.NizhaliProject.global;
                if(document.getElementById('global-auto-light')) document.getElementById('global-auto-light').checked = g.autoLight;
                if(document.getElementById('global-auto-audio')) document.getElementById('global-auto-audio').checked = g.autoAudio;
                if(document.getElementById('global-loss-behavior')) document.getElementById('global-loss-behavior').value = g.lossBehavior;
                if(document.getElementById('global-loss-time')) document.getElementById('global-loss-time').value = g.lossHoldTime;
                if(document.getElementById('global-max-track')) document.getElementById('global-max-track').value = g.maxTrack;
            } catch (e) {
                console.error("Failed to parse autosave data.", e);
            }
        }
    }

    function bindTopBarControls() {
        const nameInput = document.getElementById('project-name');
        if (nameInput) nameInput.addEventListener('input', window.autoSaveProject);

        const themeSelect = document.getElementById('theme-selector');
        if (themeSelect) themeSelect.addEventListener('change', (e) => {
            window.NizhaliProject.global.theme = e.target.value;
            window.autoSaveProject();
        });

        const trackerSelect = document.getElementById('tracker-type-select');
        if (trackerSelect) trackerSelect.addEventListener('change', (e) => {
            window.NizhaliProject.global.trackerType = e.target.value;
            window.autoSaveProject();
        });

        const btnSave = document.getElementById('btn-save-json');
        if (btnSave) btnSave.addEventListener('click', () => {
            window.autoSaveProject(); 
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.NizhaliProject, null, 2));
            const dlAnchorEle = document.createElement('a');
            dlAnchorEle.setAttribute("href", dataStr);
            dlAnchorEle.setAttribute("download", window.NizhaliProject.projectName.replace(/\s+/g, '_') + "_v7.json");
            document.body.appendChild(dlAnchorEle);
            dlAnchorEle.click();
            dlAnchorEle.remove();
        });

        const btnLoad = document.getElementById('btn-load-json');
        if (btnLoad) btnLoad.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => { 
                const file = e.target.files[0]; 
                const reader = new FileReader();
                reader.readAsText(file, 'UTF-8');
                reader.onload = readerEvent => {
                    try {
                        window.NizhaliProject = JSON.parse(readerEvent.target.result);
                        window.autoSaveProject(); 
                        location.reload();        
                    } catch(err) { alert("Invalid Project File."); }
                }
            }
            input.click();
        });
    }

    function bindGlobalSettings() {
        const ids = ['global-auto-light', 'global-auto-audio', 'global-loss-behavior', 'global-loss-time', 'global-max-track'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    const g = window.NizhaliProject.global;
                    g.autoLight = document.getElementById('global-auto-light').checked;
                    g.autoAudio = document.getElementById('global-auto-audio').checked;
                    g.lossBehavior = document.getElementById('global-loss-behavior').value;
                    g.lossHoldTime = parseFloat(document.getElementById('global-loss-time').value) || 0;
                    g.maxTrack = parseInt(document.getElementById('global-max-track').value, 10) || 1;
                    window.autoSaveProject();
                });
            }
        });
    }

    function bindPropertyInspector() {
        const propIds = [
            'prop-url', 'prop-playback', 'prop-delay', 
            'prop-scale-x', 'prop-scale-y', 'prop-scale-z',
            'prop-pos-x', 'prop-pos-y', 'prop-pos-z',
            'prop-rot-x', 'prop-rot-y', 'prop-rot-z',
            'prop-blend', 'prop-chroma', 'prop-easing'
        ];
        propIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('input', window.autoSaveProject);
        });

        const magnetBtn = document.getElementById('btn-toggle-magnet');
        if(magnetBtn) magnetBtn.addEventListener('click', () => {
            window.NizhaliProject.global.magnetSnap = !window.NizhaliProject.global.magnetSnap;
            window.autoSaveProject();
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        loadFromAutoSave();
        bindTopBarControls();
        bindGlobalSettings();
        bindPropertyInspector();

        // Reveal panels so you can verify the layout immediately
        document.getElementById('prop-empty-state').style.display = 'none';
        document.getElementById('layer-settings').style.display = 'block';
    });

})();