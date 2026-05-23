import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhotoIcon,
  PhoneIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { schoolAPI, whatsappAPI } from '../../services/api';

export default function Settings() {
  const [profile, setProfile] = useState({
    name: '',
    phone: '',
    email: '',
    address: {},
    website: '',
    logo: '',
    branding: {
      includeLogoInMessages: true
    }
  });
  const [whatsapp, setWhatsapp] = useState({
    provider: 'meta',
    appName: '',
    phoneNumberId: '',
    phoneNumber: '',
    onboardingStatus: 'not_started',
    isConnected: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const onboardingSteps = useMemo(() => {
    const connected = whatsapp.isConnected;
    const pending = whatsapp.onboardingStatus === 'pending';

    return [
      { label: 'School details', done: true },
      { label: 'Connect WhatsApp', done: connected || pending },
      { label: 'Verify number', done: connected },
      { label: 'Automation ready', done: connected }
    ];
  }, [whatsapp]);

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const setupProgress = Math.round((completedSteps / onboardingSteps.length) * 100);
  const verificationStatus = whatsapp.businessVerificationStatus || whatsapp.accountReviewStatus || 'unknown';
  const profileFields = [
    profile.name,
    profile.phone,
    profile.email,
    profile.website,
    profile.logo,
    profile.address?.street,
    profile.address?.city
  ];
  const profileProgress = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);
  const messageLimit = profile.limits?.maxMessagesPerDay || 0;
  const messagesUsed = profile.limits?.messagesUsedToday || 0;
  const usagePercent = messageLimit ? Math.min(100, Math.round((messagesUsed / messageLimit) * 100)) : 0;
  const planName = profile.subscription?.plan || 'free';
  const subscriptionStatus = profile.subscription?.status || 'active';
  const statusTone = whatsapp.isConnected
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : whatsapp.onboardingStatus === 'pending'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-slate-50 text-slate-600 ring-slate-200';

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [profileRes, whatsappRes] = await Promise.all([
        schoolAPI.getProfile(),
        whatsappAPI.getConfig()
      ]);
      setProfile(profileRes.data.data);
      setWhatsapp(whatsappRes.data.data);

      const params = new URLSearchParams(window.location.search);
      if (params.get('whatsapp') === 'connected') {
        toast.success('WhatsApp connected successfully');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setProfile({ ...profile, [parent]: { ...profile[parent], [child]: nextValue } });
    } else {
      setProfile({ ...profile, [name]: nextValue });
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    setUploadingLogo(true);
    try {
      const response = await schoolAPI.uploadLogo(formData);
      setProfile({
        ...profile,
        logo: response.data.data.logo
      });
      toast.success('Logo uploaded successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await schoolAPI.updateProfile(profile);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectWhatsapp = async () => {
    window.location.href = '/whatsapp-setup';
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
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,43,99,.08)]">
        <div className="relative bg-gradient-to-br from-[#0f2b63] to-[#2b5893] p-6 text-white md:p-8">
          <div className="absolute right-8 top-8 hidden h-28 w-28 rounded-full bg-[#ffda79]/20 blur-2xl md:block" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-[#ffda79]">
                <Cog6ToothIcon className="h-4 w-4" />
                Workspace Settings
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">{profile.name || 'School Workspace'}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
                Manage business profile, WhatsApp connection, branding, and Meta readiness from one clean control center.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatusTile label="Setup" value={`${setupProgress}%`} />
              <StatusTile label="WhatsApp" value={whatsapp.isConnected ? 'Live' : 'Setup'} />
              <StatusTile label="Provider" value="Meta" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <section className="card p-6 shadow-[0_18px_50px_rgba(7,94,84,.07)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <ShieldCheckIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-950">WhatsApp Business Setup</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusTone}`}>
                      {whatsapp.isConnected ? 'Connected' : whatsapp.onboardingStatus === 'pending' ? 'Pending' : 'Not connected'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Meta details are synced from WhatsApp setup. Keep this connected before broadcasts, templates, and flows.
                  </p>
                </div>
              </div>
              <button type="button" onClick={handleConnectWhatsapp} className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl">
                {whatsapp.isConnected ? 'Manage Meta Setup' : 'Connect WhatsApp'}
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-[#25D366] to-[#ffda79]" style={{ width: `${setupProgress}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
              {onboardingSteps.map((step, index) => (
                <div key={step.label} className={`rounded-2xl border p-4 ${step.done ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Step {index + 1}</span>
                    {step.done ? <CheckCircleIcon className="h-5 w-5 text-emerald-500" /> : <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />}
                  </div>
                  <p className="mt-2 text-sm font-bold text-gray-950">{step.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <HealthCard
              icon={BuildingOffice2Icon}
              label="Profile Completion"
              value={`${profileProgress}%`}
              hint={profileProgress === 100 ? 'Business profile is complete' : 'Add logo, website, and address for better approvals'}
              progress={profileProgress}
              tone="blue"
            />
            <HealthCard
              icon={ChartBarIcon}
              label="Daily Usage"
              value={`${messagesUsed}/${messageLimit || '-'}`}
              hint="Messages used today from your workspace limit"
              progress={usagePercent}
              tone="green"
            />
            <HealthCard
              icon={CreditCardIcon}
              label="Plan"
              value={planName.toUpperCase()}
              hint={`Subscription is ${subscriptionStatus}`}
              progress={subscriptionStatus === 'active' ? 100 : 45}
              tone="gold"
            />
          </section>

          <section className="card p-6 shadow-[0_18px_50px_rgba(15,43,99,.06)]">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2b5893]">Profile</p>
                <h2 className="mt-1 text-xl font-bold text-gray-950">Business Details</h2>
              </div>
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                Used in CRM, templates, and notifications
              </span>
            </div>

            <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <SettingInput icon={BuildingOffice2Icon} label="School Name" name="name" value={profile.name || ''} onChange={handleProfileChange} placeholder="Bkgis Academy" required />
              <SettingInput icon={PhoneIcon} label="Phone" type="tel" name="phone" value={profile.phone || ''} onChange={handleProfileChange} placeholder="+91 98765 43210" helper="Used for admin and contact verification." />
              <SettingInput icon={EnvelopeIcon} label="Email" type="email" name="email" value={profile.email || ''} onChange={handleProfileChange} placeholder="admin@school.com" helper="Primary workspace email." />
              <SettingInput icon={GlobeAltIcon} label="Website" type="url" name="website" value={profile.website || ''} onChange={handleProfileChange} placeholder="https://your-school.com" helper="Optional public website URL." />

              <div className="md:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-800">Address</label>
                    <p className="mt-1 text-xs font-medium text-gray-500">Business address used for records and verification context.</p>
                  </div>
                  <MapPinIcon className="hidden h-5 w-5 text-gray-400 sm:block" />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SettingInput compact icon={MapPinIcon} label="Street" type="text" name="address.street" value={profile.address?.street || ''} onChange={handleProfileChange} placeholder="Street address" />
                    <SettingInput compact icon={BuildingOffice2Icon} label="City" type="text" name="address.city" value={profile.address?.city || ''} onChange={handleProfileChange} placeholder="City" />
                    <SettingInput compact icon={MapPinIcon} label="State" type="text" name="address.state" value={profile.address?.state || ''} onChange={handleProfileChange} placeholder="State" />
                    <SettingInput compact icon={MapPinIcon} label="Pincode" type="text" name="address.pincode" value={profile.address?.pincode || ''} onChange={handleProfileChange} placeholder="000000" />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {profile.logo ? (
                      <img src={profile.logo} alt={`${profile.name || 'School'} logo`} className="h-full w-full object-contain" />
                    ) : (
                      <PhotoIcon className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-bold text-gray-800">Brand Logo</label>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="input-field bg-white" disabled={uploadingLogo} />
                    <p className="mt-2 text-xs font-medium text-gray-500">{uploadingLogo ? 'Uploading logo...' : 'PNG, JPG, or WEBP up to 2MB. This appears in workspace branding.'}</p>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ffda79]/30 text-[#7a5a00]">
                    <SparklesIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-950">Show school logo with outgoing messages</p>
                    <p className="text-xs text-gray-500">Branding remains consistent across automated communication.</p>
                  </div>
                </div>
                <input id="includeLogoInMessages" type="checkbox" name="branding.includeLogoInMessages" checked={profile.branding?.includeLogoInMessages !== false} onChange={handleProfileChange} className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary" />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end md:col-span-2">
                <button type="button" onClick={fetchProfile} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700">
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh
                </button>
                <button type="submit" disabled={saving} className="btn-primary inline-flex h-11 items-center justify-center rounded-2xl px-6">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="card p-6 shadow-[0_18px_50px_rgba(7,94,84,.07)]">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Meta Details</p>
            <h2 className="mt-1 text-lg font-bold text-gray-950">WhatsApp Business</h2>
            <div className="mt-5 space-y-3">
              <MetaRow label="Display Name" value={whatsapp.displayName || profile.name || 'Not synced'} />
              <MetaRow label="Phone" value={whatsapp.phoneNumber || 'Not available'} />
              <MetaRow label="Phone Number ID" value={whatsapp.phoneNumberId || 'Not configured'} />
              <MetaRow label="WABA ID" value={whatsapp.wabaId || 'Not configured'} />
              <MetaRow label="Verification" value={String(verificationStatus).replace(/_/g, ' ')} />
            </div>
          </section>

          <section className="card p-6 shadow-[0_18px_50px_rgba(15,43,99,.06)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#2b5893]">
                <ServerStackIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2b5893]">Limits</p>
                <h2 className="text-lg font-bold text-gray-950">Workspace Capacity</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <LimitRow label="Contacts" value={profile.limits?.maxLeads || 0} />
              <LimitRow label="Daily Messages" value={profile.limits?.maxMessagesPerDay || 0} />
              <LimitRow label="Broadcasts" value={profile.limits?.maxBroadcasts || 0} />
            </div>
            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center justify-between text-sm font-bold text-emerald-800">
                <span>Today used</span>
                <span>{usagePercent}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-[#25D366]" style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#0f2b63]/10 bg-gradient-to-br from-[#0f2b63] to-[#2b5893] p-6 text-white shadow-[0_20px_50px_rgba(15,43,99,.18)]">
            <MapPinIcon className="h-7 w-7 text-[#ffda79]" />
            <h3 className="mt-4 text-lg font-bold">Workspace Ready Check</h3>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Complete profile, logo, WhatsApp connection, and Meta verification for smoother broadcasts and template approvals.
            </p>
            <div className="mt-5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Readiness</span>
                <span className="text-[#ffda79]">{setupProgress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#ffda79]" style={{ width: `${setupProgress}%` }} />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
      <p className="text-xs font-semibold text-white/65">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function HealthCard({ icon: Icon, label, value, hint, progress, tone }) {
  const tones = {
    blue: {
      bar: 'from-[#0f2b63] to-[#2b5893]',
      icon: 'bg-blue-50 text-[#2b5893]'
    },
    green: {
      bar: 'from-[#25D366] to-emerald-500',
      icon: 'bg-emerald-50 text-emerald-700'
    },
    gold: {
      bar: 'from-[#ffda79] to-amber-400',
      icon: 'bg-amber-50 text-amber-700'
    }
  };
  const toneClass = tones[tone] || tones.blue;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,43,99,.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 min-h-[36px] text-sm leading-5 text-slate-500">{hint}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${toneClass.bar}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function SettingInput({ icon: Icon, label, helper, compact = false, ...props }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-gray-800">{label}</label>
      <div className="relative">
        <Icon className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 ${compact ? 'h-4 w-4' : ''}`} />
        <input
          {...props}
          className={`h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-emerald-100 ${compact ? 'h-11 rounded-xl pl-11 text-sm' : ''}`}
        />
      </div>
      {helper && <p className="mt-2 text-xs font-medium leading-5 text-gray-500">{helper}</p>}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function LimitRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-950">{Number(value).toLocaleString()}</span>
    </div>
  );
}
