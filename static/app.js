// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const resultsCount = document.getElementById('resultsCount');
const labelModal = new bootstrap.Modal('#labelModal');
const labeledObjectsList = document.getElementById('labeledObjects');
const capturedImage = document.getElementById('capturedImage');
const objectName = document.getElementById('objectName');
const saveLabelBtn = document.getElementById('saveLabelBtn');
const storageError = document.getElementById('storageError');

// State Management
const state = {
    model: null,
    isDetecting: false,
    currentDetections: [],
    stream: null,
    labeledObjects: JSON.parse(localStorage.getItem('visionAI-labeledObjects')) || [],
    currentCapture: null,
    savedLabels: {}
};

// Update status display
function updateStatus(message, statusType) {
    const indicator = statusEl.querySelector('.status-indicator');
    indicator.className = 'status-indicator';
    
    if (statusType) {
        indicator.classList.add(`status-${statusType}`);
    }
    
    statusEl.querySelector('span:last-child').textContent = message;
}

// Load COCO-SSD model
async function loadModel() {
    try {
        updateStatus('Loading model...', 'loading');
        state.model = await cocoSsd.load();
        updateStatus('Model loaded', 'ready');
        startBtn.disabled = false;
    } catch (error) {
        console.error('Model loading error:', error);
        updateStatus('Model failed to load', 'error');
    }
}

// Webcam setup
async function setupWebcam() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam API not supported');
    }

    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
    }

    try {
        state.stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });

        video.srcObject = state.stream;
        video.style.display = 'block';
        
        return new Promise((resolve) => {
            const onReady = () => {
                video.removeEventListener('loadedmetadata', onReady);
                video.removeEventListener('playing', onReady);
                
                // Set canvas dimensions to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                resolve();
            };
            
            video.addEventListener('loadedmetadata', onReady);
            video.addEventListener('playing', onReady);
        });
    } catch (error) {
        console.error('Camera access error:', error);
        updateStatus('Please allow camera access', 'error');
        throw error;
    }
}

// Detect objects in video frame with labels
async function detectFrame() {
    if (!state.isDetecting || !state.model) return;

    try {
        state.currentDetections = await state.model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update saved labels from storage
        updateSavedLabels();
        
        state.currentDetections.forEach(detection => {
            const savedLabel = state.savedLabels[detection.class];
            const displayText = savedLabel 
                ? `${savedLabel} (${detection.class}) ${(detection.score * 100).toFixed(1)}%`
                : `${detection.class} ${(detection.score * 100).toFixed(1)}%`;
            
            // Draw bounding box
            ctx.strokeStyle = savedLabel ? '#FF00FF' : '#00FFFF';
            ctx.lineWidth = 4;
            ctx.strokeRect(...detection.bbox);
            
            // Draw label background
            ctx.fillStyle = savedLabel ? '#FF00FF' : '#00FFFF';
            const textWidth = ctx.measureText(displayText).width;
            ctx.fillRect(
                detection.bbox[0],
                detection.bbox[1] - 25,
                textWidth + 10,
                25
            );
            
            // Draw text
            ctx.fillStyle = '#000000';
            ctx.font = '16px Arial';
            ctx.fillText(
                displayText,
                detection.bbox[0] + 5,
                detection.bbox[1] - 7
            );
        });
        
        updateResultsCount();
        requestAnimationFrame(detectFrame);
    } catch (error) {
        console.error('Detection error:', error);
        updateStatus('Detection error', 'error');
        stopDetection();
    }
}

// Update saved labels from localStorage
function updateSavedLabels() {
    const saved = JSON.parse(localStorage.getItem('visionAI-labeledObjects')) || [];
    state.savedLabels = saved.reduce((acc, item) => {
        acc[item.class] = item.label;
        return acc;
    }, {});
}

// Update results count and list
function updateResultsCount() {
    resultsCount.textContent = `${state.currentDetections.length} ${state.currentDetections.length === 1 ? 'object' : 'objects'}`;
    renderLabeledObjectsList();
}

// Render the list of labeled objects
function renderLabeledObjectsList() {
    labeledObjectsList.innerHTML = '';
    
    state.labeledObjects.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'list-group-item labeled-object d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <div>
                <strong>${obj.label}</strong> (${obj.class})
            </div>
            <div>
                <button class="btn btn-sm btn-outline-danger delete-btn" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        labeledObjectsList.appendChild(item);
    });

    // Event delegation for delete buttons
    labeledObjectsList.addEventListener('click', handleDeleteClick);
}

// Handle delete button clicks
function handleDeleteClick(e) {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(deleteBtn.getAttribute('data-index'));
        if (!isNaN(index)) {
            showDeleteConfirmation(index);
        }
    }
}

