const cropModule = {
    init() {
        document.getElementById('btn-apply-crop').addEventListener('click', () => {
            this.applyCrop();
        });
    },

    applyCrop() {
        if (!state.image) {
            uiModule.showToast('No hay imagen para recortar');
            return;
        }

        if (!state.selection.active) {
            uiModule.showToast('Selecciona un área primero');
            return;
        }

        const { x, y, w, h } = state.selection;
        
        if (w === 0 || h === 0) {
            uiModule.showToast('El área de recorte no puede estar vacía');
            return;
        }

        imageModule.crop(x, y, w, h);
        uiModule.showToast('Imagen recortada');
    }
};
