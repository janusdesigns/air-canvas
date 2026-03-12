import { HandLandmarks, GestureType, GestureState, Point2D } from './types';
import { LANDMARKS, GESTURE } from './constants';

export class GestureDetector {
  private lastLandmarks: HandLandmarks | null = null;
  private lastTime: number = 0;
  private gestureStartTime: number = 0;
  private currentGesture: GestureType = 'none';
  private previousGesture: GestureType = 'none';
  private palmHistory: Point2D[] = [];
  private velocityHistory: Point2D[] = [];

  detect(landmarks: HandLandmarks | null): GestureState {
    const now = performance.now();
    const dt = this.lastTime > 0 ? (now - this.lastTime) / 1000 : 0;
    this.lastTime = now;

    if (!landmarks) {
      return this.createState('none', { x: 0, y: 0 }, 0);
    }

    // Calculate hand velocity
    const velocity = this.calculateVelocity(landmarks, dt);

    // Detect gesture
    const detectedGesture = this.detectGestureType(landmarks, velocity);

    // Track gesture duration
    if (detectedGesture !== this.currentGesture) {
      this.previousGesture = this.currentGesture;
      this.currentGesture = detectedGesture;
      this.gestureStartTime = now;
    }

    const duration = now - this.gestureStartTime;

    this.lastLandmarks = landmarks;

    return this.createState(this.currentGesture, velocity, duration);
  }

  private createState(gesture: GestureType, velocity: Point2D, duration: number): GestureState {
    return {
      current: gesture,
      previous: this.previousGesture,
      duration,
      velocity,
      confidence: 1.0
    };
  }

  private calculateVelocity(landmarks: HandLandmarks, dt: number): Point2D {
    if (!this.lastLandmarks || dt === 0) {
      return { x: 0, y: 0 };
    }

    const currentPalm = this.getPalmCenter(landmarks);
    const lastPalm = this.getPalmCenter(this.lastLandmarks);

    const velocity = {
      x: (currentPalm.x - lastPalm.x) / dt,
      y: (currentPalm.y - lastPalm.y) / dt
    };

    // Minimal velocity smoothing for faster response - use only current frame
    this.velocityHistory.push(velocity);
    if (this.velocityHistory.length > 1) {  // Reduced from 2 to 1
      this.velocityHistory.shift();
    }

    const avgVelocity = this.velocityHistory.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
      { x: 0, y: 0 }
    );

