const canvasModule = {
    mainCanvas: null,
    uiCanvas: null,
    mainCtx: null,
    uiCtx: null,
    container: null,
    emptyStateEl: null,
    renderPending: false,

    init() {
        this.mainCanvas = document.getElementById('main-canvas');
        this.uiCanvas = document.getElementById('ui-canvas');
        this.container = document.getElementById('canvas-container');
        this.emptyStateEl = document.getElementById('empty-state');
        
        // Enable GPU acceleration for the display canvas (do NOT use willReadFrequently on display canvases)
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.uiCtx = this.uiCanvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize(), { passive: true });

        // Event listeners for zooming and panning
        this.uiCanvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.uiCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Prevent default drag
        this.uiCanvas.addEventListener('dragstart', e => e.preventDefault());
    },

    resize() {
        const rect = this.container.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (this.mainCanvas.width !== w || this.mainCanvas.height !== h) {
            this.mainCanvas.width = w;
            this.mainCanvas.height = h;
            this.uiCanvas.width = w;
            this.uiCanvas.height = h;
        }
        this.render();
    },

    // Convert screen coordinates to image coordinates
    screenToCanvas(x, y) {
        const rect = this.uiCanvas.getBoundingClientRect();
        const screenX = x - rect.left;
        const screenY = y - rect.top;
        
        const canvasX = (screenX - state.panX) / state.zoom;
        const canvasY = (screenY - state.panY) / state.zoom;
        return { x: canvasX, y: canvasY };
    },

    // Convert image coordinates to screen coordinates
    canvasToScreen(x, y) {
        const screenX = x * state.zoom + state.panX;
        const screenY = y * state.zoom + state.panY;
        return { x: screenX, y: screenY };
    },

    centerImage() {
        if (!state.image) return;
        
        const rect = this.container.getBoundingClientRect();
        
        // Calculate zoom to fit image in view with 40px padding
        const padding = 40;
        const scaleX = (rect.width - padding) / state.document.width;
        const scaleY = (rect.height - padding) / state.document.height;
        
        state.zoom = Math.min(scaleX, scaleY, 1);
        
        state.panX = (rect.width - state.document.width * state.zoom) / 2;
        state.panY = (rect.height - state.document.height * state.zoom) / 2;
        
        this.render();
    },

    handleWheel(e) {
        if (!state.image) return;
        e.preventDefault();

        const pt = this.screenToCanvas(e.clientX, e.clientY);
        const zoomFactor = 1.1;
        if (e.deltaY < 0) {
            state.zoom *= zoomFactor;
        } else {
            state.zoom /= zoomFactor;
        }
        state.zoom = Math.max(0.01, Math.min(state.zoom, 50));

        const rect = this.uiCanvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        state.panX = screenX - pt.x * state.zoom;
        state.panY = screenY - pt.y * state.zoom;

        this.render();
    },

    handleMouseDown(e) {
        if (!state.image) return;
        const pt = this.screenToCanvas(e.clientX, e.clientY);

        if (state.activeTool === 'move') {
            const layer = layersModule.getActiveLayer();
            if (layer && !layer.locked) {
                if (state.selection.active && !state.selection.isFloating) {
                    // Start floating pixels from layer if clicking inside selection
                    const sel = state.selection;
                    if (pt.x >= sel.x && pt.x <= sel.x + sel.w && pt.y >= sel.y && pt.y <= sel.y + sel.h) {
                        selectionModule.startMovingPixels(pt, layer);
                        return;
                    }
                } else if (state.selection.isFloating) {
                    const sel = state.selection;
                    if (pt.x >= sel.x && pt.x <= sel.x + sel.w && pt.y >= sel.y && pt.y <= sel.y + sel.h) {
                        selectionModule.startMovingPixels(pt);
                        return;
                    }
                }

                // Move the whole layer
                state.isPanning = false;
                state.selection.isMovingLayer = true;
                state.selection.moveStartX = pt.x - layer.x;
                state.selection.moveStartY = pt.y - layer.y;
                this.uiCanvas.style.cursor = 'grabbing';
                return;
            }
        } else if (state.activeTool === 'selection' || state.activeTool === 'crop') {
            selectionModule.startSelection(e);
            return;
        }

        // Fallback to pan (if holding spacebar or nothing else matched)
        state.isPanning = true;
        state.panStartX = e.clientX - state.panX;
        state.panStartY = e.clientY - state.panY;
        this.uiCanvas.style.cursor = 'grabbing';
    },

    handleMouseMove(e) {
        if (!state.image) return;
        
        if (state.activeTool === 'selection' && e.ctrlKey && state.selection.active && !state.selection.isSelecting && !state.selection.isResizing) {
            const pt = this.screenToCanvas(e.clientX, e.clientY);
            const handle = selectionModule.getResizeHandle(pt.x, pt.y);
            if (handle) {
                if (handle === 'nw' || handle === 'se') this.uiCanvas.style.cursor = 'nwse-resize';
                else if (handle === 'ne' || handle === 'sw') this.uiCanvas.style.cursor = 'nesw-resize';
                else if (handle === 'n' || handle === 's') this.uiCanvas.style.cursor = 'ns-resize';
                else if (handle === 'e' || handle === 'w') this.uiCanvas.style.cursor = 'ew-resize';
            } else {
                this.uiCanvas.style.cursor = 'crosshair';
            }
        } else if (state.activeTool === 'selection' && !state.selection.isResizing) {
            this.uiCanvas.style.cursor = 'crosshair';
        }

        if (state.isPanning) {
            state.panX = e.clientX - state.panStartX;
            state.panY = e.clientY - state.panStartY;
            this.render();
        } else if (state.selection.isMovingLayer) {
            const layer = layersModule.getActiveLayer();
            if (layer) {
                const pt = this.screenToCanvas(e.clientX, e.clientY);
                layer.x = pt.x - state.selection.moveStartX;
                layer.y = pt.y - state.selection.moveStartY;
                this.render();
            }
        } else if (state.selection.isMovingPixels) {
            const pt = this.screenToCanvas(e.clientX, e.clientY);
            selectionModule.updateMovingPixels(pt);
        } else if (state.selection.isSelecting || state.selection.isResizing) {
            selectionModule.updateSelection(e);
        }
    },

    handleMouseUp(e) {
        if (state.isPanning) {
            state.isPanning = false;
            this.uiCanvas.style.cursor = state.activeTool === 'move' ? 'grab' : 'default';
        } else if (state.selection.isMovingLayer) {
            state.selection.isMovingLayer = false;
            this.uiCanvas.style.cursor = state.activeTool === 'move' ? 'grab' : 'default';
            historyModule.saveState();
        } else if (state.selection.isMovingPixels) {
            selectionModule.endMovingPixels();
        } else if (state.selection.isSelecting || state.selection.isResizing) {
            selectionModule.endSelection(e);
        }
    },

    render() {
        if (this.renderPending) return;
        this.renderPending = true;
        requestAnimationFrame(() => {
            this.renderPending = false;
            this.executeRender();
        });
    },

    executeRender() {
        const mw = this.mainCanvas.width;
        const mh = this.mainCanvas.height;

        this.mainCtx.clearRect(0, 0, mw, mh);
        this.uiCtx.clearRect(0, 0, mw, mh);

        if (!state.image) {
            if (this.emptyStateEl) this.emptyStateEl.style.display = 'block';
            return;
        }
        if (this.emptyStateEl) this.emptyStateEl.style.display = 'none';

        this.mainCtx.save();
        this.mainCtx.translate(state.panX, state.panY);
        this.mainCtx.scale(state.zoom, state.zoom);

        // Document background
        this.mainCtx.fillStyle = '#1A1A1A';
        this.mainCtx.fillRect(0, 0, state.document.width, state.document.height);

        // Render layers from bottom to top (layers[0] is top, so iterate backwards)
        const layers = state.document.layers;
        const len = layers.length;
        for (let i = len - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            
            this.mainCtx.globalAlpha = layer.opacity;
            this.mainCtx.globalCompositeOperation = layer.blendMode;
            this.mainCtx.drawImage(layer.processedCanvas, layer.x, layer.y);
        }
        
        this.mainCtx.globalAlpha = 1.0;
        this.mainCtx.globalCompositeOperation = 'source-over';
        
        if (state.selection.isFloating && state.selection.floatingData) {
            this.mainCtx.drawImage(state.selection.floatingData, state.selection.x, state.selection.y);
        }
        
        this.mainCtx.restore();

        selectionModule.renderUI(this.uiCtx);
    }
};
