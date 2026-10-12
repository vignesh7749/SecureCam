import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Square, 
  Maximize2, 
  Minimize2,
  PenTool
} from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Button } from '../common/Button';

interface VideoControlsProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSnapshot?: () => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  isFullscreen,
  onToggleFullscreen,
}) => {
  const {
    isPlaying,
    togglePlay,
    stopAnalysis,
    replayAnalysis,
    currentTimeSeconds,
    totalDurationSeconds,
    seekTo,
    playbackSpeed,
    setSpeed,
    isZoneEditMode,
    setIsZoneEditMode,
  } = useSurveillance();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const progressPercent = totalDurationSeconds > 0 ? (currentTimeSeconds / totalDurationSeconds) * 100 : 0;

  // Touch and mouse scrubber seeking
  const handleScrub = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(pos * totalDurationSeconds);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    handleScrub(e.clientX, e.currentTarget);
  };

  const handleScrubberTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      handleScrub(e.touches[0].clientX, e.currentTarget);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2.5 flex flex-col gap-2 select-none z-20 transition-colors">
      {/* Scrubber Bar (Touch-friendly 28px hit-box with visible 8px progress bar) */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400 w-11 sm:w-12 text-right shrink-0">
          {formatTime(currentTimeSeconds)}
        </span>

        <div
          className="relative flex-1 py-2 sm:py-1.5 cursor-pointer touch-none flex items-center group"
          onClick={handleScrubberClick}
          onTouchStart={handleScrubberTouch}
          onTouchMove={handleScrubberTouch}
          role="slider"
          aria-label="Video timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={totalDurationSeconds}
          aria-valuenow={currentTimeSeconds}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seekTo(Math.min(totalDurationSeconds, currentTimeSeconds + 2));
            if (e.key === 'ArrowLeft') seekTo(Math.max(0, currentTimeSeconds - 2));
          }}
        >
          {/* Track background */}
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 group-hover:h-2.5 rounded transition-all relative overflow-hidden">
            {/* Filled progress */}
            <div
              className="h-full bg-blue-500 rounded transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <span className="text-[11px] sm:text-xs font-mono text-slate-400 dark:text-slate-500 w-11 sm:w-12 shrink-0">
          {formatTime(totalDurationSeconds)}
        </span>
      </div>

      {/* Main Transport & Speed Controls (Responsive multi-row wrapping for mobile & desktop) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        {/* Left cluster: Playback Actions & Speed */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action buttons: Play/Pause, Stop, Replay */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={togglePlay}
              className="px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-[34px] bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={isPlaying ? 'Pause Video' : 'Play Video'}
              aria-label={isPlaying ? 'Pause Video' : 'Play Video'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              onClick={stopAnalysis}
              className="p-2 sm:p-1.5 min-w-[40px] min-h-[40px] sm:min-w-[34px] sm:min-h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 text-xs transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Stop Video"
              aria-label="Stop Video"
            >
              <Square className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={replayAnalysis}
              className="p-2 sm:p-1.5 min-w-[40px] min-h-[40px] sm:min-w-[34px] sm:min-h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 text-xs transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Replay Video"
              aria-label="Replay Video"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Simple Speed Controls: 0.5x | 1x | 2x */}
          <div 
            className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-mono"
            role="group"
            aria-label="Playback speed"
          >
            {[0.5, 1, 2].map((speed) => (
              <button
                key={speed}
                onClick={() => setSpeed(speed)}
                aria-label={`Playback speed ${speed}x`}
                className={`px-2.5 py-1.5 sm:py-0.5 min-h-[36px] sm:min-h-[28px] rounded text-[11px] font-medium transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  playbackSpeed === speed
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Right cluster: Zone Drawing & Fullscreen Toggle */}
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <Button
            size="sm"
            variant={isZoneEditMode ? 'danger' : 'outline'}
            onClick={() => setIsZoneEditMode(!isZoneEditMode)}
            className="min-h-[40px] sm:min-h-[34px] px-3 text-xs"
            icon={<PenTool className="w-3.5 h-3.5" />}
            aria-label={isZoneEditMode ? 'Cancel Zone Drawing' : 'Draw Emergency Zone'}
          >
            {isZoneEditMode ? 'Cancel Drawing' : 'Draw Zone'}
          </Button>

          <button
            onClick={onToggleFullscreen}
            className="p-2 sm:p-1.5 min-w-[40px] min-h-[40px] sm:min-w-[34px] sm:min-h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-slate-100 rounded border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            ) : (
              <Maximize2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

