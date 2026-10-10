import React from 'react';
import { Search, X, SlidersHorizontal, ArrowUpDown, RotateCcw } from 'lucide-react';
import type { CameraState } from '../../types/crowdEvent';

export type TriageStatusFilter = 'all' | 'unack' | 'ack';
export type TriageSortOrder = 'newest' | 'severity' | 'oldest';

interface TriageFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedStatus: TriageStatusFilter;
  onStatusChange: (status: TriageStatusFilter) => void;
  selectedCameraId: string | null;
  onCameraChange: (cameraId: string | null) => void;
  cameras: CameraState[];
  sortBy: TriageSortOrder;
  onSortChange: (sort: TriageSortOrder) => void;
  totalAlertsCount: number;
  filteredCount: number;
  onResetFilters: () => void;
  isFiltered: boolean;
}

export const TriageFilterBar: React.FC<TriageFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  selectedCameraId,
  onCameraChange,
  cameras,
  sortBy,
  onSortChange,
  totalAlertsCount,
  filteredCount,
  onResetFilters,
  isFiltered,
}) => {
  return (
    <div className="card p-3 mb-3.5 space-y-2.5">
      {/* Top Row: Search Input + Zone Dropdown + Sort */}
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search anomalies (e.g. Surge, Bottleneck, Terminal Gate)..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50/80 hover:bg-slate-50 focus:bg-white border border-slate-200/90 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Camera / Zone Selector Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={selectedCameraId || 'all'}
            onChange={(e) => onCameraChange(e.target.value === 'all' ? null : e.target.value)}
            className="text-xs bg-white border border-slate-200 text-slate-700 py-1.5 px-3 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium cursor-pointer shadow-2xs"
            aria-label="Filter by spatial zone"
          >
            <option value="all">All Monitored Zones</option>
            {cameras.map((c) => (
              <option key={c.cameraId} value={c.cameraId}>
                {c.cameraId.toUpperCase()} — {c.zoneName}
              </option>
            ))}
          </select>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as TriageSortOrder)}
              className="text-xs text-slate-700 bg-transparent focus:outline-hidden font-medium cursor-pointer"
              aria-label="Sort incident triage feed"
            >
              <option value="newest">Newest First</option>
              <option value="severity">Highest Severity</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bottom Row: Status Filter Pills + Counter + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
        {/* Status Toggle Pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            Status:
          </span>
          <button
            type="button"
            onClick={() => onStatusChange('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedStatus === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('unack')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedStatus === 'unack'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
            }`}
          >
            Pending Action
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('ack')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedStatus === 'ack'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
            }`}
          >
            Acknowledged
          </button>
        </div>

        {/* Counter & Reset Action */}
        <div className="flex items-center gap-2.5 text-xs text-slate-500">
          <span className="font-medium">
            Showing <strong className="text-slate-900 font-semibold">{filteredCount}</strong> of {totalAlertsCount} alerts
          </span>

          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TriageFilterBar;
