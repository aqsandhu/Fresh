# 🚀 Deployment Guide - Roman Urdu

## Pakistan Grocery Delivery Platform - Complete Setup

\---

## 📋 Pehle Zaroori Cheezein (Prerequisites)

### 1\. Computer Pe Yeh Install Honay Chahiye:

**A. Node.js Install Karna (Windows)**

```
1. https://nodejs.org/ par jao
2. "LTS" version download karo (recommended for most users)
3. Installer run karo
4. Next, Next, Next... Finish
5. Command Prompt khol ke check karo:
   node --version
   (Version 18 ya uper hona chahiye)
```

**B. PostgreSQL Install Karna (Windows)**

```
1. https://www.postgresql.org/download/windows/ par jao
2. PostgreSQL 15+ download karo
3. Install karte waqt:
   - Password set karna mat bhoolna (yaad rakho!)
   - Port 5432 rehne do
   - Default settings rakho
4. pgAdmin 4 bhi install ho jayega
```

**C. Git Install Karna (Optional)**

```
1. https://git-scm.com/download/win par jao
2. Download karo aur install karo
3. Default settings rakho
```

\---

## 🗄️ Step 1: Database Setup

### A. PostgreSQL Me Database Banana

**pgAdmin 4 Open Karo:**

```
1. Start menu se "pgAdmin 4" search karo
2. Master password poochega (pehli baar) - kuch bhi set karo
3. Left side pe "Servers" expand karo
4. "PostgreSQL 15" ya jo bhi version ho, uspe right-click
5. "Create" > "Database" select karo
```

**Database Create Karo:**

```
Database Name: grocery\_db
Owner: postgres
Encoding: UTF8

Create button click karo
```

### B. Schema Import Karna

**Command Prompt (CMD) Me:**

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\database

psql -U postgres -d grocery\_db -f schema.sql
```

**Agar psql command not found aaye to:**

```cmd
# PostgreSQL ka path add karo:
C:\\Program Files\\PostgreSQL\\15\\bin\\psql -U postgres -d grocery\_db -f schema.sql
```

**Password poochega:**

```
Wohi password jo install karte waqt set kiya tha
```

**Success Message:**

```
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
CREATE INDEX
CREATE INDEX
...
```

✅ **Database Ready!**

\---

## ⚙️ Step 2: Backend API Setup

### A. Terminal/CMD Open Karo

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\backend
```

### B. Dependencies Install Karo

```cmd
npm install
```

**Agar errors aayein to yeh try karo:**

```cmd
npm install --legacy-peer-deps
```

### C. Environment Variables Set Karna

**File Create Karo:**

```cmd
copy .env.example .env
```

**.env File Edit Karo (Notepad se):**

```env
PORT=3000
DB\_HOST=localhost
DB\_PORT=5432
DB\_NAME=grocery\_db
DB\_USER=postgres
DB\_PASSWORD=apna\_password\_yahan\_dalo
JWT\_SECRET=koi\_bhi\_lamba\_random\_string
JWT\_EXPIRES\_IN=7d
NODE\_ENV=development
```

### D. Backend Start Karo

```cmd
npm run dev
```

**Success Message:**

```
Server running on port 3000
Environment: development
API URL: http://localhost:3000/api
Health Check: http://localhost:3000/health
```

✅ **Backend Ready!**

**Test Karo:**

```
Browser me jao: http://localhost:3000/health
Output: {"success": true, "message": "Service is healthy"}
```

\---

## 💻 Step 3: Admin Panel Setup

### A. New Terminal Open Karo (Pehla wala backend wala open rehne do)

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\admin-panel
```

### B. Dependencies Install

```cmd
npm install
```

### C. Admin Panel Start

```cmd
npm run dev
```

**Success Message:**

```
Local:   http://localhost:5173/
```

✅ **Admin Panel Ready!**

**Browser me jao:** http://localhost:5173

**Login:**

* Email: admin@grocery.pk
* Password: admin123

\---

## 🌐 Step 4: Website Setup

### A. New Terminal Open Karo

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\website
```

### B. Dependencies Install

```cmd
npm install
```

### C. Website Start

```cmd
npm run dev
```

**Success Message:**

```
ready started server on 0.0.0.0:3001
```

✅ **Website Ready!**

**Browser me jao:** http://localhost:3001

\---

## 📱 Step 5: Customer App Setup

### A. New Terminal Open Karo

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\customer-app
```

### B. Dependencies Install

```cmd
npm install
```

**Important:** Agar `expo-image` ka error aaye to:

```cmd
npm uninstall expo-image
npm install expo-image@1.10.6
```

### C. Metro Config Check Karo

**File: `metro.config.js`**

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(\_\_dirname);
config.resolver.sourceExts = \['jsx', 'js', 'ts', 'tsx', 'json'];
module.exports = config;
```

### D. App Start Karo

```cmd
npx expo start
```

**Agar `npx` slow ho to:**

```cmd
npm install -g expo-cli
expo start
```

**Success Message:**

```
Starting Metro Bundler
› Press r │ reload app
› Press m │ toggle menu
› Press d │ show developer tools
› Press w │ run on web
› Press j │ open debugger
› Press c │ show project QR
```

✅ **Customer App Ready!**

### Mobile Pe Chalane Ka Tareeqa:

**Option 1: Expo Go App Se (Recommended)**

```
1. Mobile pe Play Store/App Store se "Expo Go" download karo
2. Mobile aur computer same WiFi pe honay chahiye
3. Terminal me QR code dikhega, usse scan karo
4. App mobile pe chal jayegi
```

**Option 2: Web Pe Test Karo**

```
Terminal me 'w' press karo
Browser me http://localhost:19006 khul jayega
```

