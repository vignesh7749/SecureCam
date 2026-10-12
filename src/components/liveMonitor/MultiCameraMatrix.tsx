import React, { useState } from 'react';
import { LIVE_CAMERAS } from '../../services/mockData';
import { VideoSource } from '../../types/video';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { 
  Tv, 
  Grid2x2, 
  Square, 
  Grid3x3, 
  Radio, 
  ShieldAlert, 
  Crosshair, 
  Maximize2, 
  Camera, 
  AlertTriangle 
} from 'lucide-react';

export const MultiCameraMatrix: React.FC = () => {
  const { selectSampleVideo, activeViolations, unknownObjects } = useSurveillance();
  const [gridMode, setGridMode] = useState<'1x1' | '2x2' | '3x3'>('2x2');
  const [selectedCamId, setSelectedCamId] = useState<string>(LIVE_CAMERAS[0].id);

  const getGridClasses = () => {
    switch (gridMode) {
      case '1x1': return 'grid-cols-1';
      case '2x2': return 'grid-cols-1 md:grid-cols-2';
      case '3x3': return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }
  };

  const displayedCameras = gridMode === '1x1' 
    ? LIVE_CAMERAS.filter(c => c.id === selectedCamId) 
    : gridMode === '2x2' 
    ? LIVE_CAMERAS.slice(0, 4) 
    : LIVE_CAMERAS;

  return (
    <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-4 font-mono">
      {/* Header & Grid Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-surveillance-700/60">
        <div>
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-tactical-cyan" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-surveillance-100">
              TACTICAL SURVEILLANCE MATRIX // LIVE MULTI-STREAM
            </h3>
            <span className="w-2 h-2 rounded-full bg-tactical-emerald animate-pulse" />
          </div>
          <p className="text-[11px] text-surveillance-400 mt-0.5">
            Scalable RTSP / IP Camera / CCTV ingest matrix with hardware accelerated decoding
          </p>
        </div>

        {/* Grid mode toggles & RTSP protocol badge */}
        <div className="flex items-center gap-2">
          <Badge variant="demo" size="xs">
            RTSP SIMULATION FEED
          </Badge>

          <div className="flex items-center bg-surveillance-800 p-0.5 rounded-xs border border-surveillance-700">
            <button
              onClick={() => setGridMode('1x1')}
              className={`p-1.5 rounded-2xs transition-colors ${gridMode === '1x1' ? 'bg-tactical-cyan/20 text-tactical-cyan' : 'text-surveillance-400 hover:text-surveillance-200'}`}
              title="1x1 Single Focus View"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGridMode('2x2')}
              className={`p-1.5 rounded-2xs transition-colors ${gridMode === '2x2' ? 'bg-tactical-cyan/20 text-tactical-cyan' : 'text-surveillance-400 hover:text-surveillance-200'}`}
              title="2x2 Quad Matrix"
            >
              <Grid2x2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGridMode('3x3')}
              className={`p-1.5 rounded-2xs transition-colors ${gridMode === '3x3' ? 'bg-tactical-cyan/20 text-tactical-cyan' : 'text-surveillance-400 hover:text-surveillance-200'}`}
              title="3x3 High Density Matrix"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Camera Matrix Grid */}
      <div className={`grid ${getGridClasses()} gap-3.5`}>
        {displayedCameras.map((cam, idx) => {
          const hasBreach = idx === 0 && activeViolations.length > 0;
          const isSelected = selectedCamId === cam.id;

          return (
            <div
              key={cam.id}
              onClick={() => setSelectedCamId(cam.id)}
              className={`bg-surveillance-900 border rounded-sm overflow-hidden flex flex-col justify-between cursor-pointer transition-all duration-200 relative group ${
                isSelected
                  ? 'border-tactical-cyan shadow-[0_0_15px_rgba(0,229,255,0.15)]'
                  : 'border-surveillance-700/80 hover:border-surveillance-500'
              } ${hasBreach ? 'border-tactical-red/80' : ''}`}
            >
              {/* Camera Video Canvas Frame */}
              <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center">
                {/* Synthetic stream visual */}
                <div className="absolute inset-0 bg-gradient-to-tr from-surveillance-950 via-surveillance-900 to-surveillance-800 opacity-90" />
                <div className="absolute inset-0 tactical-grid opacity-30 pointer-events-none" />

                {/* Subtle scanline */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-tactical-cyan/[0.03] to-transparent animate-scanline pointer-events-none" />

                {/* Top Overlay */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[10px] z-10">
                  <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-black/80 rounded-2xs border border-surveillance-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-tactical-emerald animate-pulse" />
                    <span className="font-bold text-white uppercase">{cam.name.split('//')[0]}</span>
                    <span className="text-tactical-cyan">LIVE</span>
                  </div>

                  {hasBreach && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-tactical-red text-white font-bold rounded-2xs animate-pulse">
                      <ShieldAlert className="w-3 h-3" />
                      <span>ZONE ALARM</span>
                    </div>
                  )}
                </div>

                {/* Center Reticle */}
                <div className="w-6 h-6 border border-tactical-cyan/40 rounded-full flex items-center justify-center opacity-60">
                  <div className="w-1 h-1 bg-tactical-cyan rounded-full" />
                </div>

                {/* Bottom Overlay Telemetry */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[9px] text-surveillance-300 z-10 px-1.5 py-0.5 bg-black/70 rounded-2xs">
                  <span>{cam.location}</span>
                  <span>FPS: {cam.fps}</span>
                </div>
              </div>

              {/* Camera Card Footer */}
              <div className="p-3 bg-surveillance-850/90 border-t border-surveillance-700/80 flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-surveillance-100 uppercase text-[11px] truncate max-w-[200px]">
                    {cam.name}
                  </h4>
                  <span className="text-[10px] text-surveillance-400 block mt-0.5">
                    PROTOCOL: {cam.type.toUpperCase()} • {cam.resolution}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={cam.status === 'ONLINE' ? 'success' : 'critical'} size="xs">
                    {cam.status}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
