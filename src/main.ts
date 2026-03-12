import { HandTracker } from './handTracking';
import { GestureDetector } from './gestureDetector';
import { DrawingCanvas } from './drawingCanvas';
import { HandVisualizer } from './handVisualizer';
import { Scene3D } from './scene3D';
import { ObjectManager } from './objectManager';
import { Multiplayer, MultiplayerEvent } from './multiplayer';
import { HandLandmarks, GestureState, BalloonObject, Stroke } from './types';
import { GESTURE, TIMING } from './constants';

class AirCanvas {
  // Core components
  private handTracker: HandTracker;
  private gestureDetector: GestureDetector;
  private drawingCanvas: DrawingCanvas;
  private handVisualizer: HandVisualizer;
  private scene3D: Scene3D;
  private objectManager: ObjectManager;
  private multiplayer: Multiplayer;

  // Preview components
  private previewVideo: HTMLVideoElement;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;

  // DOM elements
  private loadingOverlay: HTMLElement;
  private statusMessage: HTMLElement;
  private colorSwatches: NodeListOf<HTMLElement>;

  // Modal elements
  private inviteModal: HTMLElement;
  private roomCodeDisplay: HTMLElement;
  private joinCodeInput: HTMLInputElement;
  private statusDot: HTMLElement;
  private statusText: HTMLElement;

  // State
  private isDrawing = false;
  private currentColor = '#FFB3BA';
  private lastGestureState: GestureState | null = null;
  private currentLandmarks: HandLandmarks | null = null;
  private palmHoldStart = 0;
  private handDetected = false;
  private lastFrameTime = 0;
  private grabbedObject: BalloonObject | null = null;
  private lastPinchPosition: { x: number; y: number } | null = null;

  // Mouse controls state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private selectedObject: BalloonObject | null = null;

  // Camera preview drag state
  private isPreviewDragging = false;
  private previewDragStartX = 0;
  private previewDragStartY = 0;
  private previewStartLeft = 0;
  private previewStartTop = 0;

