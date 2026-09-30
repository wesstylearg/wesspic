const imageModule = {
    init() {
        // Initialization handled in layers.js now for canvases
    },

    async loadImage(fileOrUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.setupDocument(img);
                resolve();
            };
            img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
            
            if (fileOrUrl instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target.result;
                reader.readAsDataURL(fileOrUrl);
            } else {
                img.src = fileOrUrl;
            }
        });
    },

    setupDocument(img) {
        if (!state.image) {
            // First image loaded, setup document dimensions
            state.document.width = img.width;
            state.document.height = img.height;
            state.image = true; // Set flag for UI compatibility
            layersModule.addLayer(img, "Fondo");
            canvasModule.centerImage();
            historyModule.reset();
        } else {
            // Document already exists, add as new layer
            layersModule.addLayer(img, "Foto");
        }
        
        state.selection.active = false;
        historyModule.saveState();
        
        uiModule.showToast('Imagen cargada.');
    },

    processAdjustments(isFull = true) {
        if (!state.image) return;
        
        const layer = layersModule.getActiveLayer();
        if (!layer) return;

        const adj = state.adjustments;
        const docW = state.document.width;
        const docH = state.document.height;
        
        // Always start by drawing the original image to clear previous adjustments
        layer.processedCtx.clearRect(0, 0, docW, docH);
        layer.processedCtx.drawImage(layer.offscreenCanvas, 0, 0);
        
        // If all adjustments are 0, we can just return since original is drawn
        const hasFilters = adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0 || adj.temperature !== 0;
        const hasPixelAdj = adj.shadows !== 0 || adj.highlights !== 0;

        if (!hasFilters && !hasPixelAdj) {
            if (isFull) {
                layersModule.updateThumbnail(layer);
            }
            canvasModule.render();
            return;
        }

        if (hasFilters) {
            const b = 100 + adj.brightness;
            const c = 100 + adj.contrast;
            const s = 100 + adj.saturation;
            
            let tempFilter = '';
            if (adj.temperature !== 0) {
                const amount = Math.abs(adj.temperature) * 0.5;
                tempFilter = adj.temperature > 0 
                    ? `sepia(${amount}%) hue-rotate(-15deg) saturate(120%)` 
                    : `sepia(${amount}%) hue-rotate(180deg) saturate(120%)`;
            }
            
            const filterStr = `brightness(${b}%) contrast(${c}%) saturate(${s}%) ${tempFilter}`.trim();
            
            layer.processedCtx.save();

            // If there's an active selection, only apply adjustments inside it
            if (state.selection.active && !state.selection.isFloating) {
                layer.processedCtx.beginPath();
                layer.processedCtx.rect(state.selection.x - layer.x, state.selection.y - layer.y, state.selection.w, state.selection.h);
                layer.processedCtx.clip();
            }
            
            // Draw filtered image over the base
            layer.processedCtx.filter = filterStr;
            layer.processedCtx.drawImage(layer.offscreenCanvas, 0, 0);
            layer.processedCtx.filter = 'none';
            layer.processedCtx.restore();
        }

        // Fast pixel loop for shadows and highlights
        if (isFull && hasPixelAdj) {
            let startX = 0, startY = 0, w = docW, h = docH;
            if (state.selection.active && !state.selection.isFloating) {
                startX = state.selection.x - layer.x;
                startY = state.selection.y - layer.y;
                w = state.selection.w;
                h = state.selection.h;
            }
            
            startX = Math.max(0, Math.floor(startX));
            startY = Math.max(0, Math.floor(startY));
            w = Math.min(docW - startX, Math.floor(w));
            h = Math.min(docH - startY, Math.floor(h));
            
            if (w > 0 && h > 0) {
                const imageData = layer.processedCtx.getImageData(startX, startY, w, h);
                const data = imageData.data;
                const len = data.length;
                const shadows = adj.shadows / 100;
                const highlights = adj.highlights / 100;
                const doShadows = shadows !== 0;
                const doHighlights = highlights !== 0;

                if (doShadows && doHighlights) {
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const lum = (r * 77 + g * 150 + b * 29) >> 8; // fast integer luminance [0, 255]
                        
                        let factor = 1.0;
                        if (lum < 128) {
                            factor += shadows * (1.0 - (lum / 128));
                        } else {
                            factor += highlights * ((lum - 128) / 127);
                        }
                        
                        data[i] = r * factor > 255 ? 255 : (r * factor < 0 ? 0 : r * factor);
                        data[i + 1] = g * factor > 255 ? 255 : (g * factor < 0 ? 0 : g * factor);
                        data[i + 2] = b * factor > 255 ? 255 : (b * factor < 0 ? 0 : b * factor);
                    }
                } else if (doShadows) {
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const lum = (r * 77 + g * 150 + b * 29) >> 8;
                        
                        if (lum < 128) {
                            const factor = 1.0 + shadows * (1.0 - (lum / 128));
                            data[i] = r * factor > 255 ? 255 : (r * factor < 0 ? 0 : r * factor);
                            data[i + 1] = g * factor > 255 ? 255 : (g * factor < 0 ? 0 : g * factor);
                            data[i + 2] = b * factor > 255 ? 255 : (b * factor < 0 ? 0 : b * factor);
                        }
                    }
                } else if (doHighlights) {
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const lum = (r * 77 + g * 150 + b * 29) >> 8;
                        
                        if (lum >= 128) {
                            const factor = 1.0 + highlights * ((lum - 128) / 127);
                            data[i] = r * factor > 255 ? 255 : (r * factor < 0 ? 0 : r * factor);
                            data[i + 1] = g * factor > 255 ? 255 : (g * factor < 0 ? 0 : g * factor);
                            data[i + 2] = b * factor > 255 ? 255 : (b * factor < 0 ? 0 : b * factor);
                        }
                    }
                }
                
                layer.processedCtx.putImageData(imageData, startX, startY);
            }
        }
        
        if (isFull) {
            layersModule.updateThumbnail(layer);
        }
        canvasModule.render();
    },

    crop(x, y, w, h) {
        if (!state.image) return;
        
        // Update document dimensions
        state.document.width = w;
        state.document.height = h;

        // Crop every layer
        state.document.layers.forEach(layer => {
            const imageData = layer.offscreenCtx.getImageData(x - layer.x, y - layer.y, w, h);
            
            layer.offscreenCanvas.width = w;
            layer.offscreenCanvas.height = h;
            layer.offscreenCtx.putImageData(imageData, 0, 0);
            
            layer.processedCanvas.width = w;
            layer.processedCanvas.height = h;
            layer.processedCtx.drawImage(layer.offscreenCanvas, 0, 0);
            
            layer.x = 0;
            layer.y = 0;
            
            layersModule.updateThumbnail(layer);
        });
        
        // Re-apply adjustments if needed (we reset them here for simplicity)
        adjustmentsModule.reset();
        
        state.selection.active = false;
        canvasModule.centerImage();
        layersModule.renderLayerList();
        historyModule.saveState();
    },
    
    exportImage() {
        if (!state.image) return;
        
        const docW = state.document.width;
        const docH = state.document.height;
        if (!docW || !docH) return;

        const expCanvas = document.createElement('canvas');
        expCanvas.width = docW;
        expCanvas.height = docH;
        const expCtx = expCanvas.getContext('2d');
        
        // Composite layers from bottom to top
        const layers = state.document.layers;
        const len = layers.length;
        for (let i = len - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            expCtx.globalAlpha = layer.opacity;
            expCtx.globalCompositeOperation = layer.blendMode;
            expCtx.drawImage(layer.processedCanvas, layer.x, layer.y);
        }
        
        expCanvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'wesspic-export.png';
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            
            // Free canvas memory
            expCanvas.width = 0;
            expCanvas.height = 0;
        }, 'image/png');
    }
};
