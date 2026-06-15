import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline';
import { chatAPI, whatsappAPI } from '../../services/api';

const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '';

const formatListTime = (value) => value
  ? new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short' })
  : '';

export default function LiveChat() {
  const [inbox, setInbox] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [conversation, setConversation] = useState({ lead: null, timeline: [] });
  const [whatsapp, setWhatsapp] = useState({});
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timelineRef = useRef(null);
  const phoneTimelineRef = useRef(null);

  const fetchInbox = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [inboxResponse, whatsappResponse] = await Promise.all([
        chatAPI.getInbox({ search, limit: 100, days: 7 }),
        whatsappAPI.getConfig()
      ]);
      const rows = inboxResponse.data.data || [];
      setInbox(rows);
      setWhatsapp(whatsappResponse.data.data || {});
      setSelectedId((current) => current || rows[0]?._id || '');
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not load live chat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchConversation = async (leadId, { quiet = false } = {}) => {
    if (!leadId) return;
    try {
      const response = await chatAPI.getConversation(leadId, { days: 7 });
      setConversation(response.data.data || { lead: null, timeline: [] });
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not load conversation');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => fetchInbox(), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchConversation(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchInbox({ quiet: true });
      if (selectedId) void fetchConversation(selectedId, { quiet: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, search]);

  useEffect(() => {
    for (const ref of [timelineRef, phoneTimelineRef]) {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [conversation.timeline?.length, selectedId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchInbox({ quiet: true }),
      fetchConversation(selectedId, { quiet: true })
    ]);
    setRefreshing(false);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!selectedId || !trimmed || sending) return;

    setSending(true);
    try {
      await chatAPI.sendMessage(selectedId, { message: trimmed });
      setMessage('');
      await Promise.all([
        fetchConversation(selectedId, { quiet: true }),
        fetchInbox({ quiet: true })
      ]);
      toast.success('Message sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const selected = conversation.lead;
  const metaReady = Boolean(whatsapp.isConnected);

  return (
    <div className="live-chat-page flex flex-col gap-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">WhatsApp Inbox</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Live Chat Center</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Handle customer replies from the last 7 days and send WhatsApp messages from one workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${metaReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${metaReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {metaReady ? 'Meta connected' : 'Meta setup required'}
          </span>
          <button type="button" onClick={handleRefresh} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <section className="live-chat-shell grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,43,99,.08)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <aside className="flex h-full min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-950">Conversations</p>
            <label className="relative mt-3 block">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner /></div>
            ) : inbox.length === 0 ? (
              <EmptyState title="No conversations" copy="Customer replies will appear here." />
            ) : inbox.map((item) => (
              <button key={item._id} type="button" onClick={() => setSelectedId(item._id)} className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${selectedId === item._id ? 'bg-emerald-50' : 'hover:bg-white'}`}>
                <Avatar name={item.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm text-slate-950">{item.name || item.phone}</b>
                    <small className="shrink-0 text-[10px] font-bold text-slate-400">{formatListTime(item.lastMessage?.at)}</small>
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium text-slate-500">{item.lastMessage?.text || item.phone}</span>
                  <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-bold capitalize text-slate-500 ring-1 ring-slate-200">{String(item.status || 'new').replace('_', ' ')}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#efeae2]">
          {selected ? (
            <>
              <ChatHeader lead={selected} />
              <div ref={timelineRef} className="chat-scroll-area min-h-0 flex-1 space-y-3 overflow-y-scroll overscroll-contain p-4 sm:p-6">
                <DateChip />
                <MessageList messages={conversation.timeline} />
              </div>
              <Composer message={message} setMessage={setMessage} sending={sending} onSubmit={handleSend} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8"><EmptyState title="Choose a conversation" copy="Select a WhatsApp contact to start chatting." /></div>
          )}
        </main>

        <aside className="hidden h-full min-h-0 overflow-hidden border-l border-slate-200 bg-slate-50/70 p-4 xl:block">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Mobile Preview</p>
          <p className="mt-1 text-sm font-bold text-slate-950">WhatsApp conversation</p>
          <PhonePreview
            lead={selected}
            messages={conversation.timeline}
            scrollRef={phoneTimelineRef}
            message={message}
            setMessage={setMessage}
            sending={sending}
            onSubmit={handleSend}
          />
        </aside>
      </section>
      <style>{`
        .live-chat-page {
          min-height: calc(100dvh - 96px);
        }
        .live-chat-shell {
          height: calc(100dvh - 188px);
          min-height: 650px;
          max-height: calc(100dvh - 132px);
        }
        .chat-scroll-area {
          scrollbar-gutter: stable;
          -webkit-overflow-scrolling: touch;
        }
        @media (max-width: 1279px) {
          .live-chat-shell {
            height: auto;
            min-height: 0;
          }
          .live-chat-shell main {
            height: min(700px, calc(100dvh - 190px));
            min-height: 520px;
          }
        }
      `}</style>
    </div>
  );
}

function ChatHeader({ lead }) {
  return (
    <div className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-black/5 bg-white/90 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={lead.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{lead.name || lead.phone}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-emerald-700">{lead.phone}</p>
        </div>
      </div>
      <PhoneIcon className="h-5 w-5 text-slate-500" />
    </div>
  );
}

function Composer({ message, setMessage, sending, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="flex shrink-0 gap-3 border-t border-black/5 bg-white/95 p-3">
      <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a WhatsApp message..." className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
      <button type="submit" disabled={!message.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#075e54] text-white transition hover:bg-[#064e45] disabled:cursor-not-allowed disabled:opacity-40" title="Send message">
        {sending ? <Spinner small /> : <PaperAirplaneIcon className="h-5 w-5" />}
      </button>
    </form>
  );
}

function MessageList({ messages = [], compact = false }) {
  if (!messages.length) return <p className="py-12 text-center text-xs font-bold text-slate-500">No messages yet</p>;
  return messages.map((item, index) => (
    <div key={item.messageId || `${item.timestamp}-${index}`} className={`flex ${item.from === 'school' ? 'justify-end' : 'justify-start'}`}>
      <div className={`${compact ? 'max-w-[88%] px-2.5 py-2 text-[10px]' : 'max-w-[82%] px-3 py-2 text-sm sm:max-w-[70%]'} rounded-xl shadow-sm ${item.from === 'school' ? 'bg-[#d9fdd3] text-slate-900' : 'bg-white text-slate-900'}`}>
        <p className="whitespace-pre-wrap break-words leading-5">{item.message}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-right font-semibold text-slate-400 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
          {formatTime(item.timestamp)}
          {item.from === 'school' && <CheckIcon className="h-3 w-3 text-emerald-600" />}
        </p>
      </div>
    </div>
  ));
}

function PhonePreview({ lead, messages, scrollRef, message, setMessage, sending, onSubmit }) {
  return (
    <div className="mx-auto mt-4 w-[270px] rounded-[30px] border-[7px] border-slate-900 bg-slate-900 p-1 shadow-[0_18px_40px_rgba(15,23,42,.18)]">
      <div className="flex h-[600px] max-h-[calc(100dvh-270px)] min-h-[520px] flex-col overflow-hidden rounded-[20px] bg-[#efeae2]">
        <div className="flex h-[50px] shrink-0 items-center gap-2 bg-[#075e54] px-3 text-white">
          <Avatar name={lead?.name || 'W'} small />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold">{lead?.name || 'Select a chat'}</p>
            <p className="truncate text-[9px] text-white/70">{lead?.phone || 'WhatsApp Business'}</p>
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
          <DateChip compact />
          <MessageList messages={messages} compact />
        </div>
        <form onSubmit={onSubmit} className="flex h-[48px] shrink-0 items-center gap-2 border-t border-black/5 bg-white/90 px-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!lead}
            placeholder={lead ? 'Message' : 'Select a chat'}
            className="h-8 min-w-0 flex-1 rounded-full border border-slate-100 bg-white px-3 text-[10px] font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300"
          />
          <button
            type="submit"
            disabled={!lead || !message.trim() || sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#075e54] text-white transition disabled:opacity-40"
            title="Send WhatsApp message"
          >
            {sending ? <Spinner small /> : <PaperAirplaneIcon className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function Avatar({ name = '', small = false }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800 ring-1 ring-emerald-200 ${small ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'}`}>{String(name || '?').charAt(0).toUpperCase()}</span>;
}

function DateChip({ compact = false }) {
  return <p className={`mx-auto w-max rounded-lg bg-white/80 px-2 py-1 font-bold text-slate-500 shadow-sm ${compact ? 'text-[8px]' : 'text-[10px]'}`}>Today</p>;
}

function EmptyState({ title, copy }) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ChatBubbleLeftRightIcon className="h-6 w-6" /></span>
      <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{copy}</p>
    </div>
  );
}

function Spinner({ small = false }) {
  return <span className={`block animate-spin rounded-full border-current border-t-transparent ${small ? 'h-4 w-4 border-2' : 'h-8 w-8 border-4 text-emerald-700'}`} />;
}
