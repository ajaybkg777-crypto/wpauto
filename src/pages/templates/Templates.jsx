import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FaceSmileIcon,
  FunnelIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PhoneIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  VideoCameraIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { templateAPI } from '../../services/api';

const EMPTY_FORM = {
  name: '',
  category: 'marketing',
  language: 'en_US',
  header: { type: 'none', text: '' },
  body: '',
  footer: '',
  buttons: [],
  media: null,
  sampleText: ''
};

const CATEGORIES = [
  { value: 'marketing', label: 'Marketing', helper: 'Offers, admissions, re-engagement' },
  { value: 'utility', label: 'Utility', helper: 'Updates, reminders, confirmations' },
  { value: 'authentication', label: 'Authentication', helper: 'OTP templates need a dedicated Meta auth flow' }
];

const HEADER_TYPES = [
  { value: 'none', label: 'None', icon: ChatBubbleLeftRightIcon },
  { value: 'text', label: 'Text', icon: DocumentTextIcon },
  { value: 'image', label: 'Image', icon: PhotoIcon },
  { value: 'video', label: 'Video', icon: VideoCameraIcon },
  { value: 'document', label: 'Document', icon: DocumentTextIcon }
];

const BUTTON_TYPES = [
  { value: 'custom', label: 'Quick Reply', helper: 'User taps a reply', icon: ChatBubbleLeftRightIcon },
  { value: 'url', label: 'URL', helper: 'Open a link', icon: LinkIcon },
  { value: 'phone_number', label: 'Call', helper: 'Call a phone number', icon: PhoneIcon },
  { value: 'copy_offer_code', label: 'Copy Code', helper: 'Copy coupon/code', icon: ClipboardDocumentIcon }
];

const STATUS_STYLES = {
  draft: 'bg-sky-100 text-sky-800',
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-rose-100 text-rose-800'
};

const getMediaAccept = (type) => {
  if (type === 'image') return 'image/png,image/jpeg,image/webp';
  if (type === 'video') return 'video/mp4,video/quicktime';
  if (type === 'document') return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
  return '';
};

const getSupportedFormats = (type) => {
  if (type === 'image') return 'PNG, JPG, WEBP up to 25MB';
  if (type === 'video') return 'MP4, MOV up to 25MB';
  if (type === 'document') return 'PDF, DOC, XLS, PPT up to 25MB';
  return '';
};

const detectVariables = (body = '') => {
  const matches = String(body).match(/{{\s*\d+\s*}}/g) || [];
  return [...new Set(matches.map((match) => match.replace(/[{}\s]/g, '')))]
    .sort((left, right) => Number(left) - Number(right));
};

const detectInvalidVariables = (body = '') => {
  const invalid = String(body).match(/{{(?!\s*\d+\s*}}).*?}}/g) || [];
  return invalid;
};

const isSequentialVariables = (variables) => variables.every((variable, index) => Number(variable) === index + 1);
const isPublicUrl = (url = '') => /^https?:\/\//i.test(url);
const normalizePhoneInput = (phone = '') => {
  const value = String(phone || '').trim();
  const digits = value.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (value.startsWith('+')) return `+${digits}`;
  return digits ? `+${digits}` : '';
};
const isValidPhoneNumber = (phone = '') => /^\+[1-9]\d{9,14}$/.test(normalizePhoneInput(phone));

const TEMPLATE_PRESETS = [
  {
    label: 'Admissions',
    name: 'admission_open_followup',
    category: 'marketing',
    header: { type: 'text', text: 'Admissions Open' },
    body: 'Hi {{1}},\nAdmissions are open for {{2}}. Visit our campus or apply online today.',
    footer: 'Reply STOP to opt out',
    sampleText: 'Rahul|Grade 6',
    buttons: [{ type: 'url', text: 'Apply Now', url: 'https://example.com/apply', phoneNumber: '', offerCode: '' }]
  },
  {
    label: 'Fee Reminder',
    name: 'fee_payment_reminder',
    category: 'utility',
    header: { type: 'none', text: '' },
    body: 'Hi {{1}}, this is a reminder that the fee for {{2}} is due on {{3}}.',
    footer: 'Thank you',
    sampleText: 'Rahul|April|25 April',
    buttons: [{ type: 'url', text: 'Pay Fees', url: 'https://example.com/pay', phoneNumber: '', offerCode: '' }]
  },
  {
    label: 'Event Invite',
    name: 'school_event_invite',
    category: 'marketing',
    header: { type: 'text', text: 'You are invited' },
    body: 'Hi {{1}}, join us for {{2}} on {{3}} at our school campus.',
    footer: '',
    sampleText: 'Parent|Annual Day|Friday',
    buttons: [{ type: 'custom', text: 'Interested', url: '', phoneNumber: '', offerCode: '' }]
  }
];

