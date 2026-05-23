const REQUIRED_ALWAYS = ['MONGODB_URI', 'JWT_SECRET'];
const REQUIRED_PRODUCTION = ['APP_BASE_URL', 'FRONTEND_URL', 'TOKEN_ENCRYPTION_KEY'];

const isProduction = process.env.NODE_ENV === 'production';

const getMissing = (keys) => keys.filter((key) => !process.env[key]);

const validateEnv = () => {
  const missing = [
    ...getMissing(REQUIRED_ALWAYS),
    ...(isProduction ? getMissing(REQUIRED_PRODUCTION) : [])
  ];

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (isProduction && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  if (!process.env.TOKEN_ENCRYPTION_KEY && !isProduction) {
    console.warn('TOKEN_ENCRYPTION_KEY is not set. Falling back to JWT_SECRET for local encryption only.');
  }

  if (process.env.AUTH_OTP_REQUIRED === 'true' && process.env.AUTH_OTP_DEBUG === 'true' && isProduction) {
    throw new Error('AUTH_OTP_DEBUG cannot be true in production when AUTH_OTP_REQUIRED is enabled');
  }
};

module.exports = { validateEnv };
