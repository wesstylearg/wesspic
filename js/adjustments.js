const adjustmentsModule = {
    ranges: null,
    rafId: null,

    init() {
        this.ranges = document.querySelectorAll('input[type="range"][data-adjust]');
        this.ranges.forEach(range => {
            range.addEventListener('input', (e) => {
                const param = e.target.getAttribute('data-adjust');
                state.adjustments[param] = parseInt(e.target.value, 10);
                
                // Throttle live adjustments with RAF
                if (this.rafId) cancelAnimationFrame(this.rafId);
                this.rafId = requestAnimationFrame(() => {
                    this.rafId = null;
                    imageModule.processAdjustments(false);
                });
            });

            range.addEventListener('change', () => {
                if (this.rafId) cancelAnimationFrame(this.rafId);
                this.rafId = null;
                imageModule.processAdjustments(true);
            });

            range.addEventListener('dblclick', (e) => {
                e.target.value = 0;
                const param = e.target.getAttribute('data-adjust');
                state.adjustments[param] = 0;
                if (this.rafId) cancelAnimationFrame(this.rafId);
                this.rafId = null;
                imageModule.processAdjustments(true);
            });
        });

        document.getElementById('btn-apply-adjustments').addEventListener('click', () => {
            if (state.image) {
                const layer = layersModule.getActiveLayer();
                if (!layer || layer.locked) {
                    uiModule.showToast('La capa actual no puede ser modificada');
                    return;
                }

                // Bake adjustments into the original offscreen canvas of the active layer
                layer.offscreenCtx.clearRect(0, 0, state.document.width, state.document.height);
                layer.offscreenCtx.drawImage(layer.processedCanvas, 0, 0);
                
                // Reset sliders to 0
                this.reset();
                
                layersModule.updateThumbnail(layer);
                
                // Save history
                historyModule.saveState();
                uiModule.showToast('Ajustes aplicados a ' + layer.name);
            }
        });

        document.getElementById('btn-reset-adjustments').addEventListener('click', () => {
            this.reset();
        });
    },

    reset() {
        // Reset state
        state.adjustments = {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            shadows: 0,
            highlights: 0,
            temperature: 0
        };

        if (this.ranges) {
            this.ranges.forEach(range => {
                range.value = 0;
            });
        }

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        imageModule.processAdjustments();
    }
};
