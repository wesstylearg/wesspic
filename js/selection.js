const selectionModule = {
    startSelection(e) {
        const pt = canvasModule.screenToCanvas(e.clientX, e.clientY);
        
        // If holding CTRL and selection is active, check if we clicked near edges to resize
        if (e.ctrlKey && state.selection.active) {
            const handle = this.getResizeHandle(pt.x, pt.y);
            if (handle) {
                state.selection.isResizing = true;
                state.selection.resizeHandle = handle;
                state.selection.startX = pt.x;
                state.selection.startY = pt.y;
                state.selection.startW = state.selection.w;
                state.selection.startH = state.selection.h;
                state.selection.startLeft = state.selection.x;
                state.selection.startTop = state.selection.y;
                return;
            }
        }

        // If we had a floating selection, commit it before starting a new selection
        if (state.selection.isFloating) {
            this.commitFloatingSelection();
        }

        state.selection.isSelecting = true;
        state.selection.startX = pt.x;
        state.selection.startY = pt.y;
        
        state.selection.x = pt.x;
        state.selection.y = pt.y;
        state.selection.w = 0;
        state.selection.h = 0;
        
        state.selection.active = true;
        canvasModule.render();
    },

    getResizeHandle(x, y) {
        const threshold = 10 / state.zoom;
        const sel = state.selection;
        
        const nearL = Math.abs(x - sel.x) < threshold;
        const nearR = Math.abs(x - (sel.x + sel.w)) < threshold;
        const nearT = Math.abs(y - sel.y) < threshold;
        const nearB = Math.abs(y - (sel.y + sel.h)) < threshold;
        const insideX = x >= sel.x && x <= sel.x + sel.w;
        const insideY = y >= sel.y && y <= sel.y + sel.h;

        if (nearT && nearL) return 'nw';
        if (nearT && nearR) return 'ne';
        if (nearB && nearL) return 'sw';
        if (nearB && nearR) return 'se';
        if (nearT && insideX) return 'n';
        if (nearB && insideX) return 's';
        if (nearL && insideY) return 'w';
        if (nearR && insideY) return 'e';
        
        return null;
    },

    updateSelection(e) {
        const pt = canvasModule.screenToCanvas(e.clientX, e.clientY);
        
        if (state.selection.isResizing) {
            const dx = pt.x - state.selection.startX;
            const dy = pt.y - state.selection.startY;
            let { startLeft, startTop, startW, startH, resizeHandle } = state.selection;
            
            let newL = startLeft, newT = startTop, newW = startW, newH = startH;

            if (resizeHandle.includes('w')) { newL += dx; newW -= dx; }
            if (resizeHandle.includes('e')) { newW += dx; }
            if (resizeHandle.includes('n')) { newT += dy; newH -= dy; }
            if (resizeHandle.includes('s')) { newH += dy; }
            
            // Prevent negative width/height
            if (newW < 0) { newL += newW; newW = Math.abs(newW); }
            if (newH < 0) { newT += newH; newH = Math.abs(newH); }

            state.selection.x = Math.floor(newL);
            state.selection.y = Math.floor(newT);
            state.selection.w = Math.floor(newW);
            state.selection.h = Math.floor(newH);
        } else if (state.selection.isSelecting) {
            const docW = state.document ? state.document.width : 0;
            const docH = state.document ? state.document.height : 0;
            
            const x = Math.max(0, Math.min(pt.x, docW));
            const y = Math.max(0, Math.min(pt.y, docH));
            
            state.selection.x = Math.floor(Math.min(state.selection.startX, x));
            state.selection.y = Math.floor(Math.min(state.selection.startY, y));
            state.selection.w = Math.floor(Math.abs(x - state.selection.startX));
            state.selection.h = Math.floor(Math.abs(y - state.selection.startY));
        }
        
        canvasModule.render();
    },

    endSelection(e) {
        if (state.selection.isResizing) {
            state.selection.isResizing = false;
        } else if (state.selection.isSelecting) {
            state.selection.isSelecting = false;
            if (state.selection.w < 5 || state.selection.h < 5) {
                this.clearSelection();
            }
        }
        canvasModule.render();
    },

    selectAll() {
        if (!state.image) return;
        this.commitFloatingSelection();
        state.selection.active = true;
        state.selection.x = 0;
        state.selection.y = 0;
        state.selection.w = state.document.width;
        state.selection.h = state.document.height;
        canvasModule.render();
    },

    clearSelection() {
        this.commitFloatingSelection();
        state.selection.active = false;
        canvasModule.render();
    },

    startMovingPixels(pt, layer) {
        if (!state.selection.active) return;
        
        if (!state.selection.isFloating) {
            if (!layer) return; // Need a layer to extract from
            
            const { x, y, w, h } = state.selection;
            
            const fCanvas = document.createElement('canvas');
            fCanvas.width = w;
            fCanvas.height = h;
            const fCtx = fCanvas.getContext('2d');
            
            fCtx.drawImage(layer.processedCanvas, x - layer.x, y - layer.y, w, h, 0, 0, w, h);
            
            state.selection.floatingData = fCanvas;
            state.selection.isFloating = true;
            state.selection.floatingLayerId = layer.id; // Remember which layer we extracted from
            
            layer.offscreenCtx.clearRect(x - layer.x, y - layer.y, w, h);
            imageModule.processAdjustments();
        }

        state.selection.isMovingPixels = true;
        state.selection.pixelMoveStartX = pt.x - state.selection.x;
        state.selection.pixelMoveStartY = pt.y - state.selection.y;
    },

    updateMovingPixels(pt) {
        state.selection.x = pt.x - state.selection.pixelMoveStartX;
        state.selection.y = pt.y - state.selection.pixelMoveStartY;
        canvasModule.render();
    },

    endMovingPixels() {
        state.selection.isMovingPixels = false;
    },

    commitFloatingSelection() {
        if (state.selection.isFloating && state.selection.floatingData) {
            const layer = layersModule.getLayer(state.selection.floatingLayerId) || layersModule.getActiveLayer();
            if (layer) {
                const { x, y } = state.selection;
                layer.offscreenCtx.drawImage(state.selection.floatingData, x - layer.x, y - layer.y);
                imageModule.processAdjustments(); // Update processed canvas
                layersModule.updateThumbnail(layer);
            }
            
            // Clean up temporary canvas memory
            state.selection.floatingData.width = 0;
            state.selection.floatingData.height = 0;
            state.selection.floatingData = null;
            state.selection.isFloating = false;
            state.selection.floatingLayerId = null;
            
            historyModule.saveState();
        }
    },

    renderUI(ctx) {
        if (!state.selection.active) return;

        const { x, y, w, h } = state.selection;
        
        const p1 = canvasModule.canvasToScreen(x, y);
        const p2 = canvasModule.canvasToScreen(x + w, y + h);
        
        const screenW = p2.x - p1.x;
        const screenH = p2.y - p1.y;

        ctx.save();
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.rect(p1.x, p1.y, screenW, screenH);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -performance.now() / 20; 
        ctx.strokeRect(p1.x, p1.y, screenW, screenH);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(p1.x - 1, p1.y - 1, screenW + 2, screenH + 2);

        ctx.restore();
    }
};
