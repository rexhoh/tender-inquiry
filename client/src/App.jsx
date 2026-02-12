import React, { useState } from 'react';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import ScheduleManager from './components/ScheduleManager';
import { Search, Calendar, Ghost } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [results, setResults] = useState([]);

  return (
    <div className="min-h-screen p-6 md:p-12 relative overflow-hidden text-cyan-50">

      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto space-y-10 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-end border-b border-cyan-900/30 pb-6 gap-6">
          <div className="space-y-2">
            <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-200 to-white drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
              TENDER<span className="text-cyan-600">.OS</span>
            </h1>
            <p className="text-cyan-700 font-mono text-sm tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Government Inquiry System v2.0
            </p>
          </div>

          <nav className="flex bg-black/40 p-1.5 rounded-lg border border-cyan-900/50 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center px-6 py-2.5 rounded transition-all font-bold tracking-wide ${activeTab === 'search'
                  ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(0,255,255,0.1)] border border-cyan-500/30'
                  : 'text-cyan-900 hover:text-cyan-500'
                }`}
            >
              <Search className="w-4 h-4 mr-2" />
              SEARCH
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center px-6 py-2.5 rounded transition-all font-bold tracking-wide ${activeTab === 'schedule'
                  ? 'bg-purple-500/20 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.1)] border border-purple-500/30'
                  : 'text-cyan-900 hover:text-purple-400'
                }`}
            >
              <Calendar className="w-4 h-4 mr-2" />
              SCHEDULE
            </button>
          </nav>
        </header>

        {/* Content */}
        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'search' ? (
            <div className="space-y-8">
              <SearchForm onResults={setResults} />
              <ResultsTable results={results} />
            </div>
          ) : (
            <ScheduleManager />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
