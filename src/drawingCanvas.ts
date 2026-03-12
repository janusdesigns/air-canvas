import { Point2D, Stroke } from './types';
import { STROKE, GESTURE } from './constants';

export class DrawingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentStroke: Stroke | null = null;
  private completedStrokes: Stroke[] = [];
  private livePosition: Point2D | null = null;
  private recentPoints: Point2D[] = [];  // Buffer for smoothing - minimal for instant response
  private strokeStartTime: number = 0;  // Time when stroke started

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;

    // Enable image smoothing for better line quality
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    // Re-enable after resize
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  startStroke(point: Point2D, color: string): void {
    this.currentStroke = {
      points: [point],
      color,
      width: STROKE.WIDTH,
      closed: false
    };
    this.livePosition = point;
    this.recentPoints = [point];
    this.strokeStartTime = performance.now();
  }

  addPoint(point: Point2D): void {
    if (!this.currentStroke) return;

    // For first 100ms of stroke, use raw position with NO smoothing
    const timeSinceStart = performance.now() - this.strokeStartTime;
    const useRawPosition = timeSinceStart < 100;

    let positionToUse: Point2D;
    if (useRawPosition) {
      // First 100ms: use raw position for zero latency
      positionToUse = point;
    } else {
      // After 100ms: apply light smoothing for stability
      this.recentPoints.push(point);
      if (this.recentPoints.length > 2) {
        this.recentPoints.shift();
      }
      positionToUse = this.recentPoints.length === 1 
        ? this.recentPoints[0]
        : this.getSmoothedPosition();
    }

    this.livePosition = positionToUse;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
    const dist = this.distance(positionToUse, lastPoint);

    // Only add points that are far enough apart
    if (dist >= 1.5) {  // Minimal distance threshold
      this.currentStroke.points.push(positionToUse);
    }
  }

  // Minimal smoothing - just return most recent point for zero latency
  private getSmoothedPosition(): Point2D {
    if (this.recentPoints.length === 0) {
      return { x: 0, y: 0 };
    }
    // Return most recent point for instant feedback
    return this.recentPoints[this.recentPoints.length - 1];
  }

  // Update live position without adding a point (for real-time tracking)
  updateLivePosition(point: Point2D): void {
    // Use raw position for live preview feedback (no filtering)
    this.livePosition = point;
  }

  clearLivePosition(): void {
    this.livePosition = null;
    this.recentPoints = [];
  }

  private distance(p1: Point2D, p2: Point2D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  pauseStroke(): void {
    // Stroke remains but we stop adding points
    // The stroke is kept for potential closing
  }

  closeStroke(): Stroke | null {
    if (!this.currentStroke) return null;

    // Check if stroke is long enough
    const length = this.calculateStrokeLength();
    if (length < GESTURE.MIN_STROKE_LENGTH) {
      this.discardStroke();
      return null;
    }

    // Close the path by connecting last point to first
    if (this.currentStroke.points.length > 2) {
      this.currentStroke.closed = true;
      const closedStroke = { ...this.currentStroke };
      this.completedStrokes.push(closedStroke);
      this.currentStroke = null;
      return closedStroke;
    }

    this.discardStroke();
    return null;
  }

  discardStroke(): void {
    this.currentStroke = null;
  }

  private calculateStrokeLength(): number {
    if (!this.currentStroke || this.currentStroke.points.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < this.currentStroke.points.length; i++) {
      length += this.distance(
        this.currentStroke.points[i - 1],
        this.currentStroke.points[i]
      );
    }
    return length;
  }

  getCurrentStroke(): Stroke | null {
    return this.currentStroke;
  }

  clearAll(): void {
    this.currentStroke = null;
    this.completedStrokes = [];
    this.clear();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(): void {
    this.clear();

    // Render completed strokes (faded)
    for (const stroke of this.completedStrokes) {
      this.renderStroke(stroke, 0.3);
    }

    // Render current stroke with live extension to finger position
    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      this.renderStrokeWithLiveExtension(this.currentStroke, 1.0);
    }
  }

  private renderStrokeWithLiveExtension(stroke: Stroke, alpha: number): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = stroke.color;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Build points array including live position
    let points = [...stroke.points];
    if (this.livePosition) {
      points.push(this.livePosition);
    }

    // If only one point, draw a dot
    if (points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    // Use smooth bezier curves
    this.drawSmoothCurve(points);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Smooth curve using cubic bezier with calculated control points
  private drawSmoothCurve(points: Point2D[]): void {
    if (points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      this.ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    // Use quadratic curves through midpoints for smooth result
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];

      if (i === 0) {
        // First segment: line to midpoint
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        this.ctx.lineTo(midX, midY);
      } else if (i === points.length - 2) {
        // Last segment: curve to end point
        this.ctx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y);
      } else {
        // Middle segments: curve to midpoint
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        this.ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
      }
    }
  }

  private renderStroke(stroke: Stroke, alpha: number): void {
    if (stroke.points.length === 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = stroke.color;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // If only one point, draw a dot
    if (stroke.points.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    // Use smooth curves
    let points = [...stroke.points];
    if (stroke.closed) {
      points.push(stroke.points[0]);  // Close the loop
    }
    this.drawSmoothCurve(points);
    this.ctx.stroke();
    this.ctx.restore();
  }

  renderClosingAnimation(stroke: Stroke, progress: number): void {
    if (stroke.points.length < 2) return;

    this.clear();

    // Render the stroke with pulsing effect
    const pulseScale = 1 + Math.sin(progress * Math.PI) * 0.1;
    const pulseAlpha = 0.5 + Math.sin(progress * Math.PI * 2) * 0.5;

    this.ctx.save();

    // Draw glow
    this.ctx.globalAlpha = pulseAlpha * 0.3;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width * pulseScale * 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.filter = 'blur(8px)';

    this.drawStrokePath(stroke);
    this.ctx.stroke();

    // Draw main stroke
    this.ctx.filter = 'none';
    this.ctx.globalAlpha = 1;
    this.ctx.lineWidth = stroke.width * pulseScale;

    this.drawStrokePath(stroke);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawStrokePath(stroke: Stroke): void {
    let points = [...stroke.points];
    if (stroke.closed) {
      points.push(stroke.points[0]);  // Close the loop
    }
    this.drawSmoothCurve(points);
  }

  removeCompletedStroke(stroke: Stroke): void {
    const index = this.completedStrokes.indexOf(stroke);
    if (index > -1) {
      this.completedStrokes.splice(index, 1);
    }
  }
}
