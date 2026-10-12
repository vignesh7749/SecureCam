import React, { useState } from 'react';
import { TacticalModal } from '../common/TacticalModal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ComingSoonBanner } from '../common/ComingSoon';
import { 
  Camera, 
  Tv, 
  Wifi, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Server,
  Usb
} from 'lucide-react';

interface CameraSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CameraSetupModal: React.FC<CameraSetupModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'local' | 'rtsp'>('rtsp');
  const [cameraName, setCameraName] = useState('Perimeter North - Cam 01');
  const [rtspUrl, setRtspUrl] = useState('rtsp://admin:password@192.168.1.120:554/live/ch0');
  const [resolution, setResolution] = useState('1920x1080');
  const [transport, setTransport] = useState<'tcp' | 'udp'>('tcp');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'info'>('idle');

  const handleTestConnection = () => {
    setTestStatus('testing');
    setTimeout(() => {
      setTestStatus('info');
    }, 1200);
  };

  return (
    <TacticalModal
      isOpen={isOpen}
      onClose={onClose}
      title="CONFIGURE LIVE CAMERA FEED"
      subtitle="Connect direct video capture hardware or network surveillance streams"
      maxWidth="xl"
    >
      <div className="p-5 space-y-5 font-mono text-xs">
        {/* Source Selection Tabs */}
        <div className="flex border-b border-surveillance-700/80 pb-1 gap-2">
          <button
            onClick={() => {
              setActiveTab('rtsp');
              setTestStatus('idle');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-semibold tracking-wider transition-colors ${
              activeTab === 'rtsp'
                ? 'bg-surveillance-800 text-tactical-cyan border-b-2 border-tactical-cyan'
                : 'text-surveillance-400 hover:text-surveillance-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>IP / RTSP STREAM</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('local');
              setTestStatus('idle');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-semibold tracking-wider transition-colors ${
              activeTab === 'local'
                ? 'bg-surveillance-800 text-tactical-cyan border-b-2 border-tactical-cyan'
                : 'text-surveillance-400 hover:text-surveillance-200'
            }`}
          >
            <Usb className="w-4 h-4" />
            <span>LOCAL USB / WEBCAM</span>
          </button>
        </div>

        {activeTab === 'rtsp' && (
          <div className="space-y-4">
            <ComingSoonBanner
              title="RTSP STREAM INGESTION IN DEVELOPMENT"
              description="Direct RTSP/ONVIF network stream ingestion with hardware-accelerated H.264 decoding is scheduled for an upcoming release. To analyze surveillance footage now, use the Video Analysis pipeline with uploaded or sample video files."
              eta="PHASE 7 INTEGRATION"
            />

            <div className="space-y-3 bg-surveillance-900/60 p-4 rounded-sm border border-surveillance-700/60">
              <div>
                <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                  Camera Identification Label
                </label>
                <input
                  type="text"
                  value={cameraName}
                  onChange={(e) => setCameraName(e.target.value)}
                  placeholder="e.g. South Gate - PTZ 02"
                  className="w-full px-3 py-2 bg-surveillance-800 border border-surveillance-700 rounded-sm text-surveillance-100 focus:outline-none focus:border-tactical-cyan"
                />
              </div>

              <div>
                <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                  Network Stream URI (RTSP / RTMP / HTTP)
                </label>
                <input
                  type="text"
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.100:554/h264"
                  className="w-full px-3 py-2 bg-surveillance-800 border border-surveillance-700 rounded-sm text-surveillance-100 focus:outline-none focus:border-tactical-cyan"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                    Stream Transport Protocol
                  </label>
                  <select
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as 'tcp' | 'udp')}
                    className="w-full px-3 py-2 bg-surveillance-800 border border-surveillance-700 rounded-sm text-surveillance-100 focus:outline-none focus:border-tactical-cyan"
                  >
                    <option value="tcp">TCP (Interleaved - Recommended)</option>
                    <option value="udp">UDP (Low Latency)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                    Target Resolution
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full px-3 py-2 bg-surveillance-800 border border-surveillance-700 rounded-sm text-surveillance-100 focus:outline-none focus:border-tactical-cyan"
                  >
                    <option value="1920x1080">1080p FHD (1920x1080)</option>
                    <option value="1280x720">720p HD (1280x720)</option>
                    <option value="2560x1440">1440p 2K (2560x1440)</option>
                  </select>
                </div>
              </div>
            </div>

            {testStatus === 'info' && (
              <div className="p-3 rounded-sm bg-surveillance-800 border border-tactical-cyan/40 text-surveillance-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-tactical-cyan shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-tactical-cyan block">STREAM DRIVER NOTICE:</span>
                  <p className="text-[11px] leading-relaxed">
                    Live RTSP stream capture daemon is currently in standby. Frame extraction and YOLOv8 pipeline will automatically attach to configured IP feeds when the network ingestion driver is enabled.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'local' && (
          <div className="space-y-4">
            <ComingSoonBanner
              title="DIRECT WEBCAM / USB CAPTURE IN DEVELOPMENT"
              description="DirectShow and V4L2 USB camera enumeration is being prepared. Local video devices will feed straight into the high-precision detection and tracking pipeline."
              eta="PHASE 7 INTEGRATION"
            />

            <div className="space-y-3 bg-surveillance-900/60 p-4 rounded-sm border border-surveillance-700/60">
              <div>
                <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                  Detected Video Capture Device
                </label>
                <select
                  disabled
                  className="w-full px-3 py-2 bg-surveillance-800/60 border border-surveillance-700/80 rounded-sm text-surveillance-500 cursor-not-allowed"
                >
                  <option>Scanning DirectShow devices... (Standby)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-surveillance-400 uppercase tracking-wider mb-1">
                  Capture API Backend
                </label>
                <div className="px-3 py-2 bg-surveillance-800 border border-surveillance-700 rounded-sm text-surveillance-300">
                  OpenCV VideoCapture / DirectShow Hardware Acceleration
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-surveillance-700/80">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                handleTestConnection();
              }}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </TacticalModal>
  );
};
