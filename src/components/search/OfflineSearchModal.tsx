import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchLocalDatabase, type SearchResultItem } from '../../lib/search/offlineSearch';
import { useI18n } from '../../lib/i18n/LanguageContext';
import { Search, X, Layers, AlertTriangle, Calendar, ChevronRight, HardDrive } from 'lucide-react';
import { useAndroidBackHandler } from '@/hooks/useAndroidBackHandler';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function OfflineSearchModal({ isOpen, onClose }: Props) {
  useAndroidBackHandler(isOpen, onClose);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchLocalDatabase(query).then((res) => {
        if (active) {
          setResults(res);
          setSearching(false);
        }
      });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (item: SearchResultItem) => {
    if (item.inspectionId) {
      navigate(`/inspections/${item.inspectionId}`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-start justify-center p-4 pt-12 sm:pt-20">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-zinc-100 flex items-center gap-3">
          <Search size={20} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder || 'Search assets, inspections, questions...'}
            className="flex-1 bg-transparent text-sm sm:text-base font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            autoFocus
            id="input-offline-search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-bold text-zinc-500 hover:text-zinc-800"
          >
            Esc
          </button>
        </div>

        {/* Offline Badge Info */}
        <div className="px-4 py-1.5 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between text-[11px] font-medium text-zinc-500">
          <span className="flex items-center gap-1.5">
            <HardDrive size={12} className="text-emerald-600" />
            Querying local IndexedDB (Zero network needed)
          </span>
          {results.length > 0 && <span>{results.length} results</span>}
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {searching && (
            <div className="py-12 text-center text-xs text-zinc-400">Searching local database…</div>
          )}

          {!searching && query.trim() !== '' && results.length === 0 && (
            <div className="py-12 text-center text-zinc-400 space-y-1">
              <Search size={28} className="mx-auto text-zinc-300" />
              <p className="text-xs font-semibold text-zinc-600">No matching local records found.</p>
              <p className="text-[11px]">Try asset code like "M-102" or title words.</p>
            </div>
          )}

          {!searching && !query.trim() && (
            <div className="py-10 text-center text-zinc-400 space-y-1">
              <p className="text-xs font-medium">Type asset name, code, question, or inspection ID.</p>
              <p className="text-[11px] text-zinc-400">Works 100% offline in field areas.</p>
            </div>
          )}

          {results.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => handleSelect(item)}
              className="p-3.5 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 group shadow-2xs"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.assetCode && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {item.assetCode}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-600 uppercase">
                    {item.type.replace('_', ' ')}
                  </span>
                  {item.unresolvedIssuesCount !== undefined && item.unresolvedIssuesCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {item.unresolvedIssuesCount} unresolved
                    </span>
                  )}
                </div>

                <p className="text-sm font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                  {item.title}
                </p>

                <p className="text-xs text-zinc-500 truncate">{item.subtitle}</p>

                <div className="flex items-center gap-3 pt-1 text-[11px] text-zinc-400 flex-wrap">
                  {item.siteName && <span>{item.siteName}</span>}
                  {item.inspectionCount !== undefined && (
                    <span className="flex items-center gap-1">
                      <Layers size={11} /> {item.inspectionCount} inspections
                    </span>
                  )}
                  {item.lastInspectionDate && (
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {new Date(item.lastInspectionDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight size={18} className="text-zinc-300 group-hover:text-indigo-600 shrink-0 transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