// Show delete confirmation dialog
function showDeleteConfirmation(index) {
    // Create modal elements
    const modal = document.createElement('div');
    modal.className = 'delete-confirmation-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1050';

    const dialog = document.createElement('div');
    dialog.className = 'delete-confirmation-dialog bg-white p-4 rounded';
    dialog.style.maxWidth = '400px';
    dialog.style.width = '90%';
    dialog.style.boxShadow = '0 0.5rem 1rem rgba(0, 0, 0, 0.15)';

    dialog.innerHTML = `
        <h5 class="mb-3">Confirm Deletion</h5>
        <p>Are you sure you want to delete this label?</p>
        <div class="d-flex justify-content-end gap-2 mt-4">
            <button id="cancelDelete" class="btn btn-secondary">Cancel</button>
            <button id="confirmDelete" class="btn btn-danger">Delete</button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Handle confirm button
    dialog.querySelector('#confirmDelete').addEventListener('click', () => {
        deleteLabel(index);
        document.body.removeChild(modal);
    });

    // Handle cancel button
    dialog.querySelector('#cancelDelete').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Close when clicking outside dialog
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Delete labeled object
function deleteLabel(index) {
    if (index >= 0 && index < state.labeledObjects.length) {
        state.labeledObjects.splice(index, 1);
        try {
            localStorage.setItem('visionAI-labeledObjects', JSON.stringify(state.labeledObjects));
            updateSavedLabels();
            renderLabeledObjectsList();
        } catch (error) {
            console.error('Error deleting label:', error);
            showStorageError('Failed to delete label. Local storage may be full.');
        }
    }
}

// Save labeled object
function saveLabeledObject() {
    const label = objectName.value.trim();
    if (!label || !state.currentCapture) return;

    try {
        // Check if we already have this label
        const existingIndex = state.labeledObjects.findIndex(
            obj => obj.class === state.currentCapture.class && obj.label === label
        );

        if (existingIndex >= 0) {
            // Update if exists
            state.labeledObjects[existingIndex] = {
                ...state.currentCapture,
                label
            };
        } else {
            // Add new labeled object
            state.labeledObjects.push({
                ...state.currentCapture,
                label
            });
        }

        // Save to localStorage
        localStorage.setItem('visionAI-labeledObjects', JSON.stringify(state.labeledObjects));
        
        // Update UI
        updateSavedLabels();
        renderLabeledObjectsList();
        labelModal.hide();
        objectName.value = '';
        
    } catch (error) {
        console.error('Error saving label:', error);
        showStorageError('Failed to save label. Local storage may be full.');
    }
}

// Show storage error
function showStorageError(message) {
    storageError.style.display = 'block';
    storageError.querySelector('#storageErrorText').textContent = message;
    setTimeout(() => {
        storageError.style.display = 'none';
    }, 5000);
}

// Capture object for labeling
function captureObject(detection) {
    state.currentCapture = detection;
    capturedImage.src = '';
    
    // Create thumbnail from canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw video frame
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw bounding box
    tempCtx.strokeStyle = '#FF0000';
    tempCtx.lineWidth = 4;
    tempCtx.strokeRect(...detection.bbox);
    
    // Convert to data URL and show in modal
    capturedImage.src = tempCanvas.toDataURL('image/jpeg');
    labelModal.show();
}

// Start detection
function startDetection() {
    if (!state.model) {
        updateStatus('Model not loaded', 'error');
        return;
    }
    
    state.isDetecting = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Detecting objects - click objects to label', 'ready');
    detectFrame();
}

// Stop detection
function stopDetection() {
    state.isDetecting = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('Ready', 'ready');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resultsCount.textContent = '0 objects';
}

// Initialize event listeners
function initEventListeners() {
    startBtn.addEventListener('click', startDetection);
    stopBtn.addEventListener('click', stopDetection);
    saveLabelBtn.addEventListener('click', saveLabeledObject);
    
    // Click on canvas to label an object
    canvas.addEventListener('click', (e) => {
        if (!state.isDetecting || state.currentDetections.length === 0) return;
        
        // Find which object was clicked
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedDetection = state.currentDetections.find(detection => {
            const [dx, dy, width, height] = detection.bbox;
            return x >= dx && x <= dx + width && y >= dy && y <= dy + height;
        });
        
        if (clickedDetection) {
            captureObject(clickedDetection);
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await setupWebcam();
        await loadModel();
        updateSavedLabels();
        renderLabeledObjectsList();
        initEventListeners();
        updateStatus('Ready - click Start to begin detection', 'ready');
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('Initialization failed', 'error');
    }
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
    }
    if (state.isDetecting) {
        stopDetection();
    }
});