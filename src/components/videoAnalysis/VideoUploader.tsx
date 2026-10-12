import React, { useState, useRef } from 'react';
import { UploadCloud, FileVideo, AlertCircle, Loader2, Info } from 'lucide-react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { surveillanceApi } from '../../services/api';
import { BACKEND_URL } from '../../services/realApi';
import { VideoMetadata } from '../../types/video';

interface VideoUploaderProps {
  onUploadComplete?: (metadata: VideoMetadata) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onUploadComplete }) => {
  const { loadUploadedVideo, backendHealth } = useSurveillance();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isUploadingRef = useRef<boolean>(false);

  const processFile = async (file: File) => {
    if (isUploadingRef.current) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('Invalid file format. Please upload an MP4, MKV, AVI, or WebM surveillance file.');
      return;
    }

    isUploadingRef.current = true;
    setErrorMessage(null);
    setIsProcessing(true);
    setProgress(15);

    try {
      // Staged ingest progress
      setTimeout(() => setProgress(45), 200);
      setTimeout(() => setProgress(80), 500);

      const { source, metadata } = await surveillanceApi.uploadVideoFile(file);

      setTimeout(() => {
        setProgress(100);
        setIsProcessing(false);
        isUploadingRef.current = false;
        loadUploadedVideo(source, metadata);
        if (onUploadComplete) onUploadComplete(metadata);
      }, 600);
    } catch (err: any) {
      isUploadingRef.current = false;
      setIsProcessing(false);
      const msg = err?.message || 'Failed to ingest video stream. Ensure backend is running and codec is supported.';
      setErrorMessage(msg);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing && !isUploadingRef.current) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploadingRef.current || isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploadingRef.current || isProcessing) return;
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Upload Video
        </h3>
      </div>

      {(!BACKEND_URL || !backendHealth) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p>
            Video upload and custom video inference require the local FastAPI backend. In Demo Mode, explore the included Sample Videos to see AI surveillance in action.
          </p>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2.5 bg-slate-50 dark:bg-slate-900 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
        } ${isProcessing ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/x-matroska,video/avi,video/webm"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-2 w-full max-w-xs">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <div className="text-center">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                Uploading and extracting video frames...
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{progress}%</span>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400">
              <UploadCloud className="w-5 h-5" />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Drag and drop video file here
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                or tap below to browse from your device
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-1 px-3.5 py-1.5 min-h-[34px] bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Choose Video File</span>
            </button>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              Supports MP4, MKV, AVI, WebM
            </div>
          </>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
