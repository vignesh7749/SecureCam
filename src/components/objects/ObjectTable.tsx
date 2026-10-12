import React, { useState } from 'react';
import { useSurveillance } from '../../context/SurveillanceContext';
import { Badge } from '../common/Badge';
import { Crosshair, Search, ShieldAlert } from 'lucide-react';

interface ObjectTableProps {
  onSelectObject?: (id: string) => void;
}

export const ObjectTable: React.FC<ObjectTableProps> = ({ onSelectObject }) => {
  const { trackedObjects, selectedObjectId, setSelectedObjectId } = useSurveillance();
  const [filterClass, setFilterClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filtered = trackedObjects.filter((obj) => {
    if (filterClass !== 'all') {
      if (filterClass === 'unknown' && !obj.isUnknown) return false;
      if (filterClass !== 'unknown' && obj.className !== filterClass) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = String(obj.trackingId).includes(q);
      const matchClass = obj.className.toLowerCase().includes(q);
      const matchZone = obj.currentZoneName?.toLowerCase().includes(q) || false;
      return matchId || matchClass || matchZone;
    }
    return true;
  });

  const handleRowClick = (id: string) => {
    setSelectedObjectId(id);
    if (onSelectObject) onSelectObject(id);
  };

  return (
    <div className="bg-white dark:bg-surveillance-850 border border-slate-200 dark:border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-3">
      {/* Table Controls & Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-surveillance-700/60">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-surveillance-100">
              TRACKED OBJECT REGISTRY
            </h3>
            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-surveillance-800 text-[10px] font-mono rounded-2xs text-slate-600 dark:text-surveillance-400">
              {filtered.length} ACTIVE TARGETS
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-500 dark:text-surveillance-400 mt-0.5">
            Real-time multi-object tracking IDs, trajectories, and classification confidence
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-surveillance-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter ID, class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-surveillance-800 border border-slate-200 dark:border-surveillance-700 rounded-sm pl-8 pr-2.5 py-1 text-xs font-mono text-slate-900 dark:text-surveillance-100 placeholder:text-slate-400 dark:placeholder:text-surveillance-500 focus:outline-none focus:border-blue-500 dark:focus:border-tactical-cyan"
            />
          </div>

          {/* Class Filter */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="bg-slate-50 dark:bg-surveillance-800 border border-slate-200 dark:border-surveillance-700 text-slate-800 dark:text-surveillance-200 text-xs font-mono px-2 py-1 rounded-sm focus:outline-none focus:border-blue-500 dark:focus:border-tactical-cyan"
          >
            <option value="all">All Classes</option>
            <option value="person">Persons</option>
            <option value="vehicle">Vehicles</option>
            <option value="unknown">Unknowns Only</option>
            <option value="bicycle">Bicycles</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-surveillance-700/80 bg-slate-50 dark:bg-surveillance-900/60 text-slate-500 dark:text-surveillance-400 text-[10px] uppercase tracking-wider">
              <th className="py-2 px-3">Target ID</th>
              <th className="py-2 px-3">Classification</th>
              <th className="py-2 px-3">Confidence</th>
              <th className="py-2 px-3">Movement</th>
              <th className="py-2 px-3">Current Zone</th>
              <th className="py-2 px-3">Dwell Time</th>
              <th className="py-2 px-3">First Seen</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-surveillance-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-surveillance-500 font-mono text-xs">
                  No tracked objects match current filters.
                </td>
              </tr>
            ) : (
              filtered.map((obj) => {
                const isSelected = selectedObjectId === obj.id;
                const isUnknown = obj.isUnknown;
                const hasZone = !!obj.currentZoneName;
                const isViolating = (obj.dwellTimeInZone || 0) >= 10 && hasZone;

                return (
                  <tr
                    key={obj.id}
                    onClick={() => handleRowClick(obj.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-tactical-cyan/10 text-slate-900 dark:text-surveillance-100'
                        : isViolating
                        ? 'bg-red-50/70 dark:bg-tactical-red/[0.06] hover:bg-red-100/60 dark:hover:bg-tactical-red/[0.12]'
                        : isUnknown
                        ? 'bg-amber-50/70 dark:bg-tactical-amber/[0.04] hover:bg-amber-100/60 dark:hover:bg-tactical-amber/[0.08]'
                        : 'hover:bg-slate-50 dark:hover:bg-surveillance-800/60'
                    }`}
                  >
                    {/* Target ID */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Crosshair className={`w-3.5 h-3.5 ${isUnknown ? 'text-amber-500 dark:text-tactical-amber' : 'text-blue-500 dark:text-tactical-cyan'}`} />
                        <span className={isUnknown ? 'text-amber-600 dark:text-tactical-amber' : 'text-slate-900 dark:text-surveillance-100'}>
                          #{String(obj.trackingId).padStart(2, '0')}
                        </span>
                      </div>
                    </td>

                    {/* Class */}
                    <td className="py-2.5 px-3 uppercase">
                      {isUnknown ? (
                        <Badge variant="warning" size="xs">
                          UNKNOWN NOVEL
                        </Badge>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-surveillance-200">
                          {obj.className}
                        </span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-800 dark:text-surveillance-200 font-bold">
                          {(obj.confidence * 100).toFixed(1)}%
                        </span>
                        <div className="w-12 bg-slate-200 dark:bg-surveillance-800 h-1 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full ${isUnknown ? 'bg-amber-500 dark:bg-tactical-amber' : 'bg-blue-500 dark:bg-tactical-cyan'}`}
                            style={{ width: `${obj.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Movement */}
                    <td className="py-2.5 px-3">
                      <span className={`text-[11px] uppercase ${
                        obj.movementStatus === 'loitering' ? 'text-red-600 dark:text-tactical-red font-bold' : 'text-slate-500 dark:text-surveillance-400'
                      }`}>
                        {obj.movementStatus}
                      </span>
                    </td>

                    {/* Current Zone */}
                    <td className="py-2.5 px-3">
                      {hasZone ? (
                        <span className={`text-[11px] font-semibold flex items-center gap-1 ${
                          isViolating ? 'text-red-600 dark:text-tactical-red' : 'text-amber-600 dark:text-tactical-amber'
                        }`}>
                          <ShieldAlert className="w-3 h-3" />
                          <span className="truncate max-w-[140px]">{obj.currentZoneName}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-surveillance-600 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Dwell Time */}
                    <td className="py-2.5 px-3">
                      {obj.dwellTimeInZone ? (
                        <span className={`font-bold ${isViolating ? 'text-red-600 dark:text-tactical-red animate-pulse' : 'text-slate-800 dark:text-surveillance-200'}`}>
                          {Math.round(obj.dwellTimeInZone)}s
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-surveillance-600">—</span>
                      )}
                    </td>

                    {/* First Seen */}
                    <td className="py-2.5 px-3 text-slate-500 dark:text-surveillance-400 text-[11px]">
                      {obj.firstSeen.split(' ')[1]}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-[10px] text-blue-600 dark:text-tactical-cyan uppercase tracking-wider hover:underline font-semibold">
                        INSPECT
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
