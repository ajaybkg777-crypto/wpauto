import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { broadcastAPI, leadAPI, templateAPI, whatsappAPI } from '../../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  MegaphoneIcon,
  PhotoIcon,
  ShieldCheckIcon,
  TrashIcon,
  DocumentArrowUpIcon,
  UsersIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const initialForm = {
  name: '',
  message: '',
  templateId: '',
  templateVariables: [],
  media: null,
  recipientType: 'status',
  statusFilter: 'interested',
  tagFilter: '',
  selectedLeads: [],
  csvRecipients: [],
  csvColumns: [],
  csvFilename: '',
  scheduledAt: '',
  type: 'marketing'
};

const detectVariables = (body = '') => {
  const matches = String(body).match(/{{\s*\d+\s*}}/g) || [];
  return [...new Set(matches.map((match) => match.replace(/[{}\s]/g, '')))]
    .sort((left, right) => Number(left) - Number(right));
};

const isPublicUrl = (url = '') => /^https?:\/\//i.test(url);

const toLocalDateTimeValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const parseCsvText = (text = '') => {
  const firstLine = String(text || '').split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
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
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => String(value || '').trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => String(value || '').trim())) rows.push(row);
  return rows;
};

const csvRowsToObjects = (text = '') => {
  const rows = parseCsvText(text);
  if (rows.length < 2) return { columns: [], recipients: [] };
  const columns = rows[0].map((column) => String(column || '').trim()).filter(Boolean);
  const recipients = rows.slice(1).map((row) => {
    return columns.reduce((item, column, index) => {
      item[column] = String(row[index] || '').trim();
      return item;
    }, {});
  }).filter((row) => getRowPhoneValue(row));
  return { columns, recipients };
};

const xmlTextToObjects = (text = '') => {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) throw new Error('Invalid XML file');

  const allElements = Array.from(document.querySelectorAll('*'));
  const recordElements = allElements.filter((element) => {
    const childElements = Array.from(element.children);
    if (!childElements.length) return false;
    return childElements.some((child) => /^(phone|mobile|number)$/i.test(child.tagName));
  });

  const recipients = recordElements.map((element) => {
    const row = {};
    Array.from(element.attributes || []).forEach((attribute) => {
      row[attribute.name] = String(attribute.value || '').trim();
    });
    Array.from(element.children).forEach((child) => {
      if (child.children.length) return;
      row[child.tagName] = String(child.textContent || '').trim();
    });
    return row;
  }).filter((row) => getRowPhoneValue(row));

  const columns = [...new Set(recipients.flatMap((row) => Object.keys(row)))];
  return { columns, recipients };
};

const getAudienceRowsFromFile = (text = '', filename = '', type = '') => {
  const cleanText = String(text || '').replace(/^\uFEFF/, '').trim();
  const isXml = /\.xml$/i.test(filename) || /xml/i.test(type) || cleanText.startsWith('<');
  return isXml ? xmlTextToObjects(cleanText) : csvRowsToObjects(cleanText);
};

const normalizeColumnKey = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const isPhoneColumn = (column = '') => {
  const key = normalizeColumnKey(column);
  return [
    'phone',
    'mobile',
    'number',
    'phoneno',
    'mobileno',
    'contactno',
    'whatsapp',
    'whatsappno',
    'contact',
    'cell',
    'cellphone'
  ].includes(key)
    || key.includes('phonenumber')
    || key.includes('mobilenumber')
    || key.includes('whatsappnumber')
    || key.includes('contactnumber');
};

const getPhoneColumn = (columns = []) => columns.find((column) => isPhoneColumn(column));
const getRowPhoneValue = (row = {}) => {
  const phoneColumn = getPhoneColumn(Object.keys(row));
  return phoneColumn ? row[phoneColumn] : '';
};
const getVariableColumns = (columns = []) => columns.filter((column) => !isPhoneColumn(column));

const resolvePreviewVariableValue = (value = '', formData = {}) => {
  const sampleRow = formData.csvRecipients?.[0] || {};
  const samplePhone = getRowPhoneValue(sampleRow) || '919826763101';
  const context = {
    lead_name: sampleRow.Name || sampleRow.name || 'Sample Parent',
    name: sampleRow.Name || sampleRow.name || 'Sample Parent',
    school_name: 'BKG International School',
    phone: samplePhone,
    ...sampleRow
  };
  const normalizedContext = Object.entries(context).reduce((items, [key, item]) => {
    items[String(key).toLowerCase()] = item == null ? '' : String(item);
    return items;
  }, {});

  return String(value || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) => {
    if (context[key] !== undefined && context[key] !== null) return String(context[key]);
    return normalizedContext[String(key).toLowerCase()] ?? match;
  });
};

