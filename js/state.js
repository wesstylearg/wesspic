const state = {
    // Document model
    document: {
        width: 0,
        height: 0,
        previewScale: 1,
        layers: [],
        activeLayerId: null,
        layerCounter: 0
    },

    image: null, // Keeps flag true if document has layers for UI compat
    
    // Viewport
    zoom: 1,
    panX: 0,
    panY: 0,

    activeTool: 'move',
    
    adjustments: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        shadows: 0,
        highlights: 0,
        temperature: 0
    },
    
    selection: {
        active: false,
        x: 0, y: 0, w: 0, h: 0,
        isSelecting: false,
        isResizing: false,
        resizeHandle: null,
        startX: 0, startY: 0,
        startW: 0, startH: 0,
        startTop: 0, startLeft: 0,
        isFloating: false,
        floatingData: null,
        floatingLayerId: null,
        isMovingPixels: false,
        pixelMoveStartX: 0,
        pixelMoveStartY: 0,
        isMovingLayer: false,
        moveStartX: 0,
        moveStartY: 0
    },

    // Mouse state for panning
    isPanning: false,
    panStartX: 0,
    panStartY: 0
};
