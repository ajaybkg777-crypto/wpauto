import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  CheckIcon,
  CreditCardIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const REQUIRED_PLAN = 'basic';
const REQUIRED_PRICE = 999;

const includedFeatures = [
  'Lead management',
  'WhatsApp broadcasts',
  'Template management',
  'Chatbot automation',
  'Daily message limits',
  'School profile and WhatsApp setup'
];

export default function Subscription() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
      toast.success('Access granted');
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const paidPlan = useMemo(() => {
    return {
      name: REQUIRED_PLAN,
      displayName: 'School Plan',
      monthlyPrice: REQUIRED_PRICE,
      description: 'Full access enabled.',
      features: {
        maxLeads: 500,
        maxMessagesPerDay: 200,
        maxBroadcasts: 20,
        chatbotEnabled: true,
        analyticsEnabled: true,
        automationEnabled: true
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-xl bg-gradient-primary p-6 text-white md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm font-semibold">
              <CheckCircleIcon className="h-4 w-4" />
              Access Active
            </div>

            <h1 className="mt-4 text-3xl font-bold">
              Welcome to WaAuto Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-white/80">
              You now have full access to dashboard, leads, broadcasts, templates, and chatbot features.
            </p>
          </div>

          <div className="min-w-[260px] rounded-xl bg-white p-5 text-gray-900">
            <p className="text-sm font-semibold text-gray-500">Status</p>
            <div className="mt-1">
              <span className="text-3xl font-bold text-green-600">FREE ACCESS</span>
            </div>

            <button
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-xl bg-gray-100 py-3 font-semibold text-gray-400"
            >
              Access Granted
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">All Features Enabled</h2>
              <p className="text-gray-600">Enjoy full WhatsApp automation access.</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {includedFeatures.map((feature) => (
              <div key={feature} className="flex items-center gap-2 rounded-xl border border-gray-100 p-3">
                <CheckIcon className="h-5 w-5 text-green-500" />
                <span className="font-medium text-gray-700">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <CreditCardIcon className="h-9 w-9 text-primary" />
          <h3 className="mt-4 text-lg font-bold text-gray-900">Usage Limits</h3>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Leads</span>
              <strong>{paidPlan.features.maxLeads}</strong>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Messages/day</span>
              <strong>{paidPlan.features.maxMessagesPerDay}</strong>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Broadcasts</span>
              <strong>{paidPlan.features.maxBroadcasts}</strong>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Chatbot</span>
              <strong>Enabled</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
