import React from 'react';
import { SampleVideo } from '../../types/video';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Button } from '../common/Button';
import { Play, RotateCw, Video, AlertTriangle } from 'lucide-react';

interface SampleVideoLibraryProps {
  onSelectSample?: (sample: SampleVideo) => void;
}

export const SampleVideoLibrary: React.FC<SampleVideoLibraryProps> = ({ onSelectSample }) => {
  const {
    sampleVideos,
    isLoadingSamples,
    sampleError,
    refreshSampleVideos,
    activeSampleVideo,
    selectSampleVideo,
    getVideoAnalysisStatus,
    apiMode,
  } = useSurveillance();

  const handleSelect = (sample: SampleVideo) => {
    selectSampleVideo(sample);
    if (onSelectSample) onSelectSample(sample);
  };

  return (
    <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sample Videos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {apiMode === 'LIVE_AI' ? (
              <>Discovered from server <code className="text-blue-600 dark:text-blue-400 font-mono">backend/samples/</code></>
            ) : (
              <>5 benchmark datasets with authentic YOLOv8 + ByteTrack replay</>
            )}
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshSampleVideos()}
          disabled={isLoadingSamples}
          icon={<RotateCw className={`w-3.5 h-3.5 ${isLoadingSamples ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {/* Loading State (Only on initial discovery when library has no videos yet) */}
      {isLoadingSamples && sampleVideos.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <RotateCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Scanning sample videos...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoadingSamples && sampleError && (
        <div className="p-3 border border-amber-500/30 bg-amber-500/10 rounded flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{sampleError}</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingSamples && !sampleError && sampleVideos.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded border border-dashed border-slate-300 dark:border-slate-800">
          No sample video files found in backend/samples/.
        </div>
      )}

      {/* Grid of Simple Cards */}
      {sampleVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sampleVideos.map((video) => {
            const isSelected = activeSampleVideo?.id === video.id;
            const status = getVideoAnalysisStatus(video.id);

            return (
              <div
                key={video.id}
                className={`bg-slate-50 dark:bg-slate-900 border rounded p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                  isSelected 
                    ? 'border-blue-500 ring-1 ring-blue-500/50' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                        <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={video.title || video.displayName}>
                        {video.title || video.displayName}
                      </h4>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {status === 'COMPLETED' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          ✓ Completed
                        </span>
                      ) : status === 'ANALYZING' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          Analyzing
                        </span>
                      ) : status === 'PAUSED' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          ❚❚ Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                          Ready / Not Analyzed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>{video.resolution}</span>
                    <span className="font-mono">{video.duration}</span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px]">
                    {video.storageType === 'bundled' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Bundled Demo Replay
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title="Large video benchmark (>80MB). Streams via local backend or cloud storage.">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {video.fileSize ? `${Math.round(video.fileSize / 1024 / 1024)}MB • ` : ''}External / Backend
                      </span>
                    )}
                    <span className="text-slate-400 text-[10px] uppercase font-mono">{video.fps ? `${Math.round(video.fps)}fps` : ''}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'outline'}
                    onClick={() => handleSelect(video)}
                    className="w-full text-xs"
                    icon={<Play className="w-3 h-3 fill-current" />}
                  >
                    {isSelected ? 'Loaded / Active' : 'Select & Analyze'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
