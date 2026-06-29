import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { schoolAPI, whatsappAPI } from '../../services/api';
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  MegaphoneIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon
} from '@heroicons/react/24/outline';

const emptyStats = {
  leads: {},
  broadcasts: {},
  templates: {},
  automations: {},
  analytics: {},
  messageLedger: {},
  limits: {},
  subscription: {},
  school: {},
  whatsapp: {}
};

export default function Dashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const isFetchingRef = useRef(false);

  const whatsapp = stats.whatsapp || {};
  const school = stats.school || {};
  const metaSync = whatsapp.sync || {};
  const businessName = school.name || whatsapp.displayName || whatsapp.appName || 'Your Business';
  const rawMetaDisplayName = whatsapp.displayName || '';
  const isTestMetaDisplay = /^waauto test school$/i.test(rawMetaDisplayName);
  const metaDisplayName = rawMetaDisplayName && !isTestMetaDisplay ? rawMetaDisplayName : businessName;
  const businessContact = [school.email, school.phone, school.website].filter(Boolean).join(' | ') || 'Complete profile details';
  const whatsappNumberLabel = whatsapp.phoneNumber || (whatsapp.phoneNumberId ? `ID ${whatsapp.phoneNumberId}` : 'Not linked');
  const whatsappConnected = Boolean(whatsapp.isConnected);
  const whatsappVerified = whatsapp.businessVerificationStatus === 'verified'
    || whatsapp.accountReviewStatus === 'APPROVED';
  const whatsappPending = whatsappConnected && !whatsappVerified;
  const hasLiveData = Boolean(lastUpdated);

  const sent = toNumber(stats.analytics?.totalMessagesSent);
  const delivered = toNumber(stats.analytics?.totalMessagesDelivered);
  const read = toNumber(stats.analytics?.totalMessagesRead);
  const failedMessages = toNumber(stats.analytics?.totalMessagesFailed || stats.messageLedger?.failed || stats.broadcasts?.failedRecipients);
  const customerReplies = toNumber(stats.messageLedger?.inbound);
  const safePercent = (value, total) => {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  };
  const deliveryRate = safePercent(delivered, sent);
  const readRate = safePercent(read, delivered || sent);
  const replyRate = safePercent(customerReplies, sent);
  const analyticsOutOfSync = read > Math.max(delivered, sent) || delivered > sent;
  const maxMessagesPerDay = toNumber(stats.limits?.maxMessagesPerDay);
  const messagesUsedToday = toNumber(stats.limits?.messagesUsedToday);
  const usagePercent = Math.min(
    Math.round((messagesUsedToday / (maxMessagesPerDay || 1)) * 100),
    100
  );
  const approvedTemplatePercent = stats.templates?.total
    ? Math.round((toNumber(stats.templates?.approved) / stats.templates.total) * 100)
    : 0;
  const activeBroadcasts = toNumber(stats.broadcasts?.scheduled) + toNumber(stats.broadcasts?.processing);
  const automationRate = stats.automations?.total
    ? Math.round((toNumber(stats.automations?.active) / stats.automations.total) * 100)
    : 0;
  const leadConversionRate = safePercent(stats.leads?.interested, stats.leads?.total);
  const totalBroadcasts = toNumber(stats.broadcasts?.total);
  const totalTemplates = toNumber(stats.templates?.total);
  const totalAutomations = toNumber(stats.automations?.total);
  const totalRecipients = toNumber(stats.broadcasts?.recipients);
  const queueCount = activeBroadcasts + toNumber(stats.broadcasts?.failed);
  const readyScore = Math.round((
    (whatsappConnected ? 1 : 0)
    + (whatsappVerified ? 1 : 0)
    + (toNumber(stats.templates?.approved) > 0 ? 1 : 0)
    + (toNumber(stats.automations?.active) > 0 ? 1 : 0)
  ) / 4 * 100);
  const messageRows = [
    { label: 'Sent', value: sent, color: 'bg-primary' },
    { label: 'Delivered', value: delivered, color: 'bg-emerald-500' },
    { label: 'Read', value: read, color: 'bg-teal-500' },
    { label: 'Failed', value: failedMessages, color: 'bg-rose-500' },
    { label: 'Replies', value: customerReplies, color: 'bg-amber-400' }
  ];
  const broadcastRows = [
    { label: 'Scheduled', value: toNumber(stats.broadcasts?.scheduled), color: 'bg-amber-400' },
    { label: 'Processing', value: toNumber(stats.broadcasts?.processing), color: 'bg-teal-500' },
    { label: 'Completed', value: toNumber(stats.broadcasts?.completed), color: 'bg-emerald-500' },
    { label: 'Failed Recipients', value: toNumber(stats.broadcasts?.failedRecipients), color: 'bg-rose-500' }
  ];
  const leadRows = [
    { label: 'Interested', value: toNumber(stats.leads?.interested), color: 'bg-emerald-500' },
    { label: 'Pending', value: toNumber(stats.leads?.pending), color: 'bg-amber-400' },
    { label: 'Not Interested', value: toNumber(stats.leads?.notInterested), color: 'bg-slate-400' }
  ];

  const fetchStats = async ({ background = false } = {}) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    if (!background) setRefreshing(true);

    try {
      const [statsResponse, whatsappResponse] = await Promise.all([
        schoolAPI.getStats(),
        whatsappAPI.getConfig()
      ]);
      const statsData = statsResponse.data.data || {};
      setStats({
        ...emptyStats,
        ...statsData,
        whatsapp: {
          ...(statsData.whatsapp || {}),
          ...(whatsappResponse.data.data || {})
        }
      });
      setError('');
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      setError(error.response?.data?.message || error.message || 'Dashboard data could not be refreshed.');
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchStats();

    const syncInterval = window.setInterval(() => {
      if (!document.hidden) {
        void fetchStats({ background: true });
      }
    }, 10000);

    const handleFocus = () => {
      void fetchStats({ background: true });
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        void fetchStats({ background: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const connection = useMemo(() => {
    if (whatsappVerified) {
      return {
        label: 'Verified',
        title: 'WhatsApp is ready',
        copy: 'Meta account is connected and verified. Broadcasts and automations are ready.',
        badgeClass: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        panelClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        dotClass: 'bg-emerald-500'
      };
    }

    if (whatsappPending) {
      return {
        label: 'Review pending',
        title: 'Meta verification pending',
        copy: 'WhatsApp is linked. Complete or wait for business verification in Meta.',
        badgeClass: 'bg-amber-100 text-amber-900 ring-amber-200',
        panelClass: 'border-amber-200 bg-amber-50 text-amber-900',
        dotClass: 'bg-amber-400'
      };
    }

    if (whatsappConnected) {
      return {
        label: 'Connected',
        title: 'WhatsApp is connected',
        copy: 'Your number is linked. Verification status is still being checked.',
        badgeClass: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
        panelClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        dotClass: 'bg-emerald-500'
      };
    }

    return {
      label: 'Not connected',
      title: 'Connect Meta WhatsApp',
      copy: 'Connect WhatsApp Business to start broadcasts and automation replies.',
      badgeClass: 'bg-rose-100 text-rose-800 ring-rose-200',
      panelClass: 'border-rose-200 bg-rose-50 text-rose-900',
      dotClass: 'bg-rose-500'
    };
  }, [whatsappConnected, whatsappPending, whatsappVerified]);

  const importantStats = [
    { label: 'Contacts', value: toNumber(stats.leads?.total), detail: `${leadConversionRate}% interested`, icon: UsersIcon, to: '/leads', accent: 'bg-white text-primary ring-slate-200' },
    { label: 'Interested Leads', value: toNumber(stats.leads?.interested), detail: `${formatNumber(stats.leads?.pending)} pending`, icon: CheckCircleIcon, to: '/leads?status=interested', accent: 'bg-white text-emerald-700 ring-slate-200' },
    { label: 'Approved Templates', value: toNumber(stats.templates?.approved), detail: `${formatNumber(totalTemplates)} total templates`, icon: DocumentTextIcon, to: '/templates', accent: 'bg-slate-100 text-slate-800 ring-slate-200' },
    { label: 'Active Campaigns', value: activeBroadcasts, detail: `${formatNumber(totalBroadcasts)} total broadcasts`, icon: MegaphoneIcon, to: '/broadcast', accent: 'bg-white text-amber-700 ring-slate-200' }
  ];

  const summaryTiles = [
    { label: 'Read Rate', value: analyticsOutOfSync ? 'Syncing' : `${readRate}%`, detail: `${formatNumber(read)} reads` },
    { label: 'Reply Rate', value: `${replyRate}%`, detail: `${formatNumber(customerReplies)} inbound replies` },
    { label: 'Recipients', value: formatNumber(totalRecipients), detail: 'Across all broadcasts' },
    { label: 'Readiness', value: `${readyScore}%`, detail: 'Setup, templates and automation' }
  ];

  const healthItems = [
    {
      title: 'Meta Connection',
      value: whatsappConnected ? 'Connected' : 'Setup needed',
      detail: whatsappConnected ? `${metaDisplayName}${whatsapp.phoneNumber ? ` | ${whatsapp.phoneNumber}` : ''}` : `${businessName} needs Meta connection`,
      ok: whatsappConnected,
      to: '/whatsapp-setup',
      icon: ShieldCheckIcon
    },
    {
      title: 'Template Readiness',
      value: `${formatNumber(stats.templates?.approved)} approved`,
      detail: `${formatNumber(stats.templates?.pending)} in review, ${formatNumber(stats.templates?.rejected)} rejected`,
      ok: toNumber(stats.templates?.approved) > 0,
      to: '/templates',
      icon: DocumentTextIcon
    },
    {
      title: 'Automation',
      value: `${formatNumber(stats.automations?.active)} active`,
      detail: `${formatNumber(totalAutomations)} total rules from database`,
      ok: toNumber(stats.automations?.active) > 0,
      to: '/chatbot',
      icon: BoltIcon
    }
  ];

  const nextSteps = [
    {
      show: !whatsappConnected,
      title: 'Connect Meta WhatsApp',
      detail: 'Required before sending broadcasts or automation replies.',
      to: '/whatsapp-setup',
      icon: ShieldCheckIcon
    },
    {
      show: whatsappPending,
      title: 'Complete Meta verification',
      detail: 'Keep business name, phone, website, and documents consistent.',
      to: '/whatsapp-setup',
      icon: ExclamationTriangleIcon
    },
    {
      show: whatsappConnected,
      title: 'Create broadcast',
      detail: 'Send approved templates to interested and pending contacts.',
      to: '/broadcast/create',
      icon: MegaphoneIcon
    },
    {
      show: true,
      title: 'Review automation',
      detail: 'Check replies for admissions, fees, callbacks, and handoff.',
      to: '/chatbot',
      icon: BoltIcon
    }
  ].filter((step) => step.show).slice(0, 3);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm font-semibold text-gray-500">Loading live dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-flow-page space-y-6">
      <div className="flow-dash-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Dashboard</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">{businessName}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Live Meta, contacts, campaigns, templates, and automation overview for this workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-primary shadow-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${refreshing ? 'bg-amber-400' : 'bg-green-500'}`} />
            {refreshing ? 'Syncing...' : `${hasLiveData ? 'Live' : 'Waiting'}${lastUpdated ? ` ${formatRelativeTime(lastUpdated)}` : ''}`}
          </div>
          <button
            type="button"
            onClick={() => fetchStats()}
            className="btn-outline inline-flex items-center justify-center gap-2 rounded-2xl"
            disabled={refreshing}
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/broadcast/create" className="btn-primary inline-flex items-center justify-center gap-2 rounded-2xl">
            <PlusIcon className="h-5 w-5" />
            New Broadcast
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Dashboard refresh failed: {error}
        </div>
      )}

      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flow-dash-hero overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(7,94,84,.10)]"
      >
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr]">
          <div className="relative overflow-hidden bg-gradient-primary p-6 text-white lg:p-8">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-50">
                    <span className={`h-2.5 w-2.5 rounded-full ${connection.dotClass}`} />
                    {connection.label}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">{connection.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{connection.copy}</p>
                </div>
                <Link
                  to="/whatsapp-setup"
                  className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-primary shadow-lg shadow-black/10 transition hover:-translate-y-0.5"
                >
                  {whatsappConnected ? 'Manage Setup' : 'Connect Meta'}
                </Link>
              </div>

              <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetaDetail label="Business" value={businessName} />
                <MetaDetail label="Meta Display" value={metaDisplayName} />
                <MetaDetail label="Contact" value={businessContact} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <MetaDetail label="WhatsApp Number" value={whatsappNumberLabel} />
                <MetaDetail label="Meta Sync" value={getSyncLabel(metaSync, whatsapp.lastSyncedAt)} />
              </div>
            </div>
          </div>

          <div className="p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500">Account Health</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{connection.label}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${connection.badgeClass}`}>
                {metaSync.status === 'fresh' ? 'Live Meta' : 'Cached'}
              </span>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${connection.panelClass}`}>
              <div className="flex items-start gap-3">
                {whatsappVerified ? (
                  <CheckCircleIcon className="h-6 w-6 shrink-0" />
                ) : (
                  <ExclamationTriangleIcon className="h-6 w-6 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{whatsappVerified ? `${businessName} verified` : `${businessName} needs attention`}</p>
                  <p className="mt-1 text-sm opacity-80">
                    Review: {formatReviewStatus(whatsapp.accountReviewStatus)} | Quality: {formatQuality(whatsapp.qualityRating)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <SmallMetric label="Delivery" value={`${deliveryRate}%`} detail={`${formatNumber(Math.min(delivered, sent))} of ${formatNumber(sent)} sent`} />
              <SmallMetric
                label={analyticsOutOfSync ? 'Read Sync' : 'Read Rate'}
                value={analyticsOutOfSync ? 'Updating' : `${readRate}%`}
                detail={analyticsOutOfSync ? 'Meta status counters are syncing' : `${formatNumber(Math.min(read, delivered || sent))} read`}
              />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="flow-dash-stat-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {importantStats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link to={stat.to} className="flow-dash-stat card card-hover block p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{formatNumber(stat.value)}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-500">{stat.detail}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${stat.accent}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="flow-dash-health-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryTiles.map((item) => (
          <div key={item.label} className="flow-dash-tile rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-gray-950">{item.value}</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="flow-dash-health-grid grid grid-cols-1 gap-4 lg:grid-cols-3">
        {healthItems.map((item) => (
          <HealthCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flow-dash-panel card p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Message Performance</h2>
              <p className="text-sm text-gray-600">Live DB totals for sent, delivered, read, failed and customer replies.</p>
            </div>
            <Link to="/analytics" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <ChartBarIcon className="h-5 w-5" />
              Details
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MessageMetric label="Sent" value={sent} icon={EnvelopeIcon} />
            <MessageMetric label="Delivered" value={delivered} icon={CheckCircleIcon} />
            <MessageMetric label="Read" value={read} icon={ArrowTrendingUpIcon} />
            <MessageMetric label="Failed" value={failedMessages} icon={ExclamationTriangleIcon} />
          </div>
          <div className="mt-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-950">Message Flow</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary ring-1 ring-slate-200">
                {deliveryRate}% delivered
              </span>
            </div>
            <MiniBarChart rows={messageRows} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ProgressMini label="Template approval" value={approvedTemplatePercent} />
            <ProgressMini label="Automation active" value={automationRate} />
            <ProgressMini label="Daily usage" value={usagePercent} amber={usagePercent > 75} />
          </div>
        </div>

        <div className="flow-dash-panel card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Today</h2>
              <p className="mt-1 text-sm text-gray-600">Usage and campaign queue.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${usagePercent > 75 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
              {usagePercent > 75 ? 'High usage' : 'Healthy'}
            </span>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-gray-600">Message usage</span>
              <span className="font-bold text-gray-900">
                {formatNumber(messagesUsedToday)} / {formatNumber(maxMessagesPerDay)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${usagePercent > 75 ? 'bg-amber-400' : 'bg-primary'}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className={`mt-2 text-xs font-semibold ${usagePercent > 75 ? 'text-amber-700' : 'text-primary'}`}>
              {usagePercent}% used today
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <SmallMetric label="Scheduled" value={formatNumber(stats.broadcasts?.scheduled)} />
            <SmallMetric label="Failed Recipients" value={formatNumber(stats.broadcasts?.failedRecipients)} />
          </div>
          <div className="mt-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
            <p className="mb-4 text-sm font-bold text-gray-950">Broadcast Queue</p>
            <MiniBarChart rows={broadcastRows} compact />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <div className="flow-dash-panel card p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Lead Pipeline</h2>
              <p className="text-sm text-gray-600">Status split from the live contacts database.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary ring-1 ring-slate-200">
              {leadConversionRate}% conversion
            </span>
          </div>
          <MiniBarChart rows={leadRows} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SmallMetric label="Total Contacts" value={formatNumber(stats.leads?.total)} />
            <SmallMetric label="Pending Follow-up" value={formatNumber(stats.leads?.pending)} />
          </div>
        </div>

        <div className="flow-dash-panel card p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-950">Workspace Snapshot</h2>
            <p className="text-sm text-gray-600">All counts are generated from the current school workspace.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SnapshotRow label="Broadcasts" value={formatNumber(totalBroadcasts)} detail={`${formatNumber(queueCount)} need attention or are queued`} />
            <SnapshotRow label="Templates" value={formatNumber(totalTemplates)} detail={`${formatNumber(stats.templates?.approved)} approved for sending`} />
            <SnapshotRow label="Automations" value={formatNumber(totalAutomations)} detail={`${formatNumber(stats.automations?.active)} active rules`} />
            <SnapshotRow label="Outbound Ledger" value={formatNumber(stats.messageLedger?.outbound)} detail={`${formatNumber(customerReplies)} inbound replies`} />
          </div>
        </div>
      </div>

      <div className="flow-dash-panel card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-950">Next Important Actions</h2>
          <Link to="/whatsapp-setup" className="text-sm font-bold text-primary">Meta setup</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {nextSteps.map((step) => (
            <Link
              key={step.title}
              to={step.to}
              className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-slate-200">
                <step.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 font-bold text-gray-950">{step.title}</p>
              <p className="mt-1 text-sm leading-5 text-gray-600">{step.detail}</p>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .dashboard-flow-page {
          min-height: calc(100vh - 48px);
          margin: -24px;
          padding: 28px;
          background:
            radial-gradient(circle at 4% 0%, rgba(37, 211, 102, .08), transparent 26%),
            radial-gradient(circle at 94% 6%, rgba(255, 218, 121, .10), transparent 24%),
            linear-gradient(180deg,#f8fafc 0%,#f6f8fb 45%,#f8fafc 100%);
          color: #0f172a;
          font-family: 'Inter','DM Sans','Segoe UI',sans-serif;
        }
        .flow-dash-header {
          border: 1px solid rgba(226,232,240,.95);
          border-radius: 26px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 18px 42px rgba(15,23,42,.06);
          backdrop-filter: blur(16px);
          padding: 18px;
        }
        .flow-dash-header > div:first-child p:first-child {
          color: #128C7E !important;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .14em;
        }
        .flow-dash-header h1 {
          color: #0f172a;
          letter-spacing: 0;
        }
        .flow-dash-header .btn-outline,
        .flow-dash-header .btn-primary,
        .flow-dash-header a,
        .flow-dash-header button {
          border-radius: 16px !important;
        }
        .flow-dash-hero {
          box-shadow: 0 28px 70px rgba(15,23,42,.08) !important;
          backdrop-filter: blur(16px);
        }
        .flow-dash-hero .bg-gradient-primary {
          background:
            radial-gradient(circle at 88% 10%, rgba(255,218,121,.20), transparent 26%),
            linear-gradient(135deg,#075E54 0%,#128C7E 100%);
        }
        .dashboard-flow-page .card {
          border: 1px solid rgba(226,232,240,.9);
          border-radius: 22px;
          background: rgba(255,255,255,.88);
          box-shadow: 0 18px 42px rgba(15,23,42,.06);
          backdrop-filter: blur(16px);
        }
        .dashboard-flow-page .card-hover:hover,
        .dashboard-flow-page .flow-dash-stat:hover,
        .dashboard-flow-page a.rounded-2xl:hover {
          transform: translateY(-2px);
          border-color: rgba(37,211,102,.38);
          box-shadow: 0 24px 54px rgba(15,23,42,.09);
        }
        .flow-dash-stat {
          min-height: 132px;
          background: linear-gradient(180deg,#fff,#f8fafc) !important;
        }
        .flow-dash-panel {
          background: rgba(255,255,255,.9) !important;
        }
        .dashboard-flow-page h2,
        .dashboard-flow-page .text-gray-950 {
          letter-spacing: 0;
        }
        .dashboard-flow-page .rounded-2xl {
          border-radius: 18px;
        }
        .dashboard-flow-page .shadow-sm {
          box-shadow: 0 12px 28px rgba(15,23,42,.05) !important;
        }
        .dashboard-flow-page .bg-gradient-to-b.from-white.to-gray-50 {
          background: linear-gradient(180deg,#fff,#f8fafc) !important;
          border-color: rgba(226,232,240,.85) !important;
        }
        .dashboard-flow-page .btn-primary {
          background: linear-gradient(135deg,#075E54,#128C7E);
          box-shadow: 0 16px 30px rgba(7,94,84,.18);
        }
        .dashboard-flow-page .btn-outline {
          border-color: rgba(18,140,126,.22);
          background: rgba(255,255,255,.86);
          color: #075E54;
          box-shadow: 0 10px 22px rgba(7,94,84,.06);
        }
        @media (max-width: 1024px) {
          .dashboard-flow-page {
            margin: -24px;
            padding: 22px;
          }
        }
        @media (max-width: 640px) {
          .dashboard-flow-page {
            margin: -24px -12px;
            padding: 18px 12px;
          }
          .flow-dash-header {
            border-radius: 22px;
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}

function MetaDetail({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-white/5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-950">{typeof value === 'number' ? formatNumber(value) : value}</p>
      {detail && <p className="mt-1 text-xs font-semibold text-gray-500">{detail}</p>}
    </div>
  );
}

function HealthCard({ title, value, detail, ok, to, icon: Icon }) {
  return (
    <Link to={to} className="card card-hover block p-5">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200 ${ok ? 'text-primary' : 'text-amber-700'}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-gray-950">{title}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${ok ? 'bg-white text-primary ring-slate-200' : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>
              {ok ? 'Ready' : 'Action'}
            </span>
          </div>
          <p className="mt-2 text-xl font-bold text-gray-950">{value}</p>
          <p className="mt-1 truncate text-sm text-gray-600">{detail}</p>
        </div>
      </div>
    </Link>
  );
}

function ProgressMini({ label, value, amber = false }) {
  const percent = Math.max(0, Math.min(Number(value) || 0, 100));
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-gray-600">{label}</span>
        <span className={`font-bold ${amber ? 'text-amber-700' : 'text-gray-950'}`}>{percent}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200/70">
        <div
          className={`h-full rounded-full transition-all ${amber ? 'bg-amber-400' : 'bg-gradient-to-r from-primary to-green-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function MessageMetric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-slate-200">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{formatNumber(value)}</p>
    </div>
  );
}

function MiniBarChart({ rows, compact = false }) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {rows.map((row) => {
        const value = Number(row.value) || 0;
        const width = value ? Math.max(8, Math.round((value / max) * 100)) : 2;

        return (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-gray-600">{row.label}</span>
              <span className="font-bold text-gray-950">{formatNumber(value)}</span>
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

function SnapshotRow({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-950">{label}</p>
          <p className="mt-1 text-sm font-semibold text-gray-500">{detail}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-primary ring-1 ring-slate-200">
          {value}
        </span>
      </div>
    </div>
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(toNumber(value));
}

function getSyncLabel(sync, lastSyncedAt) {
  if (sync?.status === 'fresh') return `Live from Meta${formatSyncTime(sync.at || lastSyncedAt)}`;
  if (sync?.status === 'cached') return 'Last synced data';
  if (sync?.status === 'not_configured') return 'Setup required';
  return lastSyncedAt ? `Synced${formatSyncTime(lastSyncedAt)}` : 'Waiting';
}

function formatSyncTime(value) {
  if (!value) return '';

  try {
    return ` at ${new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    return '';
  }
}

function formatRelativeTime(value) {
  if (!value) return '';

  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function formatReviewStatus(value) {
  const status = String(value || 'UNKNOWN').replace(/_/g, ' ').toLowerCase();
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatQuality(value) {
  if (!value) return 'Not available';
  return String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
