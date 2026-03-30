# PATIFON Campaign Maintenance

## סיכום

מערכת PATIFON מנהלת קמפיינים אוטומטיים של אינסטגרם ווטסאפ. עם הזמן יכולים להצטבר בעיות כמו:

- **Content drift** - התוכן באירוע השתנה אבל הקמפיין עדיין מציג תוכן ישן
- **Overdue stories** - סטוריז שהיו אמורים לצאת אבל תקועים
- **Expired campaigns** - קמפיינים לאירועים שכבר עברו

**הפתרון:** סקריפט אוטומטי שרץ כל בוקר (9:00) ומטפל בכל הבעיות האלה.

---

## 🛠️ הכלים שנבנו

### 1. `scripts/check-campaigns.mjs`
**מה זה עושה:** בודק את כל הקמפיינים ומדווח על בעיות

**מתי להריץ:**
- כשיש חשד שמשהו תקוע
- אחרי שינויים גדולים במערכת
- לפני יצירת קמפיין חדש (sanity check)

**איך להריץ:**
```bash
cd /home/ben/.openclaw/workspace/projects/patifon-events-management
node scripts/check-campaigns.mjs
```

**תוצאה:**
```
🔍 Checking campaign health...

✅ Checked 4 campaigns

🎉 No issues found!
```

או אם יש בעיות:
```
⚠️  Found 2 issues:

1. שיווק סטוריז אינסטגרם (AJdQX0sWAaRFabXHKeKL)
   Type: overdue_pending_story
   Severity: medium
   Message: Story scheduled_post is overdue and still pending
   Step: 2
   Scheduled: 2026-03-29T18:45:00.000Z
```

---

### 2. `scripts/daily-campaign-maintenance.mjs`
**מה זה עושה:** 
- מרענן תוכן לכל הקמפיינים הפעילים (מתקן content drift)
- סוגר קמפיינים לאירועים שכבר עברו
- מדלג על סטוריז שלא רלוונטיים יותר

**מתי להריץ:**
- **אוטומטית:** כל בוקר ב-9:00 (דרך OpenClaw cron)
- **ידנית:** אם בן רוצה לתקן דברים עכשיו

**איך להריץ ידנית:**
```bash
cd /home/ben/.openclaw/workspace/projects/patifon-events-management
node scripts/daily-campaign-maintenance.mjs
```

**תוצאה:**
```
🔧 Starting daily campaign maintenance...

🔄 Refreshing content: שיווק סטוריז אינסטגרם (AJdQX0sWAaRFabXHKeKL)
   ✅ Updated: text, media

🔒 Closing expired campaign: שיווק סטוריז אינסטגרם (rEW2FJfFUGHiutadyYzu)
   ✅ Closed: 1 posted, 3 skipped

📊 Daily maintenance summary:
   Checked: 2 campaigns
   Refreshed: 1 campaigns
   Closed: 1 expired campaigns

✅ Daily maintenance completed successfully!
```

---

### 3. `scripts/close-expired-campaign.mjs`
**מה זה עושה:** סוגר קמפיין ספציפי שהאירוע שלו כבר עבר

**מתי להריץ:**
- כשבן רוצה לסגור ידנית קמפיין שלא רלוונטי יותר
- כשיש overdue story לאירוע שעבר

**איך להריץ:**
```bash
cd /home/ben/.openclaw/workspace/projects/patifon-events-management
node scripts/close-expired-campaign.mjs <eventId> <taskId>
```

**דוגמה:**
```bash
node scripts/close-expired-campaign.mjs rEW2FJfFUGHiutadyYzu hQ4i5niT7tz0CWj604ZF
```

---

## 🔄 תזרים אוטומטי יומי

כל יום ב-9:00 (שעון ישראל):

1. OpenClaw cron מעיר agent isolated
2. Agent מריץ את `daily-campaign-maintenance.mjs`
3. הסקריפט:
   - בודק כל קמפיין אינסטגרם פעיל
   - מרענן תוכן אם יש drift
   - סוגר קמפיינים לאירועים שעברו
4. Agent מדווח לך בטלגרם את התוצאות

**אם משהו השתבש:** Agent יחקור ויתקן אוטומטית, או ידווח לך אם צריך התערבות.

---

## 🚨 מה לעשות כשיש בעיה?

### תרחיש 1: "Content drift"
**מה קרה:** שינית פלייר/תיאור באירוע, אבל הקמפיין עדיין מציג את הישן.

