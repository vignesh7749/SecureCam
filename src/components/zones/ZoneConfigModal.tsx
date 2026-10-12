import React, { useState, useEffect } from 'react';
import { SecurityZone, ZoneType, AlertLevel } from '../../types/zone';
import { TacticalModal } from '../common/TacticalModal';
import { Button } from '../common/Button';
import { Check, ShieldAlert, Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface ZoneConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: SecurityZone | null;
  onSave: (zone: SecurityZone) => void;
}

export const ZoneConfigModal: React.FC<ZoneConfigModalProps> = ({
  isOpen,
  onClose,
  zone,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<ZoneType>('emergency');
  const [alertLevel, setAlertLevel] = useState<AlertLevel>('critical');
  const [stayThresholdSeconds, setStayThresholdSeconds] = useState(10);
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [monitoredObjects, setMonitoredObjects] = useState<{
    person: boolean;
    vehicle: boolean;
    unknown: boolean;
    animal: boolean;
    bicycle: boolean;
  }>({
    person: true,
    vehicle: true,
    unknown: true,
    animal: false,
    bicycle: false,
  });

  const [alertActions, setAlertActions] = useState({
    visualAlert: true,
    audibleAlarm: true,
    eventLog: true,
    webhookNotification: false,
  });

  useEffect(() => {
    if (zone) {
      setName(zone.name);
      setType(zone.type);
      setAlertLevel(zone.alertLevel);
      setStayThresholdSeconds(zone.stayThresholdSeconds);
      setDescription(zone.description || '');
      setMonitoredObjects({
        person: zone.monitoredObjects.includes('person'),
        vehicle: zone.monitoredObjects.includes('vehicle'),
        unknown: zone.monitoredObjects.includes('unknown'),
        animal: zone.monitoredObjects.includes('animal'),
        bicycle: zone.monitoredObjects.includes('bicycle'),
      });
      const isEmergency = zone.type === 'emergency' || zone.alertLevel === 'critical';
      setAlertActions({
        visualAlert: zone.alertActions?.visualAlert !== undefined ? zone.alertActions.visualAlert : true,
        audibleAlarm: zone.alertActions?.audibleAlarm !== undefined ? zone.alertActions.audibleAlarm : isEmergency,
        eventLog: zone.alertActions?.eventLog !== undefined ? zone.alertActions.eventLog : true,
        webhookNotification: zone.alertActions?.webhookNotification ?? false,
      });
    }
  }, [zone]);

  const handleTypeChange = (newType: ZoneType) => {
    setType(newType);
    if (newType === 'emergency') {
      setAlertLevel('critical');
      setAlertActions(prev => ({ ...prev, visualAlert: true, audibleAlarm: true }));
    } else {
      if (alertLevel === 'critical') setAlertLevel('medium');
      setAlertActions(prev => ({ ...prev, visualAlert: true, audibleAlarm: false }));
    }
  };

  const handleAlertLevelChange = (newLevel: AlertLevel) => {
    setAlertLevel(newLevel);
    if (newLevel === 'critical') {
      setAlertActions(prev => ({ ...prev, visualAlert: true, audibleAlarm: true }));
    } else if (type !== 'emergency') {
      setAlertActions(prev => ({ ...prev, audibleAlarm: false }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!zone) return;

    const monitoredList = (Object.keys(monitoredObjects) as (keyof typeof monitoredObjects)[])
      .filter(k => monitoredObjects[k]);

    const updatedZone: SecurityZone = {
      ...zone,
      name,
      type,
      alertLevel,
      stayThresholdSeconds: Number(stayThresholdSeconds),
      description,
      monitoredObjects: monitoredList as any,
      alertActions,
    };

    onSave(updatedZone);
    onClose();
  };

  if (!zone) return null;

  return (
    <TacticalModal
      isOpen={isOpen}
      onClose={onClose}
      title="ZONE CONFIGURATION"
      subtitle={`Configure parameters for ${zone.name}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Zone Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Zone Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            placeholder="e.g. Caution Zone A"
          />
        </div>

        {/* Zone Type & Alert Level */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Zone Type
            </label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as ZoneType)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="emergency">Emergency (Critical)</option>
              <option value="caution">Caution (Warning)</option>
              <option value="restricted">Restricted Area</option>
              <option value="perimeter">Perimeter Boundary</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Alert Severity Level
            </label>
            <select
              value={alertLevel}
              onChange={(e) => handleAlertLevelChange(e.target.value as AlertLevel)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Stay Threshold */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Dwell Time Threshold
            </label>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{stayThresholdSeconds} seconds</span>
          </div>
          <input
            type="range"
            min="1"
            max="60"
            step="1"
            value={stayThresholdSeconds}
            onChange={(e) => setStayThresholdSeconds(Number(e.target.value))}
            className="w-full accent-blue-500 bg-slate-200 dark:bg-slate-850 cursor-pointer"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Objects lingering inside this zone longer than {stayThresholdSeconds}s trigger a Zone Violation alarm.
          </p>
        </div>

        {/* Prominent ALERT SETTINGS Section */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Alert Settings
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-start gap-2.5 p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={alertActions.visualAlert}
                onChange={(e) => setAlertActions(prev => ({ ...prev, visualAlert: e.target.checked }))}
                className="mt-0.5 rounded accent-blue-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 block">
                  Show visual alert
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Display on-screen banner and critical alert popup
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={alertActions.audibleAlarm}
                onChange={(e) => setAlertActions(prev => ({ ...prev, audibleAlarm: e.target.checked }))}
                className="mt-0.5 rounded accent-blue-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 block">
                  Play alert sound
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Trigger synthesized security audio alert on breach
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Monitored Objects Checkboxes */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <label className="block text-xs text-slate-700 dark:text-slate-300 mb-2 font-semibold">
            Monitored Target Classes
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'person', label: 'Person' },
              { id: 'vehicle', label: 'Vehicle' },
              { id: 'unknown', label: 'Unknown Object' },
              { id: 'animal', label: 'Animal' },
              { id: 'bicycle', label: 'Bicycle' },
            ].map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700"
              >
                <input
                  type="checkbox"
                  checked={monitoredObjects[item.id as keyof typeof monitoredObjects]}
                  onChange={(e) =>
                    setMonitoredObjects((prev) => ({ ...prev, [item.id]: e.target.checked }))
                  }
                  className="rounded accent-blue-500"
                />
                <span className="text-slate-800 dark:text-slate-200 text-xs">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Collapsible ADVANCED ZONE SETTINGS Accordion */}
        <div className="border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Advanced Settings
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
              <span>{showAdvanced ? 'Collapse' : 'Expand'}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showAdvanced && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-100/50 dark:bg-slate-950/40">
              {/* Description */}
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Zone Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-900 dark:text-slate-200 focus:border-blue-500 focus:outline-none text-xs"
                  placeholder="e.g. Monitored perimeter zone"
                />
              </div>

              {/* Logging and Webhook Dispatch */}
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1.5 font-semibold">
                  Event Logging &amp; Dispatch
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'eventLog', label: 'Security Event Log' },
                    { id: 'webhookNotification', label: 'Webhook Dispatch' },
                  ].map((action) => (
                    <label
                      key={action.id}
                      className="flex items-center gap-2 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={alertActions[action.id as keyof typeof alertActions]}
                        onChange={(e) =>
                          setAlertActions((prev) => ({ ...prev, [action.id]: e.target.checked }))
                        }
                        className="rounded accent-blue-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300 text-[11px]">{action.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" icon={<Check className="w-3.5 h-3.5" />}>
            Save Configuration
          </Button>
        </div>
      </form>
    </TacticalModal>
  );
};
