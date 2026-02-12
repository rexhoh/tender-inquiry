import React, { useState } from 'react';
import SearchForm from './components/SearchForm';
import ResultsTable from './components/ResultsTable';
import ScheduleManager from './components/ScheduleManager';
import { Search, Calendar, Download } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [results, setResults] = useState([]);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            政府標案查詢系統
          </h1>
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'search' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Search className="inline w-4 h-4 mr-2" />
              手動查詢
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Calendar className="inline w-4 h-4 mr-2" />
              排程管理
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="bg-card rounded-xl border border-white/5 p-6 shadow-2xl backdrop-blur-sm">
          {activeTab === 'search' ? (
            <div className="space-y-6">
              <SearchForm onResults={setResults} />
              <ResultsTable results={results} />
            </div>
          ) : (
            <ScheduleManager />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
