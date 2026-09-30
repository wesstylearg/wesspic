const historyModule = {
    stack: [],
    currentIndex: -1,
    maxHistory: 12, // Reduced slightly to minimize RAM footprint while keeping ample undo steps

    init() {
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
            }
        });
    },

    freeRecord(record) {
        if (!record || !record.layers) return;
        for (const l of record.layers) {
            if (l.canvas) {
                l.canvas.width = 0;
                l.canvas.height = 0;
                l.canvas = null;
            }
        }
    },

    saveState() {
        if (!state.image) return;

        // Free discarded redo states
        if (this.currentIndex < this.stack.length - 1) {
            const discarded = this.stack.splice(this.currentIndex + 1);
            discarded.forEach(rec => this.freeRecord(rec));
        }

        const stateRecord = {
            width: state.document.width,
            height: state.document.height,
            activeLayerId: state.document.activeLayerId,
            layerCounter: state.document.layerCounter,
            layers: state.document.layers.map(l => {
                const cloneCanvas = document.createElement('canvas');
                cloneCanvas.width = l.offscreenCanvas.width;
                cloneCanvas.height = l.offscreenCanvas.height;
                cloneCanvas.getContext('2d').drawImage(l.offscreenCanvas, 0, 0);

                return {
                    id: l.id,
                    name: l.name,
                    visible: l.visible,
                    locked: l.locked,
                    opacity: l.opacity,
                    blendMode: l.blendMode,
                    x: l.x,
                    y: l.y,
                    canvas: cloneCanvas,
                    thumb: l.thumb
                };
            })
        };

        this.stack.push(stateRecord);
        
        if (this.stack.length > this.maxHistory) {
            const oldest = this.stack.shift();
            this.freeRecord(oldest);
        } else {
            this.currentIndex++;
        }

        this.updateButtons();
    },

    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.restoreState(this.stack[this.currentIndex]);
        }
    },

    redo() {
        if (this.currentIndex < this.stack.length - 1) {
            this.currentIndex++;
            this.restoreState(this.stack[this.currentIndex]);
        }
    },

    restoreState(record) {
        if (!record) return;

        state.document.width = record.width;
        state.document.height = record.height;
        state.document.layerCounter = record.layerCounter;
        
        // Clean up current layers' canvases
        for (const oldLayer of state.document.layers) {
            if (oldLayer.offscreenCanvas) {
                oldLayer.offscreenCanvas.width = 0;
                oldLayer.offscreenCanvas.height = 0;
            }
            if (oldLayer.processedCanvas) {
                oldLayer.processedCanvas.width = 0;
                oldLayer.processedCanvas.height = 0;
            }
        }

        // Restore all layers from clone snapshots
        const newLayers = [];
        
        for (const lData of record.layers) {
            const offscreen = document.createElement('canvas');
            offscreen.width = record.width;
            offscreen.height = record.height;
            const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
            
            const processed = document.createElement('canvas');
            processed.width = record.width;
            processed.height = record.height;
            const procCtx = processed.getContext('2d', { willReadFrequently: true });

            offCtx.drawImage(lData.canvas, 0, 0);
            procCtx.drawImage(lData.canvas, 0, 0);

            newLayers.push({
                id: lData.id,
                name: lData.name,
                visible: lData.visible,
                locked: lData.locked,
                opacity: lData.opacity,
                blendMode: lData.blendMode,
                x: lData.x,
                y: lData.y,
                offscreenCanvas: offscreen,
                offscreenCtx: offCtx,
                processedCanvas: processed,
                processedCtx: procCtx,
                thumb: lData.thumb
            });
        }

        state.document.layers = newLayers;
        layersModule.setActiveLayer(record.activeLayerId, true);
        
        adjustmentsModule.reset(); // Reset sliders since history states are always baked
        
        canvasModule.render();
        this.updateButtons();
    },

    updateButtons() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        if (btnUndo) btnUndo.disabled = this.currentIndex <= 0;
        if (btnRedo) btnRedo.disabled = this.currentIndex >= this.stack.length - 1;
    },
    
    reset() {
        for (const rec of this.stack) {
            this.freeRecord(rec);
        }
        this.stack = [];
        this.currentIndex = -1;
        this.updateButtons();
    }
};
