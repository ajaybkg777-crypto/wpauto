import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowPathIcon,
  BoltIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PlusIcon,
  RectangleGroupIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { flowAPI } from "../../services/api";

const CATEGORIES = [
  ["LEAD_GENERATION", "Lead Generation"],
  ["CUSTOMER_SUPPORT", "Customer Support"],
  ["SURVEY", "Survey"],
  ["APPOINTMENT_BOOKING", "Appointment Booking"],
  ["CONTACT_US", "Contact Us"],
  ["OTHER", "Other"],
];

const FIELD_TYPES = [
  ["text", "Text"],
  ["textarea", "Long answer"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["number", "Number"],
  ["date", "Date"],
  ["single_select", "Single select"],
  ["multi_select", "Multi select"],
  ["rating", "Rating"],
];

const TEMPLATES = {
  default: {
    name: "join_now_flow",
    title: "Join Now",
    category: "LEAD_GENERATION",
    description: "Get early access to our updates. Register now!",
    submitLabel: "Continue",
    fields: [
      { type: "text", label: "Name", name: "name", required: true, options: [] },
      { type: "email", label: "Email", name: "email", required: true, options: [] },
    ],
  },
  lead: {
    name: "student_admission_flow",
    title: "Student Admission Form",
    category: "LEAD_GENERATION",
    description: "Share your details and our counselor will contact you.",
    submitLabel: "Submit",
    fields: [
      { type: "text", label: "Student name", name: "student_name", required: true, options: [] },
      { type: "phone", label: "Phone number", name: "phone_number", required: true, options: [] },
      { type: "single_select", label: "Interested class", name: "interested_class", required: true, options: ["Nursery", "Class 1-5", "Class 6-10", "Class 11-12"] },
    ],
  },
  feedback: {
    name: "feedback_flow",
    title: "Feedback",
    category: "SURVEY",
    description: "Tell us about your experience.",
    submitLabel: "Send feedback",
    fields: [
      { type: "rating", label: "Rating", name: "rating", required: true, options: ["1", "2", "3", "4", "5"] },
      { type: "textarea", label: "Review", name: "review", required: false, options: [] },
    ],
  },
  support: {
    name: "support_ticket_flow",
    title: "Support Ticket",
    category: "CUSTOMER_SUPPORT",
    description: "Create a support request from WhatsApp.",
    submitLabel: "Submit ticket",
    fields: [
      { type: "single_select", label: "Issue type", name: "issue_type", required: true, options: ["Admission", "Fees", "Course", "Technical"] },
      { type: "textarea", label: "Message", name: "message", required: true, options: [] },
    ],
  },
};

const TEMPLATE_CHOICES = [
  { key: "default", label: "Default", description: "Simple name and email form.", icon: RectangleGroupIcon },
  { key: "lead", label: "Collect interest", description: "Capture admission or product leads.", icon: SparklesIcon },
  { key: "feedback", label: "Get feedback", description: "Collect rating and review.", icon: ClipboardDocumentListIcon },
  { key: "support", label: "Customer support", description: "Create a support ticket.", icon: ChatBubbleLeftRightIcon },
];

const needsOptions = (type) => ["single_select", "multi_select", "rating"].includes(type);
const emptyField = () => ({
  type: "text",
  label: "New field",
  name: `field_${Date.now()}`,
  required: false,
  options: [],
});

const buildFlowPayload = (formData) => ({
  name: formData.name,
  title: formData.title,
  category: formData.category,
  description: formData.description,
  submitLabel: formData.submitLabel,
  mode: formData.mode,
  endpointUri: formData.endpointUri,
  fields: (formData.fields || []).map((field) => ({
    type: field.type,
    label: field.label,
    name: field.name,
    required: Boolean(field.required),
    options: Array.isArray(field.options) ? field.options : [],
  })),
});

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#f7fffb 0%,#eefcf5 45%,#f8fafc 100%)",
    fontFamily: "'Inter','DM Sans','Segoe UI',sans-serif",
    padding: 28,
    color: "#0f172a",
  },
  hero: {
    background: "linear-gradient(135deg,#075E54 0%,#128C7E 100%)",
    borderRadius: 28,
    padding: "24px 28px",
    color: "#fff",
    boxShadow: "0 24px 60px rgba(7,94,84,0.28)",
    marginBottom: 22,
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(420px, 1fr) minmax(300px, 360px)",
    gap: 20,
    alignItems: "start",
  },
  card: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(226,232,240,0.88)",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    boxShadow: "0 18px 42px rgba(7,94,84,0.08)",
    backdropFilter: "blur(16px)",
  },
  secLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#128C7E",
    textTransform: "uppercase",
    letterSpacing: ".1em",
  },
  label: { display: "block", fontSize: 12, fontWeight: 850, color: "#334155", marginBottom: 6 },
  hint: { fontSize: 11, color: "#64748b", lineHeight: 1.5, marginTop: 5 },
  input: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #dbe4ef",
    borderRadius: 14,
    background: "#fff",
    padding: "0 13px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "all .18s ease",
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    border: "1px solid #dbe4ef",
    borderRadius: 14,
    background: "#fff",
    padding: "12px 13px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "inherit",
    lineHeight: 1.55,
  },
  select: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #dbe4ef",
    borderRadius: 14,
    background: "#fff",
    padding: "0 13px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
};