export default function CreateBroadcast() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeButton, setActiveButton] = useState(null);
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [whatsapp, setWhatsapp] = useState({});
  const [formData, setFormData] = useState(initialForm);

  const selectedTemplate = templates.find((template) => template._id === formData.templateId);
  const variables = useMemo(() => detectVariables(selectedTemplate?.body || formData.message), [selectedTemplate?.body, formData.message]);
  const headerType = selectedTemplate?.header?.type || 'none';
  const needsImageHeader = headerType === 'image';
  const unsupportedHeader = ['video', 'document', 'location'].includes(headerType);
  const variablesComplete = variables.every((_, index) => String(formData.templateVariables[index] || '').trim());
  const imageReady = !needsImageHeader || Boolean(formData.media?.url);
  const imagePublicReady = !needsImageHeader || isPublicUrl(formData.media?.url);
  const scheduleReady = !formData.scheduledAt || new Date(formData.scheduledAt).getTime() > Date.now();
  const metaReady = Boolean(whatsapp?.isConnected);
  const metaVerified = whatsapp?.businessVerificationStatus === 'verified'
    || whatsapp?.accountReviewStatus === 'APPROVED';

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (formData.recipientType === 'selected' && leads.length === 0) {
      fetchLeads();
    }
  }, [formData.recipientType]);

  const bootstrap = async () => {
    setBooting(true);
    try {
      const [templatesResponse, whatsappResponse] = await Promise.all([
        templateAPI.syncTemplates().catch(() => templateAPI.getTemplates()),
        whatsappAPI.getConfig()
      ]);
      setTemplates((templatesResponse.data.data || []).filter((template) => template.status === 'approved'));
      setWhatsapp(whatsappResponse.data.data || {});
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load broadcast builder');
    } finally {
      setBooting(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await leadAPI.getLeads({ limit: 1000 });
      setLeads(response.data.data || []);
    } catch (error) {
      toast.error('Could not load contacts');
    }
  };

  const renderedMessage = useMemo(() => {
    let text = selectedTemplate?.body || formData.message || 'Select a Meta-approved template to preview your WhatsApp broadcast.';
    variables.forEach((variable, index) => {
      const value = resolvePreviewVariableValue(formData.templateVariables[index] || `Sample ${variable}`, formData);
      text = text.replace(new RegExp(`{{\\s*${variable}\\s*}}`, 'g'), value);
    });
    return text;
  }, [formData, selectedTemplate?.body, variables]);

  const audienceLabel = useMemo(() => {
    if (formData.recipientType === 'selected') return `${formData.selectedLeads.length} selected`;
    if (formData.recipientType === 'csv') return formData.csvRecipients.length ? `${formData.csvRecipients.length} file contacts` : 'CSV/XML required';
    if (formData.recipientType === 'all') return 'All contacts';
    if (formData.recipientType === 'status') return `Status: ${formData.statusFilter}`;
    if (formData.recipientType === 'tag') return formData.tagFilter ? `Tag: ${formData.tagFilter}` : 'Tag required';
    return '-';
  }, [formData]);

  const canTemplateContinue = Boolean(formData.name.trim() && selectedTemplate && formData.message && !unsupportedHeader);
  const canAudienceContinue = validateAudience(false);
  const canSubmit = metaReady && canTemplateContinue && canAudienceContinue && variablesComplete && imageReady && imagePublicReady && scheduleReady;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleTemplateSelect = (template) => {
    const nextVariables = detectVariables(template.body);
    setFormData((current) => ({
      ...current,
      templateId: template._id,
      message: template.body || '',
      type: template.category || current.type,
      media: template.header?.type === 'image' ? (template.media?.url ? template.media : null) : null,
      templateVariables: nextVariables.map((variable, index) => current.templateVariables[index] || getDefaultVariableValue(variable))
    }));
    setStep(1);
  };

  const updateVariable = (index, value) => {
    setFormData((current) => {
      const next = [...current.templateVariables];
      next[index] = value;
      return { ...current, templateVariables: next };
    });
  };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxSize = 25 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.size > maxSize) {
      toast.error('Image must be 25MB or less');
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      toast.error('Use JPG, PNG, or WEBP image for Meta header');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Use an image file for this template header');
      return;
    }

    const payload = new FormData();
    payload.append('image', file);
    setUploadingImage(true);

    try {
      const response = await broadcastAPI.uploadImage(payload);
      const image = response.data.data;
      setFormData((current) => ({
        ...current,
        media: {
          type: 'image',
          url: image.publicUrl || image.url,
          filename: image.filename
        }
      }));
      toast.success('Header image added');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const removeImage = () => {
    setFormData((current) => ({ ...current, media: null }));
  };

  const uploadCsvAudience = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { columns, recipients } = getAudienceRowsFromFile(text, file.name, file.type);
      if (!getPhoneColumn(columns)) {
        toast.error('File me Phone, Mobile, ya Number field hona chahiye');
        return;
      }
      if (!recipients.length) {
        toast.error('File has no valid phone rows');
        return;
      }
      setFormData((current) => ({
        ...current,
        templateVariables: variables.map((variable, index) => {
          const currentValue = current.templateVariables[index] || '';
          const defaultValue = getDefaultVariableValue(variable);
          const shouldAutoMap = !currentValue || currentValue === defaultValue || /^Sample\s+/i.test(currentValue);
          if (!shouldAutoMap) return currentValue;
          const column = getVariableColumns(columns)[index];
          return column ? `{{${column}}}` : currentValue || defaultValue;
        }),
        recipientType: 'csv',
        csvRecipients: recipients,
        csvColumns: columns,
        csvFilename: file.name
      }));
      toast.success(`${recipients.length} contacts loaded from ${file.name}`);
    } catch (error) {
      toast.error(error.message || 'File read nahi ho payi');
    } finally {
      event.target.value = '';
    }
  };

  const handleLeadSelect = (leadId) => {
    setFormData((current) => ({
      ...current,
      selectedLeads: current.selectedLeads.includes(leadId)
        ? current.selectedLeads.filter((id) => id !== leadId)
        : [...current.selectedLeads, leadId]
    }));
  };

  const setSchedulePreset = (daysFromNow) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    date.setMinutes(date.getMinutes() + 5);
    setFormData((current) => ({
      ...current,
      scheduledAt: toLocalDateTimeValue(date)
    }));
  };

  function validateAudience(showToast = true) {
    if (formData.recipientType === 'tag' && !formData.tagFilter.trim()) {
      if (showToast) toast.error('Enter a tag for the audience');
      return false;
    }

    if (formData.recipientType === 'selected' && formData.selectedLeads.length === 0) {
      if (showToast) toast.error('Select at least one contact');
      return false;
    }

    if (formData.recipientType === 'csv' && formData.csvRecipients.length === 0) {
      if (showToast) toast.error('Upload CSV/XML audience first');
      return false;
    }

    return true;
  }

  const goToStep = (nextStep) => {
    if (nextStep > 1 && !metaReady) {
      toast.error('Connect Meta WhatsApp before creating broadcasts');
      return;
    }
    if (nextStep > 2 && !canTemplateContinue) {
      toast.error(unsupportedHeader ? 'This broadcast builder currently supports text and image header templates' : 'Choose an approved Meta template first');
      return;
    }
    if (nextStep > 2 && !variablesComplete) {
      toast.error('Fill every template variable before selecting audience');
      return;
    }
    if (nextStep > 3 && !validateAudience()) return;
    if (nextStep > 4 && !scheduleReady) {
      toast.error('Choose a future schedule time or use manual start');
      return;
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      toast.error(needsImageHeader && !formData.media?.url
        ? 'Upload an image header before creating this broadcast'
        : !imagePublicReady
          ? 'Image header needs a public URL. Set APP_BASE_URL in backend and upload again.'
          : !variablesComplete
            ? 'Fill every template variable before creating this broadcast'
            : !scheduleReady
              ? 'Schedule time must be in the future'
              : 'Complete the broadcast setup first');
      return;
    }

    setLoading(true);
    try {
      await broadcastAPI.createBroadcast({
        name: formData.name,
        message: renderedMessage,
        templateId: formData.templateId,
        templateVariables: formData.templateVariables,
        media: formData.media,
        recipientType: formData.recipientType,
        statusFilter: formData.statusFilter,
        tagFilter: formData.tagFilter,
        recipientIds: formData.selectedLeads,
        csvRecipients: formData.recipientType === 'csv' ? formData.csvRecipients : [],
        scheduledAt: formData.scheduledAt || null,
        type: formData.type
      });
      toast.success('Broadcast campaign created');
      navigate('/broadcast');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create broadcast');
    } finally {
      setLoading(false);
    }
  };

  if (booting) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#ffda79] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="broadcast-builder">
      <div
        className="bb-hero"
        style={{
          background: 'radial-gradient(circle at 88% 10%, rgba(255,218,121,.18), transparent 28%), linear-gradient(135deg,#075E54 0%,#128C7E 100%)',
          boxShadow: '0 26px 70px rgba(7,94,84,.22)'
        }}
      >
        <button type="button" onClick={() => navigate('/broadcast')} className="bb-back" aria-label="Back to broadcasts">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div>
          <div className="bb-eyebrow"><MegaphoneIcon className="h-4 w-4" /> Meta WhatsApp Marketing</div>
          <h1>Broadcast Campaign Builder</h1>
          <p>Design approved-template campaigns with targeting, scheduling, variables, media headers, and WhatsApp-native previews.</p>
        </div>
        <div className="bb-hero-actions">
          <Link to="/templates" className="bb-ghost"><ShieldCheckIcon className="h-5 w-5" /> Templates</Link>
          <Link to="/whatsapp-setup" className="bb-gold">{metaReady ? 'Meta Connected' : 'Connect Meta'}</Link>
        </div>
      </div>

      <div className="bb-metrics">
        <Metric label="Meta Status" value={metaReady ? 'Connected' : 'Required'} tone={metaReady ? 'green' : 'gold'} />
        <Metric label="Verification" value={metaVerified ? 'Verified' : metaReady ? 'Review' : 'Pending'} />
        <Metric label="Templates" value={templates.length} />
        <Metric label="Audience" value={audienceLabel} />
      </div>

      {!metaReady && (
        <div className="bb-alert">
          <ExclamationTriangleIcon className="h-6 w-6" />
          <div>
            <b>Meta connection required</b>
            <span>Connect your WhatsApp Business account before creating or sending a broadcast campaign.</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bb-layout">
        <main className="bb-main">
          <nav className="bb-steps">
            <StepButton index={1} label="Template" active={step === 1} done={canTemplateContinue} onClick={() => goToStep(1)} />
            <StepButton index={2} label="Variables" active={step === 2} done={variables.length === 0 || formData.templateVariables.every(Boolean)} onClick={() => goToStep(2)} />
            <StepButton index={3} label="Audience" active={step === 3} done={canAudienceContinue} onClick={() => goToStep(3)} />
            <StepButton index={4} label="Schedule" active={step === 4} done={Boolean(formData.scheduledAt)} onClick={() => goToStep(4)} />
            <StepButton index={5} label="Review" active={step === 5} done={canSubmit} onClick={() => goToStep(5)} />
          </nav>

          <section className="bb-panel">
            {step === 1 && (
              <TemplateStep
                formData={formData}
                templates={templates}
                selectedTemplate={selectedTemplate}
                needsImageHeader={needsImageHeader}
                unsupportedHeader={unsupportedHeader}
                imagePublicReady={imagePublicReady}
                uploadingImage={uploadingImage}
                fileInputRef={fileInputRef}
                onChange={handleChange}
                onTemplateSelect={handleTemplateSelect}
                onUploadImage={uploadImage}
                onRemoveImage={removeImage}
                onNext={() => goToStep(2)}
                disabled={!metaReady}
              />
            )}

            {step === 2 && (
              <VariableStep
                variables={variables}
                variablesComplete={variablesComplete}
                values={formData.templateVariables}
                formData={formData}
                csvInputRef={csvInputRef}
                onUpdate={updateVariable}
                onCsvUpload={uploadCsvAudience}
                onBack={() => goToStep(1)}
                onNext={() => goToStep(3)}
              />
            )}

            {step === 3 && (
              <AudienceStep
                formData={formData}
                leads={leads}
                csvInputRef={csvInputRef}
                onChange={handleChange}
                onLeadSelect={handleLeadSelect}
                onCsvUpload={uploadCsvAudience}
                onBack={() => goToStep(2)}
                onNext={() => goToStep(4)}
              />
            )}

            {step === 4 && (
              <ScheduleStep
                formData={formData}
                onChange={handleChange}
                setSchedulePreset={setSchedulePreset}
                setFormData={setFormData}
                scheduleReady={scheduleReady}
                onBack={() => goToStep(3)}
                onNext={() => goToStep(5)}
              />
            )}

            {step === 5 && (
              <ReviewStep
                formData={formData}
                selectedTemplate={selectedTemplate}
                audienceLabel={audienceLabel}
                headerType={headerType}
                loading={loading}
                canSubmit={canSubmit}
                onBack={() => goToStep(4)}
              />
            )}
          </section>
        </main>

        <aside className="bb-preview-wrap">
          <PhonePreview
            whatsapp={whatsapp}
            template={selectedTemplate}
            message={renderedMessage}
            media={formData.media}
            activeButton={activeButton}
            setActiveButton={setActiveButton}
          />
        </aside>
      </form>

      <style>{`
        html { scroll-behavior: smooth; }
        .broadcast-builder { min-height: 100vh; color: #0f172a; }
        .broadcast-builder, .bb-layout, .bb-main, .bb-panel { max-width: 100%; min-width: 0; }
        .broadcast-builder { overflow-x: hidden; }
        .bb-hero { position: relative; overflow: hidden; border-radius: 24px; padding: 28px; display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: start; background: radial-gradient(circle at 88% 10%, rgba(255,218,121,.18), transparent 28%), linear-gradient(135deg,#075E54 0%,#128C7E 100%) !important; color: white; box-shadow: 0 26px 70px rgba(7,94,84,.22) !important; }
        .bb-hero::after { content: ""; position: absolute; right: -110px; bottom: -150px; width: 360px; height: 360px; border-radius: 999px; background: radial-gradient(circle, rgba(255,218,121,.38), rgba(37,211,102,.16), transparent 68%); }
        .bb-back, .bb-ghost, .bb-gold, .bb-action, .bb-soft, .bb-danger, .bb-template-card, .bb-audience-card, .bb-step, .bb-cta-btn { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease; }
        .bb-back { width: 44px; height: 44px; border: 1px solid rgba(255,255,255,.16); border-radius: 14px; background: rgba(255,255,255,.1); color: white; display: grid; place-items: center; }
        .bb-eyebrow { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,218,121,.35); border-radius: 999px; padding: 7px 11px; background: rgba(255,255,255,.1); color: #ffda79; font-size: 12px; font-weight: 900; text-transform: uppercase; }
        .bb-hero h1 { margin: 16px 0 0; font-size: 34px; line-height: 1.05; letter-spacing: 0; }
        .bb-hero p { margin: 10px 0 0; max-width: 760px; color: rgba(255,255,255,.76); line-height: 1.65; }
        .bb-hero-actions { position: relative; z-index: 1; display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .bb-ghost, .bb-gold { min-height: 44px; border-radius: 14px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; font-weight: 900; font-size: 13px; }
        .bb-ghost { border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.1); color: white; }
        .bb-gold { border: 1px solid rgba(255,218,121,.7); background: #ffda79; color: #075E54; box-shadow: 0 18px 34px rgba(255,218,121,.2); }
        .bb-metrics { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .bb-metric, .bb-panel, .bb-analytics, .bb-phone-shell { border: 1px solid rgba(226,232,240,.9); background: rgba(255,255,255,.92); box-shadow: 0 18px 42px rgba(15,43,99,.08); }
        .bb-metric { border-radius: 18px; padding: 16px; }
        .bb-metric span { display: block; color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .bb-metric b { display: block; margin-top: 7px; color: #075E54; font-size: 18px; }
        .bb-metric.green b { color: #16a34a; }
        .bb-metric.gold b { color: #b7791f; }
        .bb-alert { margin-top: 16px; border: 1px solid rgba(255,218,121,.8); border-radius: 18px; background: #fff7df; color: #7c4a03; padding: 16px; display: flex; gap: 12px; align-items: flex-start; }
        .bb-alert b, .bb-alert span { display: block; }
        .bb-alert span { margin-top: 3px; font-size: 13px; color: #8a5a10; }
        .bb-layout { margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
        .bb-main { display: grid; gap: 14px; }
        .bb-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; }
        .bb-step { border: 1px solid #dbe4ef; border-radius: 16px; background: #fff; padding: 13px; text-align: left; cursor: pointer; }
        .bb-step.is-active { border-color: #ffda79; background: #fff8e6; box-shadow: 0 16px 30px rgba(255,218,121,.16); }
        .bb-step b { display: block; color: #075E54; font-size: 13px; }
        .bb-step span { margin-top: 3px; display: inline-flex; color: #64748b; font-size: 11px; font-weight: 800; }
        .bb-panel { border-radius: 22px; padding: 22px; overflow: hidden; }
        .bb-section-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 18px; }
        .bb-section-head h2 { margin: 0; color: #075E54; font-size: 21px; }
        .bb-section-head p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
        .bb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .bb-template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-height: 420px; overflow-y: auto; padding-right: 4px; overscroll-behavior: contain; }
        .bb-template-grid::-webkit-scrollbar, .bb-leads::-webkit-scrollbar, .bb-chat::-webkit-scrollbar { width: 5px; }
        .bb-template-grid::-webkit-scrollbar-thumb, .bb-leads::-webkit-scrollbar-thumb, .bb-chat::-webkit-scrollbar-thumb { background: rgba(15,43,99,.22); border-radius: 999px; }
        .bb-template-card { border: 1px solid #dbe4ef; border-radius: 18px; background: linear-gradient(180deg,#fff,#f8fafc); padding: 15px; cursor: pointer; text-align: left; }
        .bb-template-card.is-selected { border-color: #25D366; background: linear-gradient(135deg,#ecfdf5,#fff); box-shadow: 0 18px 34px rgba(37,211,102,.16); }
        .bb-template-card h3 { margin: 0; color: #075E54; font-size: 15px; }
        .bb-template-card p { margin: 8px 0 0; color: #64748b; font-size: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .bb-tags { margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
        .bb-tags span { border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 10px; font-weight: 900; padding: 4px 8px; text-transform: uppercase; }
        .bb-field { display: block; }
        .bb-field span { display: block; margin-bottom: 7px; color: #334155; font-size: 12px; font-weight: 900; }
        .bb-field input, .bb-field select { width: 100%; min-height: 44px; border: 1px solid #dbe4ef; border-radius: 14px; background: #fff; padding: 0 13px; color: #0f172a; outline: none; }
        .bb-field input:focus, .bb-field select:focus { border-color: #25D366; box-shadow: 0 0 0 3px rgba(37,211,102,.13); }
        .bb-image-uploader { border: 1.5px dashed #8db3de; border-radius: 20px; background: linear-gradient(135deg,#f8fbff,#fff8e6); padding: 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .bb-image-preview { width: 126px; height: 92px; border-radius: 16px; overflow: hidden; background: #e2e8f0; flex: 0 0 auto; display: grid; place-items: center; color: #128C7E; }
        .bb-image-preview img { width: 100%; height: 100%; object-fit: cover; }
        .bb-image-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .bb-action, .bb-soft, .bb-danger { border-radius: 14px; min-height: 42px; padding: 0 15px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 900; font-size: 13px; }
        .bb-action { border: 1px solid #ffda79; background: #ffda79; color: #075E54; }
        .bb-soft { border: 1px solid #dbe4ef; background: #fff; color: #075E54; }
        .bb-danger { border: 1px solid #fecdd3; background: #fff1f2; color: #be123c; }
        .bb-nav { margin-top: 18px; display: flex; justify-content: space-between; gap: 10px; }
        .bb-variable-list { display: grid; gap: 12px; }
        .bb-csv-map { margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border: 1px solid #dbe4ef; border-radius: 18px; padding: 14px; background: linear-gradient(135deg,#f8fafc,#ffffff); }
        .bb-csv-map span, .bb-column-bank span, .bb-sample-value span { display: block; color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .bb-csv-map b { display: block; margin-top: 4px; color: #075E54; font-size: 14px; }
        .bb-csv-map p { margin-top: 4px; color: #64748b; font-size: 12px; line-height: 1.45; }
        .bb-column-bank { margin-bottom: 14px; border: 1px solid #dbe4ef; border-radius: 16px; padding: 12px; background: #f8fafc; }
        .bb-column-bank div, .bb-map-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 9px; }
        .bb-column-bank code { border: 1px solid #cbd5e1; border-radius: 999px; background: #fff; color: #075E54; padding: 6px 9px; font-size: 12px; font-weight: 900; }
        .bb-variable-row { display: grid; grid-template-columns: 90px minmax(0, 1fr) 160px; gap: 12px; align-items: start; border: 1px solid #dbe4ef; border-radius: 16px; padding: 12px; background: #f8fafc; }
        .bb-variable-row code { color: #075E54; font-weight: 900; }
        .bb-map-actions button { border: 1px solid #dbe4ef; border-radius: 999px; background: #fff; color: #075E54; padding: 5px 8px; font-size: 11px; font-weight: 900; cursor: pointer; }
        .bb-map-actions button:hover { border-color: #25D366; background: #ecfdf5; color: #047857; }
        .bb-sample-value { min-width: 0; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 10px; background: #fff; }
        .bb-sample-value b { display: block; margin-top: 4px; color: #075E54; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
        .bb-audience-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .bb-audience-card { border: 1px solid #dbe4ef; border-radius: 18px; background: #fff; padding: 15px; cursor: pointer; }
        .bb-audience-card.is-selected { border-color: #25D366; background: #ecfdf5; }
        .bb-audience-card b { color: #075E54; }
        .bb-audience-card span { display: block; margin-top: 5px; color: #64748b; font-size: 12px; }
        .bb-leads { max-height: 280px; overflow-y: auto; border: 1px solid #dbe4ef; border-radius: 18px; overscroll-behavior: contain; }
        .bb-lead { display: flex; align-items: center; gap: 10px; padding: 12px; border-bottom: 1px solid #eef2f7; }
        .bb-lead:last-child { border-bottom: 0; }
        .bb-review-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .bb-preview-wrap { position: sticky; top: 22px; display: grid; gap: 16px; }
        .bb-phone-shell { border-radius: 26px; padding: 16px; }
        .bb-phone { width: 280px; height: 606px; margin: 0 auto; border-radius: 40px; background: #07111f; padding: 7px; box-shadow: 0 28px 64px rgba(15,43,99,.24); }
        .bb-phone-screen { height: 100%; border-radius: 33px; overflow: hidden; background: #ece5dd; display: flex; flex-direction: column; position: relative; }
        .bb-notch { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 76px; height: 15px; border-radius: 999px; background: #07111f; z-index: 2; }
        .bb-wa-top { height: 76px; flex: 0 0 76px; background: #075e54; padding: 28px 12px 9px; display: flex; gap: 8px; align-items: center; color: #fff; }
        .bb-avatar { width: 30px; height: 30px; border-radius: 999px; background: #25D366; color: #063b2f; display: grid; place-items: center; font-weight: 950; font-size: 12px; }
        .bb-chat { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; background: radial-gradient(circle at top left,rgba(255,255,255,.55),transparent 30%), #ece5dd; overscroll-behavior: contain; }
        .bb-date { width: max-content; margin: 0 auto 10px; border-radius: 999px; background: rgba(255,255,255,.75); color: #64748b; padding: 4px 9px; font-size: 10px; font-weight: 900; }
        .bb-bubble { width: calc(100% - 8px); max-width: 94%; background: #fff; border-radius: 15px 15px 15px 5px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,.07); }
        .bb-bubble img { width: 100%; aspect-ratio: 1.91 / 1; max-height: 158px; object-fit: cover; display: block; }
        .bb-header-placeholder { aspect-ratio: 1.91 / 1; min-height: 112px; display: grid; place-items: center; background: #f1f5f9; color: #64748b; font-size: 12px; font-weight: 900; }
        .bb-bubble-body { padding: 10px 12px 4px; white-space: pre-wrap; font-size: 12px; line-height: 1.55; color: #1f2937; overflow-wrap: break-word; word-break: normal; }
        .bb-footer { padding: 2px 12px; color: #94a3b8; font-size: 10px; }
        .bb-time { padding: 0 12px 8px; text-align: right; color: #94a3b8; font-size: 9px; }
        .bb-cta-btn { border-top: 1px solid #eef2f7; width: 100%; min-height: 36px; background: #fff; color: #128c7e; font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .bb-cta-btn.is-active { background: #ecfdf5; color: #075e54; }
        .bb-compose { height: 42px; flex: 0 0 42px; background: #f8fafc; padding: 7px 9px; display: flex; gap: 8px; align-items: center; }
        .bb-compose span { flex: 1; border-radius: 999px; background: #fff; color: #94a3b8; padding: 7px 11px; font-size: 11px; }
        .bb-send { width: 28px; height: 28px; border-radius: 999px; border: 0; background: #25D366; color: #fff; }
        .bb-analytics { border-radius: 22px; padding: 18px; }
        .bb-analytics h3 { margin: 0; color: #075E54; font-size: 17px; }
        .bb-analytics-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .bb-mini, .bb-info { border: 1px solid #dbe4ef; border-radius: 16px; background: #f8fafc; padding: 13px; }
        .bb-mini svg { width: 21px; height: 21px; color: #128C7E; }
        .bb-mini span, .bb-info span { display: block; margin-top: 7px; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .bb-mini b, .bb-info b { display: block; margin-top: 3px; color: #075E54; font-size: 13px; }
        @media (max-width: 1180px) { .bb-layout { grid-template-columns: 1fr; } .bb-preview-wrap { position: static; } .bb-phone { width: min(280px, 100%); } }
        @media (max-width: 760px) { .bb-hero { grid-template-columns: 1fr; padding: 22px; } .bb-hero h1 { font-size: 28px; } .bb-metrics, .bb-steps, .bb-template-grid, .bb-grid, .bb-audience-grid, .bb-review-grid { grid-template-columns: 1fr; } .bb-variable-row { grid-template-columns: 1fr; } .bb-panel { padding: 18px; } .bb-phone-shell { padding: 12px; } .bb-phone { width: min(270px, 100%); height: 584px; } .bb-template-grid { max-height: 360px; } }
      `}</style>
    </div>
  );
}

