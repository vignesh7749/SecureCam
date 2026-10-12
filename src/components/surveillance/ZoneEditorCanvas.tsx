import React, { useState, useRef } from 'react';
import { ZonePoint } from '../../types/zone';
import { Check, X, Square, Pentagon, MousePointer } from 'lucide-react';
import { Button } from '../common/Button';

interface ZoneEditorCanvasProps {
  isDrawing: boolean;
  drawingShape: 'rectangle' | 'polygon';
  setDrawingShape: (shape: 'rectangle' | 'polygon') => void;
  draftPoints: ZonePoint[];
  setDraftPoints: React.Dispatch<React.SetStateAction<ZonePoint[]>>;
  onFinishZone: (name: string, type: 'emergency' | 'caution', threshold: number) => void;
  onCancel: () => void;
}

export const ZoneEditorCanvas: React.FC<ZoneEditorCanvasProps> = ({
  isDrawing,
  drawingShape,
  setDrawingShape,
  draftPoints,
  setDraftPoints,
  onFinishZone,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingRect, setIsDraggingRect] = useState(false);
  const [rectStart, setRectStart] = useState<ZonePoint | null>(null);
  const [mousePos, setMousePos] = useState<ZonePoint>({ x: 50, y: 50 });
  const [zoneName, setZoneName] = useState('New Emergency Zone');
  const [zoneType, setZoneType] = useState<'emergency' | 'caution'>('emergency');
  const [threshold, setThreshold] = useState(10);

  if (!isDrawing) return null;

  const getPercentCoordsFromClient = (clientX: number, clientY: number): ZonePoint => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  };

  const getPercentCoords = (e: React.MouseEvent<HTMLDivElement>): ZonePoint => {
    return getPercentCoordsFromClient(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getPercentCoords(e);
    setMousePos(coords);

    if (drawingShape === 'rectangle' && isDraggingRect && rectStart) {
      // 4 points of rectangle
      setDraftPoints([
        { x: Math.min(rectStart.x, coords.x), y: Math.min(rectStart.y, coords.y) },
        { x: Math.max(rectStart.x, coords.x), y: Math.min(rectStart.y, coords.y) },
        { x: Math.max(rectStart.x, coords.x), y: Math.max(rectStart.y, coords.y) },
        { x: Math.min(rectStart.x, coords.x), y: Math.max(rectStart.y, coords.y) },
      ]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only left click
    if (e.button !== 0) return;
    const coords = getPercentCoords(e);

    if (drawingShape === 'rectangle') {
      setIsDraggingRect(true);
      setRectStart(coords);
      setDraftPoints([coords]);
    } else {
      // Polygon click point
      // If clicking near first point and we have at least 3 points, complete polygon
      if (draftPoints.length >= 3) {
        const first = draftPoints[0];
        const dist = Math.hypot(coords.x - first.x, coords.y - first.y);
        if (dist < 3) {
          // close loop
          return;
        }
      }
      setDraftPoints(prev => [...prev, coords]);
    }
  };

  const handleMouseUp = () => {
    if (drawingShape === 'rectangle' && isDraggingRect) {
      setIsDraggingRect(false);
    }
  };

  // Touch event handlers for mobile & tablet touch screens
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const coords = getPercentCoordsFromClient(touch.clientX, touch.clientY);
    setMousePos(coords);

    if (drawingShape === 'rectangle') {
      setIsDraggingRect(true);
      setRectStart(coords);
      setDraftPoints([coords]);
    } else {
      if (draftPoints.length >= 3) {
        const first = draftPoints[0];
        const dist = Math.hypot(coords.x - first.x, coords.y - first.y);
        if (dist < 4) return;
      }
      setDraftPoints(prev => [...prev, coords]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const coords = getPercentCoordsFromClient(touch.clientX, touch.clientY);
    setMousePos(coords);

    if (drawingShape === 'rectangle' && isDraggingRect && rectStart) {
      setDraftPoints([
        { x: Math.min(rectStart.x, coords.x), y: Math.min(rectStart.y, coords.y) },
        { x: Math.max(rectStart.x, coords.x), y: Math.min(rectStart.y, coords.y) },
        { x: Math.max(rectStart.x, coords.x), y: Math.max(rectStart.y, coords.y) },
        { x: Math.min(rectStart.x, coords.x), y: Math.max(rectStart.y, coords.y) },
      ]);
    }
  };

  const handleTouchEnd = () => {
    if (drawingShape === 'rectangle' && isDraggingRect) {
      setIsDraggingRect(false);
    }
  };

  const handleSave = () => {
    if (draftPoints.length < 3) return;
    onFinishZone(zoneName, zoneType, threshold);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="absolute inset-0 z-30 cursor-crosshair select-none bg-surveillance-950/40 backdrop-blur-[1px] touch-none"
    >
      {/* Top Drawing Instructions & Controls HUD */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-cyan-500/60 rounded shadow-2xl p-2 flex flex-wrap items-center justify-center gap-2 max-w-[96%] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 rounded text-[11px] font-mono font-bold">
          <MousePointer className="w-3.5 h-3.5 animate-pulse" />
          <span>DRAW ZONE</span>
        </div>

        {/* Shape mode selector */}
        <div className="flex items-center bg-slate-800 p-0.5 rounded border border-slate-700">
          <button
            onClick={() => {
              setDrawingShape('rectangle');
              setDraftPoints([]);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
              drawingShape === 'rectangle' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Square className="w-3 h-3" />
            <span>Rect</span>
          </button>
          <button
            onClick={() => {
              setDrawingShape('polygon');
              setDraftPoints([]);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
              drawingShape === 'polygon' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Pentagon className="w-3 h-3" />
            <span>Polygon</span>
          </button>
        </div>

        {/* Zone Name input */}
        <input
          type="text"
          value={zoneName}
          onChange={(e) => setZoneName(e.target.value)}
          placeholder="Zone identifier..."
          className="bg-surveillance-800 border border-surveillance-700 text-surveillance-100 text-xs font-mono px-2 py-1 rounded-xs w-36"
        />

        {/* Type toggle */}
        <select
          value={zoneType}
          onChange={(e) => setZoneType(e.target.value as any)}
          className="bg-surveillance-800 border border-surveillance-700 text-surveillance-200 text-xs font-mono px-2 py-1 rounded-xs"
        >
          <option value="emergency">Emergency (Critical)</option>
          <option value="caution">Caution (Medium)</option>
        </select>

        {/* Dwell threshold */}
        <div className="flex items-center gap-1 text-xs font-mono text-surveillance-300">
          <span className="text-[10px] text-surveillance-400">DWELL:</span>
          <input
            type="number"
            min="1"
            max="120"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-12 bg-surveillance-800 border border-surveillance-700 px-1 py-0.5 text-center text-xs font-mono text-surveillance-100 rounded-xs"
          />
          <span className="text-[10px] text-surveillance-400">sec</span>
        </div>

        {/* Finish & Cancel */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-surveillance-700">
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={draftPoints.length < 3}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Save Zone
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            icon={<X className="w-3.5 h-3.5" />}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Crosshair Guides */}
      <div
        className="absolute top-0 bottom-0 border-l border-tactical-cyan/30 pointer-events-none"
        style={{ left: `${mousePos.x}%` }}
      />
      <div
        className="absolute left-0 right-0 border-t border-tactical-cyan/30 pointer-events-none"
        style={{ top: `${mousePos.y}%` }}
      />

      {/* Coordinate tooltip beside cursor */}
      <div
        className="absolute px-1.5 py-0.5 bg-surveillance-950/90 border border-tactical-cyan/50 text-tactical-cyan font-mono text-[9px] rounded-2xs pointer-events-none -translate-x-1/2 translate-y-3"
        style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
      >
        X:{mousePos.x}% Y:{mousePos.y}% {drawingShape === 'polygon' && `(${draftPoints.length} pts)`}
      </div>

      {/* SVG Canvas for Draft Shape */}
      <svg className="w-full h-full absolute inset-0 pointer-events-none">
        {draftPoints.length >= 2 && (
          <polygon
            points={draftPoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
            fill={zoneType === 'emergency' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.2)'}
            stroke={zoneType === 'emergency' ? '#EF4444' : '#F59E0B'}
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        )}

        {/* Dynamic line connecting to current mouse position for polygon */}
        {drawingShape === 'polygon' && draftPoints.length > 0 && (
          <line
            x1={`${draftPoints[draftPoints.length - 1].x}%`}
            y1={`${draftPoints[draftPoints.length - 1].y}%`}
            x2={`${mousePos.x}%`}
            y2={`${mousePos.y}%`}
            stroke="#00E5FF"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        )}

        {/* Vertices handles */}
        {draftPoints.map((pt, i) => (
          <circle
            key={i}
            cx={`${pt.x}%`}
            cy={`${pt.y}%`}
            r="4.5"
            fill={i === 0 ? '#00E5FF' : '#EF4444'}
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
};
