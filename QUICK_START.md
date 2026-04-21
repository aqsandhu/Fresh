# 🚀 Quick Start Guide

## Pakistan Grocery Delivery Platform

### For Beginners - Step by Step

---

## ⚡ Sabse Pehle Yeh Karein (First Time Setup)

### Step 1: Install Required Software

**Windows Users:**

1. **Node.js Download**
   - https://nodejs.org/ par jao
   - "LTS" version download karo (green button)
   - Install karo (Next, Next, Finish)

2. **PostgreSQL Download**
   - https://www.postgresql.org/download/windows/
   - Version 15+ download karo
   - Install karte waqt password yaad rakho!

3. **VS Code Download (Recommended)**
   - https://code.visualstudio.com/
   - Install karo

---

### Step 2: Database Setup (5 minutes)

**pgAdmin Open Karo:**
```
1. Start Menu → pgAdmin 4
2. Password poochega → kuch bhi set karo
3. Left side "Servers" → "PostgreSQL" → right click
4. Create → Database
5. Name: grocery_db
6. Save
```

**Schema Import Karo:**
```cmd
# Command Prompt open karo
cd C:\Users\STR\Desktop\FreshBazar\database

psql -U postgres -d grocery_db -f schema.sql

# Password: jo install karte waqt set kiya tha
```

✅ Database Ready!

---

### Step 3: Backend Start (3 minutes)

**VS Code me:**
```cmd
# Terminal open karo (Ctrl + `)
cd backend
npm install
```

**Environment File Create Karo:**
```cmd
copy .env.example .env
```

**.env Edit Karo:**
```env
DB_PASSWORD=apna_postgresql_password
JWT_SECRET=koi_bhi_lamba_text_123456789
```

**Backend Start:**
```cmd
npm run dev
```

✅ Backend Ready! (http://localhost:3000)

---

### Step 4: Admin Panel Start (2 minutes)

**New Terminal:**
```cmd
cd admin-panel
npm install
npm run dev
```

✅ Admin Ready! (http://localhost:5173)

**Login:**
- Email: admin@grocery.pk
- Password: admin123

---

### Step 5: Website Start (2 minutes)

**New Terminal:**
```cmd
cd website
npm install
npm run dev
```

✅ Website Ready! (http://localhost:3001)

---

### Step 6: Customer App Start (3 minutes)

**New Terminal:**
```cmd
cd customer-app
npm install
```

**Agar Error Aaye:**
```cmd
npm uninstall expo-image
npm install expo-image@1.10.6
```

**App Start:**
```cmd
npx expo start
```

✅ Customer App Ready!

**Mobile Pe Chalane Ke Liye:**
1. Mobile pe "Expo Go" app install karo
2. Same WiFi pe hona chahiye
3. QR code scan karo

---

### Step 7: Rider App Start (2 minutes)

**New Terminal:**
```cmd
cd rider-app
npm install
npx expo start --port 19001
```

✅ Rider App Ready!

---

## 📱 Testing

### Browser Me Check Karo:

1. **Backend:** http://localhost:3000/health
2. **Admin:** http://localhost:5173
3. **Website:** http://localhost:3001

### Mobile Apps:

1. **Customer App:** Expo Go → Scan QR
2. **Rider App:** Expo Go → Scan QR (port 19001)

---

## 🔄 Daily Use (Roz Ka Kaam)

### Subah Start Karne Ka Tareeqa:

**Terminal 1:**
```cmd
cd backend
npm run dev
```

**Terminal 2:**
```cmd
cd admin-panel
npm run dev
```

**Terminal 3:**
```cmd
cd website
npm run dev
```

**Terminal 4:**
```cmd
cd customer-app
npx expo start
```

**Terminal 5:**
```cmd
cd rider-app
npx expo start --port 19001
```

---

## 🛠️ Common Problems

### Problem 1: "Port already in use"

**Solution:**
```cmd
netstat -ano | findstr :3000
taskkill /PID <number> /F
```

### Problem 2: "Cannot find module"

**Solution:**
```cmd
npm install
```

### Problem 3: "Database connection failed"

**Solution:**
```
1. PostgreSQL service check karo
2. .env me password sahi hai?
3. Database create hui hai?
```

### Problem 4: "Expo app not loading"

**Solution:**
```cmd
npx expo start -c
```

---

## 📞 Need Help?

1. **Error Message Copy Karo**
2. **Google Pe Search Karo**
3. **Logs Check Karo**
4. **DEPLOYMENT_GUIDE_URDU.md Padho**

---

## ✅ Success Checklist

- [ ] Node.js installed
- [ ] PostgreSQL installed
- [ ] Database created
- [ ] Backend running
- [ ] Admin panel running
- [ ] Website running
- [ ] Customer app running
- [ ] Rider app running
- [ ] All tested

**🎉 Sab ready hai!**