import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { broadcastAPI, whatsappAPI } from '../../services/api';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PhotoIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export default function Broadcast() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [whatsapp, setWhatsapp] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedBroadcast, setSelectedBroadcast] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const fetchRef = useRef(false);

  useEffect(() => {
    fetchBroadcasts();
  }, [pagination.page]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchBroadcasts({ background: true });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [pagination.page]);

  const metaReady = Boolean(whatsapp?.isConnected);
  const metaVerified = whatsapp?.businessVerificationStatus === 'verified'
    || whatsapp?.accountReviewStatus === 'APPROVED';

  const fetchBroadcasts = async ({ background = false } = {}) => {
    if (fetchRef.current) return;

    fetchRef.current = true;
    if (!background) setLoading(true);
    if (background) setRefreshing(true);

    try {
      const [listResponse, statsResponse, whatsappResponse] = await Promise.all([
        broadcastAPI.getBroadcasts({ page: pagination.page, limit: 20 }),
        broadcastAPI.getStats(),
        whatsappAPI.getConfig()
      ]);
      setBroadcasts(listResponse.data.data || []);
      setPagination((current) => ({ ...current, ...listResponse.data }));
      setStats(statsResponse.data.data || {});
      setWhatsapp(whatsappResponse.data.data || {});
    } catch (error) {
      if (!background) toast.error(error.response?.data?.message || 'Failed to fetch broadcasts');
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchRef.current = false;
    }
  };

  const handleStart = async (broadcast) => {
    if (!metaReady) {
      toast.error('Connect Meta WhatsApp before starting broadcasts');
      return;
    }

    try {
      await broadcastAPI.startBroadcast(broadcast._id);
      toast.success('Broadcast started');
      fetchBroadcasts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start broadcast');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this broadcast?')) return;

    try {
      await broadcastAPI.deleteBroadcast(id);
      toast.success('Broadcast deleted');
      fetchBroadcasts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete broadcast');
    }
  };

  const handleResume = async (broadcast) => {
    try {
      const response = await broadcastAPI.resumeBroadcast(broadcast._id);
      toast.success(response.data.message || 'Broadcast resumed');
      fetchBroadcasts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resume broadcast');
    }
  };

  const handleRetryFailed = async (broadcast) => {
    if (!confirm(`Retry ${broadcast.failedCount || 0} failed recipient(s)?`)) return;

    try {
      const response = await broadcastAPI.resumeBroadcast(broadcast._id, { retryFailed: true });
      toast.success(response.data.message || 'Retry started');
      fetchBroadcasts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to retry recipients');
    }
  };

  const handleResendStale = async (broadcast) => {
    if (!confirm('Fresh send stale reused recipients in this broadcast?')) return;

    try {
      const response = await broadcastAPI.resumeBroadcast(broadcast._id, { resendStale: true });
      toast.success(response.data.message || 'Fresh send started');
      fetchBroadcasts();
      if (selectedBroadcast?._id === broadcast._id) {
        const details = await broadcastAPI.getBroadcast(broadcast._id);
        setSelectedBroadcast(details.data.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fresh send recipients');
    }
  };

  const handleOpenDetails = async (broadcast) => {
    setSelectedBroadcast(broadcast);
    setLoadingDetails(true);
    try {
      const response = await broadcastAPI.getBroadcast(broadcast._id);
      setSelectedBroadcast(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load recipient report');
    } finally {
      setLoadingDetails(false);
    }
  };

  const totals = useMemo(() => {
    const sent = broadcasts.reduce((sum, item) => sum + (item.sentCount || 0), 0);
    const failed = broadcasts.reduce((sum, item) => sum + (item.failedCount || 0), 0);
    const recipients = broadcasts.reduce((sum, item) => sum + (item.totalRecipients || 0), 0);
    const completed = broadcasts.filter((item) => item.status === 'completed').length;
    const scheduled = broadcasts.filter((item) => item.status === 'scheduled').length;
    const drafts = broadcasts.filter((item) => item.status === 'draft').length;
    const processing = broadcasts.filter((item) => item.status === 'processing').length;
    return { sent, failed, recipients, completed, scheduled, drafts, processing };
  }, [broadcasts]);

  const statusRows = [
    { label: 'Draft', value: totals.drafts, color: 'bg-sky-500' },
    { label: 'Scheduled', value: totals.scheduled || stats.scheduled || 0, color: 'bg-amber-400' },
    { label: 'Processing', value: totals.processing || stats.processing || 0, color: 'bg-emerald-500' },
    { label: 'Completed', value: totals.completed || stats.completed || 0, color: 'bg-green-600' },
    { label: 'Failed', value: stats.failed || broadcasts.filter((item) => item.status === 'failed').length, color: 'bg-rose-500' }
  ];
  const deliveryPercent = totals.recipients ? Math.round((totals.sent / totals.recipients) * 100) : 0;
  const filteredBroadcasts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return broadcasts;

    return broadcasts.filter((broadcast) => [
      broadcast.name,
      broadcast.message,
      broadcast.status,
      broadcast.type,
      broadcast.templateName
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [broadcasts, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Broadcasts</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Meta Campaign Console</h1>
          <p className="mt-1 text-sm text-gray-600">Create, schedule, and monitor WhatsApp template campaigns from one place.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fetchBroadcasts()}
            className="btn-outline inline-flex items-center justify-center gap-2 rounded-2xl"
            disabled={loading || refreshing}
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading || refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/broadcast/create" className="btn-primary inline-flex items-center justify-center gap-2 rounded-2xl">
            <PlusIcon className="h-5 w-5" />
            New Broadcast
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(7,94,84,.10)]">
          <div className="relative overflow-hidden bg-gradient-primary p-6 text-white lg:p-8">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-50">
                  <span className={`h-2.5 w-2.5 rounded-full ${metaReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <ShieldCheckIcon className="h-4 w-4" />
                  Meta WhatsApp
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{metaReady ? 'Broadcast channel connected' : 'Connect Meta before broadcasting'}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
                  {metaReady
                    ? `${whatsapp.phoneNumber || 'Your WhatsApp number'} is ready for approved template campaigns.`
                    : 'Broadcasts require a connected Meta WhatsApp Business number and approved message templates.'}
                </p>
              </div>
              <Link
                to="/whatsapp-setup"
                className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-primary shadow-lg shadow-black/10 transition hover:-translate-y-0.5"
              >
                {metaReady ? 'Manage Meta' : 'Connect Meta'}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
            <InfoTile label="Number" value={whatsapp.phoneNumber || 'Not connected'} />
            <InfoTile label="Verification" value={metaVerified ? 'Verified' : metaReady ? 'Review pending' : 'Not connected'} />
            <InfoTile label="Templates" value="Approved only" />
          </div>
        </div>

        <div className="card p-6 shadow-[0_18px_50px_rgba(7,94,84,.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Campaign Summary</h2>
              <p className="mt-1 text-sm text-gray-600">Current page performance snapshot.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${deliveryPercent > 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
              {deliveryPercent}% sent
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SummaryTile label="Total" value={pagination.total || 0} icon={MegaphoneIcon} />
            <SummaryTile label="Processing" value={stats.processing || 0} icon={ArrowPathIcon} />
            <SummaryTile label="Recipients" value={totals.recipients} icon={UsersIcon} />
            <SummaryTile label="Sent" value={totals.sent} icon={CheckCircleIcon} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">Campaign Pipeline</h2>
              <p className="text-sm text-gray-600">Status distribution for active broadcast records.</p>
            </div>
            <ChartBarIcon className="h-6 w-6 text-primary" />
          </div>
          <MiniBarChart rows={statusRows} />
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold text-gray-950">Delivery Health</h2>
          <p className="mt-1 text-sm text-gray-600">Sent vs failed across visible campaigns.</p>
          <div className="mt-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-semibold text-gray-600">Successful sends</span>
              <span className="font-bold text-gray-950">{deliveryPercent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-200/70">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-green-500" style={{ width: `${deliveryPercent}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <InfoTile label="Sent" value={totals.sent} />
              <InfoTile label="Failed" value={totals.failed} />
            </div>
          </div>
        </div>
      </div>

      {!metaReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Meta WhatsApp is not connected</p>
              <p className="mt-1 text-sm text-amber-800">You can prepare drafts, but sending requires Meta setup and approved templates.</p>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden shadow-[0_18px_50px_rgba(7,94,84,.08)]">
        <div className="border-b border-gray-100 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Broadcast History</h2>
              <p className="text-sm text-gray-600">Auto-refreshes while broadcasts are processing.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block w-full sm:w-80">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search campaign, status, message..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#25D366] focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <span className="inline-flex w-max items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-primary">
                <span className={`h-2 w-2 rounded-full ${refreshing ? 'bg-amber-400' : 'bg-green-500'}`}></span>
                {filteredBroadcasts.length}/{broadcasts.length}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="px-6 py-4">Campaign</th>
                <th className="px-6 py-4">Audience</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  </td>
                </tr>
              ) : filteredBroadcasts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <MegaphoneIcon className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-3 font-semibold text-gray-900">{search ? 'No matching broadcasts' : 'No broadcasts yet'}</p>
                    <p className="mt-1 text-sm text-gray-500">{search ? 'Try a different campaign name, status, or message.' : 'Create your first Meta template campaign.'}</p>
                  </td>
                </tr>
              ) : (
                filteredBroadcasts.map((broadcast) => (
                  <tr key={broadcast._id} className="hover:bg-emerald-50/70">
                    <td className="px-6 py-4">
                      <div className="min-w-[260px]">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
                            <MegaphoneIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-950">{broadcast.name}</p>
                            <p className="mt-0.5 text-xs font-semibold capitalize text-primary">{broadcast.type || 'utility'} template</p>
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {broadcast.media?.url && <PhotoIcon className="h-4 w-4 shrink-0 text-gray-400" />}
                          <p className="max-w-md truncate text-sm text-gray-500">{broadcast.message}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{broadcast.totalRecipients || 0}</div>
                      <p className="text-xs text-gray-500">recipients</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={broadcast.status} />
                    </td>
                    <td className="px-6 py-4">
                      <Progress sent={broadcast.sentCount || 0} failed={broadcast.failedCount || 0} total={broadcast.totalRecipients || 0} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(broadcast.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {(broadcast.status === 'draft' || broadcast.status === 'scheduled') && (
                          <button
                            type="button"
                            onClick={() => handleStart(broadcast)}
                            className="rounded-lg p-2 text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Start"
                            disabled={!metaReady}
                          >
                            <PlayIcon className="h-5 w-5" />
                          </button>
                        )}
                        {broadcast.status === 'processing' && (
                          <>
                            <div className="rounded-lg p-2">
                              <ArrowPathIcon className="h-5 w-5 animate-spin text-primary" />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleResume(broadcast)}
                              className="rounded-lg p-2 text-green-700 hover:bg-green-50"
                              title="Resume pending recipients"
                            >
                              <PlayIcon className="h-5 w-5" />
                            </button>
                          </>
                        )}
                        {(broadcast.failedCount || 0) > 0 && broadcast.status !== 'processing' && (
                          <button
                            type="button"
                            onClick={() => handleRetryFailed(broadcast)}
                            className="rounded-lg p-2 text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Retry failed recipients"
                            disabled={!metaReady}
                          >
                            <ArrowPathIcon className="h-5 w-5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(broadcast)}
                          className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"
                          title="View recipient report"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(broadcast._id)}
                          className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Delete"
                          disabled={broadcast.status === 'processing'}
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <p className="text-sm text-gray-600">Page {pagination.page} of {pagination.pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page === pagination.pages}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      {selectedBroadcast && (
        <RecipientReport
          broadcast={selectedBroadcast}
          loading={loadingDetails}
          onClose={() => setSelectedBroadcast(null)}
          onResendStale={handleResendStale}
        />
      )}
    </div>
  );
}

function RecipientReport({ broadcast, loading, onClose, onResendStale }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const recipients = broadcast.recipients || [];
  const filtered = recipients.filter((recipient) => {
    const effectiveStatus = getEffectiveRecipientStatus(recipient);
    const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [recipient.name, recipient.phone, recipient.error, recipient.errorDetails]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesQuery;
  });
  const counts = recipients.reduce((result, recipient) => {
    const effectiveStatus = getEffectiveRecipientStatus(recipient);
    result[effectiveStatus] = (result[effectiveStatus] || 0) + 1;
    return result;
  }, {});
  const staleReusedCount = recipients.filter((recipient) => isStaleReusedRecipient(broadcast, recipient)).length;
  const exportRecipients = (status) => {
    const rows = status === 'all'
      ? recipients
      : recipients.filter((recipient) => recipient.status === status);
    if (!rows.length) {
      toast.error(`No ${status === 'all' ? '' : `${status} `}recipients available to download`);
      return;
    }

    const columns = [
      ['Name', (recipient) => recipient.name || ''],
      ['Phone', (recipient) => recipient.phone || ''],
      ['Status', (recipient) => getEffectiveRecipientStatus(recipient)],
      ['Scheduled At', (recipient) => formatCsvDate(recipient.scheduledAt)],
      ['Sent At', (recipient) => formatCsvDate(recipient.sentAt)],
      ['Delivered At', (recipient) => formatCsvDate(recipient.deliveredAt)],
      ['Read At', (recipient) => formatCsvDate(recipient.readAt)],
      ['Failed At', (recipient) => getEffectiveRecipientStatus(recipient) === 'failed' ? formatCsvDate(recipient.failedAt) : ''],
      ['Meta Message ID', (recipient) => recipient.messageId || ''],
      ['Error Code', (recipient) => recipient.errorCode || ''],
      ['Failure Reason', (recipient) => recipient.error || ''],
      ['Error Details', (recipient) => recipient.errorDetails || ''],
      ['Retryable', (recipient) => recipient.retryable === false ? 'No' : getEffectiveRecipientStatus(recipient) === 'failed' ? 'Yes' : '']
    ];
    const csv = [
      columns.map(([heading]) => csvCell(heading)).join(','),
      ...rows.map((recipient) => columns.map(([, read]) => csvCell(read(recipient))).join(','))
    ].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toFilename(broadcast.name)}-${status}-recipients.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Delivery Report</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">{broadcast.name}</h2>
              <p className="mt-1 text-sm text-slate-500">Recipient-level Meta delivery status and failure details.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" title="Close report">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ReportStat label="Total" value={broadcast.totalRecipients || recipients.length} tone="slate" />
            <ReportStat label="Sent" value={broadcast.sentCount || 0} tone="blue" />
            <ReportStat label="Delivered" value={broadcast.deliveredCount || 0} tone="green" />
            <ReportStat label="Read" value={broadcast.readCount || 0} tone="emerald" />
            <ReportStat label="Failed" value={broadcast.failedCount || 0} tone="rose" />
          </div>
        </header>

        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="relative block w-full sm:max-w-md">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, or error..." className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#25D366] focus:ring-4 focus:ring-emerald-100" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#25D366]">
              <option value="all">All recipients ({recipients.length})</option>
              {['pending', 'sent', 'delivered', 'read', 'failed', 'skipped'].map((status) => (
                <option value={status} key={status}>{status.charAt(0).toUpperCase() + status.slice(1)} ({counts[status] || 0})</option>
              ))}
            </select>
            <button type="button" onClick={() => exportRecipients(statusFilter)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export Filter
            </button>
            <button type="button" onClick={() => exportRecipients('failed')} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Failed CSV
            </button>
            <button type="button" onClick={() => exportRecipients('sent')} className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Sent CSV
            </button>
            {staleReusedCount > 0 && (
              <button type="button" onClick={() => onResendStale?.(broadcast)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-800 transition hover:bg-amber-100">
                <ArrowPathIcon className="h-4 w-4" />
                Fresh Send ({staleReusedCount})
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-56 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm font-semibold text-slate-500">No recipients match this filter.</p>
          ) : (
            <table className="w-full min-w-[880px]">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Recipient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3">Meta Message ID</th>
                  <th className="px-4 py-3">Failure Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((recipient) => (
                  <tr key={recipient._id || `${recipient.phone}-${recipient.messageId || 'pending'}`} className="align-top hover:bg-slate-50">
                    <td className="px-6 py-4"><p className="font-bold text-slate-950">{recipient.name || 'Unknown'}</p><p className="mt-1 text-xs font-semibold text-slate-500">{recipient.phone}</p></td>
                    <td className="px-4 py-4"><RecipientStatusBadge status={getEffectiveRecipientStatus(recipient)} /></td>
                    <td className="px-4 py-4 text-xs font-medium leading-5 text-slate-600">{formatRecipientTimeline(recipient)}</td>
                    <td className="max-w-[190px] break-all px-4 py-4 text-xs font-medium text-slate-500">{recipient.messageId || '-'}</td>
                    <td className="max-w-[280px] px-4 py-4 text-xs leading-5 text-slate-600">{getEffectiveRecipientStatus(recipient) === 'failed' ? <><b className="text-rose-700">{recipient.errorCode ? `#${recipient.errorCode} ` : ''}{recipient.error || 'Meta delivery failed'}</b>{recipient.retryable === false && <span className="mt-1 block font-semibold text-amber-700">Meta blocked this delivery; retry is unlikely to help.</span>}{recipient.errorDetails && <span className="mt-1 block">{recipient.errorDetails}</span>}</> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function ReportStat({ label, value, tone }) {
  const tones = { slate: 'bg-slate-50 text-slate-700', blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700', emerald: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700' };
  return <div className={`rounded-xl px-3 py-3 ${tones[tone]}`}><p className="text-xs font-bold uppercase">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}

function RecipientStatusBadge({ status = 'pending' }) {
  const tones = { pending: 'bg-slate-100 text-slate-700', sent: 'bg-blue-100 text-blue-700', delivered: 'bg-green-100 text-green-700', read: 'bg-emerald-100 text-emerald-700', failed: 'bg-rose-100 text-rose-700', skipped: 'bg-amber-100 text-amber-700' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tones[status] || tones.pending}`}>{status}</span>;
}

function formatRecipientTimeline(recipient) {
  const rows = [
    ['Scheduled', recipient.scheduledAt],
    ['Sent', recipient.sentAt],
    ['Delivered', recipient.deliveredAt],
    ['Read', recipient.readAt]
  ].filter(([, value]) => value);
  if (getEffectiveRecipientStatus(recipient) === 'failed' && recipient.failedAt) {
    rows.push(['Failed', recipient.failedAt]);
  }
  return rows.length ? rows.map(([label, value]) => <div key={label}><b>{label}:</b> {new Date(value).toLocaleString()}</div>) : '-';
}

function getEffectiveRecipientStatus(recipient = {}) {
  if (recipient.status === 'failed') return 'failed';
  if (recipient.readAt) return 'read';
  if (recipient.deliveredAt) return 'delivered';
  return recipient.status || 'pending';
}

function isStaleReusedRecipient(broadcast, recipient) {
  if (!broadcast?.createdAt || !recipient?.sentAt) return false;
  if (!['sent', 'delivered', 'read'].includes(getEffectiveRecipientStatus(recipient))) return false;

  const createdAt = new Date(broadcast.createdAt).getTime();
  const sentAt = new Date(recipient.sentAt).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(sentAt)) return false;

  return sentAt < createdAt - 60 * 1000;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatCsvDate(value) {
  return value ? new Date(value).toLocaleString() : '';
}

function toFilename(value) {
  return String(value || 'broadcast').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'broadcast';
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-950">{value}</p>
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-sky-100 text-sky-800',
    scheduled: 'bg-amber-100 text-amber-900',
    processing: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-rose-100 text-rose-800',
    cancelled: 'bg-gray-100 text-gray-700'
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${styles[status] || styles.draft}`}>
      {status || 'draft'}
    </span>
  );
}

function Progress({ sent, failed, total }) {
  const completed = sent + failed;
  const percent = total ? Math.min(Math.round((completed / total) * 100), 100) : 0;

  return (
    <div className="min-w-[180px]">
      <div className="mb-2 flex justify-between text-xs font-semibold text-gray-500">
        <span>{completed}/{total}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }}></div>
      </div>
      <p className="mt-1 text-xs text-gray-500">{sent} sent, {failed} failed</p>
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
