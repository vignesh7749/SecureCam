import React, { useState } from 'react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../common/Button';
import { 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sliders, 
  Scale, 
  Target, 
  Zap, 
  Sun, 
  Moon, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export type YoloProfile = 'BALANCED' | 'PRECISION' | 'PERFORMANCE';

export const SystemSettingsPanel: React.FC = () => {
  const { 
    settings, 
    updateSettings, 
    modelConfig, 
    backendHealth, 
    backendError,
    apiMode,
    setApiMode 
  } = useSurveillance();
  const { theme, setTheme } = useTheme();

  const [detectionThresh, setDetectionThresh] = useState(settings.detectionConfidenceThreshold);
  const [unknownThresh, setUnknownThresh] = useState(settings.unknownNoveltyThreshold);
  const [iouThresh, setIouThresh] = useState(settings.iouThreshold);
  const [selectedProfile, setSelectedProfile] = useState<YoloProfile>('BALANCED');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const applyProfile = (profile: YoloProfile) => {
    setSelectedProfile(profile);
    let dThresh = 0.50;
    let uThresh = 0.75;
    let iThresh = 0.45;

    if (profile === 'PRECISION') {
      dThresh = 0.65;
      uThresh = 0.80;
      iThresh = 0.50;
    } else if (profile === 'PERFORMANCE') {
      dThresh = 0.35;
      uThresh = 0.70;
      iThresh = 0.40;
    }

    setDetectionThresh(dThresh);
    setUnknownThresh(uThresh);
    setIouThresh(iThresh);

    updateSettings({
      detectionConfidenceThreshold: dThresh,
      unknownNoveltyThreshold: uThresh,
      iouThreshold: iThresh,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSave = () => {
    updateSettings({
      detectionConfidenceThreshold: detectionThresh,
      unknownNoveltyThreshold: unknownThresh,
      iouThreshold: iouThresh,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const isConnected = !!backendHealth && !backendError;

  return (
    <div className="space-y-5 max-w-3xl mx-auto py-2">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure detection presets, theme preferences, and system parameters
          </p>
        </div>

        {savedSuccess && (
          <span className="text-xs text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>

      {/* 1. Detection Profile */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          Detection Profile
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Balanced */}
          <div
            onClick={() => applyProfile('BALANCED')}
            className={`p-3.5 rounded border cursor-pointer transition-colors flex flex-col justify-between gap-2 ${
              selectedProfile === 'BALANCED'
                ? 'bg-blue-50/70 dark:bg-slate-800 border-blue-500 text-slate-900 dark:text-white'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                Balanced
              </span>
              {selectedProfile === 'BALANCED' && (
                <span className="text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.2 rounded font-medium">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Standard configuration. Balanced accuracy and speed for typical video feeds.
            </p>
          </div>

          {/* Precision */}
          <div
            onClick={() => applyProfile('PRECISION')}
            className={`p-3.5 rounded border cursor-pointer transition-colors flex flex-col justify-between gap-2 ${
              selectedProfile === 'PRECISION'
                ? 'bg-emerald-50/70 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-white'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                Precision
              </span>
              {selectedProfile === 'PRECISION' && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded font-medium">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              High confidence threshold. Minimizes false positive detections.
            </p>
          </div>

          {/* Performance */}
          <div
            onClick={() => applyProfile('PERFORMANCE')}
            className={`p-3.5 rounded border cursor-pointer transition-colors flex flex-col justify-between gap-2 ${
              selectedProfile === 'PERFORMANCE'
                ? 'bg-amber-50/70 dark:bg-slate-800 border-amber-500 text-slate-900 dark:text-white'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                Performance
              </span>
              {selectedProfile === 'PERFORMANCE' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded font-medium">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Lower threshold for higher frame processing throughput.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Appearance (Interactive Dark & Light Mode Toggle) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          Appearance
        </h3>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 min-h-[38px] rounded text-xs font-medium cursor-pointer transition-colors ${
              theme === 'dark'
                ? 'bg-slate-800 border border-blue-500/80 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
            }`}
          >
            <Moon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
            <span>Dark Theme</span>
            {theme === 'dark' && (
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.2 rounded font-medium ml-1">
                Active
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 min-h-[38px] rounded text-xs font-medium cursor-pointer transition-colors ${
              theme === 'light'
                ? 'bg-blue-50 border border-blue-500 text-blue-700 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
            }`}
          >
            <Sun className={`w-4 h-4 ${theme === 'light' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`} />
            <span>Light Theme</span>
            {theme === 'light' && (
              <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.2 rounded font-medium ml-1">
                Active
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. System Status */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          System Status
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                {isConnected ? 'Backend Connected' : 'Backend Disconnected'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                FastAPI PyTorch CV Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">Mode:</span>
            <button
              onClick={() => setApiMode(apiMode === 'LIVE_AI' ? 'DEMO' : 'LIVE_AI')}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
            >
              {apiMode === 'LIVE_AI' ? 'Live AI Mode' : 'Demo Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Collapsed ADVANCED SETTINGS */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Advanced Settings
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{showAdvancedSettings ? 'Collapse' : 'Expand'}</span>
            {showAdvancedSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvancedSettings && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-slate-50 dark:bg-slate-900/60 text-xs">
            {/* Sliders */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Detection Confidence Threshold</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{Math.round(detectionThresh * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={detectionThresh}
                  onChange={(e) => setDetectionThresh(Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Unknown Object Novelty Threshold</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{Math.round(unknownThresh * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="0.95"
                  step="0.05"
                  value={unknownThresh}
                  onChange={(e) => setUnknownThresh(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 dark:text-slate-300">IoU Overlap Threshold</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.round(iouThresh * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.8"
                  step="0.05"
                  value={iouThresh}
                  onChange={(e) => setIouThresh(Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Model Info */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div>Model: <span className="text-slate-800 dark:text-slate-200 font-medium">{modelConfig.name}</span></div>
              <div>Weights: <span className="text-slate-800 dark:text-slate-200 font-medium">{modelConfig.weights}</span></div>
              <div>Device: <span className="text-slate-800 dark:text-slate-200 font-medium">{modelConfig.backend}</span></div>
              <div>Tracker: <span className="text-slate-800 dark:text-slate-200 font-medium">{modelConfig.tracker}</span></div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="primary" onClick={handleSave} icon={<Check className="w-3.5 h-3.5" />}>
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