**פתרון מהיר:**
```bash
node scripts/daily-campaign-maintenance.mjs
```

זה ירענן את התוכן בכל הקמפיינים הפעילים.

---

### תרחיש 2: "Overdue pending story"
**מה קרה:** סטורי היה אמור לצאת אתמול אבל תקוע.

**צריך להחליט:**
1. **האירוע עדיין רלוונטי?** → פרסם את הסטורי עכשיו:
   ```bash
   cd scripts
   node ig-story-send-with-convert.mjs <eventId> <taskId> <stepIndex>
   ```

2. **האירוע כבר עבר?** → סגור את הקמפיין:
   ```bash
   node scripts/close-expired-campaign.mjs <eventId> <taskId>
   ```

---

### תרחיש 3: "Missing scheduled_post"
**מה קרה:** יש משימת קמפיין ב-PATIFON, אבל אין לה `scheduled_posts` ברקע.

**פתרון:** צריך ליצור מחדש את ה-scheduled_posts. אמור לי ואני אטפל בזה.

---

### תרחיש 4: "Campaign task has no campaignControls"
**מה קרה:** משימת קמפיין נוצרה לפני שהוספנו את המערכת החדשה.

**פתרון:** הסקריפט יומי יתקן את זה אוטומטית. אם דחוף, הרץ:
```bash
node scripts/daily-campaign-maintenance.mjs
```

---

## 📋 דברים שכדאי לזכור

### ✅ הטיפול האוטומטי כבר פועל
- כל בוקר ב-9:00 המערכת בודקת ומתקנת
- לא צריך לעשות כלום ידנית (אלא אם משהו דחוף)

### ✅ איך לבדוק שהכל עובד
```bash
node scripts/check-campaigns.mjs
```

אם התוצאה היא "🎉 No issues found!" - הכל מעולה.

### ✅ אם יש בעיה דחופה
אל תחכה ל-9:00 מחר. הרץ:
```bash
node scripts/daily-campaign-maintenance.mjs
```

זה יתקן את הכל עכשיו.

---

## 🔍 איפה לראות קמפיינים?

**ב-PATIFON:**
1. לך לאירוע
2. גלול למטה ל-"משימות"
3. חפש משימות מסוג:
   - `שיווק סטוריז אינסטגרם`
   - `שיווק והפצה לקבוצות ווצאפ`

**בפיירבייס:**
- Collection: `events/{eventId}/tasks`
- Filter: `specialType == "instagram_story_campaign_patifon"`

---

## 📝 לוג שינויים

### 30.03.2026 - בניית מערכת התחזוקה
- ✅ נוסף `check-campaigns.mjs` - בדיקה מהירה של בעיות
- ✅ נוסף `daily-campaign-maintenance.mjs` - תחזוקה אוטומטית יומית
- ✅ נוסף `close-expired-campaign.mjs` - סגירה ידנית של קמפיין
- ✅ נקבע cron יומי ב-9:00 דרך OpenClaw
- ✅ תוקן `campaign-health/route.ts` לטפל נכון ב-Firebase Admin
- ✅ נפתרו כל הבעיות הקיימות:
  - Content drift בשני קמפיינים → רענון אוטומטי
  - Overdue story לאירוע שעבר → סגירה אוטומטית

---

## 💡 עצות למניעת בעיות

1. **לפני שמשנים פלייר/תיאור באירוע:**
   - אם יש כבר קמפיין פעיל, התוכן יתעדכן אוטומטית בבוקר הבא
   - אם דחוף, הרץ `daily-campaign-maintenance.mjs`

2. **לפני שמוחקים אירוע:**
   - ודא שכל הקמפיינים סומנו כ-DONE
   - אם לא, סגור אותם ידנית: `close-expired-campaign.mjs`

3. **אם משהו נראה תקוע:**
   - קודם הרץ `check-campaigns.mjs` לראות מה הבעיה
   - אז הרץ `daily-campaign-maintenance.mjs` לתקן

4. **אחרי שינויים גדולים במערכת:**
   - הרץ `check-campaigns.mjs` כ-sanity check
   - ודא שאין issues לפני שממשיכים

---

## 🎯 סיכום בשורה אחת

**מחר לא יהיו שוב בעיות כאלה** כי:
1. ✅ המערכת בודקת ומתקנת אוטומטית כל בוקר
2. ✅ יש כלים ידניים לתיקון מהיר במקרה דחוף
3. ✅ כל הבעיות הקיימות נפתרו ותוקנו
