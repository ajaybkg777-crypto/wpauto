import axios from 'axios';

const normalizeApiUrl = (value) => {
  const raw = String(value || '/api').trim().replace(/\/+$/, '');
  if (!raw || raw === '/') return '/api';
  if (raw === '/api' || raw.endsWith('/api')) return raw;
  if (/^https?:\/\//i.test(raw)) return `${raw}/api`;
  return raw;
};

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  requestOtp: (data) => api.post('/auth/otp/request', data),
  verifyOtp: (data) => api.post('/auth/otp/verify', data),
  googleLogin: (data) => api.post('/auth/google', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  updatePassword: (data) => api.put('/auth/password', data)
};

// School APIs
export const schoolAPI = {
  getProfile: () => api.get('/schools/profile'),
  updateProfile: (data) => api.put('/schools/profile', data),
  uploadLogo: (data) => api.post('/schools/logo', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadAdmissionMedia: (data) => api.post('/schools/admission-media', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getStats: () => api.get('/schools/stats'),
  getMainFlowStatus: () => api.get('/schools/main-flow'),
  configureWhatsApp: (data) => api.put('/schools/whatsapp', data),
  getWhatsAppStatus: () => api.get('/schools/whatsapp/status'),
  disconnectWhatsApp: () => api.delete('/schools/whatsapp')
};

// Lead APIs
export const leadAPI = {
  getLeads: (params) => api.get('/leads', { params }),
  getLead: (id) => api.get(`/leads/${id}`),
  createLead: (data) => api.post('/leads', data),
  updateLead: (id, data) => api.put(`/leads/${id}`, data),
  deleteLead: (id) => api.delete(`/leads/${id}`),
  bulkDeleteLeads: (data) => api.delete('/leads/bulk', { data }),
  importLeads: (data) => api.post('/leads/import', data),
  exportLeads: (params) => api.get('/leads/export', { params, responseType: 'blob' }),
  getStats: () => api.get('/leads/stats')
};

// WhatsApp APIs
export const whatsappAPI = {
  startOnboarding: () => api.post('/whatsapp/onboarding/start'),
  completeOnboarding: (data) => api.post('/whatsapp/onboarding/callback', data),
  connectConfigured: () => api.post('/whatsapp/connect-configured'),
  sendMessage: (data) => api.post('/whatsapp/send', data),
  sendTemplateMessage: (data) => api.post('/whatsapp/send-template', data),
  getMessageStatus: (messageId) => api.get(`/whatsapp/status/${messageId}`),
  getConfig: () => api.get('/whatsapp/config')
};

// Live chat APIs
export const chatAPI = {
  getInbox: (params) => api.get('/chats/inbox', { params }),
  getConversation: (leadId, params) => api.get(`/chats/${leadId}`, { params }),
  sendMessage: (leadId, data) => api.post(`/chats/${leadId}/send`, data)
};

// Chatbot APIs
export const chatbotAPI = {
  getRules: () => api.get('/chatbot/rules'),
  getRule: (id) => api.get(`/chatbot/rules/${id}`),
  createRule: (data) => api.post('/chatbot/rules', data),
  updateRule: (id, data) => api.put(`/chatbot/rules/${id}`, data),
  deleteRule: (id) => api.delete(`/chatbot/rules/${id}`),
  toggleRule: (id) => api.patch(`/chatbot/rules/${id}/toggle`),
  getAnalytics: () => api.get('/chatbot/analytics'),
  testChatbot: (data) => api.post('/chatbot/test', data),
  createStarterKit: () => api.post('/chatbot/starter-kit')
};

// Broadcast APIs
export const broadcastAPI = {
  getBroadcasts: (params) => api.get('/broadcasts', { params }),
  getBroadcast: (id) => api.get(`/broadcasts/${id}`),
  uploadImage: (data) => api.post('/broadcasts/upload-image', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  createBroadcast: (data) => api.post('/broadcasts', data),
  updateBroadcast: (id, data) => api.put(`/broadcasts/${id}`, data),
  deleteBroadcast: (id) => api.delete(`/broadcasts/${id}`),
  startBroadcast: (id) => api.post(`/broadcasts/${id}/start`),
  resumeBroadcast: (id) => api.post(`/broadcasts/${id}/resume`),
  getStats: () => api.get('/broadcasts/stats')
};

// Template APIs
export const templateAPI = {
  getTemplates: () => api.get('/templates'),
  uploadImage: (data) => api.post('/templates/upload-image', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  createTemplate: (data) => api.post('/templates', data),
  updateTemplate: (id, data) => api.put(`/templates/${id}`, data),
  submitTemplate: (id) => api.post(`/templates/${id}/submit`),
  syncTemplates: () => api.post('/templates/sync'),
  syncTemplate: (id) => api.post(`/templates/${id}/sync`),
  deleteTemplate: (id) => api.delete(`/templates/${id}`)
};

export const flowAPI = {
  getFlows: () => api.get('/flows'),
  getSubmissions: (id) => api.get(id ? `/flows/${id}/submissions` : '/flows/submissions'),
  previewFlow: (data) => api.post('/flows/preview', data),
  createFlow: (data) => api.post('/flows', data),
  updateFlow: (id, data) => api.put(`/flows/${id}`, data),
  submitFlow: (id, data) => api.post(`/flows/${id}/submit`, data),
  sendFlow: (id, data) => api.post(`/flows/${id}/send`, data),
  deleteFlow: (id) => api.delete(`/flows/${id}`)
};

// Subscription APIs
export const subscriptionAPI = {
  getPlans: () => api.get('/subscription/plans'),
  getCurrent: () => api.get('/subscription/current'),
  createOrder: (data) => api.post('/subscription/create-order', data),
  verifyPayment: (data) => api.post('/subscription/verify', data),
  cancelSubscription: () => api.post('/subscription/cancel'),
  getInvoices: () => api.get('/subscription/invoices')
};

export default api; 