\---

## 🛵 Step 6: Rider App Setup

### A. New Terminal Open Karo

```cmd
cd C:\\Users\\STR\\Desktop\\FreshBazar\\rider-app
```

### B. Dependencies Install

```cmd
npm install
```

### C. Rider App Start

```cmd
npx expo start
```

**Port change karne ke liye:**

```cmd
npx expo start --port 19001
```

✅ **Rider App Ready!**

\---

## 🔧 Common Issues \& Solutions

### Issue 1: "Cannot find module 'expo-image'"

**Solution:**

```cmd
cd customer-app
npm uninstall expo-image
npm install expo-image@1.10.6
npx expo start -c
```

### Issue 2: "Port 3000 already in use"

**Solution:**

```cmd
# Windows pe port free karne ka tareeqa:
netstat -ano | findstr :3000
taskkill /PID <PID\_NUMBER> /F
```

### Issue 3: "Database connection failed"

**Solution:**

```
1. Check karo PostgreSQL service chal rahi hai:
   - Task Manager > Services > postgresql-x64-15
   
2. .env file me password sahi hai ya nahi

3. Database create hui hai ya nahi:
   psql -U postgres -c "\\l"
```

### Issue 4: "npm install pe errors"

**Solution:**

```cmd
# Cache clear karo:
npm cache clean --force

# Node modules delete karo:
rd /s /q node\_modules

# Phir install karo:
npm install
```

### Issue 5: "CORS error in browser"

**Solution:**

```
Backend .env me CORS\_ORIGIN add karo:
CORS\_ORIGIN=http://localhost:3001,http://localhost:5173
```

### Issue 6: "Expo app load nahi ho rahi"

**Solution:**

```cmd
# Cache clear karke start karo:
npx expo start -c

# Ya phir:
npx expo start --tunnel
```

\---

## 📊 Saari Services Ek Saath Chalana

### Method 1: Alag Alag Terminals

**Terminal 1 - Backend:**

```cmd
cd backend
npm run dev
```

**Terminal 2 - Admin:**

```cmd
cd admin-panel
npm run dev
```

**Terminal 3 - Website:**

```cmd
cd website
npm run dev
```

**Terminal 4 - Customer App:**

```cmd
cd customer-app
npx expo start
```

**Terminal 5 - Rider App:**

```cmd
cd rider-app
npx expo start --port 19001
```

### Method 2: VS Code Se (Recommended)

```
1. VS Code open karo
2. File > Add Folder to Workspace
3. Har folder (backend, admin-panel, etc.) add karo
4. Terminal > New Terminal (Ctrl+`)
5. Har terminal me alag service start karo
```

\---

## 🧪 Testing Checklist

### Backend Testing

```
✅ http://localhost:3000/health - Working?
✅ Admin login API test karo (Postman se)
✅ Database connection stable hai?
```

### Admin Panel Testing

```
✅ http://localhost:5173 pe login page aa raha?
✅ Dashboard pe stats show ho rahe?
✅ Products add/update ho rahe?
✅ Orders assign ho rahe?
```

### Website Testing

```
✅ http://localhost:3001 pe home page aa raha?
✅ Categories load ho rahi?
✅ Cart me items add ho rahe?
✅ Checkout process working?
```

### Customer App Testing

```
✅ Login screen aa rahi?
✅ OTP "1234" se login ho raha?
✅ Products list ho rahe?
✅ Cart update ho raha?
✅ Address add ho raha?
```

### Rider App Testing

```
✅ Login working?
✅ Tasks list aa rahi?
✅ Online/Offline toggle working?
✅ Location update ho rahi?
```

\---

## 🌐 Production Deployment

### Backend Deploy (VPS/Cloud)

```bash
# Server pe:
git clone <your-repo>
cd backend
npm install
npm run build
npm start
```

**PM2 se manage karo:**

```bash
npm install -g pm2
pm2 start dist/app.js --name grocery-api
pm2 save
pm2 startup
```

### Database Deploy

```
1. PostgreSQL instance create karo (AWS RDS, DigitalOcean, etc.)
2. schema.sql import karo
3. Connection credentials backend .env me update karo
```

### Website Deploy (Vercel)

```bash
cd website
npm install -g vercel
vercel --prod
```

### Admin Panel Deploy

```bash
cd admin-panel
npm run build
# dist/ folder ko static host pe upload karo
```

### Mobile Apps Build

**Customer App:**

```bash
cd customer-app
expo build:android
expo build:ios
```

**Rider App:**

```bash
cd rider-app
expo build:android
expo build:ios
```

\---

## 📞 Support

### Agar Koi Issue Aaye To:

1. **Logs Check Karo:**

   * Backend: Terminal me error message
   * Frontend: Browser console (F12)
   * Mobile: Terminal me Metro logs
2. **Common Fixes:**

   * Sab services restart karo
   * Node modules delete karke reinstall karo
   * Database check karo
3. **Google Karo:**

   * Error message copy paste karo
   * Stack Overflow pe search karo

\---

## ✅ Final Checklist

```
✅ Node.js 18+ installed
✅ PostgreSQL 15+ installed
✅ Database "grocery\_db" created
✅ Schema imported successfully
✅ Backend running on port 3000
✅ Admin Panel running on port 5173
✅ Website running on port 3001
✅ Customer App running (Expo)
✅ Rider App running (Expo)
✅ All services tested
✅ Ready for production!
```

\---

**🎉 Mubarak Ho! Aapka system tayyar hai!**

Koi bhi issue aaye to pehle logs check karo, phir errors Google karo. Agar phir bhi na solve ho to mujhe batao.

**Happy Coding! 🚀**

