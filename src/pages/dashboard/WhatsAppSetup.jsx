import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { schoolAPI, whatsappAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const emptyProfile = {
  name: '',
  category: 'Education',
  email: '',
  website: '',
  phone: '',
  address: {
    street: '',
    city: '',
    state: '',
    pincode: ''
  }
};

const isHttpsPage = () => window.location.protocol === 'https:';

export default function WhatsAppSetup() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(emptyProfile);
  const [whatsapp, setWhatsapp] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingConfigured, setConnectingConfigured] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const sessionInfoRef = useRef(null);
  const loadingRef = useRef(false);

  const connected = Boolean(whatsapp?.isConnected);
  const secureSetupAvailable = isHttpsPage();
  const verified = whatsapp?.businessVerificationStatus === 'verified'
    || whatsapp?.accountReviewStatus === 'APPROVED';
  const pendingVerification = connected && !verified;
  const metaSync = whatsapp?.sync || {};
  const setupReady = Boolean(profile.name?.trim() && (profile.email || profile.phone || profile.website));
  const canUseServerConfiguredNumber = user?.role === 'super_admin';

  const status = connected
    ? verified ? 'verified' : 'pending'
    : whatsapp?.onboardingStatus === 'pending' ? 'resume' : 'empty';

  const setupSteps = useMemo(() => [
    {
      label: 'Business profile',
      detail: profile.name ? 'Saved school identity' : 'Add school name first',
      done: Boolean(profile.name),
      icon: BuildingOffice2Icon
    },
    {
      label: 'Meta connection',
      detail: connected ? 'WhatsApp number linked' : 'Connect with Meta signup',
      done: connected,
      icon: ChatBubbleLeftRightIcon
    },
    {
      label: 'Verification',
      detail: verified ? 'Approved by Meta' : connected ? 'Review pending' : 'Starts after connection',
      done: verified,
      icon: CheckCircleIcon
    }
  ], [connected, profile.name, verified]);
  const completedSteps = setupSteps.filter((step) => step.done).length;
  const setupProgress = Math.round((completedSteps / setupSteps.length) * 100);

  useEffect(() => {
    fetchSetup();

    const syncInterval = window.setInterval(() => {
      if (!document.hidden) {
        void fetchSetup({ background: true });
      }
    }, 15000);

    const handleFocus = () => {
      void fetchSetup({ background: true });
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        void fetchSetup({ background: true });
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

  useEffect(() => {
    const handleMessage = (event) => {
      if (!/facebook\.com$/.test(event.origin)) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          sessionInfoRef.current = data.data || data;
        }
      } catch (error) {
        // Facebook SDK can post non-JSON messages.
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchSetup = async ({ background = false, showToast = false } = {}) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    if (!background) setRefreshing(true);

    try {
      const [profileRes, whatsappRes] = await Promise.all([
        schoolAPI.getProfile(),
        whatsappAPI.getConfig()
      ]);
      const school = profileRes.data.data || {};

      setProfile({
        ...emptyProfile,
        ...school,
        category: school.category || 'Education',
        address: {
          ...emptyProfile.address,
          ...(school.address || {})
        }
      });
      setWhatsapp(whatsappRes.data.data || {});

      const params = new URLSearchParams(window.location.search);
      if (params.get('whatsapp') === 'connected') {
        toast.success('WhatsApp connected');
      }
      if (showToast) toast.success('Meta status refreshed');
    } catch (error) {
      if (!background) toast.error(error.response?.data?.message || 'Failed to load Meta setup');
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
      loadingRef.current = false;
    }
  };

  const updateProfileField = (name, value) => {
    if (name.startsWith('address.')) {
      const key = name.split('.')[1];
      setProfile((current) => ({
        ...current,
        address: {
          ...current.address,
          [key]: value
        }
      }));
      return;
    }

    setProfile((current) => ({ ...current, [name]: value }));
  };

  const saveBusinessInfo = async ({ silent = false } = {}) => {
    if (!profile.name.trim()) {
      toast.error('Enter school name first');
      return false;
    }

    setSaving(true);
    try {
      const response = await schoolAPI.updateProfile({
        ...profile,
        category: 'Education'
      });
      const savedProfile = response.data.data || {};
      setProfile((current) => ({
        ...current,
        ...savedProfile,
        address: {
          ...current.address,
          ...(savedProfile.address || {})
        }
      }));
      if (!silent) toast.success('Business profile saved');
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save business profile');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const loadFacebookSdk = (appId, version) => {
    return new Promise((resolve, reject) => {
      if (window.FB) {
        window.FB.init({ appId, cookie: true, xfbml: false, version });
        resolve(window.FB);
        return;
      }

      window.fbAsyncInit = () => {
        window.FB.init({ appId, cookie: true, xfbml: false, version });
        resolve(window.FB);
      };

      const existingScript = document.getElementById('facebook-jssdk');
      if (existingScript) {
        const timer = window.setInterval(() => {
          if (window.FB) {
            window.clearInterval(timer);
            window.FB.init({ appId, cookie: true, xfbml: false, version });
            resolve(window.FB);
          }
        }, 100);
        window.setTimeout(() => {
          window.clearInterval(timer);
          if (!window.FB) reject(new Error('Unable to open Meta setup'));
        }, 8000);
        return;
      }

      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Unable to load Meta setup'));
      document.body.appendChild(script);
    });
  };

  const handleConnect = async () => {
    if (!secureSetupAvailable) {
      toast.error('Meta setup needs HTTPS. Open this app using the HTTPS ngrok or Cloudflare URL.');
      return;
    }

    const saved = await saveBusinessInfo({ silent: true });
    if (!saved) return;

    sessionInfoRef.current = null;
    setConnecting(true);

    try {
      const response = await whatsappAPI.startOnboarding();
      const setup = response.data.data;
      const facebook = await loadFacebookSdk(setup.appId, setup.graphApiVersion);

      const finishConnection = async (loginResponse) => {
        const authResponse = loginResponse?.authResponse || {};
        const authCode = authResponse.code;
        const authToken = authResponse.accessToken || authResponse.access_token;

        if (!authCode && !authToken) {
          toast.error('Meta setup was closed or permission was denied.');
          await fetchSetup();
          setConnecting(false);
          return;
        }

        try {
          await whatsappAPI.completeOnboarding({
            provider: 'meta',
            state: setup.state,
            code: authCode,
            accessToken: authToken,
            redirectUri: setup.callbackUrl,
            sessionInfo: sessionInfoRef.current
          });
          toast.success('WhatsApp connected with Meta');
          await fetchSetup();
        } catch (error) {
          toast.error(error.response?.data?.message || error.message || 'Could not finish Meta setup');
        } finally {
          setConnecting(false);
        }
      };

      facebook.login((loginResponse) => {
        void finishConnection(loginResponse);
      }, {
        config_id: setup.configId,
        redirect_uri: setup.callbackUrl,
        response_type: 'code',
        override_default_response_type: true,
        scope: 'business_management,whatsapp_business_management,whatsapp_business_messaging',
        extras: {
          setup: {
            business: {
              name: profile.name,
              email: profile.email,
              website: profile.website,
              phone: profile.phone
            }
          },
          featureType: 'whatsapp_embedded_signup',
          sessionInfoVersion: '3'
        }
      });
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not start Meta setup');
      setConnecting(false);
    }
  };

  const handleConnectConfigured = async () => {
    const saved = await saveBusinessInfo({ silent: true });
    if (!saved) return;

    setConnectingConfigured(true);
    try {
      await whatsappAPI.connectConfigured();
      toast.success('Configured Meta number connected');
      await fetchSetup();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not connect configured Meta number');
    } finally {
      setConnectingConfigured(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect this WhatsApp account from the school workspace?')) return;

    setDisconnecting(true);
    try {
      await schoolAPI.disconnectWhatsApp();
      toast.success('WhatsApp disconnected');
      await fetchSetup();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not disconnect WhatsApp');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">WhatsApp Setup</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Meta Business Connection</h1>
          <p className="mt-1 text-sm text-gray-600">Connect, verify, and keep your WhatsApp Business account synced with this workspace.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fetchSetup({ showToast: true })}
            className="btn-outline inline-flex items-center justify-center gap-2 rounded-2xl"
            disabled={refreshing}
          >
            <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={saving || connecting || connectingConfigured || !secureSetupAvailable || !profile.name.trim()}
            className="btn-primary inline-flex items-center justify-center gap-2 rounded-2xl"
          >
            {connecting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ChatBubbleLeftRightIcon className="h-5 w-5" />}
            {connecting ? 'Opening Meta...' : connected ? 'Reconnect Meta' : whatsapp?.onboardingStatus === 'pending' ? 'Resume Setup' : 'Connect Meta'}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(7,94,84,.10)]">
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr]">
          <div className="relative overflow-hidden bg-gradient-primary p-6 text-white lg:p-8">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-[#25D366]/20 blur-3xl" />
            <div className="relative">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-50">
                  <ShieldCheckIcon className="h-4 w-4" />
                  Meta Embedded Signup
                </div>
                <h2 className="text-3xl font-bold tracking-tight">{getHeroTitle(status)}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{getHeroCopy(status, whatsapp)}</p>
              </div>
              <StatusBadge status={status} sync={metaSync} />
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-white/78">Setup progress</span>
                <span className="font-bold text-white">{completedSteps}/{setupSteps.length}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${setupProgress}%` }} />
              </div>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetaTile label="Business" value={profile.name || 'Not submitted'} />
              <MetaTile label="Number" value={whatsapp?.phoneNumber || 'Not connected'} />
              <MetaTile label="Sync" value={getSyncLabel(metaSync, whatsapp?.lastSyncedAt)} />
            </div>
            </div>
          </div>

          <div className="p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500">Connection Health</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{verified ? 'Ready' : connected ? 'Needs review' : 'Setup required'}</p>
              </div>
              <StatusIcon status={status} />
            </div>

            <div className="mt-5 grid gap-3">
              {setupSteps.map((step) => (
                <StepRow key={step.label} step={step} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <div className="card p-6 shadow-[0_18px_50px_rgba(7,94,84,.08)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-primary ring-1 ring-emerald-100">
              <BuildingOffice2Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Business Profile</h2>
              <p className="text-sm text-gray-600">Keep this consistent with your Meta Business account.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="School Name" value={profile.name} onChange={(value) => updateProfileField('name', value)} required />
            <Field label="Category" value="Education" disabled />
            <Field label="Email" type="email" value={profile.email || ''} onChange={(value) => updateProfileField('email', value)} />
            <Field label="Website" type="url" value={profile.website || ''} onChange={(value) => updateProfileField('website', value)} placeholder="https://school.edu" />
            <Field label="Phone" value={profile.phone || ''} onChange={(value) => updateProfileField('phone', value)} />
            <Field label="City" value={profile.address?.city || ''} onChange={(value) => updateProfileField('address.city', value)} />
            <div className="md:col-span-2">
              <Field label="Address" value={profile.address?.street || ''} onChange={(value) => updateProfileField('address.street', value)} />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => saveBusinessInfo()}
              disabled={saving}
              className="btn-outline inline-flex items-center justify-center gap-2 rounded-2xl"
            >
              {saving && <ArrowPathIcon className="h-5 w-5 animate-spin" />}
              Save Profile
            </button>
            <button
              type="button"
              onClick={handleConnect}
              disabled={saving || connecting || connectingConfigured || !secureSetupAvailable || !profile.name.trim()}
              className="btn-primary inline-flex items-center justify-center gap-2 rounded-2xl"
            >
              {connecting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ChatBubbleLeftRightIcon className="h-5 w-5" />}
              {connecting ? 'Opening Meta...' : connected ? 'Reconnect with Meta' : whatsapp?.onboardingStatus === 'pending' ? 'Resume Meta Setup' : 'Connect with Meta'}
            </button>
          </div>

          {!secureSetupAvailable && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Meta signup opens only on HTTPS. Use your ngrok or Cloudflare HTTPS app URL before connecting.
            </div>
          )}

          {!setupReady && (
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
              Add school name plus email, phone, or website before starting Meta verification.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 shadow-[0_18px_50px_rgba(7,94,84,.08)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Meta Status</h2>
                <p className="mt-1 text-sm text-gray-600">{getStatusCopy(status)}</p>
              </div>
              <StatusIcon status={status} />
            </div>

            <div className="mt-5 grid gap-3">
              <Info label="Business Review" value={formatReviewStatus(whatsapp?.accountReviewStatus)} />
              <Info label="Meta Display Name" value={whatsapp?.displayName || 'Not available'} />
              <Info label="Business Verification" value={formatVerification(whatsapp?.businessVerificationStatus)} />
              <Info label="Quality Rating" value={formatQuality(whatsapp?.qualityRating)} />
            </div>
          </motion.div>

          {pendingVerification && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <ExclamationTriangleIcon className="h-6 w-6 text-amber-700" />
                <h3 className="font-semibold text-amber-950">Verification Pending</h3>
              </div>
              <div className="space-y-3 text-sm text-amber-900">
                <GuideItem text="Business name should match school documents" />
                <GuideItem text="Website, email, phone, and address should be accurate" />
                <GuideItem text="Check Meta Business Manager if documents are requested" />
              </div>
            </div>
          )}

          {(canUseServerConfiguredNumber || connected) && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_18px_50px_rgba(7,94,84,.06)]">
              <h3 className="font-semibold text-gray-950">Advanced</h3>
              <p className="mt-1 text-sm text-gray-600">
                {canUseServerConfiguredNumber
                  ? 'Admin-only tools for testing or replacing an existing number.'
                  : 'Disconnect this workspace before connecting another Meta number.'}
              </p>
              <div className="mt-4 grid gap-3">
                {canUseServerConfiguredNumber && (
                  <button
                    type="button"
                    onClick={handleConnectConfigured}
                    disabled={saving || connecting || connectingConfigured}
                    className="btn-outline inline-flex items-center justify-center gap-2"
                  >
                    {connectingConfigured ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <GlobeAltIcon className="h-5 w-5" />}
                    Use Server Configured Number
                  </button>
                )}
                {connected && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-3 font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    {disconnecting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <TrashIcon className="h-5 w-5" />}
                    Disconnect WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', disabled = false, required = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="input-field disabled:bg-gray-100 disabled:text-gray-600"
        required={required}
      />
    </label>
  );
}

function MetaTile({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 p-4">
      <p className="text-xs font-semibold uppercase text-white/60">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-gray-950">{value}</p>
    </div>
  );
}

function GuideItem({ text }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
      <span>{text}</span>
    </div>
  );
}

function StepRow({ step }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${step.done ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.done ? 'bg-green-100 text-green-700' : 'bg-white text-primary'}`}>
        <step.icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-semibold text-gray-950">{step.label}</p>
        <p className={`mt-1 text-sm ${step.done ? 'text-green-700' : 'text-gray-600'}`}>{step.detail}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status, sync }) {
  const styles = {
    verified: 'bg-green-100 text-green-800',
    pending: 'bg-amber-100 text-amber-900',
    resume: 'bg-amber-100 text-amber-900',
    empty: 'bg-white/10 text-white'
  };
  const labels = {
    verified: 'Verified',
    pending: 'Review Pending',
    resume: 'Setup Started',
    empty: 'Not Connected'
  };

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <span className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ${styles[status]}`}>
        {labels[status]}
      </span>
      <span className="text-xs font-semibold text-white/65">
        {sync?.status === 'fresh' ? 'Live from Meta' : 'Last saved status'}
      </span>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'verified') {
    return <CheckCircleIcon className="h-8 w-8 text-green-600" />;
  }

  if (status === 'pending' || status === 'resume') {
    return <ExclamationTriangleIcon className="h-8 w-8 text-amber-600" />;
  }

  return <GlobeAltIcon className="h-8 w-8 text-gray-400" />;
}

function getHeroTitle(status) {
  if (status === 'verified') return 'WhatsApp is connected and verified';
  if (status === 'pending') return 'WhatsApp is connected';
  if (status === 'resume') return 'Resume Meta WhatsApp setup';
  return 'Connect Meta WhatsApp properly';
}

function getHeroCopy(status, whatsapp) {
  if (status === 'verified') return 'Your Meta WhatsApp account is ready for broadcasts, automation, templates, and replies.';
  if (status === 'pending') return `${whatsapp?.phoneNumber || 'Your WhatsApp number'} is linked. Meta verification is still pending.`;
  if (status === 'resume') return 'Meta setup was started earlier. Resume to finish business and phone number selection.';
  return 'Save the school profile, open secure Meta signup, select your business and WhatsApp number, then WaAuto will sync the account.';
}

function getStatusCopy(status) {
  if (status === 'verified') return 'Connected and approved by Meta.';
  if (status === 'pending') return 'Connected. Meta business review is pending.';
  if (status === 'resume') return 'Setup was started. Continue when ready.';
  return 'Connect your school WhatsApp number to begin.';
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

function formatReviewStatus(value) {
  const status = String(value || 'UNKNOWN').replace(/_/g, ' ').toLowerCase();
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatVerification(value) {
  const status = String(value || 'unknown').replace(/_/g, ' ').toLowerCase();
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatQuality(value) {
  if (!value) return 'Not available';
  return String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
