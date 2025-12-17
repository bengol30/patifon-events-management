# מדריך להגדרת חיבור אינסטגרם (Instagram Graph API)

כדי לחבר את המערכת לאינסטגרם ולהעלות פוסטים/סטורים, עליך להפיק **Access Token** ו-**Account ID** מתוך פלטפורמת המפתחים של פייסבוק (Meta).

**עלות:** חינם (לשימוש רגיל).
**דרישות:**
1. חשבון פייסבוק.
2. חשבון אינסטגרם עסקי (Business) או יוצר (Creator).
3. דף פייסבוק (Facebook Page) שמחובר לחשבון האינסטגרם הזה.

---

## שלב 1: יצירת אפליקציה ב-Meta for Developers

1. כנס לאתר [Meta for Developers](https://developers.facebook.com/).
2. התחבר עם חשבון הפייסבוק שלך.
3. לחץ על **My Apps** בפינה העליונה ואז על **Create App**.
4. בחר באפשרות **Other** (או "אחר") -> **Next**.
5. בחר ב-**Business** (עסקי) -> **Next**.
6. תן שם לאפליקציה (למשל: `Patifon Automation`) והזן את המייל שלך.
7. לחץ על **Create App**.

## שלב 2: הוספת מוצר Instagram Graph API

1. במסך הראשי של האפליקציה שיצרת, חפש את **Instagram Graph API**.
2. לחץ על **Set up**.
3. בתפריט הצד, לך ל-**Instagram Graph API** -> **Basic Display** (לא חובה, אבל מומלץ לוודא הגדרות). *הערה: אנחנו צריכים בעיקר את ה-Graph API הרגיל.*

## שלב 3: הפקת הטוקן (Access Token)

1. כנס לכלי [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. בצד ימין, וודא שב-**Meta App** נבחרה האפליקציה שיצרת (`Patifon Automation`).
3. תחת **User or Page**, בחר ב-**User Token**.
4. תחת **Permissions** (הרשאות), הוסף את ההרשאות הבאות:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `public_profile`
5. לחץ על **Generate Access Token**.
6. יפתח חלון קופץ של פייסבוק – אשר את הגישה לדף הפייסבוק ולחשבון האינסטגרם הרלוונטיים. **חשוב:** סמן את כל הדפים והחשבונות שאתה רוצה לנהל.

## שלב 4: הפיכת הטוקן לקבוע (Long-Lived Token)

הטוקן שיצרת כרגע תקף רק לשעה. כדי לקבל טוקן שתקף ל-60 יום:

1. לחץ על כפתור המידע (אייקון `i` כחול) ליד הטוקן שיצרת ב-Graph API Explorer.
2. בחלונית שנפתחת, לחץ על **Open in Access Token Tool**.
3. לחץ על הכפתור הכחול **Extend Access Token**.
4. העתק את הטוקן החדש והארוך שנוצר. **זהו ה-Access Token שלך.**

## שלב 5: מציאת ה-Account ID

1. חזור ל-[Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. בשורת הכתובת למעלה, כתוב: `me/accounts` ולחץ **Submit**.
3. בתוצאה שתתקבל, חפש את ה-ID של דף הפייסבוק שלך.
4. כעת, כתוב בשורת הכתובת: `PAGE_ID?fields=instagram_business_account` (החלף את `PAGE_ID` במספר שמצאת בסעיף הקודם).
5. בתוצאה שתתקבל, תראה שדה בשם `instagram_business_account` עם מספר מזהה בתוכו (`id`).
6. **זהו ה-Instagram Business Account ID שלך.**

---

## סיכום

יש לך כעת את שני הנתונים הנדרשים:
1. **Access Token** (הטוקן הארוך משלב 4).
2. **Account ID** (המספר משלב 5).

הכנס אותם לדף ההגדרות במערכת פטיפון תחת לשונית "אינסטגרם", ולחץ "שמור".
