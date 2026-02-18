import React, { useState } from 'react';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import ScheduleManager from './components/ScheduleManager';
import { Search, Calendar, Database } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [results, setResults] = useState([]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(11, 17, 32, 0.88)',
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Database className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">
                  標案查詢
                </h1>
                <p className="text-[10px] font-mono tracking-wider hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                  TENDER.OS v3.0
                </p>
              </div>
            </div>

            {/* Tabs */}
            <nav className="flex rounded-lg p-1" style={{ background: 'var(--bg-card)' }}>
              {[
                { key: 'search', label: '搜尋', icon: Search },
                { key: 'schedule', label: '排程', icon: Calendar },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 ${activeTab === tab.key
                      ? 'text-blue-400'
                      : 'text-slate-500 hover:text-slate-300'
                    }`}
                  style={activeTab === tab.key ? {
                    background: 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.15)',
                  } : { border: '1px solid transparent' }}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>

          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative z-10">
        {activeTab === 'search' ? (
          <div className="space-y-6 animate-fade-in">
            <SearchForm onResults={setResults} />
            <ResultsTable results={results} />
          </div>
        ) : (
          <div className="animate-fade-in">
            <ScheduleManager />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