function PreviewField({ field, value, onChange }) {
  const opts = field.options?.length ? field.options : ["Option 1", "Option 2"];

  if (field.type === "textarea") {
    return (
      <div className="flow-preview-input large">
        <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={`${field.label}${field.required ? " *" : ""}`} />
      </div>
    );
  }

  if (needsOptions(field.type)) {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="flow-preview-options">
        <b>{field.label}{field.required ? " *" : ""}</b>
        {opts.slice(0, 4).map((option) => (
          <label key={option} className={(field.type === "multi_select" ? values.includes(option) : value === option) ? "selected" : ""}>
            <input
              type={field.type === "multi_select" ? "checkbox" : "radio"}
              checked={field.type === "multi_select" ? values.includes(option) : value === option}
              onChange={() => {
                if (field.type === "multi_select") {
                  onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option]);
                } else {
                  onChange(option);
                }
              }}
            />
            <i className={field.type === "multi_select" ? "box" : ""} />
            {option}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flow-preview-input">
      <input value={value || ""} type={field.type === "phone" ? "tel" : field.type} onChange={(event) => onChange(event.target.value)} placeholder={`${field.label}${field.required ? " *" : ""}`} />
    </div>
  );
}

function PhonePreview({ formData }) {
  const [answers, setAnswers] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touchedSubmit, setTouchedSubmit] = useState(false);

  useEffect(() => {
    setAnswers({});
    setAgreed(false);
    setSubmitted(false);
    setTouchedSubmit(false);
  }, [formData.name, formData.fields.length]);

  const missingFields = useMemo(() => {
    return (formData.fields || []).filter((field) => {
      if (!field.required) return false;
      const value = answers[field.name];
      return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
  }, [answers, formData.fields]);

  const updateAnswer = (field, value) => {
    setSubmitted(false);
    setTouchedSubmit(false);
    setAnswers((prev) => ({ ...prev, [field.name]: value }));
  };

  const submitTest = () => {
    setTouchedSubmit(true);
    if (missingFields.length || !agreed) return;
    setSubmitted(true);
  };

  const resetTest = () => {
    setAnswers({});
    setAgreed(false);
    setSubmitted(false);
    setTouchedSubmit(false);
  };

  return (
    <div>
      <div className="flow-preview-head">
        <div>
          <div style={S.secLabel}>Live Preview</div>
          <div className="flow-preview-title">WhatsApp Flow</div>
        </div>
        <button type="button" onClick={resetTest}>Reset test</button>
      </div>
      <div className="flow-phone">
        <div className="flow-phone-screen">
          <div className="flow-notch" />
          <div className="flow-wa-top">
            <span className="flow-back">&lt;</span>
            <div className="flow-avatar">W</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="flow-wa-name">WaAuto</div>
              <div className="flow-wa-sub">Business account</div>
            </div>
            <span className="flow-menu">...</span>
          </div>
          <div className="flow-chat">
            <div className="flow-date">Today</div>
            <div className="flow-user-msg">I want to join <small>10:58 read</small></div>
            <div className="flow-biz-msg">Please complete this quick form.</div>
          </div>
          <div className="flow-sheet">
            <div className="flow-sheet-handle" />
            <div className="flow-sheet-top">
              <span>x</span>
              <b>{formData.title || "Flow"}</b>
              <span>...</span>
            </div>
            <div className="flow-sheet-body">
              {formData.description && <p>{formData.description}</p>}
              {(formData.fields || []).slice(0, 6).map((field, index) => (
                <PreviewField key={`${field.name}-${index}`} field={field} value={answers[field.name]} onChange={(value) => updateAnswer(field, value)} />
              ))}
              <label className={`flow-check ${agreed ? "selected" : ""}`}>
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <i />I agree to receive updates from this business.
              </label>
              {touchedSubmit && (missingFields.length > 0 || !agreed) && (
                <div className="flow-test-error">
                  {missingFields.length ? `Fill required: ${missingFields.map((field) => field.label).join(", ")}` : "Please accept the consent checkbox."}
                </div>
              )}
              {submitted && (
                <div className="flow-test-success">
                  <b>Flow submitted</b>
                  <span>{Object.keys(answers).length} answers captured in preview.</span>
                </div>
              )}
            </div>
            <button type="button" className="flow-submit-preview" onClick={submitTest}>{formData.submitLabel || "Continue"}</button>
            <div className="flow-managed">Managed by WaAuto. <b>Learn more</b></div>
          </div>
          <div className="flow-nav"><span>&lt;</span><span>o</span><span>[]</span></div>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({ field, index, updateField, removeField }) {
  return (
    <div className="flow-field-card">
      <div className="flow-field-top">
        <span>Question {index + 1}</span>
        <button type="button" onClick={() => removeField(index)}><TrashIcon /></button>
      </div>
      <div className="flow-field-grid">
        <div>
          <label style={S.label}>Type</label>
          <select style={S.select} value={field.type} onChange={(event) => updateField(index, "type", event.target.value)}>
            {FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Label</label>
          <input style={S.input} value={field.label} placeholder="Question label" onChange={(event) => updateField(index, "label", event.target.value)} />
        </div>
        <label className="flow-required">
          <input type="checkbox" checked={field.required} onChange={(event) => updateField(index, "required", event.target.checked)} />
          Required
        </label>
      </div>
      <div className="flow-field-grid bottom">
        <div>
          <label style={S.label}>Field key</label>
          <input style={S.input} value={field.name} placeholder="field_key" onChange={(event) => updateField(index, "name", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
        </div>
        {needsOptions(field.type) && (
          <div>
            <label style={S.label}>Options</label>
            <input style={S.input} value={(field.options || []).join(", ")} placeholder="Option 1, Option 2" onChange={(event) => updateField(index, "options", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function WhatsAppFlowBuilder() {
  const [selectedTemplate, setSelectedTemplate] = useState("lead");
  const [saved, setSaved] = useState(false);
  const [flows, setFlows] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);
  const [submittingFlow, setSubmittingFlow] = useState(false);
  const [sendingFlow, setSendingFlow] = useState(false);
  const [previewingJson, setPreviewingJson] = useState(false);
  const [previewJson, setPreviewJson] = useState(null);
  const [selectedFlowId, setSelectedFlowId] = useState(null);
  const [flowSearch, setFlowSearch] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [formData, setFormData] = useState({
    ...TEMPLATES.lead,
    mode: "without_endpoint",
    endpointUri: "",
  });

  const fetchFlows = useCallback(async () => {
    setLoadingFlows(true);
    try {
      const response = await flowAPI.getFlows();
      setFlows(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Saved flows load nahi ho paaye");
    } finally {
      setLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const fetchSubmissions = useCallback(async (flowId = selectedFlowId) => {
    setLoadingSubmissions(true);
    try {
      const response = await flowAPI.getSubmissions(flowId);
      setSubmissions(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Flow submissions load nahi ho paaye");
    } finally {
      setLoadingSubmissions(false);
    }
  }, [selectedFlowId]);

  useEffect(() => {
    fetchSubmissions(selectedFlowId);
  }, [fetchSubmissions, selectedFlowId]);

  const errors = useMemo(() => {
    const next = {};
    if (!formData.name.trim()) next.name = "Flow name is required";
    if (!formData.title.trim()) next.title = "Screen title is required";
    if (formData.mode === "with_endpoint" && !/^https:\/\//i.test(formData.endpointUri || "")) next.endpointUri = "Endpoint must be HTTPS";
    formData.fields.forEach((field, index) => {
      if (!field.label.trim()) next[`field_${index}_label`] = "Label required";
      if (!field.name.trim()) next[`field_${index}_name`] = "Key required";
      if (needsOptions(field.type) && !field.options?.length) next[`field_${index}_options`] = "Options required";
    });
    return next;
  }, [formData]);
  const requiredFields = formData.fields.filter((field) => field.required).length;
  const optionFields = formData.fields.filter((field) => needsOptions(field.type)).length;
  const filteredFlows = useMemo(() => {
    const query = flowSearch.trim().toLowerCase();
    if (!query) return flows;

    return flows.filter((flow) => [
      flow.name,
      flow.title,
      flow.category,
      flow.status,
      flow.description,
      ...(flow.fields || []).flatMap((field) => [field.label, field.name, field.type])
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [flowSearch, flows]);
  const readiness = Math.round(([
    Boolean(formData.name.trim() && !errors.name),
    Boolean(formData.title.trim() && !errors.title),
    formData.mode !== "with_endpoint" || !errors.endpointUri,
    formData.fields.length > 0,
    Object.keys(errors).length === 0,
  ].filter(Boolean).length / 5) * 100);

  const applyTemplate = useCallback((key) => {
    const template = TEMPLATES[key];
    setSelectedTemplate(key);
    setSelectedFlowId(null);
    setPreviewJson(null);
    setFormData((prev) => ({
      ...prev,
      ...template,
      fields: template.fields.map((field) => ({ ...field, options: [...field.options] })),
    }));
  }, []);

  const loadFlow = (flow) => {
    setSelectedTemplate("");
    setSelectedFlowId(flow._id);
    setPreviewJson(null);
    setSaved(false);
    setFormData({
      name: flow.name || "",
      title: flow.title || "",
      category: flow.category || "LEAD_GENERATION",
      description: flow.description || "",
      submitLabel: flow.submitLabel || "Continue",
      mode: flow.mode || "without_endpoint",
      endpointUri: flow.endpointUri || "",
      fields: (flow.fields || []).map((field) => ({
        type: field.type || "text",
        label: field.label || "",
        name: field.name || "",
        required: Boolean(field.required),
        options: Array.isArray(field.options) ? [...field.options] : [],
      })),
    });
    fetchSubmissions(flow._id);
  };

  const updateField = (index, key, value) => {
    const fields = [...formData.fields];
    fields[index] = { ...fields[index], [key]: value };
    if (key === "label") {
      fields[index].name = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    }
    setFormData({ ...formData, fields });
  };

  const addField = () => setFormData({ ...formData, fields: [...formData.fields, emptyField()] });
  const removeField = (index) => setFormData({ ...formData, fields: formData.fields.filter((_, itemIndex) => itemIndex !== index) });

  const handleSave = async () => {
    if (Object.keys(errors).length) {
      toast.error("Pehle flow validation issues fix karo");
      return;
    }
    setSavingFlow(true);
    try {
      const payload = buildFlowPayload(formData);
      const response = selectedFlowId
        ? await flowAPI.updateFlow(selectedFlowId, payload)
        : await flowAPI.createFlow(payload);
      const flow = response.data?.data;
      if (flow?._id) setSelectedFlowId(flow._id);
      setSaved(true);
      toast.success(selectedFlowId ? "Flow updated in database" : "Flow saved in database");
      await fetchFlows();
      setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      toast.error(error.response?.data?.message || "Flow save nahi ho paaya");
    } finally {
      setSavingFlow(false);
    }
  };

  const handlePreviewJson = async () => {
    if (Object.keys(errors).length) {
      toast.error("Valid Meta JSON ke liye validation issues fix karo");
      return;
    }
    setPreviewingJson(true);
    try {
      const response = await flowAPI.previewFlow(buildFlowPayload(formData));
      setPreviewJson(response.data?.data || response.data);
      toast.success("Meta JSON preview ready");
    } catch (error) {
      toast.error(error.response?.data?.message || "Meta JSON preview nahi ban paaya");
    } finally {
      setPreviewingJson(false);
    }
  };

  const handleSubmitMeta = async () => {
    if (!selectedFlowId) {
      toast.error("Meta me submit karne se pehle flow save karo");
      return;
    }
    if (Object.keys(errors).length) {
      toast.error("Meta submit se pehle validation issues fix karo");
      return;
    }
    setSubmittingFlow(true);
    try {
      const response = await flowAPI.submitFlow(selectedFlowId, { publish: false });
      toast.success(response.data?.meta?.already_exists
        ? "Existing Meta flow synced with database"
        : "Flow Meta review ke liye submit ho gaya");
      await fetchFlows();
    } catch (error) {
      toast.error(error.response?.data?.message || "Meta submit fail hua");
    } finally {
      setSubmittingFlow(false);
    }
  };

  const handleSendFlow = async () => {
    if (!selectedFlowId) {
      toast.error("Apply Now bhejne se pehle saved flow select karo");
      return;
    }
    if (!testPhone.trim()) {
      toast.error("Test WhatsApp number enter karo");
      return;
    }

    setSendingFlow(true);
    try {
      await flowAPI.sendFlow(selectedFlowId, {
        phone: testPhone.trim(),
        cta: "Apply Now",
        header: formData.title || "Admission Form",
        body: formData.description || "Please complete this quick form.",
        footer: "Bkgis"
      });
      toast.success("Apply Now WhatsApp Flow sent");
      await fetchSubmissions(selectedFlowId);
    } catch (error) {
      toast.error(error.response?.data?.message || "Flow WhatsApp par send nahi ho paaya");
    } finally {
      setSendingFlow(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.hero}>
        <div className="flow-hero-glow" />
        <div className="flow-hero-inner">
          <div>
            <div className="flow-eyebrow">Meta WhatsApp Flows</div>
            <h1>WhatsApp Flow Studio</h1>
            <p>Design in-chat forms, preview them live, and prepare clean Flow JSON for Meta approval.</p>
          </div>
          <div className="flow-hero-pills">
            <span><BoltIcon /> Without endpoint</span>
            <span><CalendarDaysIcon /> With endpoint</span>
          </div>
        </div>
      </div>

      <div className="flow-metrics">
        <MetricCard label="Readiness" value={`${readiness}%`} tone={readiness === 100 ? "green" : "gold"} />
        <MetricCard label="Questions" value={formData.fields.length} />
        <MetricCard label="Required" value={requiredFields} />
        <MetricCard label="Choice Fields" value={optionFields} />
      </div>

      <div style={S.grid}>
        <main>
          <div className="flow-readiness-card">
            <div>
              <div style={S.secLabel}>Meta readiness</div>
              <h3>{Object.keys(errors).length ? "Fix flow issues before saving" : "Flow is ready to save"}</h3>
              <p>{Object.keys(errors).length ? `${Object.keys(errors).length} issue(s) found in the current flow setup.` : "Name, screen details, endpoint mode, and fields look valid."}</p>
            </div>
            <div className="flow-readiness-ring">
              <span>{readiness}%</span>
            </div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>Flow settings</div><h3>Core details</h3></div>
              <span className="flow-pill">Draft</span>
            </div>
            <div className="flow-two">
              <div>
                <label style={S.label}>Flow name</label>
                <input style={{ ...S.input, ...(errors.name ? { borderColor: "#fb7185" } : {}) }} value={formData.name} maxLength={200} onChange={(event) => setFormData({ ...formData, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="student_admission_flow" />
                <div style={errors.name ? { ...S.hint, color: "#e11d48" } : S.hint}>{errors.name || `${formData.name.length}/200`}</div>
              </div>
              <div>
                <label style={S.label}>Category</label>
                <select style={S.select} value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })}>
                  {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>Template</div><h3>Start from a pattern</h3></div>
              <div className="flow-mode">
                <button type="button" className={formData.mode === "without_endpoint" ? "active" : ""} onClick={() => setFormData({ ...formData, mode: "without_endpoint" })}>Without endpoint</button>
                <button type="button" className={formData.mode === "with_endpoint" ? "active" : ""} onClick={() => setFormData({ ...formData, mode: "with_endpoint" })}>With endpoint</button>
              </div>
            </div>
            <div className="flow-template-grid">
              {TEMPLATE_CHOICES.map((choice) => {
                const Icon = choice.icon;
                return (
                  <button key={choice.key} type="button" className={`flow-template-card ${selectedTemplate === choice.key ? "active" : ""}`} onClick={() => applyTemplate(choice.key)}>
                    <Icon />
                    <b>{choice.label}</b>
                    <span>{choice.description}</span>
                  </button>
                );
              })}
            </div>
            {formData.mode === "with_endpoint" && (
              <div className="flow-endpoint">
                <label style={S.label}>Endpoint URL</label>
                <input style={{ ...S.input, ...(errors.endpointUri ? { borderColor: "#fb7185" } : {}) }} value={formData.endpointUri} onChange={(event) => setFormData({ ...formData, endpointUri: event.target.value })} placeholder="https://your-domain.com/api/flows/data" />
                <div style={errors.endpointUri ? { ...S.hint, color: "#e11d48" } : S.hint}>{errors.endpointUri || "Use HTTPS so Meta can call your backend safely."}</div>
              </div>
            )}
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>WhatsApp screen</div><h3>Screen content</h3></div>
              <span className="flow-pill green">Live preview</span>
            </div>
            <div className="flow-two">
              <div>
                <label style={S.label}>Screen title</label>
                <input style={{ ...S.input, ...(errors.title ? { borderColor: "#fb7185" } : {}) }} value={formData.title} maxLength={60} onChange={(event) => setFormData({ ...formData, title: event.target.value })} />
              </div>
              <div>
                <label style={S.label}>Submit button</label>
                <input style={S.input} value={formData.submitLabel} maxLength={25} onChange={(event) => setFormData({ ...formData, submitLabel: event.target.value })} />
              </div>
            </div>
            <div className="flow-field-space">
              <label style={S.label}>Description</label>
              <textarea style={S.textarea} rows={2} value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} placeholder="Explain what the user will complete." />
            </div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>Form questions</div><h3>{formData.fields.length} fields</h3></div>
              <button type="button" className="flow-soft-btn" onClick={addField}><PlusIcon />Add field</button>
            </div>
            <div className="flow-fields">
              {formData.fields.map((field, index) => (
                <FieldEditor key={`${field.name}-${index}`} field={field} index={index} updateField={updateField} removeField={removeField} />
              ))}
            </div>
            <div className="flow-actions">
              <button type="button" className="flow-outline-btn" disabled={previewingJson} onClick={handlePreviewJson}>
                <EyeIcon />{previewingJson ? "Preparing..." : "Preview JSON"}
              </button>
              <button type="button" className="flow-save-btn" disabled={Object.keys(errors).length > 0 || savingFlow} onClick={handleSave}>
                {savingFlow ? <><ArrowPathIcon className="flow-spin" />Saving</> : saved ? <><CheckCircleIcon />Saved</> : selectedFlowId ? "Update flow" : "Save flow"}
              </button>
              <button type="button" className="flow-submit-btn" disabled={Object.keys(errors).length > 0 || submittingFlow || !selectedFlowId} onClick={handleSubmitMeta}>
                {submittingFlow ? <><ArrowPathIcon className="flow-spin" />Submitting</> : <><PaperAirplaneIcon />Submit Meta</>}
              </button>
            </div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>Database</div><h3>Saved flow library</h3></div>
              <button type="button" className="flow-soft-btn compact" onClick={fetchFlows} disabled={loadingFlows}>
                <ArrowPathIcon className={loadingFlows ? "flow-spin" : ""} />Sync
              </button>
            </div>
            <label className="flow-search">
              <MagnifyingGlassIcon />
              <input value={flowSearch} onChange={(event) => setFlowSearch(event.target.value)} placeholder="Search saved flows, fields, status..." />
            </label>
            <div className="flow-library">
              {loadingFlows ? (
                <div className="flow-empty-state">Loading flows from database...</div>
              ) : filteredFlows.length ? (
                filteredFlows.map((flow) => (
                  <button key={flow._id} type="button" className={`flow-library-item ${selectedFlowId === flow._id ? "active" : ""}`} onClick={() => loadFlow(flow)}>
                    <span>
                      <b>{flow.title || flow.name}</b>
                      <small>{flow.name} • {(flow.fields || []).length} fields</small>
                    </span>
                    <i className={`flow-status ${flow.status || "draft"}`}>{flow.status || "draft"}</i>
                  </button>
                ))
              ) : (
                <div className="flow-empty-state">{flowSearch ? "No matching flows found." : "Abhi koi saved flow nahi hai. Builder se pehla flow save karo."}</div>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>Live WhatsApp Test</div><h3>Send Apply Now button</h3></div>
              <span className="flow-pill green">Flow CTA</span>
            </div>
            <div className="flow-send-box">
              <input value={testPhone} onChange={(event) => setTestPhone(event.target.value.replace(/[^\d]/g, ""))} placeholder="919999999999" />
              <button type="button" disabled={!selectedFlowId || sendingFlow} onClick={handleSendFlow}>
                {sendingFlow ? <><ArrowPathIcon className="flow-spin" />Sending</> : <><PaperAirplaneIcon />Send Apply Now</>}
              </button>
            </div>
            <div style={S.hint}>User button click karega, WhatsApp Flow open hoga, submit ke baad answers CRM aur MongoDB me save honge.</div>
          </div>

          <div style={S.card}>
            <div className="flow-card-head">
              <div><div style={S.secLabel}>CRM Capture</div><h3>Recent form submissions</h3></div>
              <button type="button" className="flow-soft-btn compact" onClick={() => fetchSubmissions(selectedFlowId)} disabled={loadingSubmissions}>
                <ArrowPathIcon className={loadingSubmissions ? "flow-spin" : ""} />Refresh
              </button>
            </div>
            <div className="flow-submissions">
              {loadingSubmissions ? (
                <div className="flow-empty-state">Loading submissions...</div>
              ) : submissions.length ? submissions.slice(0, 5).map((submission) => (
                <div key={submission._id} className="flow-submission-item">
                  <div>
                    <b>{submission.name || submission.phone}</b>
                    <small>{submission.phone} • {new Date(submission.submittedAt || submission.createdAt).toLocaleString()}</small>
                  </div>
                  <span>{Object.keys(submission.answers || {}).length} fields</span>
                </div>
              )) : (
                <div className="flow-empty-state">No submitted forms yet.</div>
              )}
            </div>
          </div>

          {previewJson && (
            <div style={S.card}>
              <div className="flow-card-head">
                <div><div style={S.secLabel}>Meta payload</div><h3>Flow JSON preview</h3></div>
                <span className="flow-pill green">Validated locally</span>
              </div>
              <pre className="flow-json-preview">{JSON.stringify(previewJson, null, 2)}</pre>
            </div>
          )}
        </main>

        <aside style={{ ...S.card, position: "sticky", top: 24, marginBottom: 0 }}>
          <PhonePreview formData={formData} />
        </aside>
      </div>

      <style>{`
        .flow-hero-glow { position:absolute; right:-80px; bottom:-150px; width:380px; height:380px; border-radius:50%; background:radial-gradient(circle,rgba(37,211,102,.34),rgba(255,218,121,.14),transparent 66%); }
        .flow-hero-inner { position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center; gap:18px; flex-wrap:wrap; }
        .flow-eyebrow { color:#25D366; font-size:11px; font-weight:950; letter-spacing:.14em; text-transform:uppercase; margin-bottom:7px; }
        .flow-hero-inner h1 { margin:0; font-size:34px; line-height:1; letter-spacing:-.03em; }
        .flow-hero-inner p { margin:8px 0 0; color:rgba(255,255,255,.82); font-size:14px; }
        .flow-hero-pills { display:flex; gap:10px; flex-wrap:wrap; }
        .flow-hero-pills span { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); color:#fff; border-radius:999px; padding:10px 13px; font-size:12px; font-weight:900; backdrop-filter:blur(12px); }
        .flow-hero-pills svg { width:16px; height:16px; color:#25D366; }
        .flow-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:-6px 0 18px; }
        .flow-metric-card { border:1px solid rgba(226,232,240,.9); border-radius:20px; background:linear-gradient(180deg,#fff,#f8fafc); padding:16px; box-shadow:0 16px 36px rgba(7,94,84,.07); }
        .flow-metric-card span { display:block; color:#64748b; font-size:11px; font-weight:950; text-transform:uppercase; letter-spacing:.08em; }
        .flow-metric-card b { display:block; margin-top:7px; color:#075E54; font-size:24px; line-height:1; }
        .flow-metric-card.green b { color:#16a34a; }
        .flow-metric-card.gold b { color:#b7791f; }
        .flow-readiness-card { margin-bottom:16px; border:1px solid rgba(226,232,240,.9); border-radius:24px; background:rgba(255,255,255,.9); box-shadow:0 18px 42px rgba(7,94,84,.08); padding:18px; display:flex; align-items:center; justify-content:space-between; gap:18px; }
        .flow-readiness-card h3 { margin:5px 0 0; color:#0f172a; font-size:18px; }
        .flow-readiness-card p { margin:6px 0 0; color:#64748b; font-size:13px; line-height:1.5; }
        .flow-readiness-ring { width:70px; height:70px; border-radius:999px; display:grid; place-items:center; flex:0 0 auto; background:conic-gradient(#25D366 ${readiness}%, #e2e8f0 0); }
        .flow-readiness-ring span { width:52px; height:52px; border-radius:999px; background:#fff; display:grid; place-items:center; color:#075E54; font-size:13px; font-weight:950; }
        .flow-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:15px; }
        .flow-card-head h3 { margin:4px 0 0; font-size:17px; color:#0f172a; }
        .flow-pill { display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; background:#ecfdf5; color:#128C7E; font-size:10px; font-weight:950; }
        .flow-pill.green { background:#ecfdf5; color:#047857; }
        .flow-two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .flow-field-space { margin-top:13px; }
        .flow-mode { display:flex; background:#ecfdf5; border:1px solid #dbe4ef; padding:4px; border-radius:15px; gap:4px; }
        .flow-mode button { border:0; background:transparent; color:#64748b; border-radius:11px; padding:8px 12px; font-size:11px; font-weight:950; cursor:pointer; transition:all .18s ease; }
        .flow-mode button.active { background:#fff; color:#047857; box-shadow:0 8px 20px rgba(7,94,84,.1); }
        .flow-template-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .flow-template-card { min-height:112px; border:1px solid #dbe4ef; background:#fff; border-radius:18px; padding:12px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:7px; color:#475569; transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .flow-template-card:hover { transform:translateY(-1px); box-shadow:0 14px 28px rgba(7,94,84,.1); }
        .flow-template-card.active { border-color:#25D366; background:linear-gradient(135deg,#ecfdf5,#fff); box-shadow:0 14px 28px rgba(37,211,102,.14); }
        .flow-template-card svg { width:22px; height:22px; color:#128C7E; }
        .flow-template-card b { font-size:12px; color:#0f172a; }
        .flow-template-card span { font-size:11px; color:#64748b; line-height:1.35; }
        .flow-endpoint { margin-top:14px; padding-top:14px; border-top:1px solid #eef2f7; }
        .flow-fields { display:grid; gap:12px; }
        .flow-field-card { border:1px solid #dbe4ef; border-radius:19px; padding:14px; background:linear-gradient(180deg,#fff,#f7fffb); }
        .flow-field-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; color:#075E54; font-size:12px; font-weight:950; }
        .flow-field-top button { width:32px; height:32px; border-radius:11px; border:1px solid #fecdd3; background:#fff1f2; color:#e11d48; display:grid; place-items:center; cursor:pointer; }
        .flow-field-top svg { width:15px; height:15px; }
        .flow-field-grid { display:grid; grid-template-columns:160px 1fr 110px; gap:10px; align-items:end; }
        .flow-field-grid.bottom { grid-template-columns:1fr 1fr; margin-top:10px; }
        .flow-required { height:42px; display:flex; align-items:center; gap:7px; color:#64748b; font-size:12px; font-weight:900; cursor:pointer; }
        .flow-required input { accent-color:#25D366; }
        .flow-soft-btn, .flow-outline-btn, .flow-save-btn, .flow-submit-btn { border-radius:14px; height:40px; padding:0 14px; display:inline-flex; align-items:center; justify-content:center; gap:7px; font-weight:950; cursor:pointer; transition:transform .18s ease, box-shadow .18s ease; }
        .flow-soft-btn { border:1px solid #dbe4ef; background:#fff; color:#128C7E; }
        .flow-soft-btn.compact { height:34px; padding:0 11px; font-size:11px; }
        .flow-soft-btn svg, .flow-save-btn svg, .flow-submit-btn svg, .flow-outline-btn svg { width:16px; height:16px; }
        .flow-soft-btn:hover, .flow-outline-btn:hover, .flow-save-btn:hover, .flow-submit-btn:hover { transform:translateY(-1px); }
        .flow-actions { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:14px; }
        .flow-outline-btn { flex:1; border:1px solid #dbe4ef; background:#fff; color:#128C7E; }
        .flow-save-btn { flex:1; border:0; background:linear-gradient(135deg,#25D366,#25D366); color:#063b2f; box-shadow:0 18px 36px rgba(37,211,102,.2); }
        .flow-submit-btn { flex:1; border:0; background:linear-gradient(135deg,#0f2b63,#2b5893); color:#fff; box-shadow:0 18px 36px rgba(15,43,99,.18); }
        .flow-save-btn:disabled, .flow-submit-btn:disabled, .flow-outline-btn:disabled, .flow-soft-btn:disabled { opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
        .flow-spin { animation:flowSpin .9s linear infinite; }
        @keyframes flowSpin { to { transform:rotate(360deg); } }
        .flow-library { display:grid; gap:10px; }
        .flow-search { position:relative; display:block; margin:-4px 0 12px; }
        .flow-search svg { position:absolute; left:13px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:#64748b; }
        .flow-search input { width:100%; min-height:42px; border:1px solid #dbe4ef; border-radius:14px; background:#fff; padding:0 12px 0 40px; color:#0f172a; outline:none; font:inherit; font-size:13px; box-sizing:border-box; }
        .flow-search input:focus { border-color:#25D366; box-shadow:0 0 0 3px rgba(37,211,102,.13); }
        .flow-send-box { display:grid; grid-template-columns:1fr auto; gap:10px; }
        .flow-send-box input { width:100%; min-height:42px; border:1px solid #dbe4ef; border-radius:14px; background:#fff; padding:0 13px; font:inherit; font-size:13px; color:#0f172a; outline:none; box-sizing:border-box; }
        .flow-send-box button { min-height:42px; border:0; border-radius:14px; padding:0 15px; background:linear-gradient(135deg,#0f2b63,#2b5893); color:#fff; font-weight:950; display:inline-flex; align-items:center; justify-content:center; gap:7px; cursor:pointer; box-shadow:0 18px 36px rgba(15,43,99,.18); }
        .flow-send-box button svg { width:16px; height:16px; }
        .flow-send-box button:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; }
        .flow-library-item { width:100%; border:1px solid #e2e8f0; background:linear-gradient(180deg,#fff,#f8fafc); border-radius:17px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; text-align:left; transition:all .18s ease; }
        .flow-submissions { display:grid; gap:10px; }
        .flow-submission-item { border:1px solid #e2e8f0; background:#fff; border-radius:16px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .flow-submission-item b { display:block; color:#0f172a; font-size:13px; }
        .flow-submission-item small { display:block; margin-top:4px; color:#64748b; font-size:11px; }
        .flow-submission-item span { flex:0 0 auto; border-radius:999px; padding:6px 9px; background:#ecfdf5; color:#047857; font-size:10px; font-weight:950; }
        .flow-library-item:hover { transform:translateY(-1px); border-color:#25D366; box-shadow:0 14px 28px rgba(7,94,84,.08); }
        .flow-library-item.active { border-color:#25D366; background:linear-gradient(135deg,#ecfdf5,#fff); box-shadow:0 14px 28px rgba(37,211,102,.12); }
        .flow-library-item b { display:block; color:#0f172a; font-size:13px; line-height:1.25; }
        .flow-library-item small { display:block; color:#64748b; font-size:11px; margin-top:4px; word-break:break-word; }
        .flow-status { flex:0 0 auto; border-radius:999px; padding:6px 9px; background:#f1f5f9; color:#475569; font-size:10px; font-weight:950; font-style:normal; text-transform:capitalize; }
        .flow-status.published { background:#ecfdf5; color:#047857; }
        .flow-status.submitted { background:#eff6ff; color:#1d4ed8; }
        .flow-status.rejected { background:#fff1f2; color:#be123c; }
        .flow-empty-state { border:1px dashed #cbd5e1; border-radius:17px; padding:16px; background:#f8fafc; color:#64748b; font-size:12px; font-weight:800; text-align:center; }
        .flow-json-preview { max-height:360px; overflow:auto; margin:0; border:1px solid #dbe4ef; border-radius:17px; background:#08111f; color:#d1fae5; padding:16px; font-size:11px; line-height:1.55; white-space:pre-wrap; word-break:break-word; }
        .flow-preview-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
        .flow-preview-title { font-size:14px; font-weight:950; color:#0f172a; margin-top:3px; }
        .flow-preview-head span, .flow-preview-head button { padding:6px 10px; border:0; border-radius:999px; background:#ecfdf5; color:#047857; font-size:11px; font-weight:950; cursor:pointer; }
        .flow-preview-head button:hover { background:#d1fae5; }
        .flow-phone { width:280px; max-width:100%; height:606px; aspect-ratio:390 / 844; margin:0 auto; padding:7px; border-radius:40px; background:#070b13; box-shadow:0 26px 54px rgba(7,94,84,.22); box-sizing:border-box; overflow:hidden; }
        .flow-phone-screen { width:100%; height:100%; min-height:0; border-radius:33px; overflow:hidden; background:#ece5dd; position:relative; display:flex; flex-direction:column; }
        .flow-notch { position:absolute; left:50%; top:8px; transform:translateX(-50%); width:78px; height:15px; border-radius:999px; background:#070b13; z-index:3; }
        .flow-wa-top { height:76px; flex:0 0 76px; background:#075e54; padding:28px 12px 9px; display:flex; align-items:center; gap:8px; box-sizing:border-box; }
        .flow-back { color:rgba(255,255,255,.85); font-size:24px; }
        .flow-avatar { width:30px; height:30px; border-radius:999px; background:#25D366; display:grid; place-items:center; color:#063b2f; font-weight:950; font-size:12px; }
        .flow-wa-name { color:#fff; font-size:13px; font-weight:950; }
        .flow-wa-sub { color:rgba(255,255,255,.68); font-size:10px; }
        .flow-menu { color:rgba(255,255,255,.75); font-size:18px; }
        .flow-chat { padding:10px; min-height:104px; flex:0 0 104px; box-sizing:border-box; background:radial-gradient(circle at top left,rgba(255,255,255,.5),transparent 30%),#ece5dd; }
        .flow-date { margin:0 auto 8px; width:max-content; background:rgba(255,255,255,.7); color:#64748b; border-radius:999px; padding:3px 9px; font-size:9px; }
        .flow-user-msg { margin-left:auto; max-width:80%; width:max-content; background:#dcf8c6; border-radius:13px 13px 4px 13px; padding:7px 10px; color:#1f2937; font-size:11px; }
        .flow-user-msg small { color:#5d9c69; font-size:8px; margin-left:4px; }
        .flow-biz-msg { max-width:86%; background:#fff; border-radius:13px 13px 13px 4px; padding:7px 10px; color:#475569; font-size:11px; margin-top:7px; }
        .flow-sheet { background:#fff; border-radius:25px 25px 0 0; padding:10px 13px 11px; flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
        .flow-sheet-handle { width:42px; height:4px; border-radius:999px; background:#cbd5e1; margin:0 auto 10px; }
        .flow-sheet-top { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #eef2f7; padding-bottom:9px; margin-bottom:9px; }
        .flow-sheet-top b { max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
        .flow-sheet-top span { color:#94a3b8; font-size:18px; }
        .flow-sheet-body { flex:1 1 auto; min-height:0; overflow:auto; padding-right:2px; scrollbar-width:thin; scrollbar-color:rgba(7,94,84,.28) transparent; }
        .flow-sheet-body::-webkit-scrollbar { width:5px; }
        .flow-sheet-body::-webkit-scrollbar-thumb { background:rgba(7,94,84,.28); border-radius:999px; }
        .flow-sheet-body p { margin:0 0 10px; color:#111827; font-size:12px; font-weight:800; line-height:1.4; }
        .flow-preview-input { border:1px solid #e2e8f0; border-radius:13px; padding:0; margin-bottom:9px; min-height:42px; display:flex; align-items:center; overflow:hidden; background:#fff; }
        .flow-preview-input.large { min-height:70px; align-items:flex-start; }
        .flow-preview-input span { color:#94a3b8; font-size:11px; }
        .flow-preview-input input, .flow-preview-input textarea { width:100%; min-height:42px; border:0; outline:0; padding:10px 11px; font:inherit; font-size:11px; color:#0f172a; background:transparent; box-sizing:border-box; }
        .flow-preview-input textarea { min-height:70px; resize:none; line-height:1.45; }
        .flow-preview-options { margin-bottom:10px; }
        .flow-preview-options b { display:block; font-size:11px; color:#0f172a; margin-bottom:6px; }
        .flow-preview-options label, .flow-check { display:flex; align-items:center; gap:7px; margin-bottom:5px; color:#64748b; font-size:10px; cursor:pointer; }
        .flow-preview-options label.selected, .flow-check.selected { color:#047857; font-weight:850; }
        .flow-preview-options input, .flow-check input { position:absolute; opacity:0; pointer-events:none; }
        .flow-preview-options i, .flow-check i { width:12px; height:12px; border:1px solid #cbd5e1; border-radius:999px; display:inline-block; flex-shrink:0; }
        .flow-preview-options i.box, .flow-check i { border-radius:3px; }
        .flow-preview-options label.selected i, .flow-check.selected i { border-color:#25D366; background:#25D366; box-shadow:inset 0 0 0 3px #fff; }
        .flow-test-error { margin-top:8px; padding:8px 9px; border-radius:12px; background:#fff1f2; color:#be123c; font-size:10px; font-weight:850; line-height:1.35; }
        .flow-test-success { margin-top:8px; padding:9px; border-radius:13px; background:#ecfdf5; color:#047857; font-size:10px; line-height:1.35; }
        .flow-test-success b { display:block; font-size:11px; }
        .flow-test-success span { color:#059669; }
        .flow-submit-preview { width:100%; flex:0 0 auto; border:0; border-radius:999px; background:#128c7e; color:#fff; padding:10px 0; font-weight:950; font-size:12px; margin-top:8px; cursor:pointer; }
        .flow-managed { color:#94a3b8; text-align:center; font-size:9px; margin-top:8px; }
        .flow-managed b { color:#128c7e; }
        .flow-nav { height:26px; flex:0 0 26px; background:#070b13; display:flex; justify-content:space-around; align-items:center; color:#94a3b8; font-size:13px; }
        input:focus, textarea:focus, select:focus { border-color:#25D366 !important; box-shadow:0 0 0 3px rgba(37,211,102,.12) !important; }
        @media (max-width: 1100px) { div[style*="minmax(420px, 1fr)"] { grid-template-columns:1fr !important; } aside { position:static !important; } .flow-metrics { grid-template-columns:repeat(2,1fr); } }
        @media (max-width: 760px) { .flow-two, .flow-field-grid, .flow-field-grid.bottom, .flow-actions, .flow-send-box { grid-template-columns:1fr; } .flow-template-grid, .flow-metrics { grid-template-columns:1fr; } .flow-phone { width:min(280px,100%); height:auto; } .flow-readiness-card { align-items:flex-start; flex-direction:column; } }
      `}</style>
    </div>
  );
}

function MetricCard({ label, value, tone = "" }) {
  return (
    <div className={`flow-metric-card ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

