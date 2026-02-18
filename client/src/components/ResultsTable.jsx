import React, { useState } from 'react';
import { Download, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';

const ITEMS_PER_PAGE = 20;

const ResultsTable = ({ results }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [filterText, setFilterText] = useState('');

    if (!results || results.length === 0) {
        return (
            <div className="card text-center py-14" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                <p className="text-sm">尚無資料，請先執行搜尋</p>
            </div>
        );
    }

    const filtered = filterText
        ? results.filter(r =>
            `${r.agencyName} ${r.tenderId} ${r.tenderName}`.toLowerCase().includes(filterText.toLowerCase())
        )
        : results;

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const safeCurrentPage = Math.min(currentPage, totalPages || 1);
    const startIdx = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const handleDownload = () => {
        const headers = ['機關名稱', '標案案號', '標案名稱', '招標方式', '公告日期', '截止日期', '預算金額', '詳細連結'];
        const keys = ['agencyName', 'tenderId', 'tenderName', 'method', 'publishDate', 'deadline', 'budget', 'detailLink'];
        const csvContent = [
            headers.join(','),
            ...results.map(row => keys.map(key => `"${(row[key] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `標案查詢_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-white">搜尋結果</h2>
                    <span className="badge badge-blue">{filtered.length} 筆</span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                            placeholder="篩選結果..."
                            className="input-field pl-8 sm:w-48 text-xs"
                            style={{ padding: '6px 12px 6px 32px' }}
                        />
                    </div>
                    <button
                        id="export-csv-button"
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0"
                        style={{
                            background: 'rgba(34,197,94,0.1)',
                            border: '1px solid rgba(34,197,94,0.2)',
                            color: '#4ade80',
                        }}
                    >
                        <Download className="w-3.5 h-3.5" />
                        匯出 CSV
                    </button>
                </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>機關名稱</th>
                                <th>標案案號 / 名稱</th>
                                <th>招標方式</th>
                                <th>公告日期</th>
                                <th>截止日期</th>
                                <th>預算金額</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((item, index) => (
                                <tr key={index}>
                                    <td className="max-w-[180px]">
                                        <div className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            {item.agencyName}
                                        </div>
                                    </td>
                                    <td className="max-w-[320px]">
                                        <div className="font-mono text-[11px] text-blue-400 font-medium">{item.tenderId}</div>
                                        <div className="text-xs mt-0.5 line-clamp-2 font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                            {item.tenderName}
                                        </div>
                                    </td>
                                    <td><span className="tag">{item.method || '—'}</span></td>
                                    <td className="font-mono text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                        {item.publishDate || '—'}
                                    </td>
                                    <td className="font-mono text-xs whitespace-nowrap" style={{ color: '#f59e0b' }}>
                                        {item.deadline || '—'}
                                    </td>
                                    <td className="font-mono text-xs font-semibold whitespace-nowrap" style={{ color: '#4ade80' }}>
                                        {item.budget ? `$${item.budget}` : '—'}
                                    </td>
                                    <td>
                                        {item.detailLink ? (
                                            <a
                                                href={item.detailLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all text-blue-400 hover:text-blue-300"
                                                style={{
                                                    background: 'rgba(59,130,246,0.08)',
                                                    border: '1px solid rgba(59,130,246,0.12)',
                                                }}
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                查看
                                            </a>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
                {pageItems.map((item, index) => (
                    <div key={index} className="card space-y-2">
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {item.agencyName}
                        </div>
                        <div>
                            <span className="font-mono text-[11px] text-blue-400 font-medium">{item.tenderId}</span>
                            <div className="text-sm font-medium mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                                {item.tenderName}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center text-[11px]">
                            {item.method && <span className="tag">{item.method}</span>}
                            {item.budget && (
                                <span className="font-mono font-semibold" style={{ color: '#4ade80' }}>
                                    ${item.budget}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="flex gap-3 text-[11px] font-mono">
                                <span style={{ color: 'var(--text-muted)' }}>公告 {item.publishDate || '—'}</span>
                                <span style={{ color: '#f59e0b' }}>截止 {item.deadline || '—'}</span>
                            </div>
                            {item.detailLink && (
                                <a href={item.detailLink} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400">
                                    <ExternalLink className="w-3 h-3" /> 查看
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        第 {safeCurrentPage}/{totalPages} 頁
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={safeCurrentPage === 1}
                            className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let page;
                            if (totalPages <= 5) page = i + 1;
                            else if (safeCurrentPage <= 3) page = i + 1;
                            else if (safeCurrentPage >= totalPages - 2) page = totalPages - 4 + i;
                            else page = safeCurrentPage - 2 + i;
                            return (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
                                    style={{
                                        background: page === safeCurrentPage ? 'rgba(59,130,246,0.12)' : 'transparent',
                                        border: page === safeCurrentPage ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                                        color: page === safeCurrentPage ? '#60a5fa' : 'var(--text-muted)',
                                    }}
                                >
                                    {page}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={safeCurrentPage === totalPages}
                            className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsTable;