    return {
      x: avgVelocity.x / this.velocityHistory.length,
      y: avgVelocity.y / this.velocityHistory.length
    };
  }

  private getPalmCenter(landmarks: HandLandmarks): Point2D {
    const wrist = landmarks.landmarks[LANDMARKS.WRIST];
    const indexMcp = landmarks.landmarks[LANDMARKS.INDEX_MCP];
    const pinkyMcp = landmarks.landmarks[LANDMARKS.PINKY_MCP];

    return {
      x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
      y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3
    };
  }

  private detectGestureType(landmarks: HandLandmarks, velocity: Point2D): GestureType {
    const lm = landmarks.landmarks;

    // Check for draw mode FIRST (index finger extended) - prioritized for instant responsiveness
    if (this.isPointingIndex(landmarks)) {
      return 'draw';
    }

    // Check for swipe (fast horizontal movement)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (speed > GESTURE.SWIPE_VELOCITY && Math.abs(velocity.x) > Math.abs(velocity.y) * 1.5) {
      return 'swipe';
    }

    // Check pinch (thumb tip close to index tip)
    const pinchDistance = this.distance(
      lm[LANDMARKS.THUMB_TIP],
      lm[LANDMARKS.INDEX_TIP]
    );
    if (pinchDistance < GESTURE.PINCH_THRESHOLD) {
      return 'pinch';
    }

    // Check for fist (all fingers curled)
    if (this.isFist(landmarks)) {
      return 'fist';
    }

    // Check for open palm (all fingers extended)
    if (this.isOpenPalm(landmarks)) {
      // Check if palm is stable (not moving much)
      this.palmHistory.push(this.getPalmCenter(landmarks));
      if (this.palmHistory.length > 6) {
        this.palmHistory.shift();
      }

      if (this.palmHistory.length >= 3 && this.isPalmStable()) {
        return 'palm';
      }
    } else {
      this.palmHistory = [];
    }

    return 'none';
  }

  private distance(p1: Point2D, p2: Point2D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private isFingerExtended(landmarks: HandLandmarks, tipIdx: number, pipIdx: number, _mcpIdx: number): boolean {
    const lm = landmarks.landmarks;
    const tip = lm[tipIdx];
    const pip = lm[pipIdx];

    // Finger is extended if tip is further from palm than pip
    // Using y-coordinate primarily since fingers extend upward
    const tipToPalm = this.distance(tip, lm[LANDMARKS.WRIST]);
    const pipToPalm = this.distance(pip, lm[LANDMARKS.WRIST]);

    return tipToPalm > pipToPalm * GESTURE.FINGER_CURL_THRESHOLD;
  }

  private isThumbExtended(landmarks: HandLandmarks): boolean {
    const lm = landmarks.landmarks;
    const thumbTip = lm[LANDMARKS.THUMB_TIP];
    const thumbIp = lm[LANDMARKS.THUMB_IP];
    const indexMcp = lm[LANDMARKS.INDEX_MCP];

    // Thumb is extended if tip is far from index MCP
    const distFromIndex = this.distance(thumbTip, indexMcp);
    const thumbLength = this.distance(thumbTip, thumbIp);

    return distFromIndex > thumbLength * 1.5;
  }

  private isPointingIndex(landmarks: HandLandmarks): boolean {
    // Simplified check: just make sure index is extended
    // This is much faster and more responsive than checking all fingers
    const indexExtended = this.isFingerExtended(
      landmarks,
      LANDMARKS.INDEX_TIP,
      LANDMARKS.INDEX_PIP,
      LANDMARKS.INDEX_MCP
    );

    // Check if middle finger is NOT strongly extended (loose check)
    const middleNotStronglyExtended = !this.isFingerExtended(
      landmarks,
      LANDMARKS.MIDDLE_TIP,
      LANDMARKS.MIDDLE_PIP,
      LANDMARKS.MIDDLE_MCP
    );

    // Only require index extended + middle not extended
    // This makes gesture detection MUCH faster
    return indexExtended && middleNotStronglyExtended;
  }

  private isOpenPalm(landmarks: HandLandmarks): boolean {
    // Simplified check: just check if fingers are mostly extended
    const indexExtended = this.isFingerExtended(
      landmarks,
      LANDMARKS.INDEX_TIP,
      LANDMARKS.INDEX_PIP,
      LANDMARKS.INDEX_MCP
    );

    const middleExtended = this.isFingerExtended(
      landmarks,
      LANDMARKS.MIDDLE_TIP,
      LANDMARKS.MIDDLE_PIP,
      LANDMARKS.MIDDLE_MCP
    );

    // Only need index and middle extended for fast palm detection
    // This is much faster than checking all fingers
    return indexExtended && middleExtended;
  }

  private isFist(landmarks: HandLandmarks): boolean {
    const indexCurled = !this.isFingerExtended(
      landmarks,
      LANDMARKS.INDEX_TIP,
      LANDMARKS.INDEX_PIP,
      LANDMARKS.INDEX_MCP
    );

    const middleCurled = !this.isFingerExtended(
      landmarks,
      LANDMARKS.MIDDLE_TIP,
      LANDMARKS.MIDDLE_PIP,
      LANDMARKS.MIDDLE_MCP
    );

    const ringCurled = !this.isFingerExtended(
      landmarks,
      LANDMARKS.RING_TIP,
      LANDMARKS.RING_PIP,
      LANDMARKS.RING_MCP
    );

    const pinkyCurled = !this.isFingerExtended(
      landmarks,
      LANDMARKS.PINKY_TIP,
      LANDMARKS.PINKY_PIP,
      LANDMARKS.PINKY_MCP
    );

    const thumbCurled = !this.isThumbExtended(landmarks);

    return indexCurled && middleCurled && ringCurled && pinkyCurled && thumbCurled;
  }

  private isPalmStable(): boolean {
    if (this.palmHistory.length < 2) return false;  // Reduced from 3 to 2 for faster response

    const recent = this.palmHistory.slice(-2);  // Reduced from 3 to 2
    const first = recent[0];

    for (const point of recent) {
      const dist = this.distance(point, first);
      if (dist > GESTURE.PALM_STABILITY_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  getIndexTip(landmarks: HandLandmarks): Point2D {
    return landmarks.landmarks[LANDMARKS.INDEX_TIP];
  }

  getThumbTip(landmarks: HandLandmarks): Point2D {
    return landmarks.landmarks[LANDMARKS.THUMB_TIP];
  }

  getPinchCenter(landmarks: HandLandmarks): Point2D {
    const thumb = this.getThumbTip(landmarks);
    const index = this.getIndexTip(landmarks);
    return {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2
    };
  }
}
