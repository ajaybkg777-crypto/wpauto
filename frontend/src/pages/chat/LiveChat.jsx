import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClockIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
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

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'New', value: 'new' },
  { label: 'Interested', value: 'interested' },
  { label: 'Pending', value: 'pending' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Converted', value: 'converted' },
  { label: 'Broadcast', value: 'broadcast' }
];

export default function LiveChat() {
  const [inbox, setInbox] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [conversation, setConversation] = useState({ lead: null, timeline: [] });
  const [whatsapp, setWhatsapp] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [inboxMeta, setInboxMeta] = useState({ total: 0, windowDays: 7 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const timelineRef = useRef(null);
  const phoneTimelineRef = useRef(null);
  const inboxRequestRef = useRef(0);
  const conversationRequestRef = useRef(0);
  const latestTimelineCountRef = useRef(0);
  const previousSelectedIdRef = useRef('');
  const shouldStickToBottomRef = useRef(true);

  const scrollTimelinesToBottom = useCallback((behavior = 'auto') => {
    window.requestAnimationFrame(() => {
      for (const ref of [timelineRef, phoneTimelineRef]) {
        if (ref.current) {
          ref.current.scrollTo({ top: ref.current.scrollHeight, behavior });
        }
      }
    });
  }, []);

  const updateStickiness = useCallback(() => {
    const node = timelineRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 96;
    if (distanceFromBottom < 96) setShowJumpToLatest(false);
  }, []);

  const fetchWhatsAppConfig = useCallback(async ({ quiet = false } = {}) => {
    try {
      const response = await whatsappAPI.getConfig();
      setWhatsapp(response.data.data || {});
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not load WhatsApp setup');
    }
  }, []);

  const fetchInbox = useCallback(async ({ quiet = false } = {}) => {
    const requestId = inboxRequestRef.current + 1;
    inboxRequestRef.current = requestId;
    if (!quiet) setLoading(true);
    try {
      const inboxResponse = await chatAPI.getInbox({ search, status: statusFilter, limit: 100, days: 7 });
      if (requestId !== inboxRequestRef.current) return;
      const rows = inboxResponse.data.data || [];
      setInbox(rows);
      setInboxMeta({
        total: inboxResponse.data.total ?? rows.length,
        windowDays: inboxResponse.data.windowDays || 7
      });
      setSelectedId((current) => {
        if (current && rows.some((row) => row._id === current)) return current;
        return rows[0]?._id || '';
      });
      setLastUpdated(new Date());
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not load live chat');
    } finally {
      if (requestId === inboxRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [search, statusFilter]);

  const fetchConversation = useCallback(async (leadId, { quiet = false } = {}) => {
    if (!leadId) {
      setConversation({ lead: null, timeline: [] });
      return;
    }
    const requestId = conversationRequestRef.current + 1;
    conversationRequestRef.current = requestId;
    if (!quiet) setConversationLoading(true);
    try {
      const response = await chatAPI.getConversation(leadId, { days: 7 });
      if (requestId !== conversationRequestRef.current) return;
      setConversation(response.data.data || { lead: null, timeline: [] });
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Could not load conversation');
    } finally {
      if (requestId === conversationRequestRef.current) setConversationLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchInbox(), 250);
    return () => window.clearTimeout(timer);
  }, [fetchInbox]);

  useEffect(() => {
    fetchWhatsAppConfig();
  }, [fetchWhatsAppConfig]);

  useEffect(() => {
    fetchConversation(selectedId);
  }, [fetchConversation, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchInbox({ quiet: true });
      if (selectedId) void fetchConversation(selectedId, { quiet: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchConversation, fetchInbox, selectedId]);

  useEffect(() => {
    const nextCount = conversation.timeline?.length || 0;
    const selectedChanged = previousSelectedIdRef.current !== selectedId;
    const countIncreased = nextCount > latestTimelineCountRef.current;

    if (selectedChanged) {
      previousSelectedIdRef.current = selectedId;
      shouldStickToBottomRef.current = true;
      latestTimelineCountRef.current = nextCount;
      scrollTimelinesToBottom();
      setShowJumpToLatest(false);
      return;
    }

    latestTimelineCountRef.current = nextCount;

    if (shouldStickToBottomRef.current) {
      scrollTimelinesToBottom();
      setShowJumpToLatest(false);
      return;
    }

    if (countIncreased) setShowJumpToLatest(true);
  }, [conversation.timeline?.length, scrollTimelinesToBottom, selectedId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchWhatsAppConfig({ quiet: true }),
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
      scrollTimelinesToBottom('smooth');
      toast.success('Message sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const selected = conversation.lead;
  const metaReady = Boolean(whatsapp.isConnected);
  const timeline = conversation.timeline || [];
  const lastInbound = useMemo(() => [...timeline]
    .reverse()
    .find((item) => item.from === 'user' && item.timestamp), [timeline]);
  const lastInboundAt = lastInbound?.timestamp ? new Date(lastInbound.timestamp) : null;
  const canReply = Boolean(lastInboundAt && Date.now() - lastInboundAt.getTime() <= 24 * 60 * 60 * 1000);
  const disabledReason = !selected
    ? 'Select a conversation'
    : !metaReady
      ? 'Connect Meta WhatsApp before replying'
      : !canReply
        ? 'Free-text replies need a customer message in the last 24 hours'
        : '';
  const inboxSummary = useMemo(() => {
    const needsReply = inbox.filter((item) => item.lastMessage?.from !== 'school').length;
    const outbound = inbox.length - needsReply;
    return { outbound, needsReply };
  }, [inbox]);

  return (
    <div className="live-chat-page flex flex-col gap-5">
      <header className="live-chat-header flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">WhatsApp Inbox</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Live Chat Center</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Handle customer replies, inspect lead context, and send WhatsApp messages from one workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${metaReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${metaReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {metaReady ? 'Meta connected' : 'Meta setup required'}
          </span>
          <button type="button" onClick={handleRefresh} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {lastUpdated ? `Updated ${formatRelative(lastUpdated)}` : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Conversations" value={inboxMeta.total} detail={`Last ${inboxMeta.windowDays} days`} icon={ChatBubbleLeftRightIcon} />
        <MetricCard label="Needs Reply" value={inboxSummary.needsReply} detail="Latest message from customer" icon={EnvelopeIcon} tone="emerald" />
        <MetricCard label="Agent Replies" value={inboxSummary.outbound} detail="Latest message from workspace" icon={PaperAirplaneIcon} tone="slate" />
        <MetricCard label="Reply Window" value={canReply ? 'Open' : 'Limited'} detail={lastInboundAt ? formatRelative(lastInboundAt) : 'No inbound message'} icon={ClockIcon} tone={canReply ? 'emerald' : 'amber'} />
      </section>

      <section className="live-chat-shell grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,43,99,.08)] lg:grid-cols-[300px_minmax(0,1fr)_280px] xl:grid-cols-[340px_minmax(0,1fr)_310px]">
        <aside className="flex h-full min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-950">Conversations</p>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{inbox.length} shown</span>
            </div>
            <label className="relative mt-3 block">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
            </label>
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
              <FunnelIcon className="h-4 w-4 shrink-0 text-slate-400" />
              {statusOptions.map((option) => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    statusFilter === option.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-emerald-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="conversation-list min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner /></div>
            ) : inbox.length === 0 ? (
              <EmptyState title="No conversations" copy="Customer replies will appear here." />
            ) : inbox.map((item) => (
              <button key={item._id} type="button" onClick={() => setSelectedId(item._id)} className={`conversation-row flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${selectedId === item._id ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-100' : 'hover:bg-white'}`}>
                <Avatar name={item.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm text-slate-950">{item.name || item.phone}</b>
                    <small className="shrink-0 text-[10px] font-bold text-slate-400">{formatListTime(item.lastMessage?.at)}</small>
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium text-slate-500">{item.lastMessage?.text || item.phone}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={item.status} />
                    {item.messageCount ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{item.messageCount} msgs</span> : null}
                    {item.lastMessage?.from !== 'school' ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">reply</span> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#efeae2]">
          {selected ? (
            <>
              <ChatHeader lead={selected} conversationLoading={conversationLoading} />
              {disabledReason && (
                <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{disabledReason}</span>
                </div>
              )}
              <div ref={timelineRef} onScroll={updateStickiness} className="chat-scroll-area min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <DateChip />
                {conversationLoading && !timeline.length ? <MessageSkeleton /> : <MessageList messages={timeline} />}
                <Composer message={message} setMessage={setMessage} sending={sending} onSubmit={handleSend} disabledReason={disabledReason} inline />
              </div>
              {showJumpToLatest && (
                <button type="button" onClick={() => scrollTimelinesToBottom('smooth')} className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-slate-800">
                  New messages
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8"><EmptyState title="Choose a conversation" copy="Select a WhatsApp contact to start chatting." /></div>
          )}
        </main>

        <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50/70 p-2 lg:flex xl:p-3">
          <PhonePreview
            lead={selected}
            messages={timeline}
            scrollRef={phoneTimelineRef}
            message={message}
            setMessage={setMessage}
            sending={sending}
            onSubmit={handleSend}
            disabledReason={disabledReason}
          />
        </aside>
      </section>
      <style>{`
        .live-chat-page {
          min-height: calc(100dvh - 96px);
        }
        .live-chat-header {
          border: 1px solid rgba(226,232,240,.95);
          border-radius: 24px;
          background: rgba(255,255,255,.88);
          box-shadow: 0 18px 42px rgba(15,23,42,.06);
          padding: 18px;
          backdrop-filter: blur(16px);
        }
        .live-chat-shell {
          height: clamp(500px, calc(100dvh - 286px), 760px);
          min-height: 0;
        }
        .live-chat-shell main {
          background:
            linear-gradient(45deg, rgba(7,94,84,.035) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(7,94,84,.035) 25%, transparent 25%),
            #efeae2;
          background-size: 18px 18px;
        }
        .conversation-list,
        .chat-scroll-area,
        .phone-scroll {
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: rgba(7,94,84,.34) transparent;
        }
        .chat-scroll-area {
          -webkit-overflow-scrolling: touch;
        }
        .conversation-row {
          content-visibility: auto;
          contain-intrinsic-size: 74px;
        }
        @media (max-width: 1279px) {
          .live-chat-shell {
            height: auto;
            min-height: 0;
          }
          .live-chat-shell main {
            height: clamp(430px, calc(100dvh - 180px), 680px);
            min-height: 0;
          }
        }
      `}</style>
    </div>
  );
}

function ChatHeader({ lead, conversationLoading = false }) {
  return (
    <div className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-black/5 bg-white/90 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={lead.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{lead.name || lead.phone}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-emerald-700">{lead.phone}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {conversationLoading && <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,.14)]" />}
        <PhoneIcon className="h-5 w-5 text-slate-500" />
      </div>
    </div>
  );
}

function Composer({ message, setMessage, sending, onSubmit, disabledReason = '', inline = false }) {
  return (
    <form onSubmit={onSubmit} className={`${inline ? 'mt-4 rounded-2xl border border-black/5 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,.08)]' : 'sticky bottom-0 z-10 border-t border-black/5 bg-white/95 shadow-[0_-10px_24px_rgba(15,23,42,.08)]'} flex shrink-0 items-end gap-3 p-3 backdrop-blur`}>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason || 'Type a WhatsApp message...'}
        rows={1}
        className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-5 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <button type="submit" disabled={Boolean(disabledReason) || !message.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#075e54] text-white transition hover:bg-[#064e45] disabled:cursor-not-allowed disabled:opacity-40" title="Send message">
        {sending ? <Spinner small /> : <PaperAirplaneIcon className="h-5 w-5" />}
      </button>
    </form>
  );
}

const MessageList = memo(function MessageList({ messages = [], compact = false }) {
  if (!messages.length) return <p className="py-12 text-center text-xs font-bold text-slate-500">No messages yet</p>;
  return messages.map((item, index) => (
    <div key={item.messageId || `${item.timestamp}-${index}`} className={`flex ${item.from === 'school' ? 'justify-end' : 'justify-start'}`}>
      <div className={`${compact ? 'max-w-[88%] px-2.5 py-2 text-[10px]' : 'max-w-[82%] px-3 py-2 text-sm sm:max-w-[70%]'} rounded-xl shadow-sm ${item.from === 'school' ? 'bg-[#d9fdd3] text-slate-900' : 'bg-white text-slate-900'}`}>
        <p className="whitespace-pre-wrap break-words leading-5">{item.message}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-right font-semibold text-slate-400 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
          {formatTime(item.timestamp)}
          {item.from === 'school' && (
            <>
              <CheckIcon className={`h-3 w-3 ${item.status === 'failed' ? 'text-rose-500' : 'text-emerald-600'}`} />
              {!compact && <span className="capitalize">{String(item.status || 'sent')}</span>}
            </>
          )}
        </p>
      </div>
    </div>
  ));
});

function MessageSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className={`flex ${item % 2 ? 'justify-end' : 'justify-start'}`}>
          <div className={`h-14 animate-pulse rounded-xl bg-white/70 shadow-sm ${item % 2 ? 'w-48 bg-emerald-100/70' : 'w-56'}`} />
        </div>
      ))}
    </div>
  );
}

function PhonePreview({ lead, messages, scrollRef, message, setMessage, sending, onSubmit, disabledReason = '' }) {
  return (
    <div className="mx-auto mt-0 w-[204px] rounded-[26px] border-[6px] border-slate-900 bg-slate-900 p-1 shadow-[0_18px_40px_rgba(15,23,42,.18)] xl:w-[224px]">
      <div className="flex h-[372px] flex-col overflow-hidden rounded-[17px] bg-[#efeae2] xl:h-[424px]">
        <div className="flex h-[46px] shrink-0 items-center gap-2 bg-[#075e54] px-3 text-white">
          <Avatar name={lead?.name || 'W'} small />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold">{lead?.name || 'Select a chat'}</p>
            <p className="truncate text-[9px] text-white/70">{lead?.phone || 'WhatsApp Business'}</p>
          </div>
        </div>
        <div ref={scrollRef} className="phone-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
          <DateChip compact />
          <MessageList messages={messages} compact />
        </div>
        <form onSubmit={onSubmit} className="flex h-[48px] shrink-0 items-center gap-2 border-t border-black/5 bg-white/90 px-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!lead || Boolean(disabledReason)}
            placeholder={lead ? 'Message' : 'Select a chat'}
            className="h-8 min-w-0 flex-1 rounded-full border border-slate-100 bg-white px-3 text-[10px] font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300"
          />
          <button
            type="submit"
            disabled={!lead || Boolean(disabledReason) || !message.trim() || sending}
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

function MetricCard({ label, value, detail, icon: Icon, tone = 'primary' }) {
  const toneClass = {
    primary: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    emerald: 'bg-green-50 text-green-700 ring-green-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200'
  }[tone] || 'bg-emerald-50 text-emerald-700 ring-emerald-100';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{typeof value === 'number' ? formatNumber(value) : value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = {
    interested: 'bg-emerald-100 text-emerald-700 ring-emerald-100',
    converted: 'bg-green-100 text-green-700 ring-green-100',
    pending: 'bg-amber-100 text-amber-700 ring-amber-100',
    follow_up: 'bg-blue-100 text-blue-700 ring-blue-100',
    not_interested: 'bg-slate-100 text-slate-600 ring-slate-200',
    broadcast: 'bg-purple-50 text-purple-700 ring-purple-100'
  }[status] || 'bg-white text-slate-500 ring-slate-200';

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ring-1 ${tone}`}>
      {formatStatus(status)}
    </span>
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

function formatStatus(value) {
  return String(value || 'new').replace(/_/g, ' ');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatRelative(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}
