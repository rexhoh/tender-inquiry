import React, { useState } from 'react';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import ScheduleManager from './components/ScheduleManager';
import { Search, Calendar, Database } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [results, setResults] = useState([]);

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>

      {/* Top bar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b" style={{ borderColor: 'var(--border)', background: 'rgba(10, 14, 26, 0.85)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">

            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">
                  標案查詢
                </h1>
                <p className="text-[10px] sm:text-xs font-mono tracking-wider hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                  TENDER.OS v3.0
                </p>
              </div>
            </div>

            {/* Tab Navigation */}
            <nav className="flex rounded-lg p-1" style={{ background: 'var(--bg-secondary)' }}>
              <button
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${activeTab === 'search'
                    ? 'bg-blue-500/10 text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                style={activeTab === 'search' ? { border: '1px solid rgba(59,130,246,0.15)' } : {}}
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">搜尋</span>
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${activeTab === 'schedule'
                    ? 'bg-blue-500/10 text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                style={activeTab === 'schedule' ? { border: '1px solid rgba(59,130,246,0.15)' } : {}}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">排程</span>
              </button>
            </nav>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {activeTab === 'search' ? (
          <div className="space-y-6">
            <SearchForm onResults={setResults} />
            <ResultsTable results={results} />
          </div>
        ) : (
          <ScheduleManager />
        )}
      </main>
    </div>
  );
}

export default App;
