"use client";

import { Brain, CalendarClock, ChevronRight, Lightbulb, MessageSquareQuote, Sparkles, Target } from "lucide-react";

type StyleInsight = {
  id?: string;
  createdAt?: string;
  customerName?: string;
  taskId?: string;
  summary?: string;
  source?: {
    sentMessage?: string;
    leadContext?: string;
  };
  insights?: Array<{
    title: string;
    insight: string;
    recommendation: string;
    focus?: string;
  }>;
};

interface Props {
  insights: StyleInsight[];
  enabled?: boolean;
}

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
};

export default function ImagineMeStyleInsightsPanel({ insights, enabled = true }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-violet-600" />
            <h3 className="text-lg font-bold text-gray-900">למידת סגנון Imagine Me CRM</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            אחרי כל שליחה מתוך ה-CRM המערכת שומרת 3 תובנות על איך בן באמת כותב ללקוחות — כדי לשפר את "הצעת הודעה" בהמשך.
          </p>
        </div>
        <div className="rounded-full bg-violet-50 text-violet-700 text-xs font-bold px-3 py-1.5">
          {insights.length} תובנות שנשמרו
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <Sparkles className="mx-auto mb-3 text-gray-400" size={28} />
          <div className="text-sm font-semibold text-gray-800">לימוד הסגנון כרגע כבוי</div>
          <div className="text-sm text-gray-600 mt-1">
            אפשר להפעיל אותו בכל רגע באזור ההגדרות למעלה, ואז המערכת תחזור לאסוף תובנות אחרי שליחות מתוך Imagine Me CRM.
          </div>
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 p-8 text-center">
          <Sparkles className="mx-auto mb-3 text-violet-500" size={28} />
          <div className="text-sm font-semibold text-violet-900">עוד לא נאספו תובנות</div>
          <div className="text-sm text-violet-700 mt-1">
            ברגע שבן ישלח הודעות ללידים מתוך Imagine Me CRM, התובנות יתחילו להצטבר כאן אוטומטית.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((entry, index) => (
            <div key={entry.id || `${entry.taskId || 'task'}-${index}`} className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 text-violet-900 font-bold">
                    <Target size={16} />
                    {entry.customerName || "ליד ללא שם"}
                  </div>
                  {entry.summary && (
                    <p className="text-sm text-gray-700 mt-2 leading-6 whitespace-pre-wrap">{entry.summary}</p>
                  )}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1 whitespace-nowrap">
                  <CalendarClock size={14} />
                  {formatDate(entry.createdAt)}
                </div>
              </div>

              {entry.source?.sentMessage && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-white/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 mb-2">
                    <MessageSquareQuote size={14} />
                    ההודעה שנשלחה בפועל
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap leading-6">{entry.source.sentMessage}</div>
                </div>
              )}

              <div className="grid gap-3">
                {(entry.insights || []).map((insight, insightIndex) => (
                  <div key={`${entry.id || index}-${insightIndex}`} className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                      <Lightbulb size={15} className="text-amber-500" />
                      {insight.title || `תובנה ${insightIndex + 1}`}
                    </div>
                    {insight.focus && (
                      <div className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold px-2 py-1 mb-3">
                        {insight.focus}
                      </div>
                    )}
                    <p className="text-sm text-gray-700 leading-6 whitespace-pre-wrap">{insight.insight}</p>
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <ChevronRight size={16} className="mt-0.5 shrink-0" />
                      <span className="leading-6"><strong>לזכור לפעם הבאה:</strong> {insight.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
