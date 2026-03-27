"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Sparkles, Send, Loader2, Clock3, CalendarClock } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

interface ImagineMeCRMProps {
  projectId: string;
  taskId: string;
  taskData: {
    title: string;
    currentStatus?: string;
    nextStep?: string;
    customData?: {
      phone?: string;
      lydiaId?: string;
      company?: string;
      eventDate?: string;
      eventType?: string;
      eventLocation?: string;
      followUpStatus?: string;
      whatsappHistoryFetched?: boolean;
      aiSuggestionGenerated?: boolean;
      conversationSummary?: string;
      lastSummaryUpdate?: string;
      recentMessages?: any[];
      suggestedSendAt?: string;
      suggestedSendReason?: string;
      pendingFollowupMessage?: string;
      crmActionType?: string;
    };
    scheduledAt?: string | null;
    scheduleStatus?: string | null;
  };
}

const toDatetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
};

const fromDatetimeLocalValue = (value: string) => {
  if (!value) return null;
  const isoLike = `${value}:00+03:00`;
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export default function ImagineMeCRM({ projectId, taskId, taskData }: ImagineMeCRMProps) {
  const IMAGINE_ME_PROJECT_ID = "yed4WRBzsXrdGzousyq0";

  if (projectId !== IMAGINE_ME_PROJECT_ID) {
    console.log('ImagineMeCRM hidden - projectId mismatch:', { received: projectId, expected: IMAGINE_ME_PROJECT_ID });
    return null;
  }

  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [whatsappHistory, setWhatsappHistory] = useState<any>(null);
  const [conversationSummary, setConversationSummary] = useState<string>("");
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [suggestedMessage, setSuggestedMessage] = useState<string>("");
  const [editedMessage, setEditedMessage] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [scheduleReason, setScheduleReason] = useState<string>("");
  const [scheduleConfidence, setScheduleConfidence] = useState<string>("");
  const [localScheduledStatus, setLocalScheduledStatus] = useState<string>(taskData.scheduleStatus || "");
  const [error, setError] = useState<string | null>(null);

  const phone = taskData.customData?.phone;
  const customerName = taskData.title.split(" - ")[0];

  useEffect(() => {
    console.log('ImagineMeCRM mounted for task:', taskId, 'projectId:', projectId);
    if (taskData.customData?.conversationSummary) {
      setConversationSummary(taskData.customData.conversationSummary);
      console.log('Loaded existing summary');
    }
    if (taskData.customData?.recentMessages && Array.isArray(taskData.customData.recentMessages)) {
      setRecentMessages(taskData.customData.recentMessages);
      console.log('Loaded existing recent messages');
    }

    const existingSchedule = taskData.customData?.suggestedSendAt || taskData.scheduledAt || null;
    if (existingSchedule) {
      setScheduledAt(toDatetimeLocalValue(existingSchedule));
    }
    if (taskData.customData?.suggestedSendReason) {
      setScheduleReason(taskData.customData.suggestedSendReason);
    }
    if (taskData.customData?.pendingFollowupMessage) {
      setSuggestedMessage(taskData.customData.pendingFollowupMessage);
      setEditedMessage(taskData.customData.pendingFollowupMessage);
    }
    setLocalScheduledStatus(taskData.scheduleStatus || "");
  }, [taskData, taskId, projectId]);

  const persistTaskState = async (updates: Record<string, any>) => {
    if (!db) return;
    const taskRef = doc(db, "projects", projectId, "tasks", taskId);
    await updateDoc(taskRef, updates);
  };

  const persistSuggestedSchedule = async (nextIso: string, reason?: string, confidence?: string, pendingMessage?: string) => {
    await persistTaskState({
      scheduledAt: nextIso,
      dueDate: nextIso,
      scheduleStatus: "PENDING",
      executionMode: "EXTERNAL_ACTION",
      currentStatus: taskData.currentStatus || "הודעת follow-up מוכנה",
      nextStep: `שליחה מתוזמנת ל-${new Date(nextIso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`,
      customData: {
        ...(taskData.customData || {}),
        conversationSummary,
        recentMessages,
        suggestedSendAt: nextIso,
        suggestedSendReason: reason || "",
        pendingFollowupMessage: pendingMessage ?? editedMessage,
        crmActionType: "send_followup_message",
      },
    });

    setScheduledAt(toDatetimeLocalValue(nextIso));
    setScheduleReason(reason || "");
    setScheduleConfidence(confidence || "");
    setLocalScheduledStatus("PENDING");
  };

  const handleFetchHistory = async () => {
    if (!phone) {
      setError("אין מספר טלפון ללקוח");
      return;
    }

    setFetchingHistory(true);
    setError(null);

    try {
      const res = await fetch("/api/imagine/fetch-whatsapp-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, taskId, projectId }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to fetch history");
      }

      setWhatsappHistory(data);

      if (data.messages && data.messages.length > 0) {
        const last5 = data.messages.slice(0, 5);
        setRecentMessages(last5);

        const summaryRes = await fetch("/api/imagine/summarize-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: data.messages,
            customerName,
            projectId,
            taskId,
          }),
        });

        const summaryData = await summaryRes.json();

        if (summaryData.ok) {
          setConversationSummary(summaryData.summary);

          const analyzeRes = await fetch("/api/imagine/analyze-conversation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              taskId,
              conversationSummary: summaryData.summary,
              recentMessages: last5,
            }),
          });

          const analyzeData = await analyzeRes.json();

          if (analyzeData.ok) {
            console.log('Task status updated based on conversation:', analyzeData.updated);

            alert(
              `📊 הסטטוס עודכן אוטומטית!\n\n` +
              `${analyzeData.updated.currentStatus}\n\n` +
              `שלב הבא: ${analyzeData.updated.nextStep}`
            );
          }
        } else {
          setError(`Summary failed: ${summaryData.error || 'Unknown error'}`);
        }
      } else {
        setError(`לא נמצאו הודעות מ-10.2.2026 ואילך (סה"כ ${data.messageCount} הודעות בארכיון)`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetchingHistory(false);
    }
  };

  const handleGenerateMessage = async () => {
    setGeneratingMessage(true);
    setError(null);

    try {
      const historyContext = conversationSummary || (whatsappHistory
        ? whatsappHistory.messages
            .slice(0, 10)
            .map((m: any) => `${m.from}: ${m.text}`)
            .join("\n")
        : "");

      const res = await fetch("/api/imagine/generate-followup-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          customerName,
          company: taskData.customData?.company,
          eventType: taskData.customData?.eventType,
          eventDate: taskData.customData?.eventDate,
          eventLocation: taskData.customData?.eventLocation,
          whatsappHistory: historyContext,
          recentMessages,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to generate message");
      }

      setSuggestedMessage(data.message);
      setEditedMessage(data.message);

      const suggestRes = await fetch("/api/imagine/suggest-send-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          customerName,
          company: taskData.customData?.company,
          eventType: taskData.customData?.eventType,
          eventDate: taskData.customData?.eventDate,
          conversationSummary,
          recentMessages,
          draftMessage: data.message,
        }),
      });

      const suggestData = await suggestRes.json();
      if (suggestData?.ok && suggestData?.suggestedSendAt) {
        await persistSuggestedSchedule(
          suggestData.suggestedSendAt,
          suggestData.reason,
          suggestData.confidence,
          data.message,
        );
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingMessage(false);
    }
  };

  const handleSendMessage = async () => {
    if (!editedMessage.trim()) {
      setError("ההודעה ריקה");
      return;
    }

    if (!phone) {
      setError("אין מספר טלפון");
      return;
    }

    setSendingMessage(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message: editedMessage,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      const updateRes = await fetch("/api/imagine/update-after-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          taskId,
          messageSent: editedMessage,
          conversationSummary,
          recentMessages,
        }),
      });

      const updateData = await updateRes.json();

      if (updateData.ok) {
        alert(
          `✅ ההודעה נשלחה!\n\n` +
          `סטטוס: ${updateData.updated.currentStatus}\n` +
          `שלב הבא: ${updateData.updated.nextStep}`
        );
      } else {
        alert("ההודעה נשלחה, אך העדכון נכשל");
      }

      setEditedMessage("");
      setSuggestedMessage("");
      setLocalScheduledStatus("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleScheduleChange = async (value: string) => {
    setScheduledAt(value);
    const iso = fromDatetimeLocalValue(value);
    if (!iso) return;

    try {
      setSavingSchedule(true);
      setError(null);
      await persistSuggestedSchedule(
        iso,
        scheduleReason || "תוזמן ידנית מתוך ה-CRM",
        scheduleConfidence || "manual",
      );
    } catch (err: any) {
      setError(err.message || "שמירת תזמון נכשלה");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleScheduleMessage = async () => {
    if (!editedMessage.trim()) {
      setError("אין הודעה לתזמון");
      return;
    }

    if (!scheduledAt) {
      setError("צריך לבחור זמן שליחה");
      return;
    }

    const iso = fromDatetimeLocalValue(scheduledAt);
    if (!iso) {
      setError("זמן השליחה לא תקין");
      return;
    }

    try {
      setSchedulingMessage(true);
      setError(null);
      await persistSuggestedSchedule(
        iso,
        scheduleReason || "תזמון מתוך ה-CRM",
        scheduleConfidence || "manual",
        editedMessage,
      );
      alert("✅ ההודעה תוזמנה בהצלחה");
    } catch (err: any) {
      setError(err.message || "תזמון השליחה נכשל");
    } finally {
      setSchedulingMessage(false);
    }
  };

  return (
    <div className="mt-6 p-6 border-2 border-blue-200 rounded-lg bg-blue-50">
      <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5" />
        Imagine Me CRM
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleFetchHistory}
            disabled={fetchingHistory || !phone}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchingHistory ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4" />
            )}
            {fetchingHistory ? "מחלץ..." : "חלץ היסטוריה"}
          </button>
          {whatsappHistory && (
            <span className="text-sm text-green-700">
              ✓ {whatsappHistory.messageCount} הודעות נמצאו
            </span>
          )}
        </div>

        {conversationSummary && (
          <div className="p-4 bg-white border border-green-200 rounded-lg space-y-3">
            <div>
              <h4 className="font-bold text-sm text-gray-900 mb-2">📋 סיכום השיחה:</h4>
              <div className="text-sm text-gray-700 whitespace-pre-wrap" dir="rtl">
                {conversationSummary}
              </div>
            </div>

            {recentMessages.length > 0 && (
              <div className="pt-3 border-t border-gray-200">
                <h4 className="font-bold text-sm text-gray-900 mb-2">💬 5 הודעות אחרונות:</h4>
                <div className="space-y-2">
                  {recentMessages.map((msg: any, i: number) => {
                    const date = new Date(msg.timestamp * 1000);
                    const isFromCustomer = msg.from === 'customer';
                    const sender = isFromCustomer ? customerName : 'אני (בן)';

                    return (
                      <div
                        key={i}
                        className={`p-2 rounded text-xs ${
                          isFromCustomer ? 'bg-gray-100' : 'bg-blue-50'
                        }`}
                        dir="rtl"
                      >
                        <div className="font-semibold text-gray-900 mb-1">
                          {sender} • {date.toLocaleDateString('he-IL')} {date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-gray-700">{msg.text}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateMessage}
            disabled={generatingMessage}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingMessage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generatingMessage ? "יוצר..." : "הצע הודעה"}
          </button>
        </div>

        {suggestedMessage && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              הודעת Follow-up (ניתן לערוך):
            </label>
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={8}
              dir="rtl"
            />

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Clock3 className="w-4 h-4" />
                תזמון שליחה
                {savingSchedule && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>

              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => handleScheduleChange(e.target.value)}
                className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />

              {scheduleReason && (
                <div className="text-xs text-amber-900" dir="rtl">
                  <span className="font-semibold">ברירת מחדל חכמה:</span> {scheduleReason}
                  {scheduleConfidence ? ` (${scheduleConfidence})` : ""}
                </div>
              )}

              {(scheduledAt || localScheduledStatus === "PENDING") && (
                <div className="flex items-center gap-2 text-xs text-gray-700" dir="rtl">
                  <CalendarClock className="w-4 h-4" />
                  {localScheduledStatus === "PENDING"
                    ? "יש כרגע שליחה מתוזמנת פעילה למשימה הזאת."
                    : "ההודעה מוכנה לתזמון."}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || !editedMessage.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingMessage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendingMessage ? "שולח..." : "שלח עכשיו"}
              </button>

              <button
                onClick={handleScheduleMessage}
                disabled={schedulingMessage || !editedMessage.trim() || !scheduledAt}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {schedulingMessage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CalendarClock className="w-4 h-4" />
                )}
                {schedulingMessage ? "מתזמן..." : "תזמן שליחה"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
