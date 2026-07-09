import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, ShieldCheck } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { states, products, redFlags } from '@/data';

const routeLabels: Record<string, string> = {
  'capital-estimator': 'Capital Estimator',
  'brief-generator': 'Brief Generator',
  'red-flags': 'Red Flags & Audit',
  'howey': 'Howey Calculator',
  'scenario': 'Scenario Planner',
  'states': 'State Map',
  'products': 'Product Matrix',
  'simulator': 'Simulator',
  'readiness': 'Readiness Stack',
  'roadmap': 'Launch Roadmap',
  'settings': 'Settings',
  'ontology': 'Ontology Explorer',
};

interface SearchResult {
  label: string;
  sublabel: string;
  to: string;
}

export function TopNav() {
  const { darkMode, toggleDarkMode } = useUIStore();
  const { setFilter } = useFilterStore();
  const { pathname } = useLocation();
  const breadcrumbs = pathname.split('/').filter(Boolean).map(p => routeLabels[p] || (p.charAt(0).toUpperCase() + p.slice(1)));

  const [localSearch, setLocalSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = localSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: SearchResult[] = [];

    for (const s of states) {
      if (results.length >= 6) break;
      if (s.name.toLowerCase().includes(q) || s.abbreviation.toLowerCase().includes(q)) {
        results.push({ label: s.name, sublabel: `${s.abbreviation} · ${s.status}`, to: '/states' });
      }
    }

    for (const p of products) {
      if (results.length >= 6) break;
      if (p.name.toLowerCase().includes(q)) {
        results.push({ label: p.name, sublabel: `${p.category} · ${p.status}`, to: '/products' });
      }
    }

    for (const rf of redFlags) {
      if (results.length >= 6) break;
      if (rf.title.toLowerCase().includes(q)) {
        results.push({ label: rf.title, sublabel: `Risk: ${rf.risk}`, to: '/red-flags' });
      }
    }

    return results.slice(0, 6);
  }, [localSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    setFilter('searchQuery', val);
    setShowDropdown(val.trim().length >= 2);
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b border-line bg-navy px-4 shadow-sm">
      <Link to="/" className="flex items-center gap-2 font-bold text-lg text-white">
        <span className="font-bold tracking-tight">LCX USA</span>
      </Link>
      <nav className="flex items-center text-sm text-ice/70">
        <span>/</span>
        {breadcrumbs.length === 0 ? <span className="ml-1">Dashboard</span> : breadcrumbs.map((c,i) => <span key={c} className="ml-1">{c}{i<breadcrumbs.length-1?'/':''}</span>)}
      </nav>
      <div className="flex-1 flex justify-center">
        <span className="text-[10px] font-medium text-ice/50 tracking-wide uppercase">
          Strictly Confidential · Prepared for CEO Review
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          <input
            type="text"
            placeholder="Search states, products, flags…"
            value={localSearch}
            onChange={handleSearchChange}
            onFocus={() => { if (localSearch.trim().length >= 2) setShowDropdown(true); }}
            className="h-8 w-56 rounded-md border border-ice/20 bg-navy-deep/60 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-ice text-ice placeholder-ice/30"
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-line rounded-lg shadow-xl z-50 overflow-hidden">
              {searchResults.map((r, idx) => (
                <Link
                  key={idx}
                  to={r.to}
                  onClick={() => setShowDropdown(false)}
                  className="flex flex-col px-3 py-2 hover:bg-ice-soft dark:hover:bg-ice-soft/10 transition-colors border-b border-line last:border-b-0"
                >
                  <span className="text-xs font-semibold text-navy dark:text-ice truncate">{r.label}</span>
                  <span className="text-[10px] text-grey">{r.sublabel}</span>
                </Link>
              ))}
            </div>
          )}
          {showDropdown && localSearch.trim().length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-line rounded-lg shadow-xl z-50 p-3">
              <span className="text-xs text-grey">No results found</span>
            </div>
          )}
        </div>
        <button
          onClick={toggleDarkMode}
          className="rounded-full p-1.5 text-ice/70 hover:bg-ice-soft/20 hover:text-ice transition-all duration-300 transform active:scale-95"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <Sun size={18} className="transition-transform duration-500 hover:rotate-45" />
          ) : (
            <Moon size={18} className="transition-transform duration-500 hover:-rotate-12" />
          )}
        </button>
        <div className="flex items-center gap-1.5 rounded-full bg-ice/15 px-2.5 py-1 text-xs font-bold text-ice select-none">
          <ShieldCheck size={14} className="text-status-ready" />
          <span>CCO</span>
        </div>
      </div>
    </header>
  );
}
