import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  Dimensions,
} from "react-native";
import Svg, { Path, G, Defs, ClipPath, Rect } from "react-native-svg";
import { getStroke } from "perfect-freehand";
import TemplateOverlay, { TemplateType } from "./TemplateOverlay";
import { DrawingStroke } from "../services/drawingAPI";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
}

export type DrawingTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "brush"
  | "pencil"
  | "calligraphy";

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: DrawingTool;
  opacity?: number;
}

export type CanvasOrientation = "landscape" | "portrait";

interface DrawingCanvasProps {
  strokes: DrawingStroke[];
  currentTool: DrawingTool;
  onAddStroke: (stroke: DrawingStroke) => void;
  currentColor: string;
  currentWidth: number;
  onStrokeComplete: (stroke: Stroke) => void;
  onStrokeUpdate?: (stroke: Stroke | null) => void;
  backgroundColor?: string;
  disabled?: boolean;
  template?: TemplateType;
  templateOptions?: {
    gridSize?: number;
    lineHeight?: number;
    margin?: number;
  };
  scaleStrokesWithZoom?: boolean;
  currentZoom?: number;
  orientation?: CanvasOrientation;
  canvasWidth?: number;
  canvasHeight?: number;
  onZoomChange?: (zoom: number) => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  strokes,
  currentTool,
  currentColor,
  currentWidth,
  onStrokeComplete,
  onStrokeUpdate,
  backgroundColor = "#ffffff",
  disabled = false,
  template = "blank",
  templateOptions = {},
  scaleStrokesWithZoom = false,
  currentZoom = 1,
  orientation = "landscape",
  canvasWidth,
  canvasHeight,
  onZoomChange,
}) => {
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const containerRef = useRef<View>(null);
  const canvasBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 0, y: 0, width: 0, height: 0 });
  const isFinalizingRef = useRef(false);
  const lastMeasureTsRef = useRef(0);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const framePendingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef(0);
  const gestureStartDistanceRef = useRef(0);
  const gestureStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);

  const getCanvasDimensions = () => {
    const window = Dimensions.get("window");
    const horizontalMargin = 10;
    const verticalMargin = 10;

    if (orientation === "landscape") {
      const width = Math.round(window.width * 0.9) - horizontalMargin * 2;
      const height = Math.round(window.height * 0.75) - verticalMargin * 2;
      return {
        width,
        height,
        marginHorizontal: horizontalMargin,
        marginVertical: verticalMargin,
      };
    }

    let width = Math.max(320, window.width - horizontalMargin * 2);
    let height = Math.round((width * 4) / 3);
    const reservedVerticalSpace = 180;
    const maxHeight = Math.max(
      400,
      window.height - reservedVerticalSpace - verticalMargin * 2
    );
    if (height > maxHeight) {
      height = Math.round(maxHeight);
      width = Math.round((height * 3) / 4);
    }

    const availableHeight = Math.max(0, window.height - reservedVerticalSpace);
    const marginVertical = Math.max(
      verticalMargin,
      Math.floor((availableHeight - height) / 2)
    );
    return {
      width,
      height,
      marginHorizontal: horizontalMargin,
      marginVertical,
    };
  };

  const dims = getCanvasDimensions();
  const CANVAS_WIDTH =
    typeof canvasWidth === "number"
      ? Math.max(1, Math.round(canvasWidth))
      : dims.width;
  const CANVAS_HEIGHT =
    typeof canvasHeight === "number"
      ? Math.max(1, Math.round(canvasHeight))
      : dims.height;
  const CANVAS_MARGIN_HORIZONTAL = dims.marginHorizontal ?? 0;
  const CANVAS_MARGIN_VERTICAL = dims.marginVertical ?? 0;
  const segmentIdRef = useRef(0);
  const pathCacheRef = useRef(new Map<string, string>());

  const preprocessPoints = useCallback(
    (points: Point[], tool: DrawingTool): Point[] => {
      if (tool === "pen" || tool === "pencil") return points;

      if (points.length < 4) return points;

      const smoothedPoints: Point[] = [points[0]];

      for (let i = 2; i < points.length - 2; i += 2) {
        const prev = points[i - 2];
        const curr = points[i];
        const next = points[i + 2];
        const smoothed: Point = {
          x: prev.x * 0.15 + curr.x * 0.7 + next.x * 0.15,
          y: prev.y * 0.15 + curr.y * 0.7 + next.y * 0.15,
          pressure: curr.pressure,
          timestamp: curr.timestamp,
        };

        smoothedPoints.push(smoothed);
      }

      smoothedPoints.push(points[points.length - 1]);
      return smoothedPoints;
    },
    []
  );

  const decimatePoints = useCallback((pts: Point[], step: number): Point[] => {
    if (step <= 1 || pts.length <= 2) return pts;
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
    if (out[out.length - 1] !== pts[pts.length - 1])
      out.push(pts[pts.length - 1]);
    return out;
  }, []);

  const getSmoothStrokePath = useCallback(
    (
      points: Point[],
      width: number,
      tool: DrawingTool,
      isFast: boolean = false
    ): string => {
      if (points.length === 0) return "";
      if (points.length === 1) {
        const point = points[0];
        const radius = width / 2;
        return `M ${point.x - radius},${point.y} A ${radius},${radius} 0 1,0 ${
          point.x + radius
        },${point.y} A ${radius},${radius} 0 1,0 ${point.x - radius},${
          point.y
        } Z`;
      }

      const smoothedPoints = preprocessPoints(points, tool);
      const basePts = isFast
        ? decimatePoints(smoothedPoints, 2)
        : smoothedPoints;
      const pfPoints = basePts.map((p) => [p.x, p.y, p.pressure || 0.5]);
      {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const p of smoothedPoints) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const bbW = maxX - minX;
        const bbH = maxY - minY;
        const eps = Math.max(0.75, width * 0.4);
        if (
          !Number.isFinite(bbW) ||
          !Number.isFinite(bbH) ||
          (bbW <= eps && bbH <= eps)
        ) {
          const c =
            smoothedPoints[smoothedPoints.length - 1] ||
            points[points.length - 1];
          const r = Math.max(0.5, width / 2);
          return `M ${c.x - r},${c.y} A ${r},${r} 0 1,0 ${c.x + r},${
            c.y
          } A ${r},${r} 0 1,0 ${c.x - r},${c.y} Z`;
        }
      }

      const needsRoundCaps =
        tool === "pen" || tool === "pencil" || tool === "eraser";
      const isBrush = tool === "brush";
      const isCalligraphy = tool === "calligraphy";

      const options = {
        size: width,
        thinning: needsRoundCaps
          ? 0.05
          : isBrush
          ? 0.3
          : isCalligraphy
          ? 0.65
          : 0.2,
        smoothing: needsRoundCaps
          ? 0.7
          : isBrush
          ? 0.6
          : isCalligraphy
          ? 0.85
          : 0.6,
        streamline: needsRoundCaps
          ? 0.5
          : isBrush
          ? 0.4
          : isCalligraphy
          ? 0.55
          : 0.4,
        easing: (t: number) => {
          if (isCalligraphy) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          }

          return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        },
        simulatePressure: isBrush || isCalligraphy,
        last: true,
        start: {
          taper: needsRoundCaps ? 0 : isBrush ? 5 : isCalligraphy ? 10 : 2,
          cap: true,
        },
        end: {
          taper: needsRoundCaps ? 0 : isBrush ? 5 : isCalligraphy ? 10 : 2,
          cap: true,
        },
      };

      const stroke = getStroke(pfPoints, options);
      if (!stroke || stroke.length === 0) return "";

      const cleanStroke = stroke.filter(
        (pt) =>
          Array.isArray(pt) &&
          pt.length >= 2 &&
          Number.isFinite(pt[0]) &&
          Number.isFinite(pt[1])
      );
      if (cleanStroke.length === 0) return "";

      const outline = cleanStroke as Array<[number, number]>;
      if (outline.length < 3) {
        const lastP =
          smoothedPoints[smoothedPoints.length - 1] ||
          points[points.length - 1];
        const r = Math.max(0.5, width / 2);
        return `M ${lastP.x - r},${lastP.y} A ${r},${r} 0 1,0 ${lastP.x + r},${
          lastP.y
        } A ${r},${r} 0 1,0 ${lastP.x - r},${lastP.y} Z`;
      }

      // Brush gets a curved outline; others keep polygonal stability
      if (isBrush) {
        const outlineChaikin2D = (
          pts: Array<[number, number]>,
          passes = 1
        ): Array<[number, number]> => {
          if (!pts || pts.length < 3 || passes <= 0) return pts;
          let cur = pts;
          for (let it = 0; it < passes; it++) {
            const out: Array<[number, number]> = [];
            out.push(cur[0]);
            for (let i = 0; i < cur.length - 1; i++) {
              const p0 = cur[i];
              const p1 = cur[i + 1];
              const q: [number, number] = [
                p0[0] + (p1[0] - p0[0]) * 0.25,
                p0[1] + (p1[1] - p0[1]) * 0.25,
              ];
              const r: [number, number] = [
                p1[0] - (p1[0] - p0[0]) * 0.25,
                p1[1] - (p1[1] - p0[1]) * 0.25,
              ];
              out.push(q, r);
            }
            out.push(cur[cur.length - 1]);
            cur = out;
          }
          return cur;
        };

        const bezierPathClosed = (pts: Array<[number, number]>): string => {
          if (!pts || pts.length === 0) return "";
          if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]} Z`;
          if (pts.length === 2)
            return `M ${pts[0][0]},${pts[0][1]} L ${pts[1][0]},${pts[1][1]} Z`;
          const n = pts.length;
          let d = `M ${pts[0][0]},${pts[0][1]}`;
          const smooth = 0.25;
          for (let i = 0; i < n; i++) {
            const idx0 = (i - 1 + n) % n;
            const idx1 = i % n;
            const idx2 = (i + 1) % n;
            const idx3 = (i + 2) % n;
            const p0 = pts[idx0];
            const p1 = pts[idx1];
            const p2 = pts[idx2];
            const p3 = pts[idx3];
            let c1x = p1[0] + (p2[0] - p0[0]) * smooth;
            let c1y = p1[1] + (p2[1] - p0[1]) * smooth;
            let c2x = p2[0] - (p3[0] - p1[0]) * smooth;
            let c2y = p2[1] - (p3[1] - p1[1]) * smooth;
            c1x = clamp(c1x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
            c2x = clamp(c2x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
            c1y = clamp(c1y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
            c2y = clamp(c2y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
            d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
          }
          d += " Z";
          return d;
        };

        // In fast mode, skip Bezier and return polygon or minimal smoothing
        if (isFast) {
          const poly = outlineChaikin2D(outline, 0);
          let d = `M ${poly[0][0]},${poly[0][1]}`;
          for (let i = 1; i < poly.length; i++)
            d += ` L ${poly[i][0]},${poly[i][1]}`;
          d += " Z";
          return d;
        }
        const smoothOutline = outlineChaikin2D(outline, 1);
        return bezierPathClosed(smoothOutline);
      }

      // Default: straight polygon
      let pathData = `M ${outline[0][0]},${outline[0][1]}`;
      for (let i = 1; i < outline.length; i++) {
        const [x, y] = outline[i];
        pathData += ` L ${x},${y}`;
      }
      pathData += " Z";
      return pathData;
    },
    [preprocessPoints, decimatePoints]
  );

  // Tool-specific input characteristics
  const TOOL_PARAMS: Record<
    DrawingTool,
    {
      threshold: number;
      bezierSmooth: number;
      widthFactor: number;
      opacity: number;
      slowdownZoneScale: number;
    }
  > = {
    pen: {
      threshold: 0.2,
      bezierSmooth: 0.15,
      widthFactor: 1.0,
      opacity: 1.0,
      slowdownZoneScale: 1.0,
    },
    pencil: {
      threshold: 0.15,
      bezierSmooth: 0.1,
      widthFactor: 0.9,
      opacity: 0.9,
      slowdownZoneScale: 0.9,
    },
    brush: {
      threshold: 1.0,
      bezierSmooth: 0.25,
      widthFactor: 1.4,
      opacity: 1.0,
      slowdownZoneScale: 1.1,
    },
    highlighter: {
      threshold: 0.7,
      bezierSmooth: 0.2,
      widthFactor: 2.5,
      opacity: 0.35,
      slowdownZoneScale: 1.0,
    },
    calligraphy: {
      threshold: 0.35,
      bezierSmooth: 0.25,
      widthFactor: 1.2,
      opacity: 1.0,
      slowdownZoneScale: 1.1,
    },
    eraser: {
      threshold: 0.6,
      bezierSmooth: 0.15,
      widthFactor: 1.0,
      opacity: 1.0,
      slowdownZoneScale: 1.0,
    },
  };

  const computeDeadZone = useCallback(
    (visualRadius: number, tool: DrawingTool) => {
      const base = 10;
      const dz = base + visualRadius * 2.0;
      const scaled = dz * (TOOL_PARAMS[tool]?.slowdownZoneScale ?? 1);
      return Math.max(8, Math.min(scaled, 28));
    },
    []
  );

  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const clamp = useCallback(
    (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
    []
  );
  const EDGE_INSET = 1;
  const NEAR_EDGE_MARGIN = 0.5;
  const measureCanvasBounds = useCallback(() => {
    try {
      const now = Date.now();
      if (now - lastMeasureTsRef.current < 32) return; // ~30fps throttle
      lastMeasureTsRef.current = now;
      containerRef.current?.measureInWindow((x, y, w, h) => {
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(w) &&
          Number.isFinite(h)
        ) {
          canvasBoundsRef.current = { x, y, width: w, height: h };
        }
      });
    } catch {}
  }, []);

  // Re-measure on relevant changes (orientation/size changes)
  useEffect(() => {
    measureCanvasBounds();
  }, [measureCanvasBounds, orientation, CANVAS_WIDTH, CANVAS_HEIGHT]);

  // Re-measure when window dimensions change (e.g., device rotation)
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      requestAnimationFrame(() => measureCanvasBounds());
      setTimeout(() => measureCanvasBounds(), 50);
    });
    return () => {
      if (sub && typeof sub.remove === "function") sub.remove();
    };
  }, [measureCanvasBounds]);
  const clampX = useCallback(
    (x: number) => {
      if (CANVAS_WIDTH <= EDGE_INSET * 2) return clamp(x, 0, CANVAS_WIDTH);
      return clamp(x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
    },
    [CANVAS_WIDTH, clamp]
  );
  const clampY = useCallback(
    (y: number) => {
      if (CANVAS_HEIGHT <= EDGE_INSET * 2) return clamp(y, 0, CANVAS_HEIGHT);
      return clamp(y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
    },
    [CANVAS_HEIGHT, clamp]
  );

  const handleTouchStart = useCallback(
    (evt: GestureResponderEvent) => {
      if (disabled) return;
      isFinalizingRef.current = false;
      measureCanvasBounds();

      let { locationX, locationY } = evt.nativeEvent;
      locationX = clampX(locationX);
      locationY = clampY(locationY);
      const pressure = (evt.nativeEvent as any).force || 0.7;
      const timestamp = Date.now();

      touchStartTimeRef.current = timestamp;
      touchStartPosRef.current = { x: locationX, y: locationY };

      const isEraser = currentTool === "eraser";
      const totalZoomStart = (currentZoom || 1) * (canvasZoom || 1);
      const visualWidthStart = scaleStrokesWithZoom
        ? currentWidth || 1
        : (currentWidth || 1) / (totalZoomStart || 1);
      const visualRadiusStart = Math.max(0.5, visualWidthStart * 0.5);
      const DEAD_ZONE_START = computeDeadZone(visualRadiusStart, currentTool);
      const inDeadZoneStart =
        locationX <= DEAD_ZONE_START ||
        locationX >= CANVAS_WIDTH - DEAD_ZONE_START ||
        locationY <= DEAD_ZONE_START ||
        locationY >= CANVAS_HEIGHT - DEAD_ZONE_START;
      if (inDeadZoneStart) {
        return;
      }

      const newStroke: Stroke = {
        id: `stroke_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        points: [
          {
            x: locationX,
            y: locationY,
            pressure,
            timestamp,
          },
        ],
        color: isEraser ? "#FF0000" : currentColor,
        width: isEraser ? currentWidth : currentWidth,
        tool: currentTool,
        opacity: isEraser ? 1 : TOOL_PARAMS[currentTool]?.opacity ?? 1,
      };
      currentStrokeRef.current = newStroke;
      setCurrentStroke(newStroke);
      setIsDrawing(true);
      onStrokeUpdate?.(newStroke);
      framePendingRef.current = false;
      lastUpdateTimeRef.current = Date.now();
    },
    [
      disabled,
      currentColor,
      currentWidth,
      currentTool,
      onStrokeUpdate,
      backgroundColor,
    ]
  );

  const shouldAddPoint = useCallback(
    (newPoint: Point, lastPoint: Point, tool: DrawingTool): boolean => {
      if (!lastPoint) return true;
      const distance = Math.sqrt(
        Math.pow(newPoint.x - lastPoint.x, 2) +
          Math.pow(newPoint.y - lastPoint.y, 2)
      );
      let threshold = TOOL_PARAMS[tool]?.threshold ?? 0.2;
      return distance > threshold;
    },
    []
  );

  const handleTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      if (!isDrawing || disabled) return;
      const activeStroke = currentStrokeRef.current;
      if (!activeStroke) return;

      const rawX = (evt.nativeEvent as any).locationX as number;
      const rawY = (evt.nativeEvent as any).locationY as number;
      const pageX = (evt.nativeEvent as any).pageX as number | undefined;
      const pageY = (evt.nativeEvent as any).pageY as number | undefined;
      let locationX = clampX(rawX);
      let locationY = clampY(rawY);
      const pressure = (evt.nativeEvent as any).force || 0.7;
      const timestamp = Date.now();

      const totalZoom = (currentZoom || 1) * (canvasZoom || 1);
      const visualWidth = scaleStrokesWithZoom
        ? activeStroke.width || 1
        : (activeStroke.width || 1) / (totalZoom || 1);
      const visualRadius = Math.max(0.5, visualWidth * 0.5);
      const EDGE_GUARD = Math.max(
        0.75,
        Math.min(NEAR_EDGE_MARGIN + visualRadius * 0.3, 4)
      );

      // Dead zone during move: if pointer is inside, ignore inputs (prevents bouncing)
      const DEAD_ZONE = computeDeadZone(visualRadius, activeStroke.tool);
      const inDeadZoneMove =
        locationX <= DEAD_ZONE ||
        locationX >= CANVAS_WIDTH - DEAD_ZONE ||
        locationY <= DEAD_ZONE ||
        locationY >= CANVAS_HEIGHT - DEAD_ZONE;
      if (inDeadZoneMove) {
        return;
      }

      const wasClamped = rawX !== locationX || rawY !== locationY;
      const lastPtDir = activeStroke.points[activeStroke.points.length - 1];
      const dxDir = lastPtDir ? locationX - lastPtDir.x : 0;
      const dyDir = lastPtDir ? locationY - lastPtDir.y : 0;
      const movingLeft = dxDir < 0;
      const movingRight = dxDir > 0;
      const movingUp = dyDir < 0;
      const movingDown = dyDir > 0;
      let outOfBoundsRaw = false;
      let nearEdgeAbs = false;
      if (typeof pageX === "number" && typeof pageY === "number") {
        const b = canvasBoundsRef.current;
        if (b.width > 0 && b.height > 0) {
          outOfBoundsRaw =
            pageX < b.x - 0.5 ||
            pageX > b.x + b.width + 0.5 ||
            pageY < b.y - 0.5 ||
            pageY > b.y + b.height + 0.5;
          const PROACTIVE = 3;
          const leftAbs =
            pageX <=
            b.x + EDGE_INSET + EDGE_GUARD + (movingLeft ? PROACTIVE : 0);
          const rightAbs =
            pageX >=
            b.x +
              b.width -
              EDGE_INSET -
              EDGE_GUARD -
              (movingRight ? PROACTIVE : 0);
          const TOP_GUARD =
            Math.max(EDGE_GUARD, 5) + (movingUp ? PROACTIVE : 0);
          const BOTTOM_GUARD =
            Math.max(EDGE_GUARD - 0.75, 0.25) +
            (movingDown ? PROACTIVE * 0.5 : 0);
          const HARD_TOP = TOP_GUARD + 2;
          const topAbs =
            pageY <= b.y + EDGE_INSET + (movingUp ? HARD_TOP : TOP_GUARD);
          const bottomAbs = pageY >= b.y + b.height - EDGE_INSET - BOTTOM_GUARD;
          nearEdgeAbs = leftAbs || rightAbs || topAbs || bottomAbs;
        }
      }
      const atClampedEdge =
        locationX <= EDGE_INSET ||
        locationX >= CANVAS_WIDTH - EDGE_INSET ||
        locationY <= EDGE_INSET ||
        locationY >= CANVAS_HEIGHT - EDGE_INSET;
      const TOP_GUARD_LOCAL = Math.max(EDGE_GUARD, 5) + (movingUp ? 5 : 0);
      const BOTTOM_GUARD_LOCAL =
        Math.max(EDGE_GUARD - 0.75, 0.25) + (movingDown ? 1.5 : 0);
      const nearEdge =
        locationX <= EDGE_INSET + EDGE_GUARD || // left
        locationX >= CANVAS_WIDTH - EDGE_INSET - EDGE_GUARD || // right
        locationY <= EDGE_INSET + TOP_GUARD_LOCAL || // top
        locationY >= CANVAS_HEIGHT - EDGE_INSET - BOTTOM_GUARD_LOCAL; // bottom
      if (
        wasClamped ||
        outOfBoundsRaw ||
        atClampedEdge ||
        nearEdge ||
        nearEdgeAbs
      ) {
        if (!isFinalizingRef.current) {
          isFinalizingRef.current = true;
          handleTouchEnd();
        }
        return;
      }

      const lastPoint = activeStroke.points[activeStroke.points.length - 1];
      const leftDist = Math.max(0, locationX - EDGE_INSET);
      const rightDist = Math.max(0, CANVAS_WIDTH - EDGE_INSET - locationX);
      const topDist = Math.max(0, locationY - EDGE_INSET);
      const bottomDist = Math.max(0, CANVAS_HEIGHT - EDGE_INSET - locationY);
      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
      const SLOWDOWN_ZONE = clamp(visualRadius * 4 + 8, 16, 56);
      const proximity = clamp(minDist / SLOWDOWN_ZONE, 0, 1);
      const towardDist = Math.min(
        movingLeft ? leftDist : Infinity,
        movingRight ? rightDist : Infinity,
        movingUp ? topDist : Infinity,
        movingDown ? bottomDist : Infinity
      );
      const towardProximity = Number.isFinite(towardDist)
        ? clamp(towardDist / SLOWDOWN_ZONE, 0, 1)
        : 1;
      let slowFactor = 1;
      if (minDist < SLOWDOWN_ZONE) {
        slowFactor = 0.5 + 0.5 * proximity;
      }
      if (towardProximity < proximity) {
        slowFactor = Math.min(slowFactor, 0.2 + 0.8 * towardProximity);
      }
      const topClose =
        minDist < SLOWDOWN_ZONE ? clamp(1 - topDist / SLOWDOWN_ZONE, 0, 1) : 0;
      const bottomClose =
        minDist < SLOWDOWN_ZONE
          ? clamp(1 - bottomDist / SLOWDOWN_ZONE, 0, 1)
          : 0;
      const leftClose =
        minDist < SLOWDOWN_ZONE ? clamp(1 - leftDist / SLOWDOWN_ZONE, 0, 1) : 0;
      const rightClose =
        minDist < SLOWDOWN_ZONE
          ? clamp(1 - rightDist / SLOWDOWN_ZONE, 0, 1)
          : 0;
      const xDampRaw =
        1 -
        0.85 * Math.max(movingUp ? topClose : 0, movingDown ? bottomClose : 0);
      const yDampRaw =
        1 -
        0.85 *
          Math.max(movingLeft ? leftClose : 0, movingRight ? rightClose : 0);
      let xDamp = clamp(xDampRaw, 0, 1);
      let yDamp = clamp(yDampRaw, 0, 1);
      const FREEZE_CLOSE = 0.8;
      if (
        (movingUp && topClose >= FREEZE_CLOSE) ||
        (movingDown && bottomClose >= FREEZE_CLOSE)
      ) {
        xDamp = 0;
      }
      if (
        (movingLeft && leftClose >= FREEZE_CLOSE) ||
        (movingRight && rightClose >= FREEZE_CLOSE)
      ) {
        yDamp = 0;
      }
      let targetX = locationX;
      let targetY = locationY;
      if (lastPoint) {
        const dxStep = (locationX - lastPoint.x) * slowFactor * xDamp;
        const dyStep = (locationY - lastPoint.y) * slowFactor * yDamp;
        targetX = lastPoint.x + dxStep;
        targetY = lastPoint.y + dyStep;
      }
      const newPoint: Point = { x: targetX, y: targetY, pressure, timestamp };
      const willAdd = shouldAddPoint(newPoint, lastPoint, currentTool);
      if (willAdd) {
        activeStroke.points.push(newPoint);
        if (!framePendingRef.current) {
          framePendingRef.current = true;
          rafIdRef.current = requestAnimationFrame(() => {
            framePendingRef.current = false;
            const latest = currentStrokeRef.current;
            if (latest) setCurrentStroke({ ...latest });
          });
        }

        const extraThrottle = Math.round((1 - proximity) * 8);
        const throttleMs = 16 + extraThrottle;
        if (timestamp - lastUpdateTimeRef.current > throttleMs) {
          lastUpdateTimeRef.current = timestamp;
          onStrokeUpdate?.(activeStroke);
        }
      }
    },
    [isDrawing, disabled, onStrokeUpdate, shouldAddPoint, currentTool]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDrawing || disabled) return;
    const finishingStroke = currentStrokeRef.current || currentStroke;
    if (!finishingStroke) return;

    const touchDuration = Date.now() - touchStartTimeRef.current;
    const touchDistance =
      finishingStroke.points.length > 1
        ? Math.sqrt(
            Math.pow(
              finishingStroke.points[finishingStroke.points.length - 1].x -
                touchStartPosRef.current.x,
              2
            ) +
              Math.pow(
                finishingStroke.points[finishingStroke.points.length - 1].y -
                  touchStartPosRef.current.y,
                2
              )
          )
        : 0;

    const totalZoom = (currentZoom || 1) * (canvasZoom || 1);
    const adjustWidthForZoom = (width: number) =>
      scaleStrokesWithZoom ? width : width / (totalZoom || 1);

    if (touchDuration < 200 && touchDistance < 5) {
      const dotStroke = {
        ...finishingStroke,
        width:
          finishingStroke.tool === "eraser"
            ? adjustWidthForZoom(finishingStroke.width)
            : finishingStroke.width,
        points: [finishingStroke.points[0]],
      };

      onStrokeComplete(dotStroke);
    } else if (finishingStroke.points.length >= 1) {
      const finalized =
        finishingStroke.tool === "eraser"
          ? {
              ...finishingStroke,
              width: adjustWidthForZoom(finishingStroke.width),
            }
          : finishingStroke;
      onStrokeComplete(finalized);
    }

    setCurrentStroke(null);
    currentStrokeRef.current = null;
    setIsDrawing(false);
    onStrokeUpdate?.(null);
  }, [
    isDrawing,
    currentStroke,
    disabled,
    onStrokeComplete,
    onStrokeUpdate,
    currentTool,
  ]);

  const getDistance = (touches: any[]) => {
    if (!Array.isArray(touches) || touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = (touch1.pageX ?? 0) - (touch2.pageX ?? 0);
    const dy = (touch1.pageY ?? 0) - (touch2.pageY ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return !disabled || touches.length === 2;
    },
    onStartShouldSetPanResponderCapture: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return !disabled || touches.length === 2;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      return (
        !disabled ||
        touches.length === 2 ||
        gestureState.numberActiveTouches >= 2
      );
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      return (
        !disabled ||
        touches.length === 2 ||
        gestureState.numberActiveTouches >= 2
      );
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      const isTwoFinger =
        touches.length === 2 || gestureState.numberActiveTouches >= 2;
      if (isTwoFinger) {
        isPinchingRef.current = true;
        gestureStartZoomRef.current = currentZoom || 1;
        gestureStartDistanceRef.current = getDistance(touches);
        if (isDrawing) {
          try {
            handleTouchEnd();
          } catch {}
        }
      } else {
        isPinchingRef.current = false;
        handleTouchStart(evt);
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      const activeTouches =
        touches.length || gestureState.numberActiveTouches || 0;

      if (activeTouches >= 2 && !isPinchingRef.current) {
        isPinchingRef.current = true;
        gestureStartZoomRef.current = currentZoom || 1;
        gestureStartDistanceRef.current = getDistance(touches);
        if (isDrawing) {
          try {
            handleTouchEnd();
          } catch {}
        }
      }

      if (isPinchingRef.current && activeTouches >= 2) {
        const currentDistance = getDistance(touches);
        const startDistance = gestureStartDistanceRef.current;
        if (startDistance > 0 && currentDistance > 0) {
          const scale = currentDistance / startDistance;
          const newZoom = Math.max(
            0.5,
            Math.min(5, (gestureStartZoomRef.current || 1) * scale)
          );
          onZoomChange?.(newZoom);
          requestAnimationFrame(() => measureCanvasBounds());
        }
      } else if (!isPinchingRef.current) {
        handleTouchMove(evt);
      }
    },
    onPanResponderRelease: () => {
      if (!isPinchingRef.current) {
        handleTouchEnd();
      }
      isPinchingRef.current = false;
      gestureStartDistanceRef.current = 0;
    },
    onPanResponderTerminate: () => {
      if (!isPinchingRef.current) {
        handleTouchEnd();
      }
      isPinchingRef.current = false;
      gestureStartDistanceRef.current = 0;
    },
  });

  const convertDrawingStrokeToStroke = useCallback(
    (drawingStroke: DrawingStroke): Stroke => {
      const points: Point[] = [];
      for (let i = 0; i < drawingStroke.points.length; i += 2) {
        if (i + 1 < drawingStroke.points.length) {
          const x = drawingStroke.points[i];
          const y = drawingStroke.points[i + 1];

          if (typeof x === "number" && typeof y === "number") {
            points.push({ x, y, timestamp: drawingStroke.timestamp });
          }
        }
      }

      return {
        id: drawingStroke.id,
        points,
        color: drawingStroke.color,
        width: drawingStroke.width,
        tool: drawingStroke.tool as DrawingTool,
        opacity: drawingStroke.opacity || 1,
      };
    },
    []
  );

  const makeSmoothBezierPath = useCallback(
    (points: Point[], tool: DrawingTool): string => {
      if (!points || points.length === 0) return "";
      if (points.length === 1) return `M${points[0].x},${points[0].y}`;
      if (points.length === 2)
        return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;

      const d: string[] = [];
      d.push(`M${points[0].x},${points[0].y}`);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const smooth = TOOL_PARAMS[tool]?.bezierSmooth ?? 0.2;
        let c1x = p1.x + (p2.x - p0.x) * smooth;
        let c1y = p1.y + (p2.y - p0.y) * smooth;
        let c2x = p2.x - (p3.x - p1.x) * smooth;
        let c2y = p2.y - (p3.y - p1.y) * smooth;
        c1x = clamp(c1x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
        c2x = clamp(c2x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
        c1y = clamp(c1y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
        c2y = clamp(c2y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
        d.push(` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
      }
      return d.join("");
    },
    []
  );

  const makeSeededRng = useCallback((seedStr: string) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let x = h || 123456789;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }, []);

  const makeJitteredBezierPath = useCallback(
    (points: Point[], seed: string, jitterAmp: number): string => {
      if (!points || points.length === 0) return "";
      if (points.length === 1) return `M${points[0].x},${points[0].y}`;
      if (points.length === 2)
        return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
      const rand = makeSeededRng(seed);
      const d: string[] = [];
      d.push(`M${points[0].x},${points[0].y}`);
      const smooth = 0.18;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        let c1x = p1.x + (p2.x - p0.x) * smooth;
        let c1y = p1.y + (p2.y - p0.y) * smooth;
        let c2x = p2.x - (p3.x - p1.x) * smooth;
        let c2y = p2.y - (p3.y - p1.y) * smooth;
        const j1x = (rand() * 2 - 1) * jitterAmp;
        const j1y = (rand() * 2 - 1) * jitterAmp;
        const j2x = (rand() * 2 - 1) * jitterAmp;
        const j2y = (rand() * 2 - 1) * jitterAmp;
        c1x = clamp(c1x + j1x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
        c1y = clamp(c1y + j1y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
        c2x = clamp(c2x + j2x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
        c2y = clamp(c2y + j2y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
        d.push(` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
      }
      return d.join("");
    },
    [clamp, CANVAS_WIDTH, CANVAS_HEIGHT, makeSeededRng]
  );

  const computeAvgSpeed = useCallback((pts: Point[]): number => {
    if (!pts || pts.length < 2) return 0;
    let dist = 0;
    let time = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const dt = Math.max(
        0,
        (pts[i].timestamp || 0) - (pts[i - 1].timestamp || 0)
      );
      dist += Math.hypot(dx, dy);
      time += dt;
    }
    return time > 0 ? dist / time : 0;
  }, []);

  const chaikinSmooth = useCallback(
    (src: Point[], iterations: number = 2, ratio: number = 0.25): Point[] => {
      if (!src || src.length < 3 || iterations <= 0) return src;
      let pts = src.slice();
      for (let it = 0; it < iterations; it++) {
        const out: Point[] = [];
        out.push({ ...pts[0] });
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const Q: Point = {
            x: p0.x + (p1.x - p0.x) * ratio,
            y: p0.y + (p1.y - p0.y) * ratio,
            pressure: p0.pressure ?? p1.pressure,
            timestamp: p1.timestamp,
          };
          const R: Point = {
            x: p1.x - (p1.x - p0.x) * ratio,
            y: p1.y - (p1.y - p0.y) * ratio,
            pressure: p1.pressure ?? p0.pressure,
            timestamp: p1.timestamp,
          };
          out.push(Q, R);
        }
        out.push({ ...pts[pts.length - 1] });
        pts = out;
      }
      return pts;
    },
    []
  );

  const getCalligraphyPath = useCallback(
    (
      points: Point[],
      baseWidth: number,
      angleDeg: number = 45,
      minRatio: number = 0.3,
      isFast: boolean = false
    ): string => {
      if (!points || points.length === 0) return "";
      if (points.length === 1) {
        const p = points[0];
        const r = Math.max(0.5, baseWidth / 2);
        return `M ${p.x - r},${p.y} A ${r},${r} 0 1,0 ${p.x + r},${
          p.y
        } A ${r},${r} 0 1,0 ${p.x - r},${p.y} Z`;
      }

      const smoothIters = isFast ? 1 : 2;
      const smoothCenter = chaikinSmooth(points, smoothIters, 0.25);
      const alpha = (angleDeg * Math.PI) / 180;
      const left: Array<[number, number]> = [];
      const right: Array<[number, number]> = [];

      const clampPt = (x: number, y: number): [number, number] => [
        clamp(x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET),
        clamp(y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET),
      ];

      let lastTx = 1,
        lastTy = 0;
      for (let i = 0; i < smoothCenter.length; i++) {
        const p0 = smoothCenter[Math.max(0, i - 1)];
        const p1 = smoothCenter[i];
        const p2 = smoothCenter[Math.min(smoothCenter.length - 1, i + 1)];
        let tx = p2.x - p0.x;
        let ty = p2.y - p0.y;
        const len = Math.hypot(tx, ty);
        if (len > 1e-3) {
          tx /= len;
          ty /= len;
          lastTx = tx;
          lastTy = ty;
        } else {
          tx = lastTx;
          ty = lastTy;
        }
        const nx = -ty;
        const ny = tx;
        const theta = Math.atan2(ty, tx);
        const f = minRatio + (1 - minRatio) * Math.abs(Math.sin(theta - alpha));
        const pFactor =
          p1.pressure != null ? 0.9 + 0.2 * clamp(p1.pressure, 0, 1) : 1.0;
        const halfW = (baseWidth / 2) * f * pFactor;
        const lx = p1.x + nx * halfW;
        const ly = p1.y + ny * halfW;
        const rx = p1.x - nx * halfW;
        const ry = p1.y - ny * halfW;
        left.push(clampPt(lx, ly));
        right.push(clampPt(rx, ry));
      }

      const outlineChaikin = (
        edge: Array<[number, number]>,
        passes = 1
      ): Array<[number, number]> => {
        if (edge.length < 3 || passes <= 0) return edge;
        let pts = edge;
        for (let it = 0; it < passes; it++) {
          const out: Array<[number, number]> = [];
          out.push(pts[0]);
          for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i];
            const p1 = pts[i + 1];
            const q: [number, number] = [
              p0[0] + (p1[0] - p0[0]) * 0.25,
              p0[1] + (p1[1] - p0[1]) * 0.25,
            ];
            const r: [number, number] = [
              p1[0] - (p1[0] - p0[0]) * 0.25,
              p1[1] - (p1[1] - p0[1]) * 0.25,
            ];
            out.push(q, r);
          }
          out.push(pts[pts.length - 1]);
          pts = out;
        }
        return pts;
      };

      const leftSmooth = outlineChaikin(left, isFast ? 0 : 1);
      const rightSmooth = outlineChaikin(right, isFast ? 0 : 1);

      const buildBezierChain = (
        pts: Array<[number, number]>,
        includeMove: boolean
      ): string => {
        if (!pts || pts.length === 0) return "";
        let out = includeMove
          ? `M ${pts[0][0]},${pts[0][1]}`
          : `L ${pts[0][0]},${pts[0][1]}`;
        const smooth = 0.25;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = i === 0 ? pts[0] : pts[i - 1];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          let c1x = p1[0] + (p2[0] - p0[0]) * smooth;
          let c1y = p1[1] + (p2[1] - p0[1]) * smooth;
          let c2x = p2[0] - (p3[0] - p1[0]) * smooth;
          let c2y = p2[1] - (p3[1] - p1[1]) * smooth;
          c1x = clamp(c1x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
          c2x = clamp(c2x, EDGE_INSET, CANVAS_WIDTH - EDGE_INSET);
          c1y = clamp(c1y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
          c2y = clamp(c2y, EDGE_INSET, CANVAS_HEIGHT - EDGE_INSET);
          out += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
        }
        return out;
      };

      const leftPath = buildBezierChain(leftSmooth, true);
      const rightReverse = [...rightSmooth].reverse();
      const rightPath = buildBezierChain(rightReverse, false);
      const d = `${leftPath} ${rightPath} Z`;
      return d;
    },
    [clamp, CANVAS_WIDTH, CANVAS_HEIGHT, chaikinSmooth]
  );

  const isHeavyScene = useMemo(() => {
    let totalPts = 0;
    for (const s of strokes) {
      const n = Array.isArray(s.points) ? Math.floor(s.points.length / 2) : 0;
      totalPts += n;
    }
    const manyStrokes = strokes.length > 90;
    const manyPoints = totalPts > 6000;
    return manyStrokes || manyPoints;
  }, [strokes]);

  const renderStroke = useCallback(
    (stroke: Stroke, index: number | string) => {
      if (stroke.points.length === 0) return null;
      const totalZoom = (currentZoom || 1) * (canvasZoom || 1);
      const baseWidth = scaleStrokesWithZoom
        ? stroke.width
        : stroke.width / (totalZoom || 1);
      const effectiveWidth =
        baseWidth * (TOOL_PARAMS[stroke.tool]?.widthFactor ?? 1);

      let pathData: string;
      let opacity = stroke.opacity || 1;
      const createSmoothPath = (points: Point[], tool: DrawingTool): string =>
        makeSmoothBezierPath(points, tool);
      const isCurrentStroke = index === "current";
      if (isCurrentStroke) {
        if (stroke.tool === "highlighter") {
          if (stroke.points.length === 1) {
            const dotPath = getSmoothStrokePath(
              stroke.points,
              effectiveWidth * (TOOL_PARAMS.highlighter.widthFactor ?? 2.5),
              stroke.tool
            );
            if (!dotPath) return null;
            return (
              <Path
                key={`${stroke.id}-${index}`}
                d={dotPath}
                fill={stroke.color}
                opacity={0.35}
              />
            );
          }
          pathData = createSmoothPath(stroke.points, stroke.tool);
          if (!pathData) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={pathData}
              stroke={stroke.color}
              strokeWidth={
                effectiveWidth * (TOOL_PARAMS.highlighter.widthFactor ?? 2.5)
              }
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.35}
            />
          );
        }
        if (stroke.tool === "brush") {
          const filledPath = getSmoothStrokePath(
            stroke.points,
            effectiveWidth,
            stroke.tool,
            isHeavyScene
          );
          if (!filledPath) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={filledPath}
              fill={stroke.color}
              opacity={opacity}
            />
          );
        }
        if (stroke.tool === "calligraphy") {
          const path = getCalligraphyPath(
            stroke.points,
            effectiveWidth,
            45,
            0.4,
            isHeavyScene
          );
          if (!path) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={path}
              fill={stroke.color}
              opacity={opacity}
            />
          );
        }
        if (stroke.tool === "eraser") {
          pathData = createSmoothPath(stroke.points, stroke.tool);
          if (!pathData) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={pathData}
              stroke={stroke.color}
              strokeWidth={effectiveWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={opacity}
            />
          );
        }

        if (stroke.points.length === 1) {
          const dotPath = getSmoothStrokePath(
            stroke.points,
            effectiveWidth,
            stroke.tool
          );
          if (!dotPath) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={dotPath}
              fill={stroke.color}
              opacity={opacity}
            />
          );
        }

        pathData = createSmoothPath(stroke.points, stroke.tool);
        if (!pathData) return null;
        if (stroke.tool === "pencil") {
          const seed = `${stroke.id}-current`;
          const avgSpeed = computeAvgSpeed(stroke.points);
          const speedNorm = Math.min(1, avgSpeed / 0.8);
          const baseOpacity = clamp(0.45 + (1 - speedNorm) * 0.4, 0.4, 0.9);
          const jitterPath = isHeavyScene
            ? ""
            : makeJitteredBezierPath(stroke.points, seed, 0.35);
          const rng = makeSeededRng(seed);
          const dash1 = 1.8 + rng() * 1.2;
          const dash2 = 2.4 + rng() * 1.8;
          const off1x = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off1y = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off2x = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off2y = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          return (
            <G key={`${stroke.id}-${index}-group`}>
              <Path
                key={`${stroke.id}-${index}-base`}
                d={pathData}
                stroke={stroke.color}
                strokeWidth={effectiveWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={baseOpacity}
              />
              {!isHeavyScene && jitterPath ? (
                <Path
                  key={`${stroke.id}-${index}-jitter`}
                  d={jitterPath}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 0.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.18}
                />
              ) : null}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-grain`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 1.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.22}
                  strokeDasharray={`${dash1},${dash2}`}
                />
              )}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-soft1`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 1.05}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.08}
                  transform={`translate(${off1x}, ${off1y})`}
                />
              )}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-soft2`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 0.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.08}
                  transform={`translate(${off2x}, ${off2y})`}
                />
              )}
            </G>
          );
        }
        return (
          <Path
            key={`${stroke.id}-${index}-base`}
            d={pathData}
            stroke={stroke.color}
            strokeWidth={effectiveWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={opacity}
          />
        );
      }

      if (stroke.tool === "brush") {
        const cacheKey = `brush:${stroke.id}:${effectiveWidth}:${
          isHeavyScene ? 1 : 0
        }`;
        let filledPath = pathCacheRef.current.get(cacheKey);
        if (!filledPath) {
          filledPath = getSmoothStrokePath(
            stroke.points,
            effectiveWidth,
            stroke.tool,
            isHeavyScene
          );
          if (filledPath) pathCacheRef.current.set(cacheKey, filledPath);
        }
        if (!filledPath) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={filledPath}
            fill={stroke.color}
            opacity={opacity}
          />
        );
      }
      if (stroke.tool === "calligraphy") {
        const cacheKey = `nib:${stroke.id}:${effectiveWidth}:${
          isHeavyScene ? 1 : 0
        }`;
        const cached = pathCacheRef.current.get(cacheKey);
        let calliPath: string | undefined = cached;
        if (!cached) {
          calliPath = getCalligraphyPath(
            stroke.points,
            effectiveWidth,
            45,
            0.4,
            isHeavyScene
          );
          if (calliPath) pathCacheRef.current.set(cacheKey, calliPath);
        }
        if (!calliPath) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={calliPath}
            fill={stroke.color}
            opacity={opacity}
          />
        );
      }

      if (
        stroke.tool === "pen" ||
        stroke.tool === "pencil" ||
        stroke.tool === "eraser"
      ) {
        const cacheKey = `bezier:${stroke.id}:${stroke.tool}:${
          TOOL_PARAMS[stroke.tool]?.bezierSmooth ?? 0.2
        }`;
        const cached = pathCacheRef.current.get(cacheKey);
        if (cached) {
          pathData = cached;
        } else {
          pathData = createSmoothPath(stroke.points, stroke.tool);
          if (pathData) pathCacheRef.current.set(cacheKey, pathData);
        }
        if (!pathData) return null;
        if (stroke.tool === "pencil") {
          const seed = `${stroke.id}`;
          const avgSpeed = computeAvgSpeed(stroke.points);
          const speedNorm = Math.min(1, avgSpeed / 0.8);
          const baseOpacity = clamp(0.45 + (1 - speedNorm) * 0.4, 0.4, 0.9);
          const jitterPath = isHeavyScene
            ? ""
            : makeJitteredBezierPath(stroke.points, seed, 0.35);
          const rng = makeSeededRng(seed);
          const dash1 = 1.8 + rng() * 1.2;
          const dash2 = 2.4 + rng() * 1.8;
          const off1x = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off1y = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off2x = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          const off2y = isHeavyScene ? 0 : (rng() * 2 - 1) * 0.25;
          return (
            <G key={`${stroke.id}-${index}-group`}>
              <Path
                key={`${stroke.id}-${index}-base`}
                d={pathData}
                stroke={stroke.color}
                strokeWidth={effectiveWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={baseOpacity}
              />
              {!isHeavyScene && jitterPath ? (
                <Path
                  key={`${stroke.id}-${index}-jitter`}
                  d={jitterPath}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 0.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.16}
                />
              ) : null}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-grain`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 1.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.2}
                  strokeDasharray={`${dash1},${dash2}`}
                />
              )}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-soft1`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 1.05}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.08}
                  transform={`translate(${off1x}, ${off1y})`}
                />
              )}
              {!isHeavyScene && (
                <Path
                  key={`${stroke.id}-${index}-soft2`}
                  d={pathData}
                  stroke={stroke.color}
                  strokeWidth={effectiveWidth * 0.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.08}
                  transform={`translate(${off2x}, ${off2y})`}
                />
              )}
            </G>
          );
        }
        return (
          <Path
            key={`${stroke.id}-${index}-base`}
            d={pathData}
            stroke={stroke.color}
            strokeWidth={effectiveWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={opacity}
          />
        );
      }

      if (stroke.tool === "highlighter") {
        if (stroke.points.length === 1) {
          const dotPath = getSmoothStrokePath(
            stroke.points,
            effectiveWidth * (TOOL_PARAMS.highlighter.widthFactor ?? 2.5),
            stroke.tool
          );
          if (!dotPath) return null;
          return (
            <Path
              key={`${stroke.id}-${index}`}
              d={dotPath}
              fill={stroke.color}
              opacity={0.4}
            />
          );
        }
        pathData = createSmoothPath(stroke.points, stroke.tool);
        if (!pathData) return null;

        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={pathData}
            stroke={stroke.color}
            strokeWidth={
              effectiveWidth * (TOOL_PARAMS.highlighter.widthFactor ?? 2.5)
            }
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.4}
          />
        );
      }

      if (stroke.points.length === 1) {
        const dotPath = getSmoothStrokePath(
          stroke.points,
          effectiveWidth,
          stroke.tool
        );
        if (!dotPath) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={dotPath}
            fill={stroke.color}
            opacity={opacity}
          />
        );
      }
      pathData = createSmoothPath(stroke.points, stroke.tool);
      if (!pathData) return null;
      return (
        <Path
          key={`${stroke.id}-${index}`}
          d={pathData}
          stroke={stroke.color}
          strokeWidth={effectiveWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={opacity}
        />
      );
    },
    [scaleStrokesWithZoom, currentZoom, getSmoothStrokePath]
  );

  const memoConvertedStrokes = useMemo(() => {
    return strokes.map((drawingStroke) =>
      convertDrawingStrokeToStroke(drawingStroke)
    );
  }, [strokes, convertDrawingStrokeToStroke]);

  const completedStrokesLayer = useMemo(() => {
    return memoConvertedStrokes.map((convertedStroke, index) =>
      renderStroke(convertedStroke, index)
    );
  }, [memoConvertedStrokes, renderStroke]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          alignSelf: "center",
          marginHorizontal: CANVAS_MARGIN_HORIZONTAL,
          marginVertical: CANVAS_MARGIN_VERTICAL,
        },
      ]}
      ref={containerRef}
      onLayout={() => {
        try {
          containerRef.current?.measureInWindow((x, y, w, h) => {
            canvasBoundsRef.current = { x, y, width: w, height: h };
          });
          setTimeout(() => {
            try {
              containerRef.current?.measureInWindow((x, y, w, h) => {
                if (Number.isFinite(x) && Number.isFinite(y)) {
                  canvasBoundsRef.current = { x, y, width: w, height: h };
                }
              });
            } catch {}
          }, 100);
        } catch {}
      }}
      pointerEvents="box-only"
      {...panResponder.panHandlers}
      collapsable={false}
    >
      <TemplateOverlay
        template={template}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        {...templateOptions}
      />

      <Svg
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      >
        <Defs>
          <ClipPath id="canvasClip">
            <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
          </ClipPath>
        </Defs>
        <G
          scale={1}
          origin={`${CANVAS_WIDTH / 2}, ${CANVAS_HEIGHT / 2}`}
          clipPath="url(#canvasClip)"
        >
          {completedStrokesLayer}
          {currentStroke && renderStroke(currentStroke, "current")}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
});

export default DrawingCanvas;
