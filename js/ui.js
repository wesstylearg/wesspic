const uiModule = {
    init() {
        this.setupTopMenu();
        this.setupTopBar();
        this.setupSidebar();
        this.setupResizer();
        
        document.getElementById('btn-reset-view').addEventListener('click', () => {
            canvasModule.centerImage();
        });
        
        document.getElementById('btn-select-all').addEventListener('click', () => {
            selectionModule.selectAll();
        });
        
        document.getElementById('btn-clear-selection').addEventListener('click', () => {
            selectionModule.clearSelection();
        });
        
        // Setup drop zone
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    imageModule.loadImage(file).catch(err => this.showToast(err.message));
                } else {
                    this.showToast('Por favor, selecciona una imagen válida');
                }
            }
        });
    },

    setupResizer() {
        const resizer = document.querySelector('.panel-resizer');
        const panel = document.getElementById('panel-adjust');
        if (!resizer || !panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            // Prevent text selection while dragging
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const diff = startX - e.clientX;
            // Limit the width between 200px and 400px
            const newWidth = Math.max(200, Math.min(400, startWidth + diff));
            panel.style.width = `${newWidth}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
            }
        });
    },

    setupTopMenu() {
        const fileBtn = document.getElementById('menu-file-btn');
        const fileDropdown = document.getElementById('dropdown-file');

        fileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            fileDropdown.classList.add('hidden');
        });
        
        // Placeholder for other menus
        document.getElementById('menu-edit-btn').addEventListener('click', () => {
            this.showToast('Menú Edición - Próximamente');
        });
        document.getElementById('menu-image-btn').addEventListener('click', () => {
            this.showToast('Menú Imagen - Próximamente');
        });
    },

    setupTopBar() {
        const fileInput = document.getElementById('file-input');
        
        document.getElementById('btn-open').addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                imageModule.loadImage(file)
                    .catch(err => this.showToast(err.message));
                fileInput.value = ''; // Reset so the same file can be opened again
            }
        });

        document.getElementById('btn-new').addEventListener('click', () => {
            if (state.image && confirm('¿Estás seguro de que deseas cerrar esta imagen?')) {
                state.image = null;
                state.document = {
                    width: 0,
                    height: 0,
                    previewScale: 1,
                    layers: [],
                    activeLayerId: null,
                    layerCounter: 0
                };
                selectionModule.clearSelection();
                adjustmentsModule.reset();
                historyModule.reset();
                layersModule.renderLayerList();
                canvasModule.render();
            }
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            imageModule.exportImage();
        });
    },

    setupSidebar() {
        const toolBtns = document.querySelectorAll('.tool-btn');
        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // If there's a floating selection, commit it before changing tools
                if (state.selection.isFloating) {
                    selectionModule.commitFloatingSelection();
                    canvasModule.render();
                }

                // Update active class
                toolBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update state
                const toolName = btn.getAttribute('data-tool');
                state.activeTool = toolName;

                // Update cursor
                const uiCanvas = document.getElementById('ui-canvas');
                if (toolName === 'move') {
                    uiCanvas.style.cursor = 'grab';
                } else if (toolName === 'selection' || toolName === 'crop') {
                    uiCanvas.style.cursor = 'crosshair';
                } else {
                    uiCanvas.style.cursor = 'default';
                }

                // Update UI panels
                this.showPanel(toolName);
            });
        });

        // Initialize default panel
        this.showPanel(state.activeTool);
    },

    showPanel(toolName) {
        const allPanels = document.querySelectorAll('.tool-panel');
        allPanels.forEach(p => p.classList.add('hidden'));
        
        const targetPanel = document.getElementById(`panel-${toolName}`);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
        }
    },

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Remove after animation (3s total)
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }
};
