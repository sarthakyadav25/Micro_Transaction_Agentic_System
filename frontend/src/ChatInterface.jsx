import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Link2, CheckCircle2, ShieldAlert } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatInterface() {
  const [topic, setTopic] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [streamedArticle, setStreamedArticle] = useState('');
  const [messages, setMessages] = useState([]);
  const [agentSteps, setAgentSteps] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedArticle, agentSteps]);

  const startInvestigation = async (e) => {
    if (e) e.preventDefault();
    if (!topic.trim() || isInvestigating) return;

    const currentTopic = topic;
    setTopic('');
    setIsInvestigating(true);
    setStreamedArticle('');
    setAgentSteps([]);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: currentTopic }]);

    try {
      const response = await fetch('http://localhost:5002/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: currentTopic })
      });

      if (!response.ok) throw new Error('Failed to start investigation');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.event === 'agent_step') {
                if (data.draft_content) {
                  setStreamedArticle(data.draft_content);
                }
                
                // Track unique steps gracefully
                setAgentSteps(prev => {
                  const newSteps = [...prev];
                  const existingStepIndex = newSteps.findIndex(s => s.node === data.node);
                  
                  const stepObj = {
                    node: data.node,
                    message: data.message,
                    payment_required: data.payment_required,
                    invoice: data.invoice_details
                  };

                  if (existingStepIndex >= 0) {
                    newSteps[existingStepIndex] = stepObj;
                  } else {
                    newSteps.push(stepObj);
                  }
                  return newSteps;
                });
              } else if (data.event === 'complete') {
                setIsInvestigating(false);
              }
            } catch (err) {
              console.error("Error parsing SSE JSON", err);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setIsInvestigating(false);
      setMessages(prev => [...prev, { role: 'system', content: 'Connection failed.' }]);
    }
  };

  const getStepIcon = (nodeName) => {
    switch(nodeName) {
      case 'orchestrator_node': return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'procurement_node': return <ShieldAlert className="w-4 h-4 text-orange-400" />;
      case 'execution_node': return <Link2 className="w-4 h-4 text-purple-400" />;
      case 'audit_node': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      default: return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
    }
  };

  const formatNodeName = (name) => {
    if (name === 'start') return 'Initializing';
    return name.replace('_node', '').charAt(0).toUpperCase() + name.replace('_node', '').slice(1);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] relative">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth pb-40">
        
        {/* Intro state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-4">
              <span className="text-3xl">📡</span>
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-white leading-tight">
              Investigative <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Agentic Procurement</span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed mix-blend-plus-lighter">
              Enter an investigation topic. The Orchestrator will seamlessly negotiate paywalls using Ethereum x402 micro-transactions to fetch premium offshore data, fully audited.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              <span className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] text-sm text-gray-300">Base Sepolia</span>
              <span className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] text-sm text-gray-300">USDC Settlement</span>
              <span className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] text-sm text-gray-300">GPT-4o-mini</span>
            </div>
          </div>
        )}

        {/* User query log */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`px-6 py-4 rounded-2xl max-w-2xl ${
              msg.role === 'user' 
              ? 'bg-[#2a2a2a] text-white border border-[#3a3a3a]' 
              : 'bg-red-500/10 text-red-200 border border-red-500/20'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Live Agent Steps Timeline */}
        {agentSteps.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-[#151515] border border-[#222] rounded-2xl p-6 shadow-xl mb-8 transition-all">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                Live Pipeline State
              </h3>
              <div className="space-y-4">
                {agentSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="relative flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center shrink-0 z-10">
                        {getStepIcon(step.node)}
                      </div>
                      {idx !== agentSteps.length - 1 && (
                        <div className="w-px h-full bg-[#333] absolute top-8 bottom-0 -mb-4"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <h4 className="font-semibold text-gray-200 tracking-wide text-sm">{formatNodeName(step.node)}</h4>
                      {step.node === 'start' ? (
                        <p className="text-xs text-gray-500 mt-1">{step.message}</p>
                      ) : (
                        <div className="mt-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded p-3 text-xs text-gray-400 font-mono overflow-x-auto">
                          {step.message?.length > 150 ? step.message.substring(0, 147) + '...' : step.message || 'Processing...'}
                        </div>
                      )}
                      
                      {/* Sub-UI for Paywall hit */}
                      {step.payment_required && step.invoice?.amount && (
                        <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-red-400">
                            <ShieldAlert className="w-4 h-4" />
                            <span>Paywall active — demanding <strong>{step.invoice.amount} {step.invoice.currency}</strong></span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Streaming Article Box */}
        {streamedArticle && (
          <div className="max-w-4xl mx-auto mt-8 relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-3xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-[#fafafa] rounded-2xl p-8 md:p-12 shadow-2xl">
              <div className="prose prose-lg max-w-none text-[#1a1a1a]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamedArticle}
                </ReactMarkdown>
              </div>
              {isInvestigating && (
                <div className="flex items-center gap-2 mt-8 text-blue-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input formatting container */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto">
          <form 
            onSubmit={startInvestigation}
            className="relative flex items-center focus-within:ring-2 focus-within:ring-blue-500/50 rounded-2xl bg-[#1a1a1a] border border-[#333] shadow-2xl transition-all"
          >
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isInvestigating}
              placeholder="e.g. Write an investigative piece on Apex Holdings offshore..."
              className="w-full bg-transparent text-gray-200 px-6 py-5 rounded-2xl focus:outline-none placeholder-gray-500 font-medium disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isInvestigating || !topic.trim()}
              className="absolute right-3 p-3 rounded-xl bg-white text-black hover:bg-gray-200 disabled:bg-[#333] disabled:text-gray-500 transition-colors"
            >
              {isInvestigating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </button>
          </form>
          <div className="text-center mt-3">
            <p className="text-xs text-gray-500 font-medium">Responses are generated by AI and may consume Base Sepolia testnet USDC.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
