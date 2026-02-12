import React from 'react';
import { Download, ExternalLink } from 'lucide-react';

const ResultsTable = ({ results }) => {
    if (!results || results.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500 bg-card rounded-lg border border-white/5">
                目前沒有結果。
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
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">搜尋結果 ({results.length})</h2>
                <button
                    onClick={handleDownload}
                    className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                    <Download className="w-4 h-4 mr-2" />
                    匯出 CSV
                </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-900 text-gray-200 uppercase">
                        <tr>
                            <th scope="col" className="px-6 py-3">機關名稱</th>
                            <th scope="col" className="px-6 py-3">標案案號 / 名稱</th>
                            <th scope="col" className="px-6 py-3">預算金額</th>
                            <th scope="col" className="px-6 py-3">履約地點</th>
                            <th scope="col" className="px-6 py-3">聯絡人</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {results.map((item, index) => (
                            <tr key={index} className="bg-gray-900/50 hover:bg-gray-800/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-white">
                                    {item.agencyName}
                                    {item.centralGov === '是' && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-900 text-purple-200">
                                            中央
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-bold text-blue-400">{item.tenderId}</div>
                                    <div className="text-white mt-1">{item.tenderName}</div>
                                </td>
                                <td className="px-6 py-4 text-emerald-400 font-mono">
                                    {item.budget}
                                </td>
                                <td className="px-6 py-4">
                                    {item.location}
                                </td>
                                <td className="px-6 py-4">
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
