import React from 'react';
import { Download, ExternalLink } from 'lucide-react';

const ResultsTable = ({ results }) => {
    if (!results || results.length === 0) {
        return (
            <div className="text-center py-20 text-cyan-900 border border-dashed border-cyan-900/30 rounded-xl bg-black/20">
                <p className="text-lg">No Data Available / Awaiting Query</p>
                <p className="text-sm mt-2 opacity-50">Initiate a search to view results</p>
            </div>
        );
    }

    const handleDownload = () => {
        // Generate CSV content
        const headers = ['機關名稱', '標案案號', '標案名稱', '預算金額', '中央政府計畫', '履約地點', '機關窗口'];
        const keys = ['agencyName', 'tenderId', 'tenderName', 'budget', 'centralGov', 'location', 'contact'];

        const csvContent = [
            headers.join(','),
            ...results.map(row => keys.map(key => `"${(row[key] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `tenders_export_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-cyan-100 flex items-center gap-2">
                    <span className="w-1 h-6 bg-cyan-500 rounded-sm" />
                    SEARCH RESULTS
                    <span className="text-cyan-700 text-sm font-mono ml-2">[{results.length} FUNDS FOUND]</span>
                </h2>
                <button
                    onClick={handleDownload}
                    className="flex items-center px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/50 hover:border-green-400 rounded-lg transition-all shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                >
                    <Download className="w-4 h-4 mr-2" />
                    EXPORT CSV
                </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-cyan-900/50 shadow-2xl">
                <table className="w-full text-left text-sm text-cyan-200/70">
                    <thead className="bg-cyan-950/30 text-cyan-400 font-mono text-xs uppercase tracking-wider backdrop-blur-sm">
                        <tr>
                            <th scope="col" className="px-6 py-4 border-b border-cyan-900/50">機關名稱</th>
                            <th scope="col" className="px-6 py-4 border-b border-cyan-900/50">標案案號 / 名稱</th>
                            <th scope="col" className="px-6 py-4 border-b border-cyan-900/50">預算金額</th>
                            <th scope="col" className="px-6 py-4 border-b border-cyan-900/50">履約地點</th>
                            <th scope="col" className="px-6 py-4 border-b border-cyan-900/50">聯絡人</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-900/30 bg-black/20">
                        {results.map((item, index) => (
                            <tr key={index} className="hover:bg-cyan-500/5 transition-colors group">
                                <td className="px-6 py-4 font-medium text-cyan-50 relative">
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {item.agencyName}
                                    {item.centralGov === '是' && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                            Central
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-mono text-cyan-500 font-bold group-hover:text-cyan-400 transition-colors">{item.tenderId}</div>
                                    <div className="text-white/80 mt-1 font-bold line-clamp-2">{item.tenderName}</div>
                                </td>
                                <td className="px-6 py-4 text-green-400 font-mono font-bold tracking-tight">
                                    {item.budget}
                                </td>
                                <td className="px-6 py-4 text-cyan-300/70">
                                    {item.location}
                                </td>
                                <td className="px-6 py-4 text-cyan-300/70">
                                    {item.contact}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ResultsTable;
