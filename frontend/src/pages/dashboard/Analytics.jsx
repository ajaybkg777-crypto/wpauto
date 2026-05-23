import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  BoltIcon,
  ChartBarIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EyeIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { schoolAPI, whatsappAPI } from '../../services/api';

const emptyStats = {
  analytics: {},
  messageLedger: {},
  limits: {},
  broadcasts: {},
  templates: {},
  automations: {},
  leads: {},
  whatsapp: {}
};

export default function Analytics() {
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const fetchingRef = useRef(false);

  const fetchAnalytics = async ({ background = false } = {}) => {
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    if (!background) setRefreshing(true);

    try {
      const [statsResponse, whatsappResponse] = await Promise.all([
        schoolAPI.getStats(),
        whatsappAPI.getConfig()
      ]);
      setStats({
        ...emptyStats,
        ...(statsResponse.data.data || {}),
        whatsapp: {
          ...(statsResponse.data.data?.whatsapp || {}),
          ...(whatsappResponse.data.data || {})
        }
      });
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchAnalytics();

    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchAnalytics({ background: true });
    }, 15000);

    const onFocus = () => void fetchAnalytics({ background: true });
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const sent = stats.analytics?.totalMessagesSent || 0;
  const delivered = stats.analytics?.totalMessagesDelivered || 0;
  const read = stats.analytics?.totalMessagesRead || 0;
  const customerReplies = stats.messageLedger?.inbound || 0;
  const safePercent = (value, total) => {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  };
  const deliveryRate = safePercent(delivered, sent);
  const readRate = safePercent(read, delivered || sent);
  const replyRate = safePercent(customerReplies, sent);
  const analyticsOutOfSync = read > Math.max(delivered, sent) || delivered > sent;
  const usagePercent = Math.min(
    Math.round(((stats.limits?.messagesUsedToday || 0) / (stats.limits?.maxMessagesPerDay || 1)) * 100),
    100
  );
  const templateApprovalRate = stats.templates?.total
    ? Math.round(((stats.templates?.approved || 0) / stats.templates.total) * 100)
    : 0;
  const automationRate = stats.automations?.total
    ? Math.round(((stats.automations?.active || 0) / stats.automations.total) * 100)
    : 0;

  const whatsapp = stats.whatsapp || {};
  const metaReady = Boolean(whatsapp.isConnected);
  const metaVerified = whatsapp.businessVerificationStatus === 'verified'
    || whatsapp.accountReviewStatus === 'APPROVED';

  const kpis = [
    { label: 'Sent', value: sent, icon: PaperAirplaneIcon, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
    { label: 'Delivered', value: delivered, icon: CheckCircleIcon, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    { label: 'Read', value: read, icon: EyeIcon, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
    { label: 'Customer Replies', value: customerReplies, icon: ChatBubbleBottomCenterTextIcon, tone: 'bg-slate-100 text-slate-800 ring-slate-200' }
  ];

  const flowRows = useMemo(() => [
    { label: 'Sent', value: sent, color: 'bg-slate-900' },
    { label: 'Delivered', value: delivered, color: 'bg-emerald-500' },
    { label: 'Read', value: read, color: 'bg-blue-500' },
    { label: 'Customer Replies', value: customerReplies, color: 'bg-amber-400' }
  ], [customerReplies, delivered, read, sent]);
  const performanceSummary = [
    { label: 'Best Metric', value: analyticsOutOfSync ? 'Syncing' : deliveryRate >= readRate ? 'Delivery' : 'Read Rate', detail: analyticsOutOfSync ? 'Meta counters updating' : `${Math.max(deliveryRate, readRate)}%` },
    { label: 'Audience Size', value: stats.leads?.total || 0, detail: `${stats.leads?.interested || 0} interested` },
    { label: 'Message Limit', value: `${usagePercent}%`, detail: `${stats.limits?.messagesUsedToday || 0}/${stats.limits?.maxMessagesPerDay || 0} used` }
  ];

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm font-semibold text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Analytics</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">WhatsApp Performance</h1>
          <p className="mt-1 text-sm text-gray-600">School-scoped Meta, broadcast, contact, and automation metrics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${
            metaReady ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'
          }`}>
            <span className={`h-2.5 w-2.5 rounded-full ${metaReady ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            {metaReady ? 'Meta connected' : 'Meta setup needed'}
          </span>
          <button
            type="button"
            onClick={() => fetchAnalytics()}
            className="btn-outline inline-flex w-max items-center justify-center gap-2 rounded-2xl"
            disabled={refreshing}
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {performanceSummary.map((item) => (
          <div key={item.label} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-[0_14px_34px_rgba(7,94,84,.05)]">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-gray-950">{item.value}</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-[0_18px_46px_rgba(7,94,84,.07)]">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_.9fr]">
          <div className="relative overflow-hidden bg-gradient-primary p-6 text-white">
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-50">
                <ShieldCheckIcon className="h-4 w-4" />
                Meta Analytics
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {metaReady ? 'Live WhatsApp analytics connected' : 'Connect Meta for live delivery tracking'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                {metaReady
                  ? `${whatsapp.displayName || 'Your WhatsApp Business'} is linked${metaVerified ? ' and verified' : ', with verification still pending'}.`
                  : 'Analytics will become more useful once your Meta WhatsApp Business number is connected.'}
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                <HeroTile label="Phone Number" value={whatsapp.phoneNumber || 'Not linked'} />
                <HeroTile label="Verification" value={metaVerified ? 'Verified' : metaReady ? 'Review pending' : 'Not connected'} />
                <HeroTile label="Quality" value={formatQuality(whatsapp.qualityRating)} />
              </div>
            </div>
          </div>
          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-950">Engagement Rates</h2>
            <p className="mt-1 text-sm text-gray-600">High-level ratios from sent message volume.</p>
            <div className="mt-5 space-y-3">
              <RateBar label="Delivery Rate" value={deliveryRate} />
              <RateBar label={analyticsOutOfSync ? 'Read Sync' : 'Read Rate'} value={readRate} color="bg-blue-500" />
              <RateBar label="Reply Rate" value={replyRate} color="bg-amber-400" />
            </div>
          </div>
        </div>
      </section>

      <SectionHeader title="Core Metrics" copy="Message activity directly from the workspace database." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((card) => (
          <div key={card.label} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-[0_14px_34px_rgba(7,94,84,.06)] transition hover:-translate-y-0.5 hover:border-emerald-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{card.value}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionHeader title="Performance Breakdown" copy="Conversion from sent messages into delivery, reads, and replies." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_14px_34px_rgba(7,94,84,.06)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Message Funnel</h2>
              <p className="text-sm text-gray-600">Track how messages move from sent to read and replies.</p>
            </div>
            <ChartBarIcon className="h-6 w-6 text-primary" />
          </div>
          <MiniBarChart rows={flowRows} />
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_14px_34px_rgba(7,94,84,.06)]">
          <h2 className="text-lg font-bold text-gray-950">Operational Health</h2>
          <div className="mt-5 space-y-4">
            <RateBar label="Daily Usage" value={usagePercent} color={usagePercent > 75 ? 'bg-amber-400' : 'bg-primary'} />
            <RateBar label="Template Approval" value={templateApprovalRate} />
            <RateBar label="Automation Active" value={automationRate} color="bg-blue-500" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SmallTile label="Contacts" value={stats.leads?.total || 0} icon={UsersIcon} />
            <SmallTile label="Campaigns" value={stats.broadcasts?.total || 0} icon={MegaphoneIcon} />
            <SmallTile label="Templates" value={stats.templates?.total || 0} icon={DocumentTextIcon} />
            <SmallTile label="Automations" value={stats.automations?.total || 0} icon={BoltIcon} />
          </div>
        </div>
      </div>

      <p className="text-center text-xs font-semibold text-gray-400">
        Analytics are scoped to this school workspace and its Meta phone number ID.
      </p>
    </div>
  );
}

function HeroTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-white/5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function SectionHeader({ title, copy }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-bold tracking-tight text-gray-950">{title}</h2>
      <p className="text-sm text-gray-600">{copy}</p>
    </div>
  );
}

function RateBar({ label, value, color = 'bg-emerald-500' }) {
  const percent = Math.max(0, Math.min(Number(value) || 0, 100));

  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-gray-600">{label}</span>
        <span className="font-bold text-gray-950">{percent}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200/70">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MiniBarChart({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const value = Number(row.value) || 0;
        const width = value ? Math.max(8, Math.round((value / max) * 100)) : 2;

        return (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-gray-600">{row.label}</span>
              <span className="font-bold text-gray-950">{value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-200/70">
              <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SmallTile({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function formatRelativeTime(value) {
  if (!value) return '';

  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function formatQuality(value) {
  if (!value) return 'Not available';
  return String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
