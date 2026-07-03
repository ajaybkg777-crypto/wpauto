import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { leadAPI, whatsappAPI } from '../../services/api';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  TagIcon,
  UsersIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [whatsapp, setWhatsapp] = useState({});
  const [loading, setLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    tag: searchParams.get('tag') || ''
  });
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', status: 'new', tags: '', notes: '' });
  const [importReport, setImportReport] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchLeads();
    }, filters.search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [pagination.page, filters.status, filters.source, filters.tag, filters.search]);

  useEffect(() => {
    fetchMetaStatus();
    fetchStats();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [leads]);

  const fetchLeads = async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 20,
        ...(filters.status && { status: filters.status }),
        ...(filters.source && { source: filters.source }),
        ...(filters.tag && { tag: filters.tag }),
        ...(filters.search && { search: filters.search })
      };
      const response = await leadAPI.getLeads(params);
      if (requestId !== requestRef.current) return;
      setLeads(response.data.data || []);
      setPagination({
        page: response.data.page || 1,
        pages: response.data.pages || 1,
        total: response.data.total || 0
      });
      const cleanParams = Object.fromEntries(
        Object.entries(filters)
          .map(([key, value]) => [key, String(value || '').trim()])
          .filter(([, value]) => value)
      );
      setSearchParams(cleanParams);
    } catch (error) {
      toast.error('Failed to fetch leads');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await leadAPI.getStats();
      setStats(response.data.data || {});
    } catch (error) {
      setStats({});
    }
  };

  const fetchMetaStatus = async () => {
    setMetaLoading(true);
    try {
      const response = await whatsappAPI.getConfig();
      setWhatsapp(response.data.data || {});
    } catch (error) {
      setWhatsapp({});
    } finally {
      setMetaLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLeads();
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', source: '', tag: '' });
    setPagination({ ...pagination, page: 1 });
  };

  const handleExport = async () => {
    try {
      const response = await leadAPI.exportLeads({
        ...(filters.status && { status: filters.status }),
        ...(filters.source && { source: filters.source }),
        ...(filters.tag && { tag: filters.tag }),
        ...(filters.search && { search: filters.search })
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'leads.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Leads exported successfully');
    } catch (error) {
      toast.error('Failed to export leads');
    }
  };

  const handleCsvImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rows = parseCsv(String(event.target.result));
        if (rows.length < 2) {
          toast.error('CSV file has no contacts');
          return;
        }

        const headers = rows[0].map((header) => normalizeCsvHeader(header));
        const leads = rows.slice(1).map((values) => {
          const record = headers.reduce((acc, header, index) => {
            acc[header] = String(values[index] || '').trim();
            return acc;
          }, {});

          return {
            name: record.name || record.full_name || record.fullname || record.contact_name,
            phone: record.phone || record.mobile || record.mobile_number || record.whatsapp || record.whatsapp_number || record.number,
            email: record.email || record.email_id,
            tag: record.tag || record.tags
          };
        }).filter((lead) => lead.phone);

        if (!leads.length) {
          toast.error('No phone numbers found in CSV');
          return;
        }

        const result = await importContactsInChunks(leads);
        setImportReport({
          attempted: leads.length,
          imported: result.imported || 0,
          newContacts: result.newContacts || 0,
          duplicates: result.duplicates || 0,
          skipped: result.skipped || 0,
          errors: result.errors || 0,
          details: result.details || []
        });
        const skippedText = result.skipped || result.duplicates || result.errors
          ? ` (${result.skipped || 0} skipped, ${result.duplicates || 0} duplicates, ${result.errors || 0} errors)`
          : '';
        toast.success(`${result.imported || leads.length} contacts imported${skippedText}`);
        await Promise.all([fetchLeads(), fetchStats()]);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to import CSV');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLead) {
        await leadAPI.updateLead(editingLead._id, {
          ...formData,
          tags: formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        });
        toast.success('Lead updated successfully');
      } else {
        await leadAPI.createLead({
          ...formData,
          tags: formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        });
        toast.success('Lead created successfully');
      }
      setShowModal(false);
      setEditingLead(null);
      setFormData({ name: '', phone: '', email: '', status: 'new', tags: '', notes: '' });
      await Promise.all([fetchLeads(), fetchStats()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save lead');
    }
  };

  const handleEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || '',
      status: lead.status,
      tags: lead.tags?.join(', ') || '',
      notes: lead.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await leadAPI.deleteLead(id);
      toast.success('Lead deleted successfully');
      await Promise.all([fetchLeads(), fetchStats()]);
    } catch (error) {
      toast.error('Failed to delete lead');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length && !selectedFilterCount) {
      toast.error('Apply at least one filter before bulk delete');
      return;
    }

    const matched = selectedIds.length || pagination.total || leads.length;
    const filterText = Object.entries(filters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ') || 'selected rows';

    if (!confirm(`Delete ${matched} filtered contact(s) from database?\n\nFilters: ${filterText}\n\nThis cannot be undone.`)) return;

    try {
      const response = await leadAPI.bulkDeleteLeads({
        ...filters,
        ids: selectedIds,
        confirm: true
      });
      const deleted = response.data?.data?.deleted || 0;
      toast.success(`${deleted} contact(s) deleted from DB`);
      setSelectedIds([]);
      setPagination((current) => ({ ...current, page: 1 }));
      await Promise.all([fetchLeads(), fetchStats()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to bulk delete contacts');
    }
  };

  const openModal = () => {
    setEditingLead(null);
    setFormData({ name: '', phone: '', email: '', status: 'new', tags: '', notes: '' });
    setShowModal(true);
  };

  const getStatusBadge = (status) => {
    const styles = {
      new: 'badge-info',
      interested: 'badge-success',
      not_interested: 'badge-error',
      pending: 'badge-warning',
      converted: 'badge-success',
      follow_up: 'badge-warning'
    };
    return styles[status] || 'badge-info';
  };

  const connected = Boolean(whatsapp?.isConnected);
  const verified = whatsapp?.businessVerificationStatus === 'verified'
    || whatsapp?.accountReviewStatus === 'APPROVED';
  const contactsWithPhone = leads.filter((lead) => lead.phone).length;
  const interestedCount = stats.interested ?? leads.filter((lead) => lead.status === 'interested').length;
  const newCount = stats.new ?? leads.filter((lead) => lead.status === 'new').length;
  const followUpCount = stats.follow_up ?? leads.filter((lead) => lead.status === 'follow_up').length;
  const whatsappSourceCount = leads.filter((lead) => lead.source === 'whatsapp_inbound').length;
  const selectedFilterCount = Object.values(filters).filter(Boolean).length;
  const allPageSelected = leads.length > 0 && selectedIds.length === leads.length;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleLeadSelection = (leadId) => {
    setSelectedIds((current) => current.includes(leadId)
      ? current.filter((id) => id !== leadId)
      : [...current, leadId]);
  };
  const togglePageSelection = () => {
    setSelectedIds(allPageSelected ? [] : leads.map((lead) => lead._id));
  };
  const quickSegments = [
    { label: 'Interested', key: 'status', value: 'interested' },
    { label: 'New Leads', key: 'status', value: 'new' },
    { label: 'Follow up', key: 'status', value: 'follow_up' },
    { label: 'WhatsApp', key: 'source', value: 'whatsapp_inbound' },
    { label: 'Imported', key: 'source', value: 'imported' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Contacts</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Contact CRM</h1>
          <p className="mt-1 text-sm text-gray-600">Manage DB contacts, WhatsApp replies, tags, and broadcast-ready audiences.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="btn-outline flex cursor-pointer items-center gap-2 rounded-2xl">
            <ArrowUpTrayIcon className="w-5 h-5" />
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={handleCsvImport} className="sr-only" />
          </label>
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 rounded-2xl">
            <ArrowDownTrayIcon className="w-5 h-5" />
            Export
          </button>
          <button onClick={openModal} className="btn-primary flex items-center gap-2 rounded-2xl">
            <PlusIcon className="w-5 h-5" />
            Add Contact
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(7,94,84,.10)]">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px]">
          <div className="relative overflow-hidden bg-gradient-primary p-6 text-white lg:p-8">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-50">
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                Meta + Database Contacts
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {connected ? 'Contacts are connected to WhatsApp workflows' : 'Connect Meta to activate WhatsApp workflows'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
                Contacts are loaded from your database. Meta status is checked live so broadcasts and automation readiness stay visible.
              </p>
              <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricTile label="Matched Contacts" value={pagination.total || leads.length} />
                <MetricTile label="New Contacts" value={newCount} />
                <MetricTile label="WhatsApp Source" value={whatsappSourceCount} />
              </div>
            </div>
          </div>
          <div className="p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500">WhatsApp Readiness</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
                  {metaLoading ? 'Checking...' : verified ? 'Verified' : connected ? 'Connected' : 'Setup required'}
                </p>
              </div>
              {verified ? (
                <CheckCircleIcon className="h-8 w-8 text-emerald-600" />
              ) : (
                <ExclamationTriangleIcon className="h-8 w-8 text-amber-600" />
              )}
            </div>
            <div className={`mt-5 rounded-2xl border p-4 ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <p className="font-semibold">{whatsapp?.displayName || 'Meta WhatsApp Business'}</p>
              <p className="mt-1 text-sm opacity-80">
                Number: {whatsapp?.phoneNumber || 'Not linked'} | Quality: {formatQuality(whatsapp?.qualityRating)}
              </p>
            </div>
            <Link to="/whatsapp-setup" className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-emerald-100 bg-white px-5 py-3 text-sm font-bold text-primary shadow-sm transition hover:bg-emerald-50">
              {connected ? 'Manage Meta Setup' : 'Connect Meta'}
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Interested" value={interestedCount} icon={CheckCircleIcon} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
        <SummaryCard label="Follow Up" value={followUpCount} icon={ChatBubbleLeftRightIcon} tone="bg-blue-50 text-blue-700 ring-blue-100" />
        <SummaryCard label="Active Filters" value={selectedFilterCount} icon={FunnelIcon} tone="bg-amber-50 text-amber-700 ring-amber-100" />
      </div>

      {importReport && (
        <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-blue-950">Last Import Report</h2>
              <p className="mt-1 text-sm text-blue-800">
                Attempted {importReport.attempted} rows. Imported {importReport.imported}, new {importReport.newContacts}, duplicates {importReport.duplicates}, skipped {importReport.skipped}, errors {importReport.errors}.
              </p>
              {importReport.details?.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-blue-700">
                  First issue: row {importReport.details[0].row || '-'} | {importReport.details[0].phone || 'no phone'} | {importReport.details[0].error}
                </p>
              )}
            </div>
            <button type="button" onClick={() => setImportReport(null)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
                <FunnelIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-gray-950">Audience Filters</h2>
                <p className="text-sm text-gray-600">Search, segment, and prepare contacts for broadcast.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {pagination.total || leads.length} matched
              </span>
              {selectedFilterCount > 0 && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
              {selectedFilterCount > 0 && (
                <button type="button" onClick={handleBulkDelete} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-50">
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete filtered
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <form onSubmit={handleSearch} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(150px,180px)_minmax(150px,180px)_minmax(180px,220px)_max-content]">
            <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, email, tag..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="input-field min-w-0 pl-10"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="input-field min-w-0"
            >
              <option value="">All Status</option>
              <option value="new">New</option>
              <option value="interested">Interested</option>
              <option value="pending">Pending</option>
              <option value="follow_up">Follow Up</option>
              <option value="not_interested">Not Interested</option>
              <option value="converted">Converted</option>
            </select>
            <select
              value={filters.source}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="input-field min-w-0"
            >
              <option value="">All Sources</option>
              <option value="website_form">Website Form</option>
              <option value="whatsapp_inbound">WhatsApp</option>
              <option value="manual">Manual</option>
              <option value="imported">Imported</option>
            </select>
            <input
              type="text"
              placeholder="Tag: parent, admission"
              value={filters.tag}
              onChange={(e) => handleFilterChange('tag', e.target.value)}
              className="input-field min-w-0"
            />
            <button type="submit" className="btn-primary min-h-[50px] whitespace-nowrap rounded-2xl px-5">
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick segments</span>
            {quickSegments.map((segment) => {
              const active = filters[segment.key] === segment.value;
              return (
                <button
                  key={`${segment.key}-${segment.value}`}
                  type="button"
                  onClick={() => handleFilterChange(segment.key, active ? '' : segment.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-primary'}`}
                >
                  {segment.label}
                </button>
              );
            })}
          </div>

          {selectedFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {Object.entries(filters).filter(([, value]) => value).map(([key, value]) => (
                <span key={key} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                  {key}: {String(value).replace('_', ' ')}
                  <button type="button" onClick={() => handleFilterChange(key, '')} className="text-slate-400 hover:text-rose-600">
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leads Table */}
      <div className="card overflow-hidden shadow-[0_18px_50px_rgba(7,94,84,.08)]">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-950">Contacts Database</h2>
            <p className="text-sm text-gray-600">{pagination.total || 0} contacts synced from DB | {contactsWithPhone} phone-ready on this page</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                {selectedIds.length} selected
              </span>
            )}
            {(selectedFilterCount > 0 || selectedIds.length > 0) && (
              <button type="button" onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100">
                <TrashIcon className="h-4 w-4" />
                Delete {selectedIds.length || pagination.total || leads.length}
              </button>
            )}
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {connected ? 'WhatsApp ready' : 'Meta setup needed'}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    aria-label="Select all contacts on this page"
                  />
                </th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Tags</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Last Message</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-emerald-50/70">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(lead._id)}
                        onChange={() => toggleLeadSelection(lead._id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        aria-label={`Select ${lead.name || lead.phone}`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-white">
                          {String(lead.name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                        <p className="font-semibold text-gray-900">{lead.name}</p>
                        {lead.email && <p className="text-sm text-gray-500">{lead.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{lead.phone}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${getStatusBadge(lead.status)}`}>
                        {lead.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {lead.tags?.length ? lead.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                            <TagIcon className="h-3 w-3" />
                            {tag}
                          </span>
                        )) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{lead.source?.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{lead.lastMessage || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link to={`/leads/${lead._id}`} className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-primary">
                          <EyeIcon className="w-5 h-5" />
                        </Link>
                        <button onClick={() => handleEdit(lead)} className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-primary">
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleDelete(lead._id)} className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-red-600">
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {((pagination.page - 1) * 20) + 1} to {Math.min(pagination.page * 20, pagination.total)} of {pagination.total} results
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page === pagination.pages}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingLead ? 'Edit Contact' : 'Add New Contact'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input-field"
                >
                  <option value="new">New</option>
                  <option value="interested">Interested</option>
                  <option value="pending">Pending</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="converted">Converted</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="input-field"
                  placeholder="Student, Parent, Lead"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input-field"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 btn-outline">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingLead ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-white/5 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${tone}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function formatQuality(value) {
  if (!value) return 'Not available';
  return String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCsvHeader(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function importContactsInChunks(leads, chunkSize = 500) {
  const report = {
    imported: 0,
    newContacts: 0,
    duplicates: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  for (let index = 0; index < leads.length; index += chunkSize) {
    const chunk = leads.slice(index, index + chunkSize);
    const response = await leadAPI.importLeads({ leads: chunk });
    const data = response.data?.data || {};

    report.imported += data.imported || 0;
    report.newContacts += data.newContacts || 0;
    report.duplicates += data.duplicates || 0;
    report.skipped += data.skipped || 0;
    report.errors += data.errors || 0;
    if (Array.isArray(data.details)) {
      report.details.push(...data.details.slice(0, 50));
    }
  }

  return report;
}
