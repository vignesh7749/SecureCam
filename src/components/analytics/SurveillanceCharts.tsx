import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid 
} from 'recharts';
import { 
  ANALYTICS_TIME_SERIES, 
  CLASS_DISTRIBUTION_DATA, 
  ZONE_ACTIVITY_DATA 
} from '../../services/mockData';

// Custom Tactical Dark Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surveillance-950/95 border border-surveillance-700 p-2.5 rounded-sm shadow-2xl font-mono text-[11px] backdrop-blur-md">
        <div className="text-surveillance-400 font-semibold mb-1 border-b border-surveillance-800 pb-0.5">
          TIME: {label}
        </div>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-2xs inline-block" style={{ backgroundColor: entry.color }} />
              <span className="uppercase">{entry.name}:</span>
            </span>
            <span className="font-bold text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const SurveillanceCharts: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono">
      {/* 1. Objects Over Time (Known vs Unknown) */}
      <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between pb-2 border-b border-surveillance-700/60">
          <div>
            <h4 className="text-xs font-bold text-surveillance-100 uppercase tracking-wider">
              OBJECTS TRACKED OVER TIME
            </h4>
            <p className="text-[10px] text-surveillance-400">
              Temporal density comparison: Known Targets vs Novel/Unknown Objects
            </p>
          </div>
          <span className="text-[10px] text-tactical-cyan px-2 py-0.5 bg-tactical-cyan/10 border border-tactical-cyan/30 rounded-2xs">
            LIVE DENSITY
          </span>
        </div>

        <div className="h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ANALYTICS_TIME_SERIES}>
              <defs>
                <linearGradient id="knownGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="unknownGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2740" />
              <XAxis dataKey="time" stroke="#4A659A" fontSize={10} tickLine={false} />
              <YAxis stroke="#4A659A" fontSize={10} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              <Area type="monotone" dataKey="knownObjects" name="Known Targets" stroke="#00E5FF" strokeWidth={2} fillOpacity={1} fill="url(#knownGrad)" />
              <Area type="monotone" dataKey="unknownObjects" name="Unknown Novelties" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#unknownGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Target Class Distribution */}
      <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between pb-2 border-b border-surveillance-700/60">
          <div>
            <h4 className="text-xs font-bold text-surveillance-100 uppercase tracking-wider">
              CLASSIFICATION DISTRIBUTION
            </h4>
            <p className="text-[10px] text-surveillance-400">
              Proportion of detected classes across current surveillance session
            </p>
          </div>
          <span className="text-[10px] text-surveillance-400 px-2 py-0.5 bg-surveillance-800 border border-surveillance-700 rounded-2xs">
            N = 87 DETECTIONS
          </span>
        </div>

        <div className="h-64 pt-2 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={CLASS_DISTRIBUTION_DATA}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="count"
                nameKey="className"
              >
                {CLASS_DISTRIBUTION_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0B0F17" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Emergency Zone Activity & Violations */}
      <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between pb-2 border-b border-surveillance-700/60">
          <div>
            <h4 className="text-xs font-bold text-surveillance-100 uppercase tracking-wider">
              ZONE INTRUSION &amp; VIOLATION FREQUENCY
            </h4>
            <p className="text-[10px] text-surveillance-400">
              Entries versus prolonged dwell breaches per configured perimeter
            </p>
          </div>
          <span className="text-[10px] text-tactical-red px-2 py-0.5 bg-tactical-red/10 border border-tactical-red/30 rounded-2xs">
            PERIMETER AUDIT
          </span>
        </div>

        <div className="h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ZONE_ACTIVITY_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2740" />
              <XAxis dataKey="zoneName" stroke="#4A659A" fontSize={10} tickLine={false} />
              <YAxis stroke="#4A659A" fontSize={10} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              <Bar dataKey="entries" name="Total Entries" fill="#2563EB" radius={[2, 2, 0, 0]} />
              <Bar dataKey="violations" name="Threshold Violations" fill="#EF4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Processing Performance (FPS & Inference Latency) */}
      <div className="bg-surveillance-850 border border-surveillance-700/80 rounded-sm p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between pb-2 border-b border-surveillance-700/60">
          <div>
            <h4 className="text-xs font-bold text-surveillance-100 uppercase tracking-wider">
              INFERENCE LATENCY &amp; FPS STABILITY
            </h4>
            <p className="text-[10px] text-surveillance-400">
              Hardware acceleration throughput telemetry (TensorRT / CUDA)
            </p>
          </div>
          <span className="text-[10px] text-tactical-emerald px-2 py-0.5 bg-tactical-emerald/10 border border-tactical-emerald/30 rounded-2xs">
            OPTIMAL PIPELINE
          </span>
        </div>

        <div className="h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ANALYTICS_TIME_SERIES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2740" />
              <XAxis dataKey="time" stroke="#4A659A" fontSize={10} tickLine={false} />
              <YAxis yAxisId="left" stroke="#10B981" fontSize={10} tickLine={false} domain={[50, 65]} />
              <YAxis yAxisId="right" orientation="right" stroke="#ADC0E3" fontSize={10} tickLine={false} domain={[10, 25]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
              <Line yAxisId="left" type="monotone" dataKey="fps" name="Pipeline FPS" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="inferenceLatency" name="Latency (ms)" stroke="#ADC0E3" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
