import { useState } from 'react';
import ChatInterface from './ChatInterface';
import AuditView from './AuditView';
import { Newspaper, FileText } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="flex h-screen bg-[#111111] text-gray-200 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <div className="w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Newspaper className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-white">AI Investigative Journalist</h1>
          </div>
          <p className="text-xs text-gray-400 mt-2 font-medium">Agentic Procurement</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'chat'
                ? 'bg-[#2a2a2a] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#222]'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            Investigation
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-[#2a2a2a] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#222]'
            }`}
          >
            <FileText className="w-4 h-4" />
            Compliance Audit
          </button>
        </nav>

        <div className="p-4 border-t border-[#333]">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            <span className="text-xs font-semibold text-gray-400">Base Sepolia Active</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0d0d0d]">
        {activeTab === 'chat' ? <ChatInterface /> : <AuditView />}
      </main>
    </div>
  );
}

export default App;
