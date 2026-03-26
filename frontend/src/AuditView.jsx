import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function AuditView() {
  const [auditLog, setAuditLog] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchAuditLog = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5002/api/audit');
      if (response.ok) {
        const data = await response.json();
        setAuditLog(data.content);
      } else {
        setAuditLog('# Audit Log Error\\nCould not fetch the compliance log.');
      }
    } catch (err) {
      setAuditLog('# Connection Error\\nMake sure the buyer backend API is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="bg-[#1a1a1a] border-b border-[#333] px-8 py-6 flex items-center justify-between shadow-md z-10">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-green-500" />
            Compliance Audit Log
          </h2>
          <p className="text-gray-400 mt-1">Immutable record of all agentic procurement decisions.</p>
        </div>
        <button 
          onClick={fetchAuditLog} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Log
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          {loading && !auditLog ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="bg-[#151515] border border-[#222] rounded-2xl p-8 mb-12 shadow-2xl">
              <article className="prose prose-invert prose-green max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {auditLog}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
