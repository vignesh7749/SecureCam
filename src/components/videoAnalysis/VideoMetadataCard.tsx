import React from 'react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { VideoMetadata } from '../../types/video';
import { FileText, Cpu, HardDrive, Gauge, Eye, Film } from 'lucide-react';
import { Badge } from '../common/Badge';

export const VideoMetadataCard: React.FC = () => {
  const { activeSource, uploadedMetadata, activeSampleVideo, fps, totalDurationSeconds } = useSurveillance();

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const filename = uploadedMetadata?.filename || activeSampleVideo?.displayName || activeSampleVideo?.filename || activeSource.name;
  const duration = uploadedMetadata 
    ? `${Math.floor(uploadedMetadata.durationSeconds / 60)}:${String(uploadedMetadata.durationSeconds % 60).padStart(2, '0')}`
    : activeSampleVideo?.duration || '00:00';
  const resolution = uploadedMetadata ? `${uploadedMetadata.width}x${uploadedMetadata.height}` : activeSampleVideo?.resolution || activeSource.resolution;
  const framerate = uploadedMetadata ? `${uploadedMetadata.fps} FPS` : activeSampleVideo?.fps ? `${activeSampleVideo.fps} FPS` : `${fps} FPS`;
  const filesize = uploadedMetadata ? formatFileSize(uploadedMetadata.filesizeBytes) : formatFileSize(activeSampleVideo?.fileSize);
  const codec = uploadedMetadata?.codec || activeSampleVideo?.codec || 'H.264 / AVC';

  return (
    <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-3 font-mono">
      <div className="flex items-center justify-between pb-2 border-b border-surveillance-700/60">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-tactical-cyan" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-surveillance-100">
            VIDEO CONTAINER TELEMETRY
          </h3>
        </div>
        <Badge variant="cyan" size="xs">
          PROBED &amp; BUFFERED
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <div className="p-2.5 rounded-xs bg-surveillance-800 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">SOURCE IDENTIFIER</span>
          <span className="text-xs font-bold text-surveillance-100 truncate block mt-0.5" title={filename}>
            {filename}
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-surveillance-800 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">DURATION</span>
          <span className="text-xs font-bold text-tactical-cyan block mt-0.5">
            {duration} ({Math.round(totalDurationSeconds)}s)
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-surveillance-800 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">SPATIAL RESOLUTION</span>
          <span className="text-xs font-bold text-surveillance-100 block mt-0.5">
            {resolution}
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-surveillance-800 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">FRAME RATE</span>
          <span className="text-xs font-bold text-tactical-emerald block mt-0.5">
            {framerate}
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-surveillance-800 border border-surveillance-700/60">
          <span className="text-[10px] text-surveillance-400 uppercase tracking-wider block">FILE SIZE / CODEC</span>
          <span className="text-xs font-bold text-surveillance-100 block mt-0.5 truncate" title={codec}>
            {filesize} • {codec.split(' ')[0]}
          </span>
        </div>
      </div>
    </div>
  );
};
