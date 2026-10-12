import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Video, 
  Play, 
  Scan, 
  ShieldAlert, 
  FileText, 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  ArrowRight
} from 'lucide-react';
import { NavTabId } from '../layout/Navigation';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: NavTabId) => void;
}

const TUTORIAL_STORAGE_KEY = 'securecam_tutorial_completed';

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  // Step 0: Welcome, Steps 1-5: Guided tour
  const [currentStep, setCurrentStep] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Support ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinish = () => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {}
    onClose();
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {}
    onClose();
  };

  const handleNext = () => {
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);

    // Contextual navigation per step
    if (onNavigateTab) {
      if (nextStep === 1 || nextStep === 2 || nextStep === 3) {
        onNavigateTab('video-analysis');
      } else if (nextStep === 4) {
        onNavigateTab('emergency-zones');
      } else if (nextStep === 5) {
        onNavigateTab('reports');
      }
    }
  };

  const handleBack = () => {
    const prevStep = Math.max(0, currentStep - 1);
    setCurrentStep(prevStep);

    if (onNavigateTab) {
      if (prevStep === 1 || prevStep === 2 || prevStep === 3) {
        onNavigateTab('video-analysis');
      } else if (prevStep === 4) {
        onNavigateTab('emergency-zones');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 select-none">
      {/* Subtle Backdrop */}
      <div 
        onClick={handleSkip}
        className="fixed inset-0 bg-slate-950/70 dark:bg-black/80 backdrop-blur-xs transition-opacity"
      />

      {/* Tutorial Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl z-10 overflow-hidden my-auto sm:my-8 max-h-[92vh] flex flex-col transition-colors">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              SecureCam Quick Guide
            </span>
          </div>

          <button
            onClick={handleSkip}
            title="Close Tutorial (ESC)"
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {currentStep === 0 ? (
            /* Welcome Screen */
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-200 dark:border-blue-500/20">
                <Shield className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Welcome to SecureCam
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  SecureCam is a computer-vision surveillance project. It detects supported objects, 
                  tracks their movement, and monitors custom emergency zones for loitering violations.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">What you can do:</div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>Analyze sample videos or upload custom MP4 footage</li>
                  <li>Track targets with real YOLOv8 &amp; ByteTrack models</li>
                  <li>Draw interactive security zones to catch loitering</li>
                </ul>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  onClick={handleSkip}
                  className="px-3 py-1.5 rounded text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span>Start Tutorial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Steps 1 through 5 */
            <div className="space-y-4">
              {/* Step indicator header */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  Step {currentStep} of 5
                </span>

                {/* Progress Dots */}
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        s === currentStep
                          ? 'bg-blue-600 dark:bg-blue-500 scale-110'
                          : s < currentStep
                          ? 'bg-blue-300 dark:bg-blue-800'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Step Content */}
              {currentStep === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                      <Video className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        1. Select a Video
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Choose footage to analyze
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Choose a sample video from the library (such as <strong className="text-blue-600 dark:text-blue-400">Testing 1</strong>) 
                    or upload your own MP4 video file to begin surveillance analysis.
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>The sample library automatically discovers videos in <code className="font-mono text-[11px] text-blue-600 dark:text-blue-400">backend/samples/</code>.</span>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        2. Play &amp; Analyze
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Run object detection
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Play the video and start analysis. SecureCam uses YOLOv8 to detect objects 
                    and ByteTrack to assign consistent tracking IDs as objects move across the frame.
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Playback Speed:</span>
                    <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      <span>0.5x</span>
                      <span>•</span>
                      <span>1.0x</span>
                      <span>•</span>
                      <span>2.0x</span>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                      <Scan className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        3. Understand Detections
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Boxes, IDs, and classes
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Detected objects appear with colored bounding boxes, category labels 
                    (e.g., CAR, PERSON), confidence percentages, and tracking IDs (e.g., #01).
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-600 text-white font-semibold">CAR #01 78%</span>
                      <span className="text-slate-600 dark:text-slate-400 text-[11px]">Normal monitored target</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-600 text-white font-semibold">UNKNOWN #12 91%</span>
                      <span className="text-slate-600 dark:text-slate-400 text-[11px]">Novelty / unclassified target</span>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        4. Create Emergency Zones
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Detect loitering &amp; intrusion
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Use <strong className="text-blue-600 dark:text-blue-400">Draw Zone</strong> to mark an area 
                    you want to safeguard. Configure a stay threshold (e.g. 10s) — if an object remains inside longer than allowed, a violation is triggered.
                  </p>

                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 rounded flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                    <span>Audible siren and visual banners warn operators instantly on dwell breaches.</span>
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        5. Review Results
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Events, stats, and reports
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Review tracked objects, zone violations, and chronological events. 
                    Export summaries in the <strong className="text-blue-600 dark:text-blue-400">Reports</strong> section 
                    to document system performance.
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>You're ready to start using SecureCam! You can reopen this guide anytime by clicking <strong>Help</strong> in the header.</span>
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={handleBack}
                  className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSkip}
                    className="px-2.5 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    Skip
                  </button>

                  {currentStep < 5 ? (
                    <button
                      onClick={handleNext}
                      className="px-4 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleFinish}
                      className="px-4 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Finish</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
