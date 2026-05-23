# 🤖 LY-SYSTEM Bot

بوت ديسكورد احترافي مبني بـ TypeScript + discord.js

## 📁 هيكل المشروع

```
LY-SYSTEM-Bot/
├── src/
│   ├── commands/
│   │   └── general/
│   │       ├── ping.ts       ← أمر قياس السرعة
│   │       └── help.ts       ← أمر قائمة الأوامر
│   ├── events/
│   │   ├── ready.ts          ← حدث بدء التشغيل
│   │   └── interactionCreate.ts ← حدث استقبال الأوامر
│   ├── utils/
│   │   └── logger.ts         ← نظام تسجيل الأحداث
│   └── index.ts              ← نقطة البداية
├── .env                      ← التوكن السري (لا ترفعه)
├── .env.example              ← نموذج ملف .env
├── .gitignore
├── railway.json              ← إعدادات الاستضافة
├── package.json
└── tsconfig.json
```

## 🚀 طريقة التشغيل

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. إنشاء ملف .env
```bash
cp .env.example .env
```
ثم افتح ملف `.env` وحط التوكن الخاص بك.

### 3. بناء الكود
```bash
npm run build
```

### 4. تشغيل البوت
```bash
npm start
```

## ☁️ الرفع على Railway
1. ارفع الكود على GitHub
2. افتح railway.app وربطه بالـ repository
3. أضف متغير `DISCORD_TOKEN` و `CLIENT_ID` في إعدادات Variables
4. Railway يشغل البوت تلقائياً!