function TemplateStep({ formData, templates, selectedTemplate, needsImageHeader, unsupportedHeader, imagePublicReady, uploadingImage, fileInputRef, onChange, onTemplateSelect, onUploadImage, onRemoveImage, onNext, disabled }) {
  const templateStepReady = formData.name.trim() && selectedTemplate && !unsupportedHeader && (!needsImageHeader || (formData.media?.url && imagePublicReady));

  return (
    <div>
      <SectionHead title="Template Selection" copy="Choose an approved Meta template and configure its campaign name." />
      <div className="bb-grid">
        <label className="bb-field">
          <span>Campaign Name</span>
          <input name="name" value={formData.name} onChange={onChange} placeholder="Admission follow-up campaign" disabled={disabled} />
        </label>
        <label className="bb-field">
          <span>Campaign Type</span>
          <select name="type" value={formData.type} onChange={onChange} disabled={disabled}>
            <option value="marketing">Marketing</option>
            <option value="utility">Utility</option>
            <option value="authentication">Authentication</option>
          </select>
        </label>
      </div>
      <div className="bb-template-grid mt-4">
        {templates.map((template) => (
          <button
            key={template._id}
            type="button"
            className={`bb-template-card ${selectedTemplate?._id === template._id ? 'is-selected' : ''}`}
            onClick={() => onTemplateSelect(template)}
            disabled={disabled}
          >
            <h3>{template.name}</h3>
            <p>{template.body}</p>
            <div className="bb-tags">
              <span>{template.category}</span>
              <span>{template.language || 'en_US'}</span>
              <span>Header: {template.header?.type || 'none'}</span>
              {!!template.buttons?.length && <span>{template.buttons.length} CTA</span>}
            </div>
          </button>
        ))}
        {templates.length === 0 && <div className="bb-alert"><ExclamationTriangleIcon className="h-6 w-6" /><div><b>No approved templates</b><span>Approve templates in Meta before creating campaigns.</span></div></div>}
      </div>

      {selectedTemplate && (
        <div className="mt-4">
          <div className="bb-info">
            <span>Template Body</span>
            <b>{selectedTemplate.body}</b>
          </div>
        </div>
      )}

      {unsupportedHeader && (
        <div className="bb-alert mt-4">
          <ExclamationTriangleIcon className="h-6 w-6" />
          <div>
            <b>Unsupported broadcast header</b>
            <span>Use a text or image header template for broadcast campaigns. Video/document template sending can be added separately.</span>
          </div>
        </div>
      )}

      {needsImageHeader && (
        <div className="mt-4">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onUploadImage} className="hidden" />
          <div className="bb-image-uploader">
            <div className="bb-image-preview">
              {formData.media?.url ? <img src={formData.media.url} alt="Header" /> : <PhotoIcon className="h-9 w-9" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#0f2b63]">Image header required</p>
              <p className="mt-1 text-sm text-slate-500">Upload the image that Meta will send in the template header.</p>
              {formData.media?.filename && <p className="mt-1 text-xs font-bold text-emerald-700">{formData.media.filename}</p>}
              {formData.media?.url && !imagePublicReady && <p className="mt-1 text-xs font-bold text-rose-700">Public APP_BASE_URL is required before Meta can send this image.</p>}
            </div>
            <div className="bb-image-actions">
              <button type="button" className="bb-action" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                {uploadingImage ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PhotoIcon className="h-5 w-5" />}
                {formData.media?.url ? 'Change' : 'Upload'}
              </button>
              {formData.media?.url && <button type="button" className="bb-danger" onClick={onRemoveImage}><XMarkIcon className="h-5 w-5" /> Remove</button>}
            </div>
          </div>
        </div>
      )}

      <NavActions onNext={onNext} nextLabel="Configure Variables" disabled={disabled || !templateStepReady} />
    </div>
  );
}