const DEFAULT_FORM = {
  ...EMPTY_FORM,
  ...TEMPLATE_PRESETS[0],
  media: null
};

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [activePreviewButton, setActivePreviewButton] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const fileInputRef = useRef(null);
  const chatRef = useRef(null);

  const variables = useMemo(() => detectVariables(formData.body), [formData.body]);
  const invalidVariables = useMemo(() => detectInvalidVariables(formData.body), [formData.body]);
  const sampleValues = useMemo(() => {
    const values = String(formData.sampleText || '').split('|');
    return Object.fromEntries(variables.map((variable, index) => [variable, values[index] || '']));
  }, [formData.sampleText, variables]);

  const previewBody = useMemo(() => {
    let text = formData.body || 'Hi {{1}},\nAdmissions are open for {{2}}.';
    variables.forEach((variable) => {
      text = text.replace(new RegExp(`{{\\s*${variable}\\s*}}`, 'g'), sampleValues[variable] || `Sample ${variable}`);
    });
    return text;
  }, [formData.body, sampleValues, variables]);

  const errors = useMemo(() => {
    const next = {};
    if (!formData.name.trim()) next.name = 'Template name is required';
    if (formData.name && !/^[a-z0-9_]+$/.test(formData.name)) next.name = 'Use lowercase letters, numbers, and underscores only';
    if (formData.category === 'authentication') next.category = 'Authentication templates need a dedicated OTP flow. Use Marketing or Utility here.';
    if (formData.language && !/^[a-z]{2}(_[A-Z]{2})?$/.test(formData.language)) next.language = 'Use Meta language format like en_US or hi_IN';
    if (!formData.body.trim()) next.body = 'Body is required';
    if (formData.body.length > 1024) next.body = 'Body must be 1024 characters or fewer';
    if (invalidVariables.length) next.variables = `Invalid variables: ${invalidVariables.join(', ')}`;
    if (!isSequentialVariables(variables)) next.variables = 'Variables must be sequential: {{1}}, {{2}}, {{3}}';
    if (formData.header.type === 'text' && !formData.header.text.trim()) next.header = 'Header text is required';
    if (['image', 'video', 'document'].includes(formData.header.type) && !formData.media?.url) next.media = 'Media sample is required for this header';
    if (['image', 'video', 'document'].includes(formData.header.type) && formData.media?.url && formData.media?.type !== formData.header.type) next.media = 'Media file type must match selected header type';
    variables.forEach((variable) => {
      if (!sampleValues[variable]) next[`sample_${variable}`] = `Sample for {{${variable}}} is required`;
    });
    const actionButtons = formData.buttons.filter((button) => ['url', 'phone_number', 'copy_offer_code'].includes(button.type));
    const quickReplies = formData.buttons.filter((button) => button.type === 'custom');
    if (actionButtons.length > 2) next.buttons = 'Use at most 2 CTA buttons';
    if (actionButtons.length && quickReplies.length) next.buttons = 'Do not mix quick replies with CTA buttons';
    formData.buttons.forEach((button, index) => {
      if (!button.text.trim()) next[`button_${index}`] = 'Button text is required';
      if (button.text.length > 25) next[`button_${index}`] = 'Button text must be 25 characters or fewer';
      if (button.type === 'url' && !/^https?:\/\//i.test(button.url || '')) next[`button_${index}`] = 'Valid http/https URL is required';
      if (button.type === 'phone_number' && !isValidPhoneNumber(button.phoneNumber)) next[`button_${index}`] = 'Use a valid number like +919999999999';
      if (button.type === 'copy_offer_code' && !button.offerCode?.trim()) next[`button_${index}`] = 'Offer code is required';
    });
    return next;
  }, [formData, invalidVariables, sampleValues, variables]);

  const isValid = Object.keys(errors).length === 0;
  const statusCounts = useMemo(() => ({
    total: templates.length,
    approved: templates.filter((template) => template.status === 'approved').length,
    pending: templates.filter((template) => template.status === 'pending').length,
    draft: templates.filter((template) => template.status === 'draft').length
  }), [templates]);
  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesSearch = !query
        || template.name?.toLowerCase().includes(query)
        || template.body?.toLowerCase().includes(query)
        || template.category?.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || template.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, templates]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [previewBody, formData.media, formData.buttons, formData.footer, formData.header]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await templateAPI.syncTemplates().catch(() => templateAPI.getTemplates());
      setTemplates(response.data.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: name === 'name' ? value.toLowerCase().replace(/[^a-z0-9_]/g, '_') : value
    }));
  };

  const setHeaderType = (type) => {
    setFormData((current) => ({
      ...current,
      header: { type, text: type === 'text' ? current.header.text : '' },
      media: ['image', 'video', 'document'].includes(type) && current.media?.type === type ? current.media : null
    }));
  };

  const setSampleValue = (variable, value) => {
    const next = { ...sampleValues, [variable]: value };
    setFormData((current) => ({
      ...current,
      sampleText: variables.map((item) => next[item] || '').join('|')
    }));
  };

  const addEmoji = (emoji) => {
    setFormData((current) => ({ ...current, body: `${current.body}${emoji}` }));
  };

  const resetBuilder = () => {
    setFormData(DEFAULT_FORM);
    setActivePreviewButton(null);
    setDragActive(false);
    setUploadProgress(0);
  };

  const applyPreset = (preset) => {
    setFormData({
      ...EMPTY_FORM,
      ...preset,
      language: formData.language || 'en_US',
      media: null
    });
    setActivePreviewButton(null);
    setDragActive(false);
    setUploadProgress(0);
  };

  const uploadMedia = async (file) => {
    if (!file) return;
    const headerType = formData.header.type;
    const maxSize = 25 * 1024 * 1024;

    if (file.size > maxSize) {
      toast.error('File must be 25MB or less');
      return;
    }

    if (headerType === 'image' && !file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (headerType === 'video' && !file.type.startsWith('video/')) {
      toast.error('Please upload a video file');
      return;
    }
    if (headerType === 'document' && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      toast.error('Please upload a document file');
      return;
    }

    const payload = new FormData();
    payload.append('image', file);
    setUploading(true);
    setUploadProgress(10);
    const timer = window.setInterval(() => setUploadProgress((value) => Math.min(value + 12, 90)), 140);

    try {
      const response = await templateAPI.uploadImage(payload);
      setUploadProgress(100);
      setFormData((current) => ({
        ...current,
        media: {
          type: response.data.data.type || headerType,
          url: response.data.data.publicUrl || response.data.data.url,
          localUrl: response.data.data.localUrl || response.data.data.url,
          handle: response.data.data.handle || '',
          filename: response.data.data.filename,
          mimetype: response.data.data.mimetype
        }
      }));
      if (response.data.data.metaUploadError) {
        toast.error(`Uploaded locally, but Meta sample failed: ${response.data.data.metaUploadError}`);
      } else {
        toast.success('Media sample uploaded to Meta');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 300);
    }
  };

  const addButton = () => {
    if (formData.buttons.length >= 10) {
      toast.error('Maximum 10 buttons allowed');
      return;
    }
    setFormData((current) => ({
      ...current,
      buttons: [...current.buttons, { type: 'custom', text: '', url: '', phoneNumber: '', offerCode: '' }]
    }));
  };

  const updateButton = (index, field, value) => {
    setFormData((current) => {
      const buttons = [...current.buttons];
      buttons[index] = { ...buttons[index], [field]: value };
      return { ...current, buttons };
    });
  };

  const removeButton = (index) => {
    setFormData((current) => ({
      ...current,
      buttons: current.buttons.filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    if (!isValid) {
      toast.error('Fix template validation errors first');
      return;
    }

    setSaving(true);
    try {
      await templateAPI.createTemplate(formData);
      toast.success('Template saved');
      setFormData(DEFAULT_FORM);
      setActivePreviewButton(null);
      await fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async (id) => {
    try {
      await templateAPI.submitTemplate(id);
      toast.success('Submitted to Meta');
      await fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Submit failed');
    }
  };

  const syncTemplates = async () => {
    setSyncing(true);
    try {
      const response = await templateAPI.syncTemplates();
      setTemplates(response.data.data || []);
      toast.success('Synced with Meta');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const syncOne = async (id) => {
    try {
      await templateAPI.syncTemplate(id);
      toast.success('Template synced');
      await fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Sync failed');
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template from software and Meta WhatsApp Manager?')) return;
    try {
      const response = await templateAPI.deleteTemplate(id);
      toast.success(response.data.message || 'Template deleted from software and Meta');
      setTemplates((current) => current.filter((template) => template._id !== id));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="template-builder-page">
      <section className="tb-hero">
        <div>
          <div className="tb-eyebrow"><ShieldIcon /> Meta-Compatible Template Studio</div>
          <h1>WhatsApp Template Builder</h1>
          <p>Design marketing, utility, and authentication templates with media headers, dynamic variables, CTA buttons, and live WhatsApp mobile rendering.</p>
        </div>
        <div className="tb-hero-actions">
          <button type="button" className="tb-ghost" onClick={resetBuilder}>New Draft</button>
          <button type="button" className="tb-gold" onClick={syncTemplates} disabled={syncing}>
            {syncing ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ArrowPathIcon className="h-5 w-5" />}
            Sync Meta
          </button>
        </div>
      </section>

      <section className="tb-metrics">
        <MetricCard label="Total Templates" value={statusCounts.total} />
        <MetricCard label="Approved" value={statusCounts.approved} tone="green" />
        <MetricCard label="In Review" value={statusCounts.pending} tone="gold" />
        <MetricCard label="Drafts" value={statusCounts.draft} />
      </section>

      <div className="tb-grid">
        <main className="tb-editor">
          <form onSubmit={saveTemplate} className="tb-card">
            <SectionTitle
              title="Template Identity"
              copy="Start with a Meta-compatible category, language, and machine-safe template name."
              action={<StatusPill valid={isValid} count={Object.keys(errors).length} />}
            />
            <div className="tb-two">
              <Field label="Template Name" error={errors.name}>
                <input name="name" value={formData.name} onChange={handleChange} placeholder="admission_open_grade_6" />
              </Field>
              <Field label="Language" error={errors.language}>
                <input name="language" value={formData.language} onChange={handleChange} placeholder="en_US" />
              </Field>
            </div>

            <div className="tb-category-grid">
              {CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.value}
                  className={`tb-category ${formData.category === category.value ? 'is-selected' : ''}`}
                  onClick={() => setFormData((current) => ({ ...current, category: category.value }))}
                >
                  <b>{category.label}</b>
                  <span>{category.helper}</span>
                </button>
              ))}
            </div>
            {errors.category && <div className="tb-error-box"><ExclamationTriangleIcon className="h-5 w-5" /> {errors.category}</div>}

            <SectionTitle title="Header" copy="Choose one header type. Media samples are required for image, video, and document headers." />
            <div className="tb-header-types">
              {HEADER_TYPES.map((header) => {
                const Icon = header.icon;
                return (
                  <button
                    type="button"
                    key={header.value}
                    className={`tb-header-type ${formData.header.type === header.value ? 'is-selected' : ''}`}
                    onClick={() => setHeaderType(header.value)}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{header.label}</span>
                  </button>
                );
              })}
            </div>

            {formData.header.type === 'text' && (
              <Field label="Header Text" error={errors.header}>
                <input value={formData.header.text} maxLength={60} onChange={(event) => setFormData((current) => ({ ...current, header: { ...current.header, text: event.target.value } }))} placeholder="Admissions Open" />
              </Field>
            )}

            {['image', 'video', 'document'].includes(formData.header.type) && (
              <MediaUploader
                type={formData.header.type}
                media={formData.media}
                uploading={uploading}
                progress={uploadProgress}
                dragActive={dragActive}
                fileInputRef={fileInputRef}
                onUpload={uploadMedia}
                onRemove={() => setFormData((current) => ({ ...current, media: null }))}
                setDragActive={setDragActive}
                error={errors.media}
              />
            )}
            {formData.media?.url && !isPublicUrl(formData.media.url) && (
              <div className="tb-error-box"><ExclamationTriangleIcon className="h-5 w-5" /> Public APP_BASE_URL is required before this media template can be submitted to Meta.</div>
            )}

            <SectionTitle title="Quick Start" copy="Use a clean, Meta-friendly school template and edit it for your campaign." />
            <div className="tb-preset-grid">
              {TEMPLATE_PRESETS.map((preset) => (
                <button key={preset.name} type="button" className="tb-preset" onClick={() => applyPreset(preset)}>
                  <b>{preset.label}</b>
                  <span>{preset.body}</span>
                </button>
              ))}
            </div>

            <SectionTitle title="Body Builder" copy="Write the WhatsApp message body. Use numbered variables like {{1}}, {{2}} for personalization." />
            <Field label="Message Body" error={errors.body || errors.variables}>
              <div className="tb-textarea-wrap">
                <textarea name="body" value={formData.body} onChange={handleChange} rows={8} placeholder={'Hi {{1}},\nAdmissions are open for {{2}}.'} />
                <div className="tb-body-tools">
                  {['\u{1F600}', '\u{1F389}', '\u2705', '\u{1F4DA}', '\u260E\uFE0F'].map((emoji) => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}
                  <span>{formData.body.length}/1024</span>
                </div>
              </div>
            </Field>
            <div className="tb-highlight">
              <span>Formatting Preview</span>
              <p>{formData.body || 'Your formatted body appears here.'}</p>
            </div>

            <SectionTitle title="Sample Variables" copy="Meta requires sample values for every variable used in the body." />
            {variables.length === 0 ? (
              <div className="tb-empty"><FaceSmileIcon className="h-6 w-6" /> No variables detected. Add {'{{1}}'} to personalize the message.</div>
            ) : (
              <div className="tb-variable-list">
                {variables.map((variable) => (
                  <Field key={variable} label={`Sample for {{${variable}}}`} error={errors[`sample_${variable}`]}>
                    <input value={sampleValues[variable] || ''} onChange={(event) => setSampleValue(variable, event.target.value)} placeholder={variable === '1' ? 'Rahul' : variable === '2' ? 'Grade 6' : `Sample ${variable}`} />
                  </Field>
                ))}
              </div>
            )}

            <SectionTitle title="Footer" copy="Optional small footer text shown below the template body." />
            <Field label="Footer Text">
              <input name="footer" value={formData.footer} onChange={handleChange} maxLength={60} placeholder="Reply STOP to opt out" />
            </Field>

            <SectionTitle title="Buttons" copy="Add quick replies, URL buttons, call buttons, or copy offer code buttons." action={<button type="button" className="tb-soft" onClick={addButton}><PlusIcon className="h-4 w-4" /> Add Button</button>} />
            {errors.buttons && <div className="tb-error-box"><ExclamationTriangleIcon className="h-5 w-5" /> {errors.buttons}</div>}
            {formData.buttons.length === 0 ? (
              <div className="tb-empty"><ChatBubbleLeftRightIcon className="h-6 w-6" /> No buttons added yet.</div>
            ) : (
              <div className="tb-button-list">
                {formData.buttons.map((button, index) => (
                  <ButtonEditor key={index} button={button} index={index} error={errors[`button_${index}`]} updateButton={updateButton} removeButton={removeButton} />
                ))}
              </div>
            )}

            <div className="tb-save-bar">
              <div className={isValid ? 'tb-valid' : 'tb-invalid'}>
                {isValid ? <CheckCircleIcon className="h-5 w-5" /> : <ExclamationTriangleIcon className="h-5 w-5" />}
                {isValid ? 'Ready to save' : `${Object.keys(errors).length} issue(s) to fix`}
              </div>
              <MetaChecklist errors={errors} variables={variables} formData={formData} />
              <button type="submit" className="tb-gold" disabled={saving}>
                {saving ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />}
                Save Template
              </button>
            </div>
          </form>

          <TemplateTable
            templates={filteredTemplates}
            totalTemplates={templates.length}
            loading={loading}
            search={search}
            statusFilter={statusFilter}
            setSearch={setSearch}
            setStatusFilter={setStatusFilter}
            submitForApproval={submitForApproval}
            syncOne={syncOne}
            deleteTemplate={deleteTemplate}
          />
        </main>

        <aside className="tb-preview-column">
          <PhonePreview formData={formData} previewBody={previewBody} chatRef={chatRef} activeButton={activePreviewButton} setActiveButton={setActivePreviewButton} />
        </aside>
      </div>

      <style>{`
        html { scroll-behavior: smooth; }
        .template-builder-page { min-height: 100vh; color: #0f172a; }
        .tb-hero { position: relative; overflow: hidden; display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border-radius: 26px; padding: 30px; color: #fff; background: linear-gradient(135deg,#0f2b63 0%,#2b5893 100%); box-shadow: 0 28px 80px rgba(15,43,99,.24); }
        .tb-hero::after { content:""; position:absolute; right:-120px; bottom:-170px; width:420px; height:420px; border-radius:999px; background: radial-gradient(circle, rgba(255,218,121,.36), rgba(37,211,102,.14), transparent 70%); }
        .tb-eyebrow { width:max-content; display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(255,218,121,.34); border-radius:999px; padding:7px 11px; background:rgba(255,255,255,.1); color:#ffda79; font-size:12px; font-weight:900; text-transform:uppercase; }
        .tb-hero h1 { margin:16px 0 0; font-size:36px; line-height:1.05; letter-spacing:0; }
        .tb-hero p { max-width:820px; margin:10px 0 0; color:rgba(255,255,255,.76); line-height:1.65; }
        .tb-hero-actions { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; }
        .tb-ghost { min-height:42px; border:1px solid rgba(255,255,255,.2); border-radius:14px; padding:0 15px; background:rgba(255,255,255,.1); color:#fff; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-size:13px; font-weight:900; cursor:pointer; }
        .tb-metrics { margin-top:16px; display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .tb-metric { border:1px solid rgba(226,232,240,.9); border-radius:18px; background:rgba(255,255,255,.92); padding:16px; box-shadow:0 18px 42px rgba(15,43,99,.07); }
        .tb-metric span { display:block; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase; }
        .tb-metric b { display:block; margin-top:6px; color:#0f2b63; font-size:22px; line-height:1; }
        .tb-metric.green b { color:#16a34a; }
        .tb-metric.gold b { color:#b7791f; }
        .tb-grid { margin-top:18px; display:grid; grid-template-columns:minmax(0,1fr) 350px; gap:18px; align-items:start; }
        .tb-editor { display:grid; gap:18px; min-width:0; }
        .tb-card, .tb-preview-card, .tb-table-card { border:1px solid rgba(226,232,240,.9); border-radius:24px; background:rgba(255,255,255,.92); box-shadow:0 20px 54px rgba(15,43,99,.08); backdrop-filter:blur(14px); }
        .tb-card { padding:22px; }
        .tb-section-title { margin:24px 0 14px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .tb-section-title:first-child { margin-top:0; }
        .tb-section-title h2 { margin:0; color:#0f2b63; font-size:20px; }
        .tb-section-title p { margin:5px 0 0; color:#64748b; font-size:13px; line-height:1.55; }
        .tb-two { display:grid; grid-template-columns:1fr 220px; gap:12px; }
        .tb-field { display:block; }
        .tb-field > span { display:block; margin-bottom:7px; color:#334155; font-size:12px; font-weight:900; }
        .tb-field input, .tb-field textarea, .tb-field select { width:100%; border:1px solid #dbe4ef; border-radius:15px; background:#fff; color:#0f172a; outline:none; font:inherit; }
        .tb-field input, .tb-field select { min-height:44px; padding:0 13px; }
        .tb-field textarea { min-height:170px; padding:13px; resize:vertical; line-height:1.6; }
        .tb-field input:focus, .tb-field textarea:focus, .tb-field select:focus { border-color:#25D366; box-shadow:0 0 0 3px rgba(37,211,102,.13); }
        .tb-error { display:block; margin-top:6px; color:#be123c; font-size:12px; font-weight:800; }
        .tb-category-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:12px; }
        .tb-preset-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .tb-preset { min-height:92px; border:1px solid #dbe4ef; border-radius:18px; background:linear-gradient(180deg,#fff,#f8fafc); padding:14px; text-align:left; cursor:pointer; }
        .tb-preset b { display:block; color:#0f2b63; }
        .tb-preset span { margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; color:#64748b; font-size:12px; line-height:1.45; }
        .tb-error-box { margin-top:12px; border:1px solid #fecdd3; border-radius:16px; background:#fff1f2; color:#be123c; padding:12px; display:flex; align-items:flex-start; gap:8px; font-size:12px; font-weight:850; }
        .tb-category, .tb-header-type, .tb-button-type, .tb-soft, .tb-gold, .tb-danger, .tb-row-action, .tb-ghost { transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease; }
        .tb-category:hover, .tb-header-type:hover, .tb-button-type:hover, .tb-soft:hover, .tb-gold:hover, .tb-danger:hover, .tb-row-action:hover, .tb-ghost:hover { transform:translateY(-1px); }
        .tb-category { min-height:88px; border:1px solid #dbe4ef; border-radius:18px; background:#fff; text-align:left; padding:14px; cursor:pointer; }
        .tb-category b, .tb-category span { display:block; }
        .tb-category b { color:#0f2b63; }
        .tb-category span { margin-top:5px; color:#64748b; font-size:12px; line-height:1.4; }
        .tb-category.is-selected { border-color:#ffda79; background:#fff8e6; box-shadow:0 16px 30px rgba(255,218,121,.18); }
        .tb-header-types { display:grid; grid-template-columns:repeat(5,1fr); gap:9px; }
        .tb-header-type { min-height:70px; border:1px solid #dbe4ef; border-radius:17px; background:#fff; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:7px; padding:12px; color:#2b5893; cursor:pointer; }
        .tb-header-type span { color:#0f2b63; font-weight:900; font-size:12px; }
        .tb-header-type.is-selected { border-color:#25D366; background:#ecfdf5; box-shadow:0 16px 30px rgba(37,211,102,.14); }
        .tb-uploader { border:1.5px dashed #8db3de; border-radius:22px; background:linear-gradient(135deg,#f8fbff,#fff8e6); padding:18px; }
        .tb-uploader.is-active { border-color:#25D366; background:#ecfdf5; }
        .tb-upload-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .tb-media-preview { width:132px; height:96px; border-radius:18px; background:#e8eef7; display:grid; place-items:center; overflow:hidden; color:#2b5893; flex:0 0 auto; }
        .tb-media-preview img, .tb-media-preview video { width:100%; height:100%; object-fit:cover; }
        .tb-upload-copy b, .tb-upload-copy span { display:block; }
        .tb-upload-copy b { color:#0f2b63; }
        .tb-upload-copy span { margin-top:4px; color:#64748b; font-size:13px; }
        .tb-progress { margin-top:12px; height:8px; border-radius:999px; background:#dbeafe; overflow:hidden; }
        .tb-progress i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#25D366,#ffda79); transition:width .2s ease; }
        .tb-upload-actions, .tb-save-bar, .tb-table-actions, .tb-button-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .tb-gold, .tb-soft, .tb-danger { min-height:42px; border-radius:14px; padding:0 15px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-size:13px; font-weight:900; cursor:pointer; }
        .tb-gold { border:1px solid #ffda79; background:#ffda79; color:#0f2b63; box-shadow:0 16px 34px rgba(255,218,121,.18); }
        .tb-soft { border:1px solid #dbe4ef; background:#fff; color:#2b5893; }
        .tb-danger { border:1px solid #fecdd3; background:#fff1f2; color:#be123c; }
        .tb-textarea-wrap { position:relative; }
        .tb-body-tools { position:absolute; right:10px; bottom:10px; display:flex; align-items:center; gap:6px; padding:5px; border-radius:999px; background:rgba(255,255,255,.9); box-shadow:0 8px 20px rgba(15,43,99,.08); }
        .tb-body-tools button { border:0; background:transparent; cursor:pointer; font-size:15px; }
        .tb-body-tools span { padding:0 7px; color:#64748b; font-size:11px; font-weight:900; }
        .tb-highlight, .tb-empty { margin-top:12px; border:1px solid #dbe4ef; border-radius:18px; background:#f8fafc; padding:14px; }
        .tb-highlight span { display:block; color:#2b5893; font-size:11px; font-weight:900; text-transform:uppercase; }
        .tb-highlight p { margin:7px 0 0; white-space:pre-wrap; color:#334155; line-height:1.55; }
        .tb-empty { display:flex; gap:10px; align-items:center; color:#64748b; font-size:13px; }
        .tb-variable-list, .tb-button-list { display:grid; gap:12px; }
        .tb-button-card { border:1px solid #dbe4ef; border-radius:20px; background:linear-gradient(180deg,#fff,#f8fafc); padding:15px; }
        .tb-button-top { justify-content:space-between; margin-bottom:12px; color:#0f2b63; font-weight:900; }
        .tb-button-types { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
        .tb-button-type { border:1px solid #dbe4ef; border-radius:16px; background:#fff; padding:10px; text-align:left; cursor:pointer; }
        .tb-button-type svg { color:#2b5893; }
        .tb-button-type b { display:block; margin-top:6px; color:#0f2b63; font-size:12px; }
        .tb-button-type span { display:block; margin-top:3px; color:#64748b; font-size:10px; }
        .tb-button-type.is-selected { border-color:#25D366; background:#ecfdf5; }
        .tb-save-bar { margin-top:22px; justify-content:space-between; border-top:1px solid #eef2f7; padding-top:18px; }
        .tb-checklist { width:100%; border:1px solid #dbe4ef; border-radius:18px; background:#f8fafc; padding:12px; display:grid; grid-template-columns:repeat(4,1fr); gap:8px; order:-1; }
        .tb-check { display:flex; align-items:center; gap:7px; color:#64748b; font-size:11px; font-weight:900; }
        .tb-check.ok { color:#047857; }
        .tb-check.warn { color:#b45309; }
        .tb-check svg { width:16px; height:16px; flex:0 0 auto; }
        .tb-valid, .tb-invalid { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:900; }
        .tb-valid { color:#16a34a; } .tb-invalid { color:#be123c; }
        .tb-status-pill { min-height:34px; border-radius:999px; padding:0 12px; display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:900; }
        .tb-status-pill.ok { background:#ecfdf5; color:#047857; }
        .tb-status-pill.warn { background:#fff7df; color:#92400e; }
        .tb-preview-column { position:sticky; top:22px; display:grid; gap:16px; }
        .tb-preview-card { padding:18px; }
        .tb-preview-card h2 { margin:0; color:#0f2b63; font-size:18px; }
        .tb-preview-card p { margin:4px 0 14px; color:#64748b; font-size:13px; }
        .tb-phone { width:320px; max-width:100%; height:692px; margin:0 auto; border-radius:44px; background:#07111f; padding:8px; box-shadow:0 28px 64px rgba(15,43,99,.24); }
        .tb-phone-screen { position:relative; height:100%; border-radius:36px; overflow:hidden; background:#ece5dd; display:flex; flex-direction:column; }
        .tb-notch { position:absolute; top:8px; left:50%; transform:translateX(-50%); width:92px; height:20px; border-radius:999px; background:#07111f; z-index:2; }
        .tb-wa-top { height:82px; flex:0 0 82px; background:#075e54; padding:31px 13px 10px; display:flex; align-items:center; gap:9px; color:white; }
        .tb-avatar { width:32px; height:32px; border-radius:999px; background:#25D366; color:#063b2f; display:grid; place-items:center; font-weight:950; font-size:12px; }
        .tb-chat { flex:1; min-height:0; overflow-y:auto; padding:12px; background:radial-gradient(circle at top left,rgba(255,255,255,.55),transparent 30%),#ece5dd; overscroll-behavior:contain; }
        .tb-chat::-webkit-scrollbar { width:5px; } .tb-chat::-webkit-scrollbar-thumb { background:rgba(7,94,84,.28); border-radius:999px; }
        .tb-date { width:max-content; margin:0 auto 10px; border-radius:999px; background:rgba(255,255,255,.75); color:#64748b; padding:4px 10px; font-size:10px; font-weight:900; }
        .tb-bubble { width:calc(100% - 8px); max-width:94%; background:#fff; border-radius:16px 16px 16px 5px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,.07); }
        .tb-bubble-media { width:100%; aspect-ratio:1.91 / 1; min-height:142px; max-height:172px; background:#f1f5f9; display:grid; place-items:center; color:#64748b; }
        .tb-bubble-media img, .tb-bubble-media video { width:100%; height:100%; object-fit:cover; }
        .tb-document-preview { padding:16px; display:flex; align-items:center; gap:10px; background:#f8fafc; color:#0f2b63; font-weight:900; }
        .tb-header-text { padding:12px 13px 0; color:#0f172a; font-size:14px; font-weight:900; }
        .tb-body-preview { padding:10px 13px 4px; white-space:pre-wrap; overflow-wrap:break-word; word-break:normal; color:#1f2937; font-size:13px; line-height:1.55; }
        .tb-footer-preview { padding:0 13px 4px; color:#94a3b8; font-size:11px; }
        .tb-time { padding:0 13px 8px; text-align:right; color:#94a3b8; font-size:10px; }
        .tb-preview-button { width:100%; min-height:38px; border:0; border-top:1px solid #eef2f7; background:#fff; color:#128c7e; display:flex; align-items:center; justify-content:center; gap:7px; font-size:12px; font-weight:900; cursor:pointer; }
        .tb-preview-button.is-active { background:#ecfdf5; color:#075e54; }
        .tb-quick-replies { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
        .tb-quick-replies button { border:1px solid #dbe4ef; border-radius:999px; background:#fff; color:#128c7e; padding:6px 12px; font-size:12px; font-weight:900; cursor:pointer; }
        .tb-compose { height:44px; flex:0 0 44px; padding:7px 9px; display:flex; gap:8px; align-items:center; background:#f8fafc; }
        .tb-compose span { flex:1; border-radius:999px; background:#fff; color:#94a3b8; padding:9px 12px; font-size:12px; }
        .tb-compose button { width:32px; height:32px; border:0; border-radius:999px; background:#25D366; color:#fff; }
        .tb-table-card { overflow:hidden; }
        .tb-table-head { padding:18px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid #eef2f7; }
        .tb-table-head h2 { margin:0; color:#0f2b63; font-size:18px; }
        .tb-library-tools { padding:14px 20px; display:grid; grid-template-columns:1fr 210px; gap:10px; border-bottom:1px solid #eef2f7; background:#fbfdff; }
        .tb-search, .tb-filter { position:relative; }
        .tb-search svg, .tb-filter svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:#64748b; }
        .tb-search input, .tb-filter select { width:100%; min-height:42px; border:1px solid #dbe4ef; border-radius:14px; background:#fff; padding:0 12px 0 38px; color:#0f172a; outline:none; font:inherit; }
        .tb-search input:focus, .tb-filter select:focus { border-color:#25D366; box-shadow:0 0 0 3px rgba(37,211,102,.13); }
        .tb-table { width:100%; border-collapse:collapse; }
        .tb-table th { padding:12px 16px; text-align:left; color:#64748b; background:#f8fafc; font-size:11px; font-weight:900; text-transform:uppercase; }
        .tb-table td { padding:15px 16px; border-top:1px solid #eef2f7; vertical-align:top; font-size:13px; color:#475569; }
        .tb-table td b { display:block; color:#0f172a; }
        .tb-table td p { margin:4px 0 0; max-width:380px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tb-status { display:inline-flex; border-radius:999px; padding:5px 9px; font-size:11px; font-weight:900; text-transform:capitalize; }
        .tb-row-actions { display:flex; gap:7px; align-items:center; }
        .tb-row-action { width:34px; height:34px; border:1px solid #dbe4ef; border-radius:12px; background:#fff; color:#2b5893; display:grid; place-items:center; cursor:pointer; }
        .tb-row-action.danger { border-color:#fecdd3; background:#fff1f2; color:#be123c; }
        @media (max-width:1280px) { .tb-grid { grid-template-columns:1fr; } .tb-preview-column { position:static; } }
        @media (max-width:720px) { .tb-hero { flex-direction:column; padding:22px; } .tb-hero h1 { font-size:28px; } .tb-metrics, .tb-two, .tb-category-grid, .tb-preset-grid, .tb-header-types, .tb-button-types, .tb-library-tools, .tb-checklist { grid-template-columns:1fr; } .tb-upload-inner, .tb-save-bar { align-items:stretch; flex-direction:column; } .tb-phone { width:min(280px,100%); height:606px; } .tb-table { min-width:760px; } }
      `}</style>
    </div>
  );
}

function SectionTitle({ title, copy, action }) {
  return (
    <div className="tb-section-title">
      <div><h2>{title}</h2><p>{copy}</p></div>
      {action}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="tb-field">
      <span>{label}</span>
      {children}
      {error && <small className="tb-error">{error}</small>}
    </label>
  );
}

function MetricCard({ label, value, tone = '' }) {
  return (
    <div className={`tb-metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function StatusPill({ valid, count }) {
  return (
    <span className={`tb-status-pill ${valid ? 'ok' : 'warn'}`}>
      {valid ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
      {valid ? 'Meta-ready draft' : `${count} fix needed`}
    </span>
  );
}

function MetaChecklist({ errors, variables, formData }) {
  const items = [
    { label: 'Identity', ok: !errors.name && !errors.category && !errors.language },
    { label: `${variables.length} variable${variables.length === 1 ? '' : 's'}`, ok: !errors.variables && variables.every((variable) => !errors[`sample_${variable}`]) },
    { label: 'Header', ok: !errors.header && !errors.media },
    { label: 'Buttons', ok: !errors.buttons && formData.buttons.every((_, index) => !errors[`button_${index}`]) }
  ];

  return (
    <div className="tb-checklist">
      {items.map((item) => (
        <div key={item.label} className={`tb-check ${item.ok ? 'ok' : 'warn'}`}>
          {item.ok ? <CheckCircleIcon /> : <ExclamationTriangleIcon />}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function MediaUploader({ type, media, uploading, progress, dragActive, fileInputRef, onUpload, onRemove, setDragActive, error }) {
  const Icon = type === 'video' ? VideoCameraIcon : type === 'document' ? DocumentTextIcon : PhotoIcon;
  return (
    <div
      className={`tb-uploader ${dragActive ? 'is-active' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        onUpload(event.dataTransfer.files?.[0]);
      }}
    >
      <input ref={fileInputRef} type="file" accept={getMediaAccept(type)} className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
      <div className="tb-upload-inner">
        <div className="tb-media-preview">
          {media?.type === 'image' && media?.url ? <img src={media.url} alt="Header sample" /> : null}
          {media?.type === 'video' && media?.url ? <video src={media.url} muted /> : null}
          {media?.type === 'document' && media?.url ? <DocumentTextIcon className="h-10 w-10" /> : null}
          {!media?.url && <Icon className="h-10 w-10" />}
        </div>
        <div className="tb-upload-copy flex-1">
          <b>{media?.filename || `Upload ${type} header sample`}</b>
          <span>{getSupportedFormats(type)}</span>
          {error && <small className="tb-error">{error}</small>}
        </div>
        <div className="tb-upload-actions">
          <button type="button" className="tb-gold" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CloudArrowUpIcon className="h-5 w-5" />}
            {media?.url ? 'Replace' : 'Upload'}
          </button>
          {media?.url && <button type="button" className="tb-danger" onClick={onRemove}><XMarkIcon className="h-5 w-5" /> Remove</button>}
        </div>
      </div>
      {uploading && <div className="tb-progress"><i style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}

function ButtonEditor({ button, index, error, updateButton, removeButton }) {
  return (
    <div className="tb-button-card">
      <div className="tb-button-top">
        <span>Button {index + 1}</span>
        <button type="button" className="tb-danger" onClick={() => removeButton(index)}><TrashIcon className="h-4 w-4" /> Remove</button>
      </div>
      <div className="tb-button-types">
        {BUTTON_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button key={type.value} type="button" className={`tb-button-type ${button.type === type.value ? 'is-selected' : ''}`} onClick={() => updateButton(index, 'type', type.value)}>
              <Icon className="h-5 w-5" />
              <b>{type.label}</b>
              <span>{type.helper}</span>
            </button>
          );
        })}
      </div>
      <div className="tb-two">
        <Field label="Button Text" error={error}>
          <input value={button.text || ''} maxLength={25} onChange={(event) => updateButton(index, 'text', event.target.value)} placeholder="Apply Now" />
        </Field>
        {button.type === 'url' && <Field label="Website URL"><input value={button.url || ''} onChange={(event) => updateButton(index, 'url', event.target.value)} placeholder="https://example.com/apply" /></Field>}
        {button.type === 'phone_number' && <Field label="Phone Number" error={error}><input value={button.phoneNumber || ''} onBlur={(event) => updateButton(index, 'phoneNumber', normalizePhoneInput(event.target.value))} onChange={(event) => updateButton(index, 'phoneNumber', event.target.value.replace(/[^\d+]/g, ''))} placeholder="+919999999999" /></Field>}
        {button.type === 'copy_offer_code' && <Field label="Offer Code"><input value={button.offerCode || ''} onChange={(event) => updateButton(index, 'offerCode', event.target.value.toUpperCase())} placeholder="SAVE20" /></Field>}
      </div>
    </div>
  );
}

function PhonePreview({ formData, previewBody, chatRef, activeButton, setActiveButton }) {
  const quickReplies = formData.buttons.filter((button) => button.type === 'custom');
  const actionButtons = formData.buttons.filter((button) => button.type !== 'custom');
  return (
    <div className="tb-preview-card">
      <h2>Live Mobile Preview</h2>
      <p>Fixed 390x844 WhatsApp frame with internal scrolling and live button interactions.</p>
      <div className="tb-phone">
        <div className="tb-phone-screen">
          <div className="tb-notch" />
          <div className="tb-wa-top">
            <div className="tb-avatar">W</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">WaAuto</p>
              <p className="text-[10px] text-white/70">Business account</p>
            </div>
          </div>
          <div ref={chatRef} className="tb-chat">
            <div className="tb-date">Today</div>
            <div className="tb-bubble">
              {formData.header.type === 'text' && formData.header.text && <div className="tb-header-text">{formData.header.text}</div>}
              {['image', 'video', 'document'].includes(formData.header.type) && (
                <div className="tb-bubble-media">
                  {formData.media?.type === 'image' && formData.media?.url && <img src={formData.media.url} alt="" />}
                  {formData.media?.type === 'video' && formData.media?.url && <video src={formData.media.url} muted />}
                  {formData.media?.type === 'document' && formData.media?.url && <div className="tb-document-preview"><DocumentTextIcon className="h-7 w-7" /> {formData.media.filename || 'Document'}</div>}
                  {!formData.media?.url && <span>{formData.header.type} header preview</span>}
                </div>
              )}
              <div className="tb-body-preview">{previewBody}</div>
              {formData.footer && <div className="tb-footer-preview">{formData.footer}</div>}
              <div className="tb-time">11:42 AM</div>
              {actionButtons.map((button, index) => (
                <button key={`${button.type}-${index}`} type="button" className={`tb-preview-button ${activeButton === index ? 'is-active' : ''}`} onClick={() => setActiveButton(index)}>
                  {button.type === 'url' && <LinkIcon className="h-4 w-4" />}
                  {button.type === 'phone_number' && <PhoneIcon className="h-4 w-4" />}
                  {button.type === 'copy_offer_code' && <ClipboardDocumentIcon className="h-4 w-4" />}
                  {button.text || 'Button'}
                </button>
              ))}
            </div>
            {!!quickReplies.length && (
              <div className="tb-quick-replies">
                {quickReplies.map((button, index) => <button key={index} type="button">{button.text || 'Quick reply'}</button>)}
              </div>
            )}
          </div>
          <div className="tb-compose"><span>Message</span><button type="button">{'>'}</button></div>
        </div>
      </div>
    </div>
  );
}

function TemplateTable({ templates, totalTemplates, loading, search, statusFilter, setSearch, setStatusFilter, submitForApproval, syncOne, deleteTemplate }) {
  return (
    <section className="tb-table-card">
      <div className="tb-table-head"><h2>Template Library</h2><span className="text-sm font-bold text-slate-500">{templates.length} of {totalTemplates}</span></div>
      <div className="tb-library-tools">
        <label className="tb-search">
          <MagnifyingGlassIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates, category, or body..." />
        </label>
        <label className="tb-filter">
          <FunnelIcon />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="tb-table">
          <thead><tr><th>Template</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="py-10 text-center">Loading...</td></tr> : templates.length === 0 ? <tr><td colSpan={4} className="py-10 text-center">No templates yet.</td></tr> : templates.map((template) => (
              <tr key={template._id}>
                <td><b>{template.name}</b><p>{template.body}</p></td>
                <td className="capitalize">{template.category}</td>
                <td><span className={`tb-status ${STATUS_STYLES[template.status] || STATUS_STYLES.draft}`}>{template.status}</span></td>
                <td>
                  <div className="tb-row-actions">
                    {template.status === 'draft' && <button type="button" className="tb-row-action" onClick={() => submitForApproval(template._id)} title="Submit"><PaperAirplaneIcon className="h-4 w-4" /></button>}
                    <button type="button" className="tb-row-action" onClick={() => syncOne(template._id)} title="Sync"><ArrowPathIcon className="h-4 w-4" /></button>
                    <button type="button" className="tb-row-action danger" onClick={() => deleteTemplate(template._id)} title="Delete"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ShieldIcon() {
  return <CheckCircleIcon className="h-4 w-4" />;
}
