# 🎭 Patifon Event Management System

מערכת לניהול אירועים ומשימות עבור פטיפון - מרכז תרבות צעירים.

## ✨ תכונות

- 📅 **ניהול אירועים** - יצירה, עריכה ומעקב אחר אירועים
- ✅ **ניהול משימות** - משימות קבועות ומשימות לכל אירוע
- 👥 **ניהול משתמשים** - אימות והרשאות דרך Firebase
- 🎯 **תיוג משימות** - אפשרות לתייג אנשים למשימות
- 📊 **דשבורד** - מעקב אחר כל האירועים והמשימות במקום אחד

## 🚀 התחלה מהירה

### דרישות מקדימות

- Node.js 18+ 
- חשבון Firebase
- npm או yarn

### התקנה מקומית

1. שכפל את הפרויקט:
```bash
git clone https://github.com/[YOUR-USERNAME]/patifon-events-management.git
cd patifon-events-management
```

2. התקן תלויות:
```bash
npm install
```

3. הגדר משתני סביבה:
```bash
cp .env.example .env.local
```
ערוך את `.env.local` והוסף את פרטי Firebase שלך.

4. הרץ את השרת המקומי:
```bash
npm run dev
```

האתר יהיה זמין ב: `http://localhost:3000`

## 🌐 העלאה לאוויר (Deployment)

### Vercel (מומלץ)

1. התחבר ל-[Vercel](https://vercel.com)
2. חבר את ה-repository מ-GitHub
3. הוסף את משתני הסביבה מ-`.env.example`
4. לחץ Deploy!

הכתובת תהיה: `https://[your-project-name].vercel.app`

### הגדרת Firebase

אחרי ההעלאה, אל תשכח:
1. Firebase Console > Authentication > Settings > Authorized domains
2. הוסף את הדומיין של Vercel

## 🛠️ טכנולוגיות

- **Next.js 15** - React Framework
- **TypeScript** - Type Safety
- **Firebase** - Authentication & Database (Firestore)
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## 📝 רישיון

MIT License - ראה קובץ LICENSE לפרטים נוספים.

## 👨‍💻 תמיכה

לשאלות או בעיות, פתח Issue ב-GitHub.

---

Made with ❤️ for Patifon
