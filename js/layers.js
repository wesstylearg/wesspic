const layersModule = {
    listEl: null,
    opacitySlider: null,
    blendSelect: null,
    thumbCanvas: null,
    thumbCtx: null,

    init() {
        this.listEl = document.getElementById('layers-list');
        this.opacitySlider = document.getElementById('layer-opacity');
        this.blendSelect = document.getElementById('layer-blend-mode');

        // Reusable singleton thumbnail canvas to eliminate GC churn
        this.thumbCanvas = document.createElement('canvas');
        this.thumbCanvas.width = 40;
        this.thumbCanvas.height = 40;
        this.thumbCtx = this.thumbCanvas.getContext('2d');

        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-add-layer').addEventListener('click', () => {
            if (!state.image) return;
            this.createEmptyLayer();
            historyModule.saveState();
        });

        document.getElementById('btn-layer-up').addEventListener('click', () => {
            this.moveLayer(state.document.activeLayerId, 1);
        });

        document.getElementById('btn-layer-down').addEventListener('click', () => {
            this.moveLayer(state.document.activeLayerId, -1);
        });

        document.getElementById('btn-layer-delete').addEventListener('click', () => {
            this.deleteLayer(state.document.activeLayerId);
        });

        document.getElementById('btn-layer-duplicate').addEventListener('click', () => {
            this.duplicateLayer(state.document.activeLayerId);
        });

        this.opacitySlider.addEventListener('input', (e) => {
            const layer = this.getActiveLayer();
            if (layer) {
                layer.opacity = parseInt(e.target.value, 10) / 100;
                canvasModule.render();
            }
        });
        this.opacitySlider.addEventListener('change', () => {
            historyModule.saveState();
        });

        this.blendSelect.addEventListener('change', (e) => {
            const layer = this.getActiveLayer();
            if (layer) {
                layer.blendMode = e.target.value;
                canvasModule.render();
                historyModule.saveState();
            }
        });
    },

    addLayer(imageEl, name) {
        state.document.layerCounter++;
        const layerId = `layer_${state.document.layerCounter}`;

        const offscreen = document.createElement('canvas');
        offscreen.width = state.document.width;
        offscreen.height = state.document.height;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        
        if (imageEl) {
            offCtx.drawImage(imageEl, 0, 0);
        }

        const processed = document.createElement('canvas');
        processed.width = state.document.width;
        processed.height = state.document.height;
        const procCtx = processed.getContext('2d', { willReadFrequently: true });
        if (imageEl) {
            procCtx.drawImage(imageEl, 0, 0);
        }

        const layer = {
            id: layerId,
            name: name || `Capa ${state.document.layerCounter}`,
            visible: true,
            locked: false,
            opacity: 1.0,
            blendMode: 'source-over',
            x: 0,
            y: 0,
            offscreenCanvas: offscreen,
            offscreenCtx: offCtx,
            processedCanvas: processed,
            processedCtx: procCtx,
            thumb: ''
        };

        // Add to top of stack
        state.document.layers.unshift(layer);
        this.updateThumbnail(layer, false);
        this.setActiveLayer(layerId, true);
    },

    createEmptyLayer() {
        this.addLayer(null, `Capa ${state.document.layerCounter + 1}`);
    },

    deleteLayer(id) {
        if (!id) return;
        const index = state.document.layers.findIndex(l => l.id === id);
        if (index === -1) return;
        
        if (state.document.layers.length <= 1) {
            uiModule.showToast('No puedes eliminar la única capa');
            return;
        }

        const [removed] = state.document.layers.splice(index, 1);
        if (removed) {
            // Free GPU texture memory immediately
            removed.offscreenCanvas.width = 0;
            removed.offscreenCanvas.height = 0;
            removed.processedCanvas.width = 0;
            removed.processedCanvas.height = 0;
        }

        // Set next active layer
        const nextLayer = state.document.layers[Math.min(index, state.document.layers.length - 1)];
        this.setActiveLayer(nextLayer.id, true);
        
        canvasModule.render();
        historyModule.saveState();
    },

    duplicateLayer(id) {
        const layer = this.getLayer(id);
        if (!layer) return;

        state.document.layerCounter++;
        const layerId = `layer_${state.document.layerCounter}`;

        const offscreen = document.createElement('canvas');
        offscreen.width = state.document.width;
        offscreen.height = state.document.height;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        offCtx.drawImage(layer.offscreenCanvas, 0, 0);

        const processed = document.createElement('canvas');
        processed.width = state.document.width;
        processed.height = state.document.height;
        const procCtx = processed.getContext('2d', { willReadFrequently: true });
        procCtx.drawImage(layer.processedCanvas, 0, 0);

        const newLayer = {
            ...layer,
            id: layerId,
            name: `${layer.name} copia`,
            offscreenCanvas: offscreen,
            offscreenCtx: offCtx,
            processedCanvas: processed,
            processedCtx: procCtx,
            thumb: layer.thumb
        };

        const index = state.document.layers.findIndex(l => l.id === id);
        state.document.layers.splice(index, 0, newLayer);
        
        this.setActiveLayer(layerId, true);
        canvasModule.render();
        historyModule.saveState();
    },

    moveLayer(id, delta) {
        const index = state.document.layers.findIndex(l => l.id === id);
        if (index === -1) return;
        
        const newIndex = index - delta; // UI is visually reversed (index 0 is top)
        if (newIndex < 0 || newIndex >= state.document.layers.length) return;

        const layer = state.document.layers.splice(index, 1)[0];
        state.document.layers.splice(newIndex, 0, layer);
        
        this.renderLayerList();
        canvasModule.render();
        historyModule.saveState();
    },

    getLayer(id) {
        return state.document.layers.find(l => l.id === id);
    },

    getActiveLayer() {
        return this.getLayer(state.document.activeLayerId);
    },

    setActiveLayer(id, forceFullListRender = false) {
        state.document.activeLayerId = id;
        
        // Sync UI inputs
        const layer = this.getLayer(id);
        if (layer) {
            if (this.opacitySlider) this.opacitySlider.value = Math.round(layer.opacity * 100);
            if (this.blendSelect) this.blendSelect.value = layer.blendMode;
        }

        // Reset adjustments panel because we switched layers
        adjustmentsModule.reset();

        if (forceFullListRender || !this.listEl || this.listEl.children.length !== state.document.layers.length) {
            this.renderLayerList();
        } else {
            // Fast class update without destroying DOM nodes
            const items = this.listEl.querySelectorAll('.layer-item');
            state.document.layers.forEach((l, idx) => {
                const item = items[idx];
                if (item) {
                    if (l.id === id) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                }
            });
        }
    },

    updateThumbnail(layer, updateDOM = true) {
        if (!this.thumbCtx || !state.document.width || !state.document.height) return;
        
        this.thumbCtx.clearRect(0, 0, 40, 40);
        
        // Calculate fit
        const scale = Math.min(40 / state.document.width, 40 / state.document.height);
        const w = state.document.width * scale;
        const h = state.document.height * scale;
        const x = (40 - w) / 2;
        const y = (40 - h) / 2;

        this.thumbCtx.drawImage(layer.processedCanvas, x, y, w, h);
        layer.thumb = this.thumbCanvas.toDataURL();

        if (updateDOM && this.listEl) {
            const index = state.document.layers.findIndex(l => l.id === layer.id);
            if (index !== -1 && this.listEl.children[index]) {
                const thumbImg = this.listEl.children[index].querySelector('.layer-thumb');
                if (thumbImg) {
                    thumbImg.src = layer.thumb;
                }
            }
        }
    },

    renderLayerList() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';

        const frag = document.createDocumentFragment();

        state.document.layers.forEach(layer => {
            const li = document.createElement('div');
            li.className = `layer-item ${layer.id === state.document.activeLayerId ? 'active' : ''}`;
            
            const visBtn = document.createElement('button');
            visBtn.className = 'layer-vis-btn';
            visBtn.innerHTML = layer.visible 
                ? '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
                : '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            visBtn.onclick = (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.renderLayerList();
                canvasModule.render();
                historyModule.saveState();
            };

            const thumb = document.createElement('img');
            thumb.className = 'layer-thumb';
            thumb.src = layer.thumb || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

            const name = document.createElement('span');
            name.className = 'layer-name';
            name.textContent = layer.name;
            
            name.ondblclick = (e) => {
                e.stopPropagation();
                const newName = prompt('Nombre de la capa:', layer.name);
                if (newName) {
                    layer.name = newName;
                    name.textContent = newName;
                    historyModule.saveState();
                }
            };

            const lockBtn = document.createElement('button');
            lockBtn.className = 'layer-lock-btn';
            lockBtn.innerHTML = layer.locked 
                ? '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
            lockBtn.style.opacity = layer.locked ? '1' : '0.2';
            lockBtn.onclick = (e) => {
                e.stopPropagation();
                layer.locked = !layer.locked;
                this.renderLayerList();
                canvasModule.render();
                historyModule.saveState();
            };

            li.appendChild(visBtn);
            li.appendChild(thumb);
            li.appendChild(name);
            li.appendChild(lockBtn);

            li.onclick = () => {
                this.setActiveLayer(layer.id);
            };

            frag.appendChild(li);
        });

        this.listEl.appendChild(frag);
    }
};