function VariableStep({ variables, variablesComplete, values, formData, csvInputRef, onUpdate, onCsvUpload, onBack, onNext }) {
  const variableColumns = getVariableColumns(formData.csvColumns);
  const sampleRow = formData.csvRecipients?.[0] || {};
  const samplePhone = sampleRow[getPhoneColumn(formData.csvColumns)] || getRowPhoneValue(sampleRow) || '-';

  return (
    <div>
      <SectionHead title="Dynamic Variables" copy="Personalize Meta template placeholders before targeting your audience." />
      <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt,.xml,text/csv,text/tab-separated-values,text/plain,text/xml,application/xml" onChange={onCsvUpload} className="hidden" />
      <div className="bb-csv-map">
        <div>
          <span>CSV/XML Variable Source</span>
          <b>{formData.csvFilename || 'Upload CSV or XML to map row-wise variables'}</b>
          <p>{formData.csvRecipients.length ? `${formData.csvRecipients.length} recipients loaded. First number: ${samplePhone}` : 'CSV/TSV/XML fields can be used as {{ColumnName}}. Add Scheduled At or Birth Date + Send Time for row-wise sending.'}</p>
        </div>
        <button type="button" className="bb-soft" onClick={() => csvInputRef.current?.click()}>
          <DocumentArrowUpIcon className="h-5 w-5" />
          {formData.csvRecipients.length ? 'Change File' : 'Upload File'}
        </button>
      </div>
      {!!variableColumns.length && (
        <div className="bb-column-bank">
          <span>Available columns</span>
          <div>
            {variableColumns.map((column) => (
              <code key={column}>{`{{${column}}}`}</code>
            ))}
          </div>
        </div>
      )}
      {variables.length === 0 ? (
        <div className="bb-info"><span>Variables</span><b>This template has no dynamic body variables.</b></div>
      ) : (
        <div className="bb-variable-list">
          {variables.map((variable, index) => (
            <div className="bb-variable-row" key={variable}>
              <code>{`{{${variable}}}`}</code>
              <label className="bb-field">
                <span>Value</span>
                <input value={values[index] || ''} onChange={(event) => onUpdate(index, event.target.value)} placeholder={getDefaultVariableValue(variable)} />
                {!!variableColumns.length && (
                  <div className="bb-map-actions">
                    {variableColumns.map((column) => (
                      <button type="button" key={column} onClick={() => onUpdate(index, `{{${column}}}`)}>
                        {column}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div className="bb-sample-value">
                <span>First row</span>
                <b>{resolvePreviewVariableValue(values[index] || getDefaultVariableValue(variable), formData) || '-'}</b>
              </div>
            </div>
          ))}
        </div>
      )}
      <NavActions onBack={onBack} onNext={onNext} nextLabel="Select Audience" disabled={!variablesComplete} />
    </div>
  );
}

function AudienceStep({ formData, leads, csvInputRef, onChange, onLeadSelect, onCsvUpload, onBack, onNext }) {
  const types = [
    { value: 'status', label: 'By Status', detail: 'Best for lead follow-ups' },
    { value: 'selected', label: 'Selected', detail: 'Choose exact contacts' },
    { value: 'csv', label: 'CSV/XML Upload', detail: 'Use row-wise variables' },
    { value: 'tag', label: 'By Tag', detail: 'Target imported segments' },
    { value: 'all', label: 'All Contacts', detail: 'Full database blast' }
  ];

  return (
    <div>
      <SectionHead title="Audience Targeting" copy="Build focused recipient groups for higher-quality campaign delivery." />
      <div className="bb-audience-grid">
        {types.map((type) => (
          <label key={type.value} className={`bb-audience-card ${formData.recipientType === type.value ? 'is-selected' : ''}`}>
            <input type="radio" name="recipientType" value={type.value} checked={formData.recipientType === type.value} onChange={onChange} className="hidden" />
            <b>{type.label}</b>
            <span>{type.detail}</span>
          </label>
        ))}
      </div>
      <div className="mt-4">
        {formData.recipientType === 'status' && (
          <label className="bb-field">
            <span>Lead Status</span>
            <select name="statusFilter" value={formData.statusFilter} onChange={onChange}>
              <option value="new">New</option>
              <option value="interested">Interested</option>
              <option value="pending">Pending</option>
              <option value="converted">Converted</option>
            </select>
          </label>
        )}
        {formData.recipientType === 'tag' && (
          <label className="bb-field">
            <span>Tag</span>
            <input name="tagFilter" value={formData.tagFilter} onChange={onChange} placeholder="parent, admission, grade_10" />
          </label>
        )}
        {formData.recipientType === 'csv' && (
          <div>
            <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt,.xml,text/csv,text/tab-separated-values,text/plain,text/xml,application/xml" onChange={onCsvUpload} className="hidden" />
            <div className="bb-image-uploader">
              <div className="bb-image-preview">
                <DocumentArrowUpIcon className="h-9 w-9" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#0f2b63]">{formData.csvFilename || 'Upload CSV/XML audience'}</p>
                <p className="mt-1 text-sm text-slate-500">Phone/Mobile/Number field se recipient banega. Scheduled At ya Birth Date + Send Time row-wise sending ke liye use hoga.</p>
                {!!formData.csvColumns.length && (
                  <p className="mt-1 text-xs font-bold text-emerald-700">
                    {formData.csvRecipients.length} rows: {formData.csvColumns.join(', ')}
                  </p>
                )}
              </div>
              <button type="button" className="bb-action" onClick={() => csvInputRef.current?.click()}>
                <DocumentArrowUpIcon className="h-5 w-5" />
                {formData.csvRecipients.length ? 'Change File' : 'Upload File'}
              </button>
            </div>
            {!!formData.csvColumns.length && (
              <div className="bb-info mt-4">
                <span>Use In Variables</span>
                <b>{getVariableColumns(formData.csvColumns).map((column) => `{{${column}}}`).join('  ') || 'No variable columns found'}</b>
              </div>
            )}
          </div>
        )}
        {formData.recipientType === 'selected' && (
          <div className="bb-leads">
            {leads.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No contacts found.</div>
            ) : leads.map((lead) => (
              <label key={lead._id} className="bb-lead">
                <input type="checkbox" checked={formData.selectedLeads.includes(lead._id)} onChange={() => onLeadSelect(lead._id)} />
                <div>
                  <p className="font-bold text-[#0f2b63]">{lead.name}</p>
                  <p className="text-sm text-slate-500">{lead.phone}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      <NavActions onBack={onBack} onNext={onNext} nextLabel="Schedule Campaign" />
    </div>
  );
}

function ScheduleStep({ formData, onChange, setSchedulePreset, setFormData, scheduleReady, onBack, onNext }) {
  return (
    <div>
      <SectionHead title="Broadcast Scheduling" copy="Create a draft for manual start or schedule the campaign for a future slot." />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="bb-soft" onClick={() => setSchedulePreset(0)}>Today</button>
        <button type="button" className="bb-soft" onClick={() => setSchedulePreset(1)}>Tomorrow</button>
        <button type="button" className="bb-soft" onClick={() => setFormData((current) => ({ ...current, scheduledAt: '' }))}>Manual start</button>
      </div>
      <label className="bb-field mt-4">
        <span>Scheduled Date & Time</span>
        <input type="datetime-local" name="scheduledAt" value={formData.scheduledAt} onChange={onChange} min={toLocalDateTimeValue(new Date())} />
      </label>
      {!scheduleReady && <div className="mt-3 text-xs font-bold text-rose-700">Schedule time must be in the future.</div>}
      <NavActions onBack={onBack} onNext={onNext} nextLabel="Review Campaign" disabled={!scheduleReady} />
    </div>
  );
}

function ReviewStep({ formData, selectedTemplate, audienceLabel, headerType, loading, canSubmit, onBack }) {
  return (
    <div>
      <SectionHead title="Campaign Review" copy="Confirm the final Meta campaign setup before creating the broadcast." />
      <div className="bb-review-grid">
        <Info label="Campaign" value={formData.name || '-'} />
        <Info label="Template" value={selectedTemplate?.name || '-'} />
        <Info label="Audience" value={audienceLabel} />
        <Info label="Schedule" value={formData.scheduledAt ? new Date(formData.scheduledAt).toLocaleString() : 'Manual start'} />
      </div>
      <div className="bb-analytics mt-4">
        <h3>Campaign Checks</h3>
        <div className="bb-analytics-grid">
          <MiniStat label="Audience" value={audienceLabel} icon={UsersIcon} />
          <MiniStat label="Mode" value={formData.scheduledAt ? 'Scheduled' : 'Manual'} icon={CalendarDaysIcon} />
          <MiniStat label="CTA" value={selectedTemplate?.buttons?.length || 0} icon={CursorArrowRaysIcon} />
          <MiniStat label="Header" value={headerType} icon={PhotoIcon} />
        </div>
      </div>
      <div className="bb-alert mt-4">
        <CheckCircleIcon className="h-6 w-6" />
        <div><b>Meta Cloud API ready</b><span>This campaign will use the approved template, configured variables, and selected audience.</span></div>
      </div>
      <div className="bb-nav">
        <button type="button" onClick={onBack} className="bb-soft">Back</button>
        <button type="submit" disabled={loading || !canSubmit} className="bb-action">
          {loading && <ArrowPathIcon className="h-5 w-5 animate-spin" />}
          Create Broadcast
        </button>
      </div>
    </div>
  );
}

function PhonePreview({ whatsapp, template, message, media, activeButton, setActiveButton }) {
  const buttons = template?.buttons || [];
  const headerType = template?.header?.type || 'none';

  return (
    <div className="bb-phone-shell">
      <div className="bb-section-head">
        <div>
          <h2>Mobile Preview</h2>
          <p>WhatsApp-style rendering with internal scroll and CTA interactions.</p>
        </div>
      </div>
      <div className="bb-phone">
        <div className="bb-phone-screen">
          <div className="bb-notch" />
          <div className="bb-wa-top">
            <div className="bb-avatar">W</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{whatsapp.displayName || 'School WhatsApp'}</p>
              <p className="text-[10px] text-white/70">Business account</p>
            </div>
          </div>
          <div className="bb-chat">
            <div className="bb-date">Today</div>
            <div className="bb-bubble">
              {headerType === 'image' && (media?.url ? <img src={media.url} alt="Header" /> : <div className="bb-header-placeholder">Image header</div>)}
              {headerType === 'text' && template?.header?.text && <div className="px-3 pt-3 text-sm font-bold text-slate-900">{template.header.text}</div>}
              <div className="bb-bubble-body">{message}</div>
              {template?.footer && <div className="bb-footer">{template.footer}</div>}
              <div className="bb-time">11:42 AM</div>
              {buttons.map((button, index) => (
                <button
                  type="button"
                  key={`${button.text}-${index}`}
                  className={`bb-cta-btn ${activeButton === index ? 'is-active' : ''}`}
                  onClick={() => setActiveButton(index)}
                >
                  {button.type === 'url' && <LinkIcon className="h-4 w-4" />}
                  {button.text || 'Button'}
                </button>
              ))}
            </div>
          </div>
          <div className="bb-compose"><span>Message</span><button type="button" className="bb-send">{'>'}</button></div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, copy }) {
  return (
    <div className="bb-section-head">
      <div><h2>{title}</h2><p>{copy}</p></div>
    </div>
  );
}

function StepButton({ index, label, active, done, onClick }) {
  return (
    <button type="button" className={`bb-step ${active ? 'is-active' : ''}`} onClick={onClick}>
      <b>{index}. {label}</b>
      <span>{done ? 'Complete' : active ? 'Editing' : 'Pending'}</span>
    </button>
  );
}

function NavActions({ onBack, onNext, nextLabel, disabled = false }) {
  return (
    <div className="bb-nav">
      {onBack ? <button type="button" className="bb-soft" onClick={onBack}>Back</button> : <span />}
      <button type="button" className="bb-action" onClick={onNext} disabled={disabled}>{nextLabel}</button>
    </div>
  );
}

function Metric({ label, value, tone = '' }) {
  return <div className={`bb-metric ${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function MiniStat({ label, value, icon: Icon }) {
  return <div className="bb-mini"><Icon /><span>{label}</span><b>{value}</b></div>;
}

function Info({ label, value }) {
  return <div className="bb-info"><span>{label}</span><b>{value}</b></div>;
}

function getDefaultVariableValue(variable) {
  if (variable === '1') return '{{lead_name}}';
  if (variable === '2') return '{{school_name}}';
  if (variable === '3') return '{{phone}}';
  return `Sample ${variable}`;
}
