# Fresh Bazar - Deployment Guide

This guide walks you through deploying the Fresh Bazar platform to production.

---

## Architecture Overview

```
                    +-------------------+
                    |   Fresh Bazar     |
                    |    (Website)      |
                    |  freshbazar.pk    |
                    +---------+---------+
                              |
                    +---------v---------+
    +---------------+   Backend API     +----------------+
    |               |  Render (Free)    |                |
    |               |  :3000            |                |
    |               +---------+---------+                |
    |                         |                          |
    |               +---------v---------+                |
    |               |   Supabase DB     |                |
    |               |  PostgreSQL       |                |
    |               +-------------------+                |
    |                                                    |
+---v------------+                          +------------v---+
|  Admin Panel   |                          |  Customer App  |
|  Netlify       |                          |  Expo / APK    |
|  (Free)        |                          +----------------+
+----------------+                          +----------------+
                                              |  Rider App     |
                                              |  Expo / APK    |
                                              +----------------+
```

---

## Step 1: GitHub Repository Setup

### 1.1 Create a new GitHub repository
1. Go to https://github.com/new
2. Name: `freshbazar` (or any name)
3. Make it **Private** (recommended for production)
4. Don't initialize with README (we already have one)

### 1.2 Push your code
```bash
cd FreshBazar
git remote add origin https://github.com/YOUR_USERNAME/freshbazar.git
git branch -M main
git push -u origin main
```

---

## Step 2: Supabase (Database) - Already Connected

Your database is already configured with these credentials:

| Setting | Value |
|---------|-------|
| **URL** | `https://kvyjqqtkpozxpvuoalyw.supabase.co` |
| **Host** | `db.kvyjqqtkpozxpvuoalyw.supabase.co` |
| **Port** | `5432` |
| **Database** | `postgres` |
| **User** | `postgres` |

### 2.1 Run Migrations (One-time setup)

Go to Supabase Dashboard > SQL Editor, and run this SQL:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create webhook_logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_type VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(255),
  source VARCHAR(100) NOT NULL,
  order_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  response_body JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_idempotency ON webhook_logs(idempotency_key);
CREATE INDEX idx_webhook_logs_order_id ON webhook_logs(order_id);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  admin_id UUID,
  admin_email VARCHAR(255),
  resource VARCHAR(100) NOT NULL,
  resource_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Create system_settings table (for configurable charges)
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed atta charge settings
INSERT INTO system_settings (key, value, description) VALUES
('atta_service_charge', '50', 'Base service charge for atta grinding (Rs.)'),
('atta_milling_charge_per_kg', '5', 'Milling charge per kg of wheat (Rs.)'),
('atta_delivery_charge', '100', 'Delivery charge for atta orders (Rs.)'),
('atta_free_delivery_threshold_kg', '20', 'Free delivery threshold in kg'),
('delivery_free_threshold', '1200', 'Free delivery threshold for regular orders (Rs.)'),
('delivery_standard_charge', '50', 'Standard delivery charge (Rs.)')
ON CONFLICT (key) DO NOTHING;
```

---

## Step 3: Render (Backend Deployment)

### 3.1 Sign up
1. Go to https://render.com
2. Sign up with GitHub
3. Click **New +** > **Blueprint**

### 3.2 Deploy using render.yaml
1. Select your GitHub repo
2. Render will read `render.yaml` automatically
3. Add these **Environment Variables** in the dashboard:

| Variable | Value |
|----------|-------|
| `DB_PASSWORD` | `Aq@146776786` |
| `JWT_SECRET` | (Generate at https://generate-secret.vercel.app/32) |
| `JWT_REFRESH_SECRET` | (Generate a different one) |

4. Click **Apply**
5. Wait 2-3 minutes for deployment
6. Your backend will be at: `https://freshbazar-backend.onrender.com`

### 3.3 Test the backend
```bash
curl https://freshbazar-backend.onrender.com/health
```
Should return: `{"success": true, "message": "Service is healthy"}`

---

## Step 4: Vercel (Website Deployment)

### 4.1 Sign up
1. Go to https://vercel.com
2. Sign up with GitHub

### 4.2 Deploy
1. Click **Add New...** > **Project**
2. Select your GitHub repo
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `website`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
4. Add Environment Variable:
   - `NEXT_PUBLIC_API_URL` = `https://freshbazar-backend.onrender.com/api`
5. Click **Deploy**
6. Your website will be at: `https://freshbazar.vercel.app`

---

## Step 5: Netlify (Admin Panel Deployment)

### 5.1 Sign up
1. Go to https://netlify.com
2. Sign up with GitHub

### 5.2 Deploy
1. Click **Add new site** > **Import an existing project**
2. Select your GitHub repo
3. Configure:
   - **Base directory**: `admin-panel`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Add Environment Variable:
   - `VITE_API_URL` = `https://freshbazar-backend.onrender.com/api`
5. Click **Deploy site**
6. Your admin panel will be at: `https://freshbazar-admin.netlify.app`

---

## Step 6: GitHub Secrets (Auto-Deploy on Push)

### Add these secrets to your GitHub repo:
Go to: `Settings` > `Secrets and variables` > `Actions` > `New repository secret`

| Secret Name | Where to Get It |
|-------------|----------------|
| `RENDER_SERVICE_ID` | Render Dashboard > your service > Settings > copy service ID |
| `RENDER_API_KEY` | Render Dashboard > Account Settings > API Keys > Create |
| `VERCEL_TOKEN` | Vercel Dashboard > Settings > Tokens > Create |
| `VERCEL_ORG_ID` | Vercel Dashboard > Settings > General > Organization ID |
| `VERCEL_WEBSITE_PROJECT_ID` | Vercel project settings > Project ID |
| `NETLIFY_AUTH_TOKEN` | Netlify Dashboard > User settings > Applications > Personal access tokens |
| `NETLIFY_ADMIN_SITE_ID` | Netlify Dashboard > your site > Settings > Site details > Site ID |

After adding these, every `git push` will automatically deploy all services!

---

## Step 7: Post-Deployment Checklist

- [ ] Backend health check passes: `GET /health`
- [ ] Swagger docs accessible: `GET /api/docs`
- [ ] Website loads without errors
- [ ] Admin panel login works
- [ ] Database tables created in Supabase
- [ ] Test user registration
- [ ] Test order placement
- [ ] Test atta grinding request
- [ ] Real-time chat works (WebSocket)

---

## URLs Summary After Deployment

| Service | URL | Status |
|---------|-----|--------|
| **Backend API** | `https://freshbazar-backend.onrender.com` | Free |
| **Website** | `https://freshbazar.vercel.app` | Free |
| **Admin Panel** | `https://freshbazar-admin.netlify.app` | Free |
| **Database** | Supabase PostgreSQL | Free (500MB) |
| **API Docs** | `https://freshbazar-backend.onrender.com/api/docs` | Free |

**Total Monthly Cost: $0**

---

## Troubleshooting

### Backend shows "Database connection failed"
- Check `DB_PASSWORD` is set correctly in Render dashboard
- Verify Supabase project is active (not paused)

### Website shows CORS errors
- Update `CORS_ORIGIN` in Render to include your Vercel URL
- Format: `https://your-site.vercel.app,https://your-admin.netlify.app`

### Admin panel blank screen
- Check `VITE_API_URL` points to correct backend URL
- Check browser console for errors
- Verify `netlify.toml` redirects are working

### Auto-deploy not working
- Check GitHub Actions logs: `Actions` tab in your repo
- Verify all secrets are correctly set
- Ensure workflows are enabled (not disabled)
