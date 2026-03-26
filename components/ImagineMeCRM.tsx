"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Sparkles, Send, Loader2 } from "lucide-react";

interface ImagineMeCRMProps {
  projectId: string;
  taskId: string;
  taskData: {
    title: string;
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
    };
  };
}

export default function ImagineMeCRM({ projectId, taskId, taskData }: ImagineMeCRMProps) {
  const IMAGINE_ME_PROJECT_ID = "yed4WRBzsXrdGzousyq0";

  // Only show for Imagine Me project
  if (projectId !== IMAGINE_ME_PROJECT_ID) {
    return null;
  }

  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [whatsappHistory, setWhatsappHistory] = useState<any>(null);
  const [conversationSummary, setConversationSummary] = useState<string>("");
  const [suggestedMessage, setSuggestedMessage] = useState<string>("");
  const [editedMessage, setEditedMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const phone = taskData.customData?.phone;
  const customerName = taskData.title.split(" - ")[0];

  // Load existing summary on mount
  useEffect(() => {
    if (taskData.customData?.conversationSummary) {
      setConversationSummary(taskData.customData.conversationSummary);
    }
  }, [taskData]);

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

      // Now summarize the conversation
      const summaryRes = await fetch("/api/imagine/summarize-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: data.messages,
          customerName,
          projectId,
          taskId, // Send taskId so it can be saved to Firestore
        }),
      });

      const summaryData = await summaryRes.json();

      if (summaryData.ok) {
        setConversationSummary(summaryData.summary);
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
      // Use conversation summary if available, otherwise use raw history
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
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to generate message");
      }

      setSuggestedMessage(data.message);
      setEditedMessage(data.message);
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
      // Use PATIFON's WhatsApp send endpoint
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

      alert("ההודעה נשלחה בהצלחה!");
      setEditedMessage("");
      setSuggestedMessage("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingMessage(false);
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
        {/* Fetch WhatsApp History */}
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

        {/* Conversation Summary */}
        {conversationSummary && (
          <div className="p-4 bg-white border border-green-200 rounded-lg">
            <h4 className="font-bold text-sm text-gray-900 mb-2">📋 סיכום השיחה:</h4>
            <div className="text-sm text-gray-700 whitespace-pre-wrap" dir="rtl">
              {conversationSummary}
            </div>
          </div>
        )}

        {/* Generate AI Message */}
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

        {/* Message Editor */}
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
              {sendingMessage ? "שולח..." : "שלח הודעה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
