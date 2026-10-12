import React from 'react';
import { SampleVideo } from '../../types/video';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Button } from '../common/Button';
import { Play, RotateCw, Video, HardDrive } from 'lucide-react';

interface UploadedVideoListProps {
  onSelectVideo?: (video: SampleVideo) => void;
}

export const UploadedVideoList: React.FC<UploadedVideoListProps> = ({ onSelectVideo }) => {
  const {
    uploadedVideos,
    isLoadingUploads,
    refreshUploadedVideos,
    activeSource,
    selectUploadedVideo,
    getVideoAnalysisStatus,
  } = useSurveillance();

  const handleSelect = (video: SampleVideo) => {
    selectUploadedVideo(video);
    if (onSelectVideo) onSelectVideo(video);
  };

  return (
    <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Uploaded Surveillance Videos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Footage stored and available for multi-video analysis on the server
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshUploadedVideos()}
          disabled={isLoadingUploads}
          icon={<RotateCw className={`w-3.5 h-3.5 ${isLoadingUploads ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoadingUploads && (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <RotateCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Loading uploaded videos...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingUploads && uploadedVideos.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded border border-dashed border-slate-300 dark:border-slate-800 space-y-2">
          <HardDrive className="w-6 h-6 text-slate-400 dark:text-slate-600 mx-auto" />
          <div className="font-semibold text-slate-800 dark:text-slate-200">NO UPLOADED VIDEOS</div>
          <div className="text-slate-500 dark:text-slate-400 text-[11px]">
            No uploaded videos found on the server. Upload a video file to begin analysis.
          </div>
        </div>
      )}

      {/* Grid of uploaded videos */}
      {!isLoadingUploads && uploadedVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {uploadedVideos.map((video) => {
            const isSelected = activeSource.id === video.id;
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
                        <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                    <span>{video.resolution} @ {video.fps} FPS</span>
                    <span className="font-mono">{video.duration}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'outline'}
                    className="w-full text-xs"
                    onClick={() => handleSelect(video)}
                    icon={<Play className="w-3.5 h-3.5 fill-current" />}
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
