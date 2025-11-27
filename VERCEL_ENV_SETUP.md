# 🚀 הגדרת משתני סביבה ב-Vercel

## ⚠️ פעולה אחת אחרונה נדרשת ממך

כל הקוד מוכן ותקין! הבנייה ב-Vercel אמורה להתחיל אוטומטית.
**אבל** - כדי שהאתר יעבוד, צריך להעתיק את הגדרות Firebase ל-Vercel.

## 📝 צעדים פשוטים (לוקח דקה אחת):

### 1. פתח את Vercel
- לך ל: https://vercel.com/dashboard
- בחר את הפרויקט `patifon-events-management`

### 2. הוסף משתני סביבה
- לחץ על **Settings** (למעלה)
- לחץ על **Environment Variables** (בצד)
- לחץ על **Add New**

### 3. העתק את 6 המשתנים הבאים

פתח את הקובץ `.env.local` במחשב שלך והעתק **כל שורה** ל-Vercel:

```
NEXT_PUBLIC_FIREBASE_API_KEY=<הערך שלך מ-.env.local>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<הערך שלך מ-.env.local>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<הערך שלך מ-.env.local>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<הערך שלך מ-.env.local>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<הערך שלך מ-.env.local>
NEXT_PUBLIC_FIREBASE_APP_ID=<הערך שלך מ-.env.local>
```

**חשוב:** לכל משתנה, סמן את כל 3 הסביבות (Production, Preview, Development)

### 4. זהו!
לאחר שהוספת את המשתנים, Vercel יבנה אוטומטית את האתר עם ההגדרות הנכונות.

---

## 💡 למה אני לא יכול לעשות את זה בשבילך?
משתני הסביבה מכילים מפתחות API פרטיים של Firebase שלך.
רק אתה יכול להתחבר לחשבון Vercel שלך ולהגדיר אותם.

## ✅ מה כבר נעשה:
- ✅ כל שגיאות הקוד תוקנו
- ✅ הבנייה עוברת בהצלחה (בדקתי)
- ✅ הקוד נדחף ל-GitHub
- ✅ Vercel התחיל בנייה חדשה

## 🎯 הצעד האחרון:
פשוט תעתיק את המשתנים מ-`.env.local` ל-Vercel ותהיה מוכן!
