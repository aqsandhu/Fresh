# WhatsApp + SMS OTP — Setup Guide (Firebase ka sasta mutbadil)

Ye guide batati hai k **apne backend se OTP** (WhatsApp pehle, SMS fallback) kaise on
karna hai — Firebase se ~4–6 guna sasta, aur Play/App Store dono k rules k andar.

Sab kuch **env vars** se control hota hai — koi code change nahi. Jab tak aap
switch nahi karte, purana Firebase / bypass flow waise ka waisa chalta rahega.

---

## 1. OTP kaise kaam karta hai (3 modes)

`/api/auth/send-otp` ab teen modes support karta hai:

| Mode | Env | Kya hota hai |
|------|-----|--------------|
| `bypass` | `OTP_BYPASS_ENABLED=true` | Fixed code (123789), koi SMS nahi. **Abhi prod isi per hai.** |
| `backend` | `OTP_PROVIDER=backend` | Backend khud code banata + bhejta hai: **WhatsApp → SMS fallback** |
| `firebase` | (kuch set na ho) | Purana Firebase Phone Auth (sirf website; app Firebase support nahi karta) |

Bypass sab per bhaari hai — yani jab tak `OTP_BYPASS_ENABLED=true` hai, backend mode
ignore hoga. Backend OTP on karne k liye: **pehle bypass off karein**, phir
`OTP_PROVIDER=backend` set karein.

---

## 2. Database migration (aik dafa)

Supabase SQL Editor men chalayein:

```
database/migrations/47-otp-codes.sql
```

(Backend pehli request per khud bhi bana leta hai agar `DATABASE_URL` direct ho,
lekin manually chalana behtar hai.)

---

## 3. WhatsApp Cloud API (pehli tarjeeh — sabse sasta)

