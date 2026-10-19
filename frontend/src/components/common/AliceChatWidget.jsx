import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X, Send, Bot, User, ExternalLink } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const AliceChatWidget = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "alice", text: t("alice_chat.initial_message") }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const quickTopics = [
    { label: t("alice_chat.topics.terms"), query: t("alice_chat.queries.terms") },
    { label: t("alice_chat.topics.privacy"), query: t("alice_chat.queries.privacy") },
    { label: t("alice_chat.topics.cancellation"), query: t("alice_chat.queries.cancellation") },
    { label: t("alice_chat.topics.payments"), query: t("alice_chat.queries.payments") },
  ];

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: "user", text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await axios.post(`${API}/api/alice/chat`, { message: text.trim() });
      const aliceMsg = { role: "alice", text: data.response, sources: data.sources, escalate: data.escalate };
      setMessages(prev => [...prev, aliceMsg]);
    } catch {
      setMessages(prev => [...prev, { role: "alice", text: t("alice_chat.error_message") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all hover:scale-105 flex items-center justify-center">
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-4rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <div>
                <p className="font-semibold text-sm">Alice</p>
                <p className="text-xs text-blue-200">{t("alice_chat.subtitle")}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-blue-500 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white text-slate-700 border border-slate-200 rounded-bl-sm shadow-sm"
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  {msg.sources?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-400 mb-1">{t("alice_chat.sources")}</p>
                      {msg.sources.map((s, j) => (
                        <span key={j} className="text-xs text-blue-500 mr-2">{s.title}</span>
                      ))}
                    </div>
                  )}
                  {msg.escalate && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <a href="mailto:suporte@cuidau.com.br" className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                        <ExternalLink size={10} /> {t("alice_chat.contact_support")}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick topics (shown only when few messages) */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto flex-shrink-0">
              {quickTopics.map(topic => (
                <button key={topic.label} onClick={() => sendMessage(topic.query)}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 font-medium hover:bg-blue-100 whitespace-nowrap flex-shrink-0 transition-colors">
                  {topic.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-white border-t border-slate-100 flex-shrink-0">
            <div className="flex gap-2">
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && sendMessage(input)}
                placeholder={t("alice_chat.input_placeholder")}
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 transition-colors"
                disabled={loading} />
              <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
                className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              {t("alice_chat.footer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AliceChatWidget;