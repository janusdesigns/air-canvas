import { Hands, Results } from '@mediapipe/hands';
import { HandLandmarks, Point2D } from './types';

export type HandResultsCallback = (landmarks: HandLandmarks | null) => void;

export class HandTracker {
  private hands: Hands;
  private videoElement: HTMLVideoElement;
  private callback: HandResultsCallback | null = null;
  private isRunning = false;
  private animationId: number | null = null;
  private canvasWidth = 640;
  private canvasHeight = 480;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;

    this.hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,  // Better accuracy model (less jitter)
      minDetectionConfidence: 0.5,  // Reduced from 0.6 for faster detection (still accurate)
      minTrackingConfidence: 0.5    // Keep consistent for smooth tracking
    });

    this.hands.onResults((results) => this.onResults(results));
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  private onResults(results: Results): void {
    if (!this.callback) return;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Use the first detected hand (could enhance to prefer right hand)
      const landmarks = results.multiHandLandmarks[0];
      const worldLandmarks = results.multiHandWorldLandmarks?.[0];

      // Convert normalized coordinates to canvas coordinates
      const convertedLandmarks: Point2D[] = landmarks.map((lm) => ({
        x: (1 - lm.x) * this.canvasWidth,  // Mirror horizontally
        y: lm.y * this.canvasHeight
      }));

      const convertedWorldLandmarks = worldLandmarks?.map((lm) => ({
        x: -lm.x,  // Mirror
        y: -lm.y,
        z: lm.z
      }));

      this.callback({
        landmarks: convertedLandmarks,
        worldLandmarks: convertedWorldLandmarks
      });
    } else {
      this.callback(null);
    }
  }

  async start(callback: HandResultsCallback): Promise<void> {
    this.callback = callback;

    if (this.isRunning) return;

    try {
      // Request camera access - balance between speed and detection quality
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },  // 30fps is enough for hand tracking
          facingMode: 'user'
        }
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.isRunning = true;

      // Use direct requestAnimationFrame for lower latency
      const processFrame = async () => {
        if (!this.isRunning) return;

        if (this.videoElement.readyState >= 2) {
          await this.hands.send({ image: this.videoElement });
        }

        this.animationId = requestAnimationFrame(processFrame);
      };

      processFrame();
    } catch (error) {
      console.error('Failed to start hand tracking:', error);
      throw error;
    }
  }

  stop(): void {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    const stream = this.videoElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
