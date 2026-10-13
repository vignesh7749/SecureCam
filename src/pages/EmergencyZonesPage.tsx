import React, { useState } from 'react';
import { useSurveillance } from '../context/SurveillanceContext';
import { SecurityZone, ZoneStatus } from '../types/zone';
import { isObjectInZone } from '../services/zoneService';
import { ZoneConfigModal } from '../components/zones/ZoneConfigModal';
import { ZoneOverlay } from '../components/surveillance/ZoneOverlay';
import { ZoneEditorCanvas } from '../components/surveillance/ZoneEditorCanvas';
import { Button } from '../components/common/Button';
import { BACKEND_URL } from '../services/realApi';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Plus, 
  Settings, 
  Trash2, 
  Power, 
  X, 
  Square, 
  Pentagon,
  AlertTriangle,
  Info
} from 'lucide-react';

export const EmergencyZonesPage: React.FC = () => {
  const { 
    zones, 
    activeViolations, 
    events,
    trackedObjects,
    updateZone,
    deleteZone,
    toggleZoneEnabled,
    selectedZoneId,
    setSelectedZoneId,
    isZoneEditMode,
    setIsZoneEditMode,
    drawingShape,
    setDrawingShape,
    draftPoints,
    setDraftPoints,
    finishDraftZone,
    cancelDraftZone,
    activeSource,
    backendHealth,
  } = useSurveillance();

  const [editingZone, setEditingZone] = useState<SecurityZone | null>(null);

  const activeZonesCount = zones.filter(z => z.enabled).length;
  const currentViolations = activeViolations.filter(v => v.status === 'ACTIVE');
  const dwellAlarmEvents = events.filter(e => e.type === 'ZONE_VIOLATION' || e.type === 'ZONE_ENTRY');

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Emergency Zones</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure protected perimeters, dwell-time thresholds, and automated intruder alarms
          </p>
        </div>

        <Button
          size="md"
          variant={isZoneEditMode ? 'danger' : 'primary'}
          onClick={() => {
            if (isZoneEditMode) {
              cancelDraftZone();
            } else {
              setIsZoneEditMode(true);
            }
          }}
          icon={isZoneEditMode ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        >
          {isZoneEditMode ? 'Cancel Drawing' : '+ CREATE ZONE'}
        </Button>
      </div>

      {/* Demo Mode Notice: In-memory zone evaluation */}
      {(!BACKEND_URL || !backendHealth) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p>
            In Demo Mode, emergency zones operate dynamically and persist in your browser's local storage. You can draw zones and test intrusion/dwell rules against replaying benchmark tracks.
          </p>
        </div>
      )}

      {/* Compact Zone Drawing Canvas Preview (ONLY shown when drawing/creating a zone) */}
      {isZoneEditMode && (
        <div className="bg-white dark:bg-slate-850 border border-blue-500/50 rounded p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Draw Zone Boundary on Video
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {drawingShape === 'rectangle'
                  ? 'Click and drag on the video frame to place a rectangular zone.'
                  : 'Click sequential points on the video to define polygon vertices (min 3 points).'}
              </p>
            </div>

            {/* Shape Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setDrawingShape('rectangle')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                  drawingShape === 'rectangle'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Rectangle</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawingShape('polygon')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                  drawingShape === 'polygon'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Pentagon className="w-3.5 h-3.5" />
                <span>Polygon</span>
              </button>
            </div>
          </div>

          {/* Compact Video Viewport for Zone Placement (Scaled & Focused) */}
          <div className="max-w-3xl mx-auto relative aspect-video bg-black rounded border border-slate-800 overflow-hidden shadow-lg">
            {activeSource.uri ? (
              <video
                key={activeSource.id || activeSource.uri}
                src={activeSource.uri}
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                onLoadedMetadata={(e) => {
                  if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = 0.001;
                }}
                className="w-full h-full object-cover pointer-events-none opacity-85"
              />
            ) : (
              <div className="w-full h-full bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                No active video loaded. Select a video in Video Analysis for visual boundary placement.
              </div>
            )}

            {/* Existing Zones Overlay */}
            <ZoneOverlay
              zones={zones}
              objects={[]}
              onSelectZone={(id) => setSelectedZoneId(id)}
              selectedZoneId={selectedZoneId}
            />

            {/* Zone Drawing Interactive Canvas Overlay */}
            <ZoneEditorCanvas
              isDrawing={isZoneEditMode}
              drawingShape={drawingShape}
              setDrawingShape={setDrawingShape}
              draftPoints={draftPoints}
              setDraftPoints={setDraftPoints}
              onFinishZone={finishDraftZone}
              onCancel={cancelDraftZone}
            />
          </div>

          <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            Fill in the zone name, severity, and dwell-time in the popup banner after placing coordinates.
          </div>
        </div>
      )}

      {/* 3 Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Active Zones</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">{activeZonesCount} / {zones.length}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Current Breaches</span>
            <span className={`text-lg font-bold ${currentViolations.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {currentViolations.length}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Dwell Alarms Logged</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{dwellAlarmEvents.length}</span>
          </div>
        </div>
      </div>

      {/* Existing Zones Table / List (The Main Purpose of Emergency Zones Page) */}
      {/* Existing Zones Table / List (The Main Purpose of Emergency Zones Page) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded p-4 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Configured Security Zones</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Physical boundary polygons, monitored classes, and dwell-time violation triggers
            </p>
          </div>

          <span className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700">
            {zones.length} zone{zones.length === 1 ? '' : 's'} defined
          </span>
        </div>

        {zones.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900/40 space-y-2">
            <AlertTriangle className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto" />
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">No emergency zones configured yet</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-500">
              Click &quot;+ CREATE ZONE&quot; above to draw and configure caution or emergency zones.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px]">
                    <th className="pb-2.5 font-medium">Zone Name</th>
                    <th className="pb-2.5 font-medium">Type</th>
                    <th className="pb-2.5 font-medium">Severity</th>
                    <th className="pb-2.5 font-medium">Dwell Limit</th>
                    <th className="pb-2.5 font-medium">Monitored Objects</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {zones.map((zone) => {
                    const occupants = trackedObjects.filter(obj => isObjectInZone(obj, zone));
                    const maxDwell = occupants.reduce((max, obj) => Math.max(max, obj.dwellTimeInZone || 0), 0);
                    
                    let status: ZoneStatus = 'SAFE';
                    if (occupants.length > 0) {
                      status = maxDwell >= zone.stayThresholdSeconds ? 'VIOLATION' : 'OCCUPIED';
                    }
                    const isViolation = status === 'VIOLATION';

                    return (
                      <tr 
                        key={zone.id}
                        onClick={() => setSelectedZoneId(zone.id)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          selectedZoneId === zone.id ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                        } ${isViolation ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                      >
                        {/* Zone Name */}
                        <td className="py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: zone.color || (zone.type === 'emergency' ? '#EF4444' : '#F59E0B') }}
                            />
                            <span>{zone.name}</span>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="py-3 capitalize text-slate-700 dark:text-slate-300">
                          {zone.type}
                        </td>

                        {/* Severity */}
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            zone.alertLevel === 'critical'
                              ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                              : zone.alertLevel === 'high'
                              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                          }`}>
                            {zone.alertLevel}
                          </span>
                        </td>

                        {/* Dwell Limit */}
                        <td className="py-3 font-mono text-slate-700 dark:text-slate-300">
                          {zone.stayThresholdSeconds}s
                        </td>

                        {/* Monitored Objects */}
                        <td className="py-3 text-slate-500 dark:text-slate-400 capitalize">
                          {zone.monitoredObjects && zone.monitoredObjects.length > 0
                            ? zone.monitoredObjects.join(', ')
                            : 'person, vehicle, unknown'}
                        </td>

                        {/* Status */}
                        <td className="py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              !zone.enabled
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                : isViolation
                                ? 'bg-red-500/20 text-red-600 dark:text-red-400 font-bold'
                                : status === 'OCCUPIED'
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {!zone.enabled ? 'DISABLED' : status}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Enable / Disable */}
                            <button
                              onClick={() => toggleZoneEnabled(zone.id)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                                zone.enabled
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}
                              title={zone.enabled ? 'Click to Disable' : 'Click to Enable'}
                            >
                              <Power className="w-3 h-3" />
                              <span>{zone.enabled ? 'Enabled' : 'Disabled'}</span>
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => setEditingZone(zone)}
                              className="px-2 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Edit Zone Parameters"
                            >
                              <Settings className="w-3 h-3" />
                              <span>Edit</span>
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => deleteZone(zone.id)}
                              className="p-1 rounded text-[11px] bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-300 dark:bg-slate-800 dark:hover:bg-red-950/30 dark:text-slate-400 dark:hover:text-red-400 dark:border-slate-700 transition-colors cursor-pointer"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< md) */}
            <div className="md:hidden space-y-3">
              {zones.map((zone) => {
                const occupants = trackedObjects.filter(obj => isObjectInZone(obj, zone));
                const maxDwell = occupants.reduce((max, obj) => Math.max(max, obj.dwellTimeInZone || 0), 0);
                
                let status: ZoneStatus = 'SAFE';
                if (occupants.length > 0) {
                  status = maxDwell >= zone.stayThresholdSeconds ? 'VIOLATION' : 'OCCUPIED';
                }
                const isViolation = status === 'VIOLATION';

                return (
                  <div
                    key={zone.id}
                    onClick={() => setSelectedZoneId(zone.id)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                      selectedZoneId === zone.id ? 'ring-1 ring-blue-500 border-blue-500' : 'border-slate-200 dark:border-slate-800'
                    } ${
                      isViolation
                        ? 'bg-red-50/50 dark:bg-red-950/20'
                        : 'bg-slate-50/80 dark:bg-slate-900/60'
                    }`}
                  >
                    {/* Card Header: Name + Badges */}
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: zone.color || (zone.type === 'emergency' ? '#EF4444' : '#F59E0B') }}
                        />
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {zone.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          zone.alertLevel === 'critical'
                            ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                            : zone.alertLevel === 'high'
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                        }`}>
                          {zone.alertLevel}
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          !zone.enabled
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            : isViolation
                            ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                            : status === 'OCCUPIED'
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {!zone.enabled ? 'DISABLED' : status}
                        </span>
                      </div>
                    </div>

                    {/* Card Details Grid */}
                    <div className="grid grid-cols-2 gap-2 py-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Type / Dwell</span>
                        <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
                          {zone.type} ({zone.stayThresholdSeconds}s limit)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">Monitored Classes</span>
                        <span className="capitalize font-medium text-slate-700 dark:text-slate-300 truncate block">
                          {zone.monitoredObjects && zone.monitoredObjects.length > 0
                            ? zone.monitoredObjects.join(', ')
                            : 'person, vehicle'}
                        </span>
                      </div>
                    </div>

                    {/* Card Action Buttons (Touch Friendly) */}
                    <div className="pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleZoneEnabled(zone.id)}
                        className={`flex-1 py-1.5 min-h-[36px] rounded text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          zone.enabled
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{zone.enabled ? 'Enabled' : 'Disabled'}</span>
                      </button>

                      <button
                        onClick={() => setEditingZone(zone)}
                        className="flex-1 py-1.5 min-h-[36px] rounded text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => deleteZone(zone.id)}
                        className="p-2 min-h-[36px] min-w-[36px] rounded bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-300 dark:bg-slate-800 dark:hover:bg-red-950/30 dark:text-slate-400 dark:hover:text-red-400 dark:border-slate-700 transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
                        title="Delete Zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Active Zone Breaches Alert (if any active violations exist) */}
      {currentViolations.length > 0 && (
        <div className="bg-white dark:bg-slate-850 border border-red-500/50 rounded p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-red-200 dark:border-red-500/30">
            <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Active Zone Breaches
            </h4>
            <span className="text-[11px] bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 rounded font-bold">
              {currentViolations.length} Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {currentViolations.map((violation) => {
              const zone = zones.find(z => z.id === violation.zoneId);
              const isAlarm = violation.dwellTimeSeconds >= (zone?.stayThresholdSeconds || violation.thresholdSeconds || 5);

              return (
                <div
                  key={violation.id}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-red-200 dark:border-red-500/30 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white block">
                      Target #{violation.objectId}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Zone: {violation.zoneName}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`font-semibold block ${isAlarm ? 'text-red-600 dark:text-red-400 font-bold' : 'text-amber-600 dark:text-amber-400'}`}>
                      {violation.dwellTimeSeconds.toFixed(1)}s dwell
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Limit: {zone?.stayThresholdSeconds || violation.thresholdSeconds || 5}s
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zone Config Modal */}
      <ZoneConfigModal
        isOpen={!!editingZone}
        onClose={() => setEditingZone(null)}
        zone={editingZone}
        onSave={(updated) => updateZone(updated)}
      />
    </div>
  );
};
