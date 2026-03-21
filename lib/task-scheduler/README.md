# Task Scheduler

שכבת תזמון למשימות ב-PATIFON.

## מטרה

לאפשר למשימה לשאת גם הוראת ביצוע ותזמון, כך שכאשר מגיע המועד שלה:
- היא תסומן כמשימה שהופעלה
- תישלח ל-OpenClaw דרך webhook אם הוגדר
- ואם אין webhook, תיכנס ל-queue פנימי (`agent_triggers`)

## שדות רלוונטיים על המשימה

- `scheduledAt`
- `scheduleType`
- `scheduleStatus`
- `executionMode`
- `agentInstruction`
- `payload`
- `lastTriggeredAt`
- `executionResult`
- `triggerLockId`

## flow

1. ה-cron קורא ל-`/api/cron/run-scheduled-tasks`
2. ה-route מושך משימות עם `scheduleStatus = PENDING`
3. מסנן רק את אלה שהגיע זמנן
4. מסמן אותן `TRIGGERED`
5. מנסה dispatch:
   - קודם webhook (`OPENCLAW_TASK_WEBHOOK_URL`)
   - אחרת queue ל-`agent_triggers`

## למה יש fallback

כדי שגם בלי webhook פעיל, המערכת לא תאבד משימות. במקום זה הן ייכנסו ל-queue שאפשר לצרוך בהמשך.

## השלב הבא

- להוסיף UI לשדות התזמון במסך המשימה
- consumer ל-`agent_triggers` כבר נוסף דרך `/api/cron/dispatch-agent-triggers`
- להוסיף idempotency/retry policy למשימות שנכשלו
- להגדיר `OPENCLAW_TASK_WEBHOOK_URL` כדי שהטריגרים יישלחו החוצה אוטומטית
- אחרי ביצוע משימה: לסמן `DONE` ולעדכן בתיאור/לוג מה בוצע, מה הסטטוס כרגע, ומה השלב הבא