### 3a. Meta setup (aik dafa ka process)
1. [Meta Business Manager](https://business.facebook.com) per business banayein →
   **business verification** karwayein (documents lagenge, 1–3 din).
2. **WhatsApp Business Platform** app banayein (developers.facebook.com).
3. Aik phone number add karein (jo WhatsApp per pehle se use na ho raha ho).
4. Direct Meta Cloud API use karein to **koi beech ka commission nahi**. Agar
   asaan chahiye to Pakistani BSP (jaise **Eocean**) k zariye bhi le sakte hain.

### 3b. Authentication template banayein
- Meta Business Manager → WhatsApp → **Message Templates** → New.
- Category: **Authentication** (ye zaroori hai — isi men one-tap autofill button milta hai).
- Body men aik `{{1}}` variable (code).
- Button: **Copy code** / **One-tap** — yehi Android per auto-fill karata hai.
- Template ka naam yaad rakhein (default hum `otp_code` maante hain).

### 3c. Env vars (Render backend)
```
OTP_PROVIDER=backend
WHATSAPP_ACCESS_TOKEN=<permanent system-user token>
WHATSAPP_PHONE_NUMBER_ID=<Cloud API number id>
WHATSAPP_OTP_TEMPLATE=otp_code        # jo naam aapne rakha
WHATSAPP_OTP_LANGUAGE=en              # template ki language
WHATSAPP_API_VERSION=v21.0
```

> **Token tip:** temporary token 24 ghante men expire ho jata hai. System User se
> **permanent token** banayein (Business Settings → System Users).

---

## 4. Branded SMS fallback (jinke pass WhatsApp na ho)

### 4a. PTA mask (sender name)
- Local gateway (SendPK / Veevotech) se **PTA-approved mask** register karwayein
  (jaise "FreshBazar") — gateway khud karwa deta hai, ~PKR 5,000/saal.

### 4b. Env vars — SendPK
```
SMS_PROVIDER=sendpk
SMS_USERNAME=<sendpk username>
SMS_PASSWORD=<sendpk password>
SMS_SENDER_ID=FreshBazar          # PTA mask
SMS_BRAND_NAME=Fresh Bazar        # SMS text me dikhega
SMS_APP_HASH=<11-char app hash>   # neeche section 5 (Android zero-tap ke liye)
SMS_SUCCESS_MATCH=OK              # SendPK success par 'OK' jaisa return karta hai
```

### 4b (alt). Env vars — Veevotech
```
SMS_PROVIDER=veevotech
SMS_API_KEY=<veevotech hash/api key>
SMS_SENDER_ID=FreshBazar
SMS_BRAND_NAME=Fresh Bazar
SMS_APP_HASH=<11-char app hash>
```

### 4b (alt). Koi aur gateway — custom URL template
```
SMS_PROVIDER=custom
SMS_API_URL=https://gateway.example/send?to={phone}&text={message}
```
`{phone}` aur `{message}` khud replace ho jate hain.

> Agar WhatsApp env vars set na hon aur sirf SMS ho — to sab OTP SMS se jayenge.
> Dono set hon — WhatsApp pehle, fail hone par SMS.

---

## 5. Android zero-tap ke liye APP HASH (`SMS_APP_HASH`)

Google SMS Retriever ko SMS ke aakhir me app ka **11-character hash** chahiye hota
hai — tab hi app khud SMS parh kar OTP bhar deti hai (user ko kuch nahi karna parta).

- Hash **har signing key** ka alag hota hai (debug build, EAS build, Play Store).
- Play Store par publish hone ke baad **Play App Signing** ka hash lagta hai.
- Nikalne ka tareeqa: `react-native-otp-verify` ka `getHash()` method aik dafa app
  me call karke console me print karwa lein, ya AppSignatureHelper (Google) use karein.
- Ye value `SMS_APP_HASH` me daal dein. Ghalat/khali hone par sirf zero-tap band
  hoga — SMS phir bhi aata hai, user manually type kar sakta hai (koi crash nahi).

---

## 6. Customer app — naya build zaroori

Do naye **native Android modules** add hue hain (Expo Go me nahi chalte):
- `expo-phone-number-hint` — SIM number auto-detect (Phone Number Hint)
- `react-native-otp-verify` — SMS zero-tap auto-read (SMS Retriever)

Dono **autolinking** se chalte hain — koi config plugin nahi chahiye. Bas:
```
pnpm install          # (lockfile pehle se updated hai)
eas build -p android  # naya dev/production build
```
iPhone par native detect nahi hota (Apple allow nahi karta) — wahan keyboard
suggestion + OTP autofill khud kaam karta hai, koi extra build setup nahi.

---

## 7. Rate limiting (SMS pumping se bachao) — pehle se on

Backend OTP mode me ye limits khud lagti hain (env se tune ho sakti hain):

| Env | Default | Matlab |
|-----|---------|--------|
| `OTP_RESEND_COOLDOWN_SECONDS` | 45 | Do sends ke beech kam se kam gap |
| `OTP_MAX_SENDS_PER_PHONE_HOUR` | 5 | Aik number ko ghante me max codes |
| `OTP_MAX_SENDS_PER_IP_HOUR` | 15 | Aik IP se ghante me max codes |
| `OTP_TTL_SECONDS` | 300 | Code kitni der valid rahe |
| `OTP_MAX_ATTEMPTS` | 5 | Aik code par ghalat tries |

Failed delivery quota/cooldown **kharaab nahi** karti (code sirf successful send par
save hota hai).

---

## 8. Switch-over checklist

1. [ ] Migration 47 chalayein
2. [ ] WhatsApp template approve karwayein (category: Authentication)
3. [ ] SMS mask (PTA) register karwayein
4. [ ] `SMS_APP_HASH` nikaal kar set karein (EAS build key ka)
5. [ ] Render backend me env vars set karein (`OTP_PROVIDER=backend` + WhatsApp/SMS)
6. [ ] **`OTP_BYPASS_ENABLED` ko `false`** karein (warna bypass hi chalega)
7. [ ] Naya EAS Android build banayein, test karein (WhatsApp aata hai? zero-tap chalta hai?)
8. [ ] Website bhi khud-ba-khud backend mode par aa jayegi (response se detect karti hai)
