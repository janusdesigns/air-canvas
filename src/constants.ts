// Pastel color palette
export const COLORS = {
  pink: '#FFB3BA',
  yellow: '#FFFFBA',
  mint: '#BAFFC9',
  blue: '#BAE1FF',
  lavender: '#E8BAFF'
};

export const COLOR_ARRAY = Object.values(COLORS);

// Hand landmark indices (MediaPipe)
export const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20
};

// Gesture detection thresholds
export const GESTURE = {
  PINCH_THRESHOLD: 40,          // pixels between thumb and index tip
  PALM_HOLD_TIME: 200,          // ms to hold palm for inflate (reduced from 500 for instant completion)
  FIST_HOLD_TIME: 1000,         // ms to hold fist for clear
  SWIPE_VELOCITY: 800,          // pixels/second for swipe detection
  MIN_STROKE_LENGTH: 50,        // minimum stroke length in pixels
  FINGER_CURL_THRESHOLD: 0.6,   // ratio for determining if finger is curled
  PALM_STABILITY_THRESHOLD: 50  // max movement for "still" palm (increased from 30 for faster recognition)
};

// Stroke settings
export const STROKE = {
  WIDTH: 10,
  MIN_POINT_DISTANCE: 8     // higher = smoother lines, less jitter
};

// Animation timings (in seconds)
export const TIMING = {
  STROKE_CLOSE_PULSE: 0.2,
  INFLATE_DURATION: 0.7,
  OBJECT_SETTLE: 0.5,
  POKE_SQUISH_IN: 0.15,
  POKE_SQUISH_OUT: 0.4,
  OBJECT_POP: 0.25,
  SCENE_CLEAR: 0.5
};

// 3D Scene settings
export const SCENE = {
  MAX_OBJECTS: 10,
  CAMERA_FOV: 50,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 1000,
  CAMERA_Z: 10,
  OBJECT_DEPTH: 0.8,           // depth of inflated objects
  SUBDIVISION_LEVEL: 2,
  INFLATION_AMOUNT: 1.2,
  BOB_AMPLITUDE: 0.1,
  BOB_SPEED_MIN: 0.5,
  BOB_SPEED_MAX: 1.5,
  ROTATION_SPEED_MAX: 0.3,
  DRIFT_SPEED: 0.02,
  COLLISION_RADIUS: 1.5
};

// Visual settings
export const VISUAL = {
  CURSOR_SIZE: 16,
  CURSOR_GLOW_SIZE: 30,
  CURSOR_PULSE_SPEED: 2,
  HAND_SKELETON_OPACITY: 0.3,
  HAND_SKELETON_WIDTH: 2,
  BLOOM_STRENGTH: 0.3,
  BLOOM_RADIUS: 0.5,
  DOF_FOCUS: 10,
  DOF_APERTURE: 0.01
};

// Background gradient colors
export const BACKGROUND = {
  COLOR_START: '#475569',  // slate
  COLOR_END: '#a78bfa'     // lavender
};
