import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import ProfileMenu from "../../components/common/ProfileMenu";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const Messages = () => {
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const token       = localStorage.getItem("token");
  const currentId   = localStorage.getItem("user_id");
  const headers     = { Authorization: `Bearer ${token}` };
  const bottomRef   = useRef(null);

  const [conversations, setConversations]  = useState([]);
  const [activePartner, setActivePartner]  = useState(params.get("partner") || null);
  const [messages,      setMessages]       = useState([]);
  const [newMsg,        setNewMsg]         = useState("");
  const [sending,       setSending]        = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/messages/conversations`, { headers })
      .then(r => setConversations(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activePartner) return;
    axios.get(`${API}/api/messages/thread/${activePartner}`, { headers })
      .then(r => { setMessages(r.data); scrollToBottom(); })
      .catch(() => {});
  }, [activePartner]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSend = async () => {
    if (!newMsg.trim() || !activePartner) return;
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/api/messages`, {
        recipient_id: activePartner,
        content: newMsg.trim(),
      }, { headers });
      setMessages(prev => [...prev, data]);
      setNewMsg("");
    } catch { toast.error("Erro ao enviar mensagem."); }
    finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm flex-shrink-0">
        <Logo size="sm" />
        <div className="flex items-center gap-3"><LanguageSwitcher /><ProfileMenu /></div>
      </nav>

      <div className="flex flex-1 overflow-hidden max-w-5xl mx-auto w-full">
        {/* Conversations list */}
        <div className="w-72 bg-white border-r border-slate-100 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-navy">Mensagens</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">Nenhuma conversa ainda</div>
            ) : (
              conversations.map(conv => (
                <button key={conv.partner_id} onClick={() => setActivePartner(conv.partner_id)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 ${activePartner === conv.partner_id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-navy truncate">{conv.partner_name}</p>
                    {conv.unread_count > 0 && (
                      <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 flex-shrink-0">{conv.unread_count}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.last_message}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message thread */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activePartner ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <MessageSquare size={48} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-400 font-medium">Selecione uma conversa</p>
                <p className="text-xs text-slate-300 mt-1">ou inicie uma nova a partir de um agendamento</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
                <button onClick={() => setActivePartner(null)} className="text-slate-400 hover:text-slate-600 sm:hidden">
                  <ArrowLeft size={18} />
                </button>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                  {(conversations.find(c => c.partner_id === activePartner)?.partner_name || "?")[0]}
                </div>
                <p className="font-semibold text-navy text-sm">
                  {conversations.find(c => c.partner_id === activePartner)?.partner_name || "Conversa"}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_id === currentId ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs sm:max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender_id === currentId
                        ? "bg-blue-500 text-white rounded-br-sm"
                        : "bg-white text-navy border border-slate-200 rounded-bl-sm"
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.sender_id === currentId ? "text-blue-200" : "text-slate-400"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="bg-white border-t border-slate-100 p-4 flex gap-3">
                <input
                  className="form-input flex-1"
                  placeholder="Digite uma mensagem..."
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  maxLength={2000}
                />
                <button onClick={handleSend} disabled={sending || !newMsg.trim()}
                  className="btn-primary px-4 py-2 flex-shrink-0 disabled:opacity-60">
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;