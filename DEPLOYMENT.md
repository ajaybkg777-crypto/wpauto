# WaAuto - Deployment Guide

## Table of Contents
1. [Backend Deployment (Render)](#backend-deployment-render)
2. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
3. [Production Configuration](#production-configuration)
4. [Database Setup](#database-setup)
5. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Backend Deployment (Render)

### Step 1: Prepare Repository

1. Push backend code to GitHub:
   ```bash
   git init
   git add backend/
   git commit -m "WaAuto Backend"
   git branch -M main
   git remote add origin https://github.com/yourusername/waauto-backend.git
   git push -u origin main
   ```

### Step 2: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub
3. Authorize access to your repository

### Step 3: Create Web Service

1. **New** → **Web Service**
2. Select your GitHub repository
3. **Name**: `waauto-backend`
4. **Environment**: `Node`
5. **Build Command**: `cd backend && npm install && npm run build` (or just `npm install`)
6. **Start Command**: `cd backend && node server.js`
7. **Region**: Choose closest to your users

### Step 4: Environment Variables

Add these in Render Dashboard → Environment:

```
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/waauto
JWT_SECRET=generate-strong-random-key-here
JWT_EXPIRE=30d

RAZORPAY_KEY_ID=rzp_live_XXXXXX
RAZORPAY_KEY_SECRET=XXXXXX

GUPSHUP_API_KEY=your_production_api_key
GUPSHUP_APP_NAME=your_production_app_name
GUPSHUP_BASE_URL=https://api.gupshup.io
GUPSHUP_ONBOARDING_URL=https://your-render-url.onrender.com/api/webhook/whatsapp
GUPSHUP_ONBOARDING_SECRET=your_webhook_secret

FRONTEND_URL=https://your-vercel-app.vercel.app
APP_BASE_URL=https://your-render-url.onrender.com
```

### Step 5: Deploy

1. Click **Create Web Service**
2. Render automatically builds and deploys
3. Get your live URL: `https://your-app-name.onrender.com`
4. Update `GUPSHUP_ONBOARDING_URL` and `FRONTEND_URL` with production URLs

### Step 6: Update GupShup Webhook

In GupShup Dashboard:
1. Navigate to **Webhooks** settings
2. Update webhook URL to: `https://your-render-url.onrender.com/api/webhook/whatsapp`
3. Save and test webhook

---

## Frontend Deployment (Vercel)

### Step 1: Prepare Repository

1. Push frontend code to GitHub:
   ```bash
   git init
   git add frontend/
   git commit -m "WaAuto Frontend"
   git branch -M main
   git remote add origin https://github.com/yourusername/waauto-frontend.git
   git push -u origin main
   ```

### Step 2: Create Vercel Account

1. Go to https://vercel.com
2. Sign up with GitHub
3. Authorize access

### Step 3: Import Project

1. Click **Add New** → **Project**
2. Select your frontend repository
3. **Framework Preset**: Select **Vite**
4. **Root Directory**: `./frontend` (if monorepo) or leave blank

### Step 4: Configure Build

1. **Build Command**: `npm run build`
2. **Output Directory**: `dist`
3. **Install Command**: `npm install`

### Step 5: Environment Variables

Add in Vercel Dashboard → Settings → Environment Variables:

```
VITE_API_URL=https://your-render-backend-url.onrender.com
```

### Step 6: Deploy

1. Click **Deploy**
2. Vercel builds and deploys automatically
3. Get your live URL: `https://your-app.vercel.app`

### Step 7: Update Backend URL

If you haven't already, update backend's `FRONTEND_URL`:
```
FRONTEND_URL=https://your-app.vercel.app
```

---

## Production Configuration

### Security Best Practices

1. **Generate Strong Secrets**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Use Environment Variables** - Never hardcode secrets

3. **HTTPS Only** - Both services automatically use HTTPS

4. **CORS Configuration** - Already configured in backend for your frontend URL

5. **Rate Limiting** - Already enabled (100 req/15min)

### Database Backup

**MongoDB Atlas Backup Setup:**

1. Go to MongoDB Atlas → Your Cluster
2. Click **Backup** → **Enable Backup**
3. Set daily backup schedule
4. Automatic 7-day retention

### SSL Certificates

- **Render**: Free automatic SSL
- **Vercel**: Free automatic SSL

Both services handle SSL automatically.

---

## Database Setup

### MongoDB Atlas (Recommended)

1. **Create Cluster**:
   - Go to https://cloud.mongodb.com
   - Click **Create** → **Shared Cluster**
   - Choose free tier
   - Select region close to your servers
   - Click **Create**

2. **Set Security**:
   - Add IP: Allow from Anywhere (`0.0.0.0/0`)
   - Or add specific IPs from Render dashboard
   - Create database user

3. **Get Connection String**:
   - Click **Connect** → **Connect your application**
   - Copy URI: `mongodb+srv://user:password@cluster.mongodb.net/waauto`

4. **Update `.env`**:
   ```
   MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/waauto
   ```

### Local MongoDB (Development Only)

1. Install MongoDB
2. Start MongoDB service
3. Use: `mongodb://localhost:27017/waauto`

---

## Domain Setup (Optional)

### Add Custom Domain to Vercel

1. Vercel Dashboard → Settings → Domains
2. Add your domain
3. Update DNS records (provided by Vercel)
4. Wait for verification (24-48 hours)

### Add Custom Domain to Render

1. Render Dashboard → Settings → Custom Domain
2. Add your domain
3. Update DNS records
4. Wait for verification

---

## Monitoring & Troubleshooting

### View Logs

**Render Backend Logs:**
- Dashboard → Your Service → Logs

**Vercel Frontend Logs:**
- Dashboard → Your Project → Deployments → View Function Logs

### Common Issues

#### 1. Backend Won't Start
**Error**: `EADDRINUSE` or `Port already in use`

**Solution**:
```bash
# Kill process on port 5000
# Windows: taskkill /pid <pid> /f
# Linux/Mac: lsof -ti:5000 | xargs kill -9
```

#### 2. Frontend Can't Connect to Backend
**Error**: `ERR_CONNECTION_REFUSED` or CORS errors

**Solution**:
- Check `VITE_API_URL` matches backend URL
- Verify backend is running
- Check CORS configuration in backend

#### 3. WhatsApp Webhook Not Working
**Error**: Webhook endpoint returns 404

**Solution**:
- Verify webhook URL in GupShup matches your backend
- Check API logs for incoming requests
- Test with GupShup webhook tester

#### 4. Database Connection Error
**Error**: `MongooseError` or `ECONNREFUSED`

**Solution**:
- Check `MONGODB_URI` format
- Verify IP whitelist in MongoDB Atlas
- Check network connectivity
- Test connection string locally

#### 5. Razorpay Test Payment Fails
**Error**: Payment integration error

**Solution**:
- Use test keys, not live keys
- Use test card: `4242 4242 4242 4242`
- Use any future date and CVV
- Check Razorpay webhook is configured

### Performance Optimization

1. **Enable Caching**:
   - Vercel: Already configured
   - Render: Add cache headers in backend

2. **Database Indexes**: Already created on:
   - schoolId (all collections)
   - phone+schoolId (leads)

3. **Image Optimization**:
   - Use Cloudinary or Vercel Image Optimization
   - Compress images before upload

4. **API Response Caching**:
   ```javascript
   // In backend routes
   res.set('Cache-Control', 'public, max-age=300');
   ```

---

## Upgrade/Scale Later

### Scale Backend
- Upgrade Render plan from Free to Starter ($7/month)
- Enables persistent disk storage
- Better performance

### Scale Frontend
- Already scalable on Vercel free tier
- Upgrade if you need team collaboration

### Scale Database
- Upgrade MongoDB from free to paid tier
- Increased connection limits
- Better support

---

## Production Checklist

- [ ] Backend deployed to Render
- [ ] Frontend deployed to Vercel
- [ ] Environment variables configured
- [ ] Custom domain added (optional)
- [ ] SSL certificates working
- [ ] Database backups enabled
- [ ] GupShup webhook updated
- [ ] Razorpay credentials verified
- [ ] Email notifications tested
- [ ] Error monitoring setup
- [ ] CDN/caching configured
- [ ] Security headers added

---

## Post-Deployment

1. **Test End-to-End**:
   - Create test school
   - Send test message
   - Verify database
   - Check webhook

2. **Monitor Metrics**:
   - Error rate
   - Response time
   - API usage
   - Database performance

3. **Set Up Alerts**:
   - Render: Alerts for crashes
   - Vercel: Deployment failures

---

## Support & Resources

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **MongoDB Docs**: https://docs.mongodb.com
- **Express Docs**: https://expressjs.com
- **React Docs**: https://react.dev

For more help, see README.md or QUICK_START.md
