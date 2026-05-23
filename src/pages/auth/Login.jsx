import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const otpRequired = import.meta.env.VITE_AUTH_OTP_REQUIRED === 'true';
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const requestOtp = async () => {
    if (!formData.email) {
      toast.error('Enter email first');
      return;
    }

    try {
      const response = await authAPI.requestOtp({
        email: formData.email,
        purpose: 'login'
      });
      setOtpSent(true);
      if (response.data?.data?.otp) {
        toast.success(`OTP: ${response.data.data.otp}`);
      } else {
        toast.success('OTP sent');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request OTP');
    }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) {
      toast.error('Enter OTP');
      return false;
    }

    try {
      const response = await authAPI.verifyOtp({
        email: formData.email,
        purpose: 'login',
        otp: otpCode.trim()
      });
      const token = response.data.data.otpToken;
      setOtpToken(token);
      toast.success('OTP verified');
      return token;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid OTP');
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let verifiedToken = otpToken;
      if (otpRequired && !verifiedToken) {
        const token = await verifyOtp();
        if (!token) return;
        verifiedToken = token;
      }

      await login({
        email: formData.email,
        password: formData.password,
        ...(verifiedToken ? { otpToken: verifiedToken } : {})
      });
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* Left Side - Form */}
      <div className="auth-panel">
        <div className="auth-card">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
              <span className="text-white font-bold text-2xl">W</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">WaAuto</h1>
              <p className="text-sm text-gray-500">WhatsApp Automation</p>
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h2>
          <p className="text-gray-600 mb-8">Sign in to your account to continue</p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Sign In'
              )}
            </button>

            {otpRequired && (
              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700">OTP Verification</p>
                <button type="button" onClick={requestOtp} className="w-full btn-outline">
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="input-field"
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                />
              </div>
            )}
          </form>

          {/* Register Link */}
          <p className="mt-8 text-center text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Image/Gradient */}
      <div className="auth-side">
        <div className="auth-side-card text-center">
          <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-8">
            <svg className="w-12 h-12 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-3xl font-bold mb-4">Automate Your School Communications</h3>
          <p className="text-lg text-white/80">
            Streamline lead management, send bulk messages, and engage with students using AI-powered chatbots.
          </p>
        </div>
      </div>
    </div>
  );
}