  constructor() {
    // Get DOM elements
    const videoElement = document.getElementById('webcam') as HTMLVideoElement;
    const sceneCanvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
    const drawCanvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
    const handCanvas = document.getElementById('hand-canvas') as HTMLCanvasElement;

    // Preview elements
    this.previewVideo = document.getElementById('preview-video') as HTMLVideoElement;
    this.previewCanvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
    this.previewCtx = this.previewCanvas.getContext('2d')!;

    this.loadingOverlay = document.getElementById('loading-overlay')!;
    this.statusMessage = document.getElementById('status-message')!;
    this.colorSwatches = document.querySelectorAll('.color-swatch');

    // Modal elements
    this.inviteModal = document.getElementById('invite-modal')!;
    this.roomCodeDisplay = document.getElementById('room-code')!;
    this.joinCodeInput = document.getElementById('join-code-input') as HTMLInputElement;
    this.statusDot = document.getElementById('status-dot')!;
    this.statusText = document.getElementById('status-text')!;

    // Initialize components
    this.handTracker = new HandTracker(videoElement);
    this.gestureDetector = new GestureDetector();
    this.drawingCanvas = new DrawingCanvas(drawCanvas);
    this.handVisualizer = new HandVisualizer(handCanvas);
    this.scene3D = new Scene3D(sceneCanvas);
    this.objectManager = new ObjectManager(
      this.scene3D,
      window.innerWidth,
      window.innerHeight
    );
    this.multiplayer = new Multiplayer();

    // Set initial size
    this.resize();

    // Setup event listeners
    this.setupEventListeners();
    this.setupButtonListeners();
    this.setupPreviewDrag();
    this.setupMultiplayer();

    // Start the application
    this.init();
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', () => this.resize());

    // Color palette clicks
    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.colorSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.currentColor = swatch.dataset.color || '#FFB3BA';
      });
    });

    // Mouse controls for 3D scene
    const sceneCanvas = document.getElementById('scene-canvas')!;

    sceneCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    sceneCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    sceneCanvas.addEventListener('mouseup', () => this.onMouseUp());
    sceneCanvas.addEventListener('mouseleave', () => this.onMouseUp());
    sceneCanvas.addEventListener('wheel', (e) => this.onWheel(e));

    // Touch support
    sceneCanvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    sceneCanvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    sceneCanvas.addEventListener('touchend', () => this.onMouseUp());

    // Click to select objects
    sceneCanvas.addEventListener('click', (e) => this.onSceneClick(e));
  }

  private setupButtonListeners(): void {
    // Clear all button
    const clearAllBtn = document.getElementById('clear-all-btn');
    clearAllBtn?.addEventListener('click', () => {
      this.clearAll();
      // Broadcast to peers
      if (this.multiplayer.isConnected()) {
        this.multiplayer.broadcast({ type: 'clear_all' });
      }
    });

    // Invite button
    const inviteBtn = document.getElementById('invite-btn');
    inviteBtn?.addEventListener('click', () => {
      this.openInviteModal();
    });

    // Modal close button
    const modalClose = document.getElementById('modal-close');
    modalClose?.addEventListener('click', () => {
      this.closeInviteModal();
    });

    // Close modal on overlay click
    this.inviteModal?.addEventListener('click', (e) => {
      if (e.target === this.inviteModal) {
        this.closeInviteModal();
      }
    });

    // Copy code button
    const copyCodeBtn = document.getElementById('copy-code-btn');
    copyCodeBtn?.addEventListener('click', () => {
      this.copyRoomCode();
    });

    // Join room button
    const joinRoomBtn = document.getElementById('join-room-btn');
    joinRoomBtn?.addEventListener('click', () => {
      this.joinRoom();
    });

    // Join on Enter key
    this.joinCodeInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinRoom();
      }
    });

    // Camera preview expand button
    const previewExpandBtn = document.getElementById('preview-expand-btn');
    const cameraPreview = document.getElementById('camera-preview');
    previewExpandBtn?.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent drag from starting
      cameraPreview?.classList.toggle('expanded');
      // Update preview canvas size when expanded
      this.updatePreviewCanvasSize();
    });
  }

  private setupPreviewDrag(): void {
    const cameraPreview = document.getElementById('camera-preview');
    const expandBtn = document.getElementById('preview-expand-btn');
    if (!cameraPreview) return;

    // Mouse events
    cameraPreview.addEventListener('mousedown', (e) => {
      // Don't start drag if clicking on the expand button
      if (e.target === expandBtn) return;
      this.startPreviewDrag(e.clientX, e.clientY, cameraPreview);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPreviewDragging) return;
      this.movePreview(e.clientX, e.clientY, cameraPreview);
    });

    document.addEventListener('mouseup', () => {
      this.endPreviewDrag(cameraPreview);
    });

    // Touch events
    cameraPreview.addEventListener('touchstart', (e) => {
      // Don't start drag if touching the expand button
      if (e.target === expandBtn) return;
      if (e.touches.length === 1) {
        e.preventDefault(); // Prevent scrolling
        this.startPreviewDrag(e.touches[0].clientX, e.touches[0].clientY, cameraPreview);
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!this.isPreviewDragging) return;
      if (e.touches.length === 1) {
        this.movePreview(e.touches[0].clientX, e.touches[0].clientY, cameraPreview);
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      this.endPreviewDrag(cameraPreview);
    });

    // Double-click to reset position
    cameraPreview.addEventListener('dblclick', (e) => {
      if (e.target === expandBtn) return;
      this.resetPreviewPosition(cameraPreview);
    });
  }

  private resetPreviewPosition(preview: HTMLElement): void {
    preview.classList.remove('custom-position');
    preview.style.left = '';
    preview.style.top = '';
  }

  private startPreviewDrag(clientX: number, clientY: number, preview: HTMLElement): void {
    this.isPreviewDragging = true;
    this.previewDragStartX = clientX;
    this.previewDragStartY = clientY;

    // Get current position
    const rect = preview.getBoundingClientRect();
    this.previewStartLeft = rect.left;
    this.previewStartTop = rect.top;

    preview.classList.add('dragging');
  }

  private movePreview(clientX: number, clientY: number, preview: HTMLElement): void {
    const deltaX = clientX - this.previewDragStartX;
    const deltaY = clientY - this.previewDragStartY;

    let newLeft = this.previewStartLeft + deltaX;
    let newTop = this.previewStartTop + deltaY;

    // Constrain to viewport
    const rect = preview.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    // Apply custom position (remove centered transform)
    preview.classList.add('custom-position');
    preview.style.left = `${newLeft}px`;
    preview.style.top = `${newTop}px`;
  }

  private endPreviewDrag(preview: HTMLElement): void {
    if (this.isPreviewDragging) {
      this.isPreviewDragging = false;
      preview.classList.remove('dragging');
    }
  }

  private updatePreviewCanvasSize(): void {
    const cameraPreview = document.getElementById('camera-preview');

    // Get computed size of the preview container
    if (cameraPreview) {
      const rect = cameraPreview.getBoundingClientRect();
      this.previewCanvas.width = rect.width;
      this.previewCanvas.height = rect.height;
    }
  }

  private setupMultiplayer(): void {
    // Initialize multiplayer
    this.multiplayer.initialize().then(() => {
      this.roomCodeDisplay.textContent = this.multiplayer.getRoomCode();
    }).catch(err => {
      console.error('Failed to initialize multiplayer:', err);
    });

    // Handle status changes
    this.multiplayer.onStatusChange((status, message) => {
      this.statusDot.className = 'status-dot';
      if (status === 'connected') {
        this.statusDot.classList.add('connected');
      } else if (status === 'connecting') {
        this.statusDot.classList.add('connecting');
      }
      this.statusText.textContent = message;
    });

    // Handle multiplayer events
    this.multiplayer.onEvent((event: MultiplayerEvent) => {
      this.handleMultiplayerEvent(event);
    });
  }

  private handleMultiplayerEvent(event: MultiplayerEvent): void {
    switch (event.type) {
      case 'balloon_created':
        // Create balloon from peer's stroke
        this.objectManager.createFromStroke(event.strokeData);
        break;

      case 'clear_all':
        this.drawingCanvas.clearAll();
        this.objectManager.clearAll();
        break;

      case 'peer_joined':
        this.showStatus('Friend joined!', 2000);
        break;

      case 'peer_left':
        this.showStatus('Friend left', 2000);
        break;
    }
  }

  private openInviteModal(): void {
    this.inviteModal.classList.add('visible');
  }

  private closeInviteModal(): void {
    this.inviteModal.classList.remove('visible');
  }

  private async copyRoomCode(): Promise<void> {
    const code = this.multiplayer.getRoomCode();
    try {
      await navigator.clipboard.writeText(code);
      const copyBtn = document.getElementById('copy-code-btn');
      if (copyBtn) {
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.textContent = '📋';
        }, 2000);
      }
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  private async joinRoom(): Promise<void> {
    const code = this.joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      this.statusText.textContent = 'Please enter a 6-character code';
      return;
    }

    try {
      await this.multiplayer.joinRoom(code);
      this.showStatus('Connected!', 2000);
    } catch {
      this.statusText.textContent = 'Failed to connect';
    }
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    // Check if clicking on an object
    const hitObject = this.objectManager.getObjectAtPosition(e.clientX, e.clientY);
    if (hitObject) {
      this.selectedObject = hitObject;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    if (this.selectedObject) {
      // Rotate the selected object
      this.objectManager.rotateObject(this.selectedObject, deltaX * 0.01, deltaY * 0.01);
    } else {
      // Orbit the camera
      this.scene3D.orbitCamera(deltaX * 0.005, deltaY * 0.005);
    }

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.selectedObject = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scene3D.zoomCamera(e.deltaY * 0.001);
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;

      const hitObject = this.objectManager.getObjectAtPosition(
        e.touches[0].clientX,
        e.touches[0].clientY
      );
      if (hitObject) {
        this.selectedObject = hitObject;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.isDragging || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - this.lastMouseX;
    const deltaY = e.touches[0].clientY - this.lastMouseY;

    if (this.selectedObject) {
      this.objectManager.rotateObject(this.selectedObject, deltaX * 0.01, deltaY * 0.01);
    } else {
      this.scene3D.orbitCamera(deltaX * 0.005, deltaY * 0.005);
    }

    this.lastMouseX = e.touches[0].clientX;
    this.lastMouseY = e.touches[0].clientY;
  }

  private onSceneClick(e: MouseEvent): void {
    const hitObject = this.objectManager.getObjectAtPosition(e.clientX, e.clientY);
    if (hitObject) {
      this.objectManager.selectObject(hitObject);
    }
  }

  private async init(): Promise<void> {
    try {
      // Start hand tracking
      await this.handTracker.start((landmarks) => this.onHandResults(landmarks));

      // Setup camera preview
      this.setupCameraPreview();

      // Hide loading overlay
      this.loadingOverlay.classList.add('hidden');

      // Start animation loop
      this.animate();
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.showStatus('Camera access denied. Please allow camera access and refresh.');
    }
  }

  private setupCameraPreview(): void {
    // Get the video stream from the hand tracker and display in preview
    const webcam = document.getElementById('webcam') as HTMLVideoElement;
    if (webcam.srcObject) {
      this.previewVideo.srcObject = webcam.srcObject;
      this.previewVideo.play();
    }

    // Set preview canvas size (4:3 ratio to match camera)
    this.previewCanvas.width = 320;
    this.previewCanvas.height = 240;
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.handTracker.setCanvasSize(width, height);
    this.drawingCanvas.resize(width, height);
    this.handVisualizer.resize(width, height);
    this.scene3D.resize(width, height);
    this.objectManager.updateSize(width, height);
  }

  private onHandResults(landmarks: HandLandmarks | null): void {
    const wasDetected = this.handDetected;
    this.handDetected = landmarks !== null;
    this.currentLandmarks = landmarks;

    // Show/hide hand detection message
    if (!this.handDetected && wasDetected) {
      this.showStatus('Show your hand to begin');
    } else if (this.handDetected && !wasDetected) {
      this.showStatus('Point to Draw');  // Show "Point to Draw" when hand is detected
    }

    // Render hand tracking on preview canvas
    this.renderPreviewOverlay(landmarks);

    if (!landmarks) {
      // Pause drawing if hand leaves
      if (this.isDrawing) {
        this.isDrawing = false;
      }
      return;
    }

    // Detect gesture
    const gestureState = this.gestureDetector.detect(landmarks);

    // Handle gesture
    this.handleGesture(gestureState, landmarks);

    this.lastGestureState = gestureState;
  }

  private renderPreviewOverlay(landmarks: HandLandmarks | null): void {
    const previewWidth = this.previewCanvas.width || 320;
    const previewHeight = this.previewCanvas.height || 240;
    this.previewCtx.clearRect(0, 0, previewWidth, previewHeight);

    if (!landmarks) return;

    // Use uniform scaling to maintain aspect ratio (same as main screen)
    const scale = Math.min(previewWidth / window.innerWidth, previewHeight / window.innerHeight);
    const offsetX = (previewWidth - window.innerWidth * scale) / 2;
    const offsetY = (previewHeight - window.innerHeight * scale) / 2;

    // Draw hand skeleton connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    // Scale line width and joint size based on preview size
    const uiScale = previewWidth / 320;
    this.previewCtx.strokeStyle = '#bee17d';
    this.previewCtx.lineWidth = 2 * uiScale;

    for (const [from, to] of connections) {
      const start = landmarks.landmarks[from];
      const end = landmarks.landmarks[to];

      this.previewCtx.beginPath();
      this.previewCtx.moveTo(start.x * scale + offsetX, start.y * scale + offsetY);
      this.previewCtx.lineTo(end.x * scale + offsetX, end.y * scale + offsetY);
      this.previewCtx.stroke();
    }

    // Draw joints
    this.previewCtx.fillStyle = '#bee17d';
    for (const lm of landmarks.landmarks) {
      this.previewCtx.beginPath();
      this.previewCtx.arc(lm.x * scale + offsetX, lm.y * scale + offsetY, 3 * uiScale, 0, Math.PI * 2);
      this.previewCtx.fill();
    }
  }

  private handleGesture(state: GestureState, landmarks: HandLandmarks): void {
    const indexTip = this.gestureDetector.getIndexTip(landmarks);

    switch (state.current) {
      case 'draw':
        this.handleDraw(indexTip);
        break;

      case 'pinch':
        this.handlePinch(landmarks);
        break;

      case 'palm':
        this.handlePalm();
        break;

      case 'swipe':
        this.handleSwipe(indexTip);
        break;

      default:
        // Release grabbed object if gesture changes
        if (this.grabbedObject) {
          this.objectManager.releaseObject(this.grabbedObject);
          this.grabbedObject = null;
          this.lastPinchPosition = null;
        }
        break;
    }

    // Reset timers and clear live position if gesture changed
    if (this.lastGestureState && state.current !== this.lastGestureState.current) {
      this.palmHoldStart = 0;
      // Clear live position when leaving draw mode
      if (this.lastGestureState.current === 'draw') {
        this.drawingCanvas.clearLivePosition();
      }
    }
  }

  private handleDraw(position: { x: number; y: number }): void {
    // Always update live position for real-time line feedback
    this.drawingCanvas.updateLivePosition(position);

    // Check if poking an object
    const hitObject = this.objectManager.getObjectAtPosition(position.x, position.y);
    if (hitObject) {
      this.objectManager.pokeObject(hitObject);
      return;
    }

    if (!this.isDrawing) {
      // Start new stroke
      this.isDrawing = true;
      this.drawingCanvas.startStroke(position, this.currentColor);
    } else {
      // Continue stroke
      this.drawingCanvas.addPoint(position);
    }

    // Render immediately for lowest latency (don't wait for animation frame)
    this.drawingCanvas.render();
  }

  private handlePinch(landmarks: HandLandmarks): void {
    const pinchCenter = this.gestureDetector.getPinchCenter(landmarks);

    if (this.isDrawing) {
      // Pause drawing but keep stroke
      this.isDrawing = false;
      this.drawingCanvas.pauseStroke();
    }

    // Check if grabbing an object
    if (!this.grabbedObject) {
      const hitObject = this.objectManager.getObjectAtPosition(pinchCenter.x, pinchCenter.y);
      if (hitObject) {
        this.grabbedObject = hitObject;
        this.objectManager.grabObject(hitObject);
        this.lastPinchPosition = pinchCenter;
      }
    } else {
      // Move and rotate grabbed object based on hand movement
      if (this.lastPinchPosition) {
        const deltaX = pinchCenter.x - this.lastPinchPosition.x;
        const deltaY = pinchCenter.y - this.lastPinchPosition.y;

        // Move the object
        this.objectManager.moveGrabbedObject(this.grabbedObject, pinchCenter.x, pinchCenter.y);

        // Rotate based on movement
        this.objectManager.rotateObject(this.grabbedObject, deltaX * 0.02, deltaY * 0.02);
      }
      this.lastPinchPosition = pinchCenter;
    }
  }

  private handlePalm(): void {
    // Release any grabbed object
    if (this.grabbedObject) {
      this.objectManager.releaseObject(this.grabbedObject);
      this.grabbedObject = null;
      this.lastPinchPosition = null;
    }

    // Track palm hold time
    if (this.palmHoldStart === 0) {
      this.palmHoldStart = performance.now();
    }

    const holdDuration = performance.now() - this.palmHoldStart;

    if (holdDuration >= GESTURE.PALM_HOLD_TIME) {
      // Close and inflate current stroke
      this.closeAndInflate();
      this.palmHoldStart = 0;
    }
  }

  private handleSwipe(position: { x: number; y: number }): void {
    // Check if swiping on an object
    const hitObject = this.objectManager.getObjectAtPosition(position.x, position.y);
    if (hitObject) {
      this.objectManager.removeObject(hitObject);
    }
  }

  private async closeAndInflate(): Promise<void> {
    const stroke = this.drawingCanvas.closeStroke();
    this.drawingCanvas.clearLivePosition();

    if (!stroke) {
      this.showStatus('Draw a larger shape', 1000);
      return;
    }

    this.isDrawing = false;

    // Animate the closing
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / (TIMING.STROKE_CLOSE_PULSE * 1000), 1);

      this.drawingCanvas.renderClosingAnimation(stroke, progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Create 3D balloon
        this.createBalloon(stroke);
      }
    };
    animate();
  }

  private async createBalloon(stroke: Stroke): Promise<void> {
    // Clear the stroke from drawing canvas FIRST before creating 3D object
    this.drawingCanvas.removeCompletedStroke(stroke);
    this.drawingCanvas.clear();

    try {
      await this.objectManager.createFromStroke(stroke);

      // Broadcast to peers
      if (this.multiplayer.isConnected()) {
        this.multiplayer.broadcast({
          type: 'balloon_created',
          strokeData: stroke
        });
      }
    } catch (error) {
      console.error('Failed to create balloon:', error);
      this.showStatus('Failed to create shape', 2000);
    }
  }

  private async clearAll(): Promise<void> {
    this.showStatus('Clearing all...');
    this.drawingCanvas.clearAll();
    await this.objectManager.clearAll();
    this.hideStatus();
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = now;

    // Update 3D objects
    this.objectManager.update(deltaTime, now / 1000);

    // Render 3D scene
    this.scene3D.render();

    // Render drawing canvas
    this.drawingCanvas.render();

    // Render hand visualization
    const gestureState = this.lastGestureState || {
      current: 'none' as const,
      previous: 'none' as const,
      duration: 0,
      velocity: { x: 0, y: 0 },
      confidence: 0
    };
    this.handVisualizer.render(
      this.currentLandmarks,
      gestureState,
      this.currentColor,
      deltaTime
    );
  }

  private showStatus(message: string, duration?: number): void {
    this.statusMessage.textContent = message;
    this.statusMessage.classList.add('visible');

    if (duration) {
      setTimeout(() => this.hideStatus(), duration);
    }
  }

  private hideStatus(): void {
    this.statusMessage.classList.remove('visible');
  }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AirCanvas();
});
