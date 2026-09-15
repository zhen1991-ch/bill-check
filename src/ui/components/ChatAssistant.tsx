
import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { chatWithFinancialData } from '../services/backendService';
import { Button } from './Button';
import { ChatMessage, ChatSession, Bill, Category } from '../types';
import { calculateNextDate } from '../services/recurringService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatAssistantProps {
  activeCollectionId: string | null;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ activeCollectionId }) => {
  const { bills, collections, budget, chatSessions, saveChatSession, deleteChatSession, addBill } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  const greetingMsg: ChatMessage = { 
    role: 'ai', 
    content: 'Hi! I can analyze your **recurring bills**, check your **budget**, or give financial advice. Try asking *"Do I have any subscriptions?"*', 
    timestamp: Date.now() 
  };

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isTyping]);

  useEffect(() => {
    if (activeSessionId) {
      const session = chatSessions.find(s => s.id === activeSessionId);
      if (session) setMessages(session.messages);
    } else {
      setMessages([greetingMsg]);
    }
  }, [activeSessionId, chatSessions]);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsSpeechSupported(true);
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' happens if silence is detected (timeout). It's not a critical error.
        // 'aborted' happens if the user stops it manually or focus is lost.
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setIsListening(false);
          return;
        }
        console.error("Speech error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start speech recognition:", e);
        setIsListening(false);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userText = input;
    const timestamp = Date.now();
    const newUserMsg: ChatMessage = { role: 'user', content: userText, timestamp };
    
    setInput('');
    setMessages(prev => [...prev, newUserMsg]);
    setIsTyping(true);

    try {
      // Pass 'messages' as the history (excluding the current new message which is passed as userText)
      const fullResponse = await chatWithFinancialData(
        userText, 
        messages, 
        {
          bills,
          collections,
          budget, // Pass budget context
          activeCollectionId
        }
      );

      // Parse JSON Action if present
      let displayText = fullResponse;
      let actionData = null;

      // Check for |||JSON_START||| ... |||JSON_END||| pattern
      const jsonMatch = fullResponse.match(/\|\|\|JSON_START\|\|\|([\s\S]*?)\|\|\|JSON_END\|\|\|/);
      
      if (jsonMatch) {
        try {
          actionData = JSON.parse(jsonMatch[1]);
          // Remove the JSON block from the text shown to user
          displayText = fullResponse.replace(jsonMatch[0], "").trim();
        } catch (e) {
          console.error("Failed to parse action JSON", e);
        }
      }

      const aiMsg: ChatMessage = { 
        role: 'ai', 
        content: displayText, 
        timestamp: Date.now(),
        actionData 
      };
      
      const updatedMessages = [...messages, newUserMsg, aiMsg];
      setMessages(updatedMessages);
      saveSession(updatedMessages, userText);

    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, error processing request.", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const saveSession = async (msgs: ChatMessage[], lastUserText: string) => {
    let sessionId = activeSessionId;
    let title = 'New Chat';

    if (!sessionId) {
      sessionId = `chat_${Date.now()}`;
      title = lastUserText.split(' ').slice(0, 4).join(' ') + '...';
      setActiveSessionId(sessionId);
    } else {
      const existing = chatSessions.find(s => s.id === sessionId);
      if (existing) title = existing.title;
    }

    const sessionToSave: ChatSession = {
      id: sessionId,
      title,
      messages: msgs,
      updatedAt: Date.now()
    };
    await saveChatSession(sessionToSave);
  };

  const handleConfirmBill = async (data: any) => {
    try {
      const isRecurring = data.recurring && data.recurring !== 'none';
      
      // Calculate next date if recurring
      const nextDate = isRecurring ? calculateNextDate(data.date, data.recurring) : null;

      const newBill: Bill = {
        id: Date.now().toString(),
        merchantName: data.merchantName,
        amount: data.amount,
        currency: data.currency,
        category: data.category as Category,
        date: data.date,
        items: [],
        isTaxRelevant: false,
        collectionIds: [],
        recurring: data.recurring || 'none',
        nextRecurringDate: nextDate, // IMPORTANT: Set this so it shows up in Recurring Expenses
        createdAt: Date.now()
      };
      await addBill(newBill);
      
      // Add success message to chat
      const successContent = isRecurring
        ? `✅ Saved recurring bill for **${data.merchantName}** (${data.recurring}).`
        : `✅ Saved bill for **${data.merchantName}** (${data.currency}${data.amount}).`;

      const successMsg: ChatMessage = { 
        role: 'ai', 
        content: successContent, 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, successMsg]);
      saveSession([...messages, successMsg], "");
      
    } catch (e) {
      alert("Failed to save bill.");
    }
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([greetingMsg]);
    setShowHistory(false);
  };

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setShowHistory(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-xl shadow-indigo-300/50 flex items-center justify-center text-white hover:scale-105 transition-transform active:scale-95 ring-4 ring-white/20"
      >
        <i className="fas fa-robot text-xl"></i>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>

      <div className="relative w-full h-[85vh] sm:h-[600px] sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 antialiased">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between shrink-0 shadow-md z-20 relative">
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowHistory(!showHistory)} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <i className={`fas ${showHistory ? 'fa-times' : 'fa-bars'}`}></i>
            </button>
            <div>
              <h3 className="font-bold text-base leading-tight truncate max-w-[150px]">
                {activeSessionId ? chatSessions.find(s => s.id === activeSessionId)?.title || 'Chat' : 'New Chat'}
              </h3>
              <p className="text-xs text-indigo-100 font-medium opacity-90">BillCheck AI</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={startNewChat} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><i className="fas fa-plus text-sm"></i></button>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><i className="fas fa-chevron-down text-sm"></i></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {/* History Sidebar */}
          {showHistory && (
            <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm overflow-y-auto animate-in slide-in-from-left-5 duration-200 flex flex-col">
              <div className="p-4 border-b border-slate-100"><h3 className="text-xs font-bold text-slate-400 uppercase">History</h3></div>
              <div className="p-2 space-y-1">
                {chatSessions.map(session => (
                  <div key={session.id} onClick={() => selectSession(session.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${activeSessionId === session.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}>
                    <span className="truncate text-sm font-medium">{session.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteChatSession(session.id); }} className="text-slate-300 hover:text-red-500"><i className="fas fa-times text-xs"></i></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50 scroll-smooth">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.content && (
                   <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'}`}>
                      {msg.role === 'ai' ? (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                             ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                             ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                             li: ({node, ...props}) => <li className="" {...props} />,
                             p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                             strong: ({node, ...props}) => <span className="font-bold text-slate-900" {...props} />,
                             a: ({node, ...props}) => <a className="text-indigo-600 underline" {...props} />,
                             h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2" {...props} />,
                             h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2" {...props} />,
                             h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1" {...props} />,
                             code: ({node, ...props}) => <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono text-slate-600" {...props} />,
                             table: ({node, ...props}) => <div className="overflow-x-auto my-2"><table className="min-w-full text-left text-xs" {...props} /></div>,
                             th: ({node, ...props}) => <th className="bg-slate-100 p-2 font-semibold" {...props} />,
                             td: ({node, ...props}) => <td className="p-2 border-b border-slate-100" {...props} />
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                   </div>
                )}
                
                {/* Draft Bill Card */}
                {msg.actionData && msg.actionData.action === 'create_bill' && (
                   <div className="mt-2 w-64 bg-white border border-indigo-100 rounded-xl shadow-lg overflow-hidden animate-in zoom-in-95 duration-300">
                      <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center">
                         <span className="text-xs font-bold text-indigo-700 uppercase">Draft Bill</span>
                         <i className="fas fa-receipt text-indigo-400"></i>
                      </div>
                      <div className="p-4 text-sm text-slate-700 space-y-2">
                         <div className="flex justify-between">
                            <span className="text-slate-500">Merchant</span>
                            <span className="font-semibold">{msg.actionData.data.merchantName}</span>
                         </div>
                         <div className="flex justify-between">
                            <span className="text-slate-500">Amount</span>
                            <span className="font-bold text-slate-900">{msg.actionData.data.currency} {msg.actionData.data.amount}</span>
                         </div>
                         <div className="flex justify-between">
                            <span className="text-slate-500">Date</span>
                            <span>{msg.actionData.data.date}</span>
                         </div>
                         <div className="flex justify-between">
                            <span className="text-slate-500">Category</span>
                            <span className="bg-slate-100 px-2 rounded text-xs">{msg.actionData.data.category}</span>
                         </div>
                         {/* Recurring Status Badge */}
                         {msg.actionData.data.recurring && msg.actionData.data.recurring !== 'none' && (
                             <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-purple-600">
                                <span className="text-xs font-bold uppercase">Subscription</span>
                                <span className="text-xs bg-purple-100 px-2 py-1 rounded capitalize">
                                   <i className="fas fa-sync-alt mr-1"></i>{msg.actionData.data.recurring}
                                </span>
                             </div>
                         )}
                      </div>
                      <div className="p-2 bg-slate-50 flex space-x-2">
                         <Button size="sm" fullWidth onClick={() => handleConfirmBill(msg.actionData.data)}>Confirm</Button>
                      </div>
                   </div>
                )}
              </div>
            ))}
            {isTyping && <div className="text-slate-400 text-xs ml-4">AI is typing...</div>}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-slate-100 shrink-0 pb-safe z-10">
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type or speak..."
                className="flex-1 bg-white border border-slate-200 text-slate-900 text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              />
              
              {isSpeechSupported && (
                <button 
                  onClick={toggleListening}
                  className={`w-12 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  title="Voice Input"
                >
                  <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                </button>
              )}

              <Button onClick={handleSend} disabled={!input.trim() || isTyping} className="rounded-xl w-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white">
                 <i className="fas fa-paper-plane"></i>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
