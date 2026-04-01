"use client";

import { useMemo, useState, useEffect } from "react";
import { BarChart3, FileText, TrendingDown, TrendingUp, Activity, ShieldAlert, CheckCircle2, Search, ChevronLeft, Sparkles, ScrollText, X, Trash2, Zap } from "lucide-react";

type StockReport = {
  id: string;
  company: string;
  updatedAt: string;
  source: string;
  price: number;
  monthly: number;
  yearly: number;
  rsi: number;
  summary: string[];
  supports: string[];
  resistances: string[];
  keyTakeaways: string[];
  ma: {
    ma20: number;
    ma50: number;
    ma100: number;
    ma200: number;
  };
  entryPlans: { title: string; body: string; range?: string }[];
  claims: string[];
  sources: string[];
  fullTextSections: {
    title: string;
    body: string;
  }[];
};

const FALLBACK_REPORTS: StockReport[] = [
  {
    id: "almor-electric",
    company: "אלמור חשמל",
    updatedAt: "31.03.2026",
    source: "נדב שחם / Instagram Reel",
    price: 2235,
    monthly: -12.76,
    yearly: 57.35,
    rsi: 32.64,
    summary: [
      "אלמור מוצגת כחברת ביצוע שנהנית ממגמות צמיחה באנרגיה מתחדשת, אגירה ודאטה-סנטרים.",
      "התזה של נדב נראית מבוססת חלקית מול מקורות פומביים, אבל דורשת זהירות בהבנת צבר ההזמנות והרווחיות.",
      "טכנית המניה נמצאת בתיקון בתוך מגמה רחבה חיובית, כרגע באזור מבחן תמיכה ולא בפריצה."
    ],
    supports: ["2235–2169", "2050–2000"],
    resistances: ["2295–2305", "2415–2485", "2550–2705"],
    keyTakeaways: [
      "מחיר נוכחי 2235, ממש על אזור תמיכה מיידי.",
      "אישור כוח ראשון ייחשב רק מעל 2295–2305.",
      "אם תגיע שטיפה ל-2050–2000 עם היפוך — זה יכול להיות setup איכותי יותר.",
      "המניה עדיין חיובית בטווח הרחב, אבל חלשה בטווח הקצר."
    ],
    ma: {
      ma20: 2502.85,
      ma50: 2294.22,
      ma100: 2098.52,
      ma200: 1863.63,
    },
    entryPlans: [
      {
        title: "כניסה אגרסיבית",
        body: "מנה ראשונה סביב 2220–2245, רק עם משמעת וסטופ מתחת 2169.",
        range: "2220–2245"
      },
      {
        title: "כניסה מאוזנת",
        body: "העדפה לחכות לאישור ראשון מעל 2295–2305 לפני הגדלת פוזיציה.",
        range: "2295–2305"
      },
      {
        title: "תרחיש מועדף ל-risk/reward",
        body: "אם תגיע ירידה ל-2050–2000 עם היפוך ברור, זה אזור שיכול לתת setup איכותי יותר.",
        range: "2050–2000"
      }
    ],
    claims: [
      "יש התאמה בין תחומי הפעילות של החברה לבין הסיפור על אנרגיה מתחדשת ואגירה.",
      "נמצאה אינדיקציה גם לחשיפה לדאטה-סנטרים, אך צריך להמשיך לאמת כל עסקה לגופה.",
      "בצבר ההזמנות יש ניואנס חשוב בין צבר מגזרי לבין צבר כולל של הקבוצה."
    ],
    sources: ["Instagram Reel", "TheMarker Finance", "Bizportal", "Globes", "אתר החברה"],
    fullTextSections: [
      {
        title: "תמלול הסרטון",
        body: `המניה הישראלית הלא כל כך מוכרת שנהנת משני תחומים מאוד מאוד צומחים כרגע בעולם, אנרגיה מתחדשת בדגש על אגירה וחוות שרתים שצומחים בצורה אדירה בגלל כל מה שקשור ל-AI זו חברה לא מאוד גדולה, לפחות לא במונחים של בורסה, שווי שוק 800 מיליון שקל, נסחרת כאמור בבורסה הישראלית. זו חברה שהיא בגדול חברה קבלנית, אוקיי? מה שהיא עושה, באופן כלל, אנרגיה מתחדשת, היא מקימה פרויקטים של אנרגיה מתחדשת, חווה קבלנית בדגש על אגירה. היום מודיעה לבורסה על הזמנה של 100 מיליון שקל, פרויקט של אגירה של אנרגיה מתחדשת. צבר ההזמנות בדוח האחרון שפורסם לפני שבועיים בערך עם צבר ההזמנות במגזר האנרגיה מתחדשת בסוף 2023 היה באזור ה-190 מיליון, היום הוא באזור ה-800. שתבינו את הצמיחה בצבר ההזמנות, חוות שרתים לפני כמה חודשים שתי הזמנות מאוד משמעותיות בשווי של כמה מאות מיליוני שקלים. אחת 100 ו-1.80 לדעתי להקמה של חוות שרתים בישראל היום יש המון המון חוות בהקמה, כי יש ביקוש גדול לחשמל בגלל כל ה-AI, אנחנו רואים את זה בכל העולם. בקיצור, נישות צומחות, חברה לא מאוד גדולה שאני אוהב, אני אוהב לחפש חברות מתחת לרדאר, בהחלט מעניין. כמובן חברים, שזה לא ייעוץ השקעות, זו הדעה האישית שלי בלבד. לכו, תעשו את המחקר העצמאי שלכם, אני ממליץ כמו תמיד רק לעקוב אחריי. החברה היא חברת אלמור חשמל, כאמור לא המלצה.`
      },
      {
        title: "בדיקת הטענות של נדב",
        body: `- תחומי הפעילות אכן מתאימים לתזה: מקורות פומביים של החברה מציגים פעילות משמעותית ב-EPC, סולארי, O&M ואנרגיה מתחדשת, כולל ניסיון מצטבר של מאות MWp.\n- אגירה / אנרגיה מתחדשת: פרופיל החברה מתאר במפורש תכנון והקמה של מתקני אגירת אנרגיה ומתקנים סולאריים גדולים.\n- חוות שרתים: נמצאה אינדיקציה לזכייה/עבודות חשמל בפרויקט הקמת חוות שרתים.\n- שווי שוק: בזמן הסרטון הוזכר שווי של כ-800 מיליון ש"ח, תואם בקירוב למקורות שוק.\n- צבר הזמנות: יש להיזהר להבחין בין צבר מגזרי לצבר קבוצתי.`
      },
      {
        title: "מחקר עומק",
        body: `אלמור היא לא חברת "חלום" אלא קבלן/אינטגרטור ביצועי עם רגליים חזקות בעולם החשמל, האלקטרו-מכאני והפרויקטים.\n\nלמה הסיפור שלה מעניין עכשיו:\n- אנרגיה מתחדשת\n- אגירה\n- דאטה סנטרים / AI\n- שילוב של בסיס ביצועי יציב עם חשיפה למגמות צמיחה\n\nמה חשוב לבדוק הלאה:\n- איכות צבר ההזמנות\n- רווחיות גולמית ותפעולית\n- תזרים מזומנים\n- תלות בפרויקטים גדולים\n- עומק אמיתי של חשיפה לדאטה-סנטרים.`
      },
      {
        title: "ניתוח טכני ותוכנית כניסה",
        body: `מחיר נוכחי: 2235\nRSI14: 32.64\nMA20: 2502.85\nMA50: 2294.22\nMA100: 2098.52\nMA200: 1863.63\n\nתמיכות:\n- 2235–2169\n- 2050–2000\n\nהתנגדויות:\n- 2295–2305\n- 2415–2485\n- 2550–2705\n\nתוכנית כניסה:\n- אגרסיבית: 2220–2245 עם סטופ מתחת 2169\n- מאוזנת: אישור מעל 2295–2305\n- תרחיש מועדף: ירידה ל-2050–2000 עם היפוך ברור.`
      }
    ]
  }
];

function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function MetricCard({ title, value, subtitle, tone = "default", icon }: { title: string; value: string; subtitle: string; tone?: "default" | "green" | "red" | "amber"; icon?: React.ReactNode }) {
  const toneClass = {
    default: "text-slate-900",
    green: "text-emerald-600",
    red: "text-red-600",
    amber: "text-amber-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`mt-2 flex items-center gap-2 text-2xl font-bold ${toneClass}`}>
        {icon}
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

export default function StockTrackingPreviewPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showFullText, setShowFullText] = useState(false);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showQuickView, setShowQuickView] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      const res = await fetch('/api/stock-tracking/list');
      const data = await res.json();
      if (data.reports) {
        setReports(data.reports);
      }
    } catch (error) {
      console.error('Failed to load stock reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDelete = async (id: string, companyName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${companyName}"?`)) {
      return;
    }

    setDeleting(id);
    try {
      const res = await fetch(`/api/stock-tracking/delete?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete');
      }

      // רענון הרשימה
      await loadReports();
      
      // אם המניה שנמחקה היא זו שפתוחה, חזור לרשימה
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (error) {
      console.error('Error deleting stock:', error);
      alert('שגיאה במחיקת המניה');
    } finally {
      setDeleting(null);
    }
  };

  const activeReports = reports.length > 0 ? reports : FALLBACK_REPORTS;

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeReports;
    return activeReports.filter((report) => report.company.toLowerCase().includes(q));
  }, [search, activeReports]);

  const selectedReport = useMemo(() => {
    if (!selectedId) return null;
    return activeReports.find((report) => report.id === selectedId) || null;
  }, [selectedId, activeReports]);

  const quickViewReport = showQuickView ? activeReports.find(r => r.id === showQuickView) : null;

  if (selectedReport) {
    return (
      <>
        {quickViewReport && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="mx-auto max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
                <div>
                  <div className="text-xs font-medium text-indigo-600">תצוגה מהירה</div>
                  <h3 className="text-xl font-bold text-slate-900">{quickViewReport.company}</h3>
                </div>
                <button
                  onClick={() => setShowQuickView(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:text-red-600"
                >
                  <X size={16} />
                  סגור
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">מחיר נוכחי</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">₪{quickViewReport.price.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">RSI14</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{quickViewReport.rsi.toFixed(1)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">תשואה חודשית</div>
                    <div className={`mt-1 text-2xl font-bold ${quickViewReport.monthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {quickViewReport.monthly >= 0 ? '+' : ''}{quickViewReport.monthly.toFixed(2)}%
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">תשואה שנתית</div>
                    <div className={`mt-1 text-2xl font-bold ${quickViewReport.yearly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {quickViewReport.yearly >= 0 ? '+' : ''}{quickViewReport.yearly.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-bold text-slate-900 mb-2">ממוצעים נעים</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-500">MA20:</span> <span className="font-semibold">₪{quickViewReport.ma.ma20.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">MA50:</span> <span className="font-semibold">₪{quickViewReport.ma.ma50.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">MA100:</span> <span className="font-semibold">₪{quickViewReport.ma.ma100.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">MA200:</span> <span className="font-semibold">₪{quickViewReport.ma.ma200.toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-bold text-slate-900 mb-2">תמיכות</div>
                  <div className="flex flex-wrap gap-2">
                    {quickViewReport.supports.map((s, i) => (
                      <span key={i} className="rounded-lg bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-bold text-slate-900 mb-2">התנגדויות</div>
                  <div className="flex flex-wrap gap-2">
                    {quickViewReport.resistances.map((r, i) => (
                      <span key={i} className="rounded-lg bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowQuickView(null);
                    setSelectedId(quickViewReport.id);
                  }}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  פתח דוח מלא
                </button>
              </div>
            </div>
          </div>
        )}

        {showFullText && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm p-4 md:p-8 overflow-y-auto">
            <div className="mx-auto max-w-5xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
                <div>
                  <div className="text-xs font-medium text-indigo-600">מילה במילה / מחקר מלא</div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedReport.company}</h3>
                </div>
                <button
                  onClick={() => setShowFullText(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:text-red-600"
                >
                  <X size={16} />
                  סגור
                </button>
              </div>

              <div className="space-y-6 p-6">
                {selectedReport.fullTextSections.map((section) => (
                  <section key={section.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h4 className="text-lg font-bold text-slate-900">{section.title}</h4>
                    <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{section.body}</div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                <BarChart3 size={14} />
                מעקב מניות
              </div>
              <h2 className="mt-3 text-2xl font-bold text-slate-900">{selectedReport.company}</h2>
              <p className="mt-1 text-sm text-slate-500">תצוגת עומק מלאה של המניה שנבחרה.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFullText(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <ScrollText size={16} />
                טקסט מלא מילה במילה
              </button>
              <button
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
              >
                <ChevronLeft size={16} />
                חזרה לרשימת המניות
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-100">
                    <BarChart3 size={14} />
                    דוח מניה מלא
                  </div>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight">{selectedReport.company}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    שילוב של תמלול, בדיקת טענות, מחקר עומק, ניתוח טכני ותוכנית כניסה — בתוך ממשק מובנה של PATIFON.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  <div><span className="text-slate-400">מקור:</span> {selectedReport.source}</div>
                  <div className="mt-1"><span className="text-slate-400">עודכן:</span> {selectedReport.updatedAt}</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400">מחיר נוכחי</div>
                  <div className="mt-2 text-2xl font-bold">{selectedReport.price}</div>
                  <div className="mt-1 text-xs text-slate-400">נקודת מצב אחרונה</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400">שינוי חודשי</div>
                  <div className={`mt-2 flex items-center gap-2 text-2xl font-bold ${selectedReport.monthly >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {selectedReport.monthly >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    {formatPct(selectedReport.monthly)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">מומנטום קצר</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400">שינוי שנתי</div>
                  <div className={`mt-2 flex items-center gap-2 text-2xl font-bold ${selectedReport.yearly >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {selectedReport.yearly >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    {formatPct(selectedReport.yearly)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">מגמה רחבה</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-400">RSI14</div>
                  <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-amber-300">
                    <Activity size={20} />
                    {selectedReport.rsi}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">קרוב ל-oversold</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900">
                  <FileText size={18} className="text-blue-600" />
                  <h3 className="text-lg font-bold">תקציר מנהלים</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedReport.summary.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <h3 className="text-lg font-bold">בדיקת הטענות של נדב</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedReport.claims.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900">
                  <ShieldAlert size={18} className="text-amber-600" />
                  <h3 className="text-lg font-bold">מקורות מידע</h3>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedReport.sources.map((source) => (
                    <span key={source} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                      {source}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">רמות טכניות</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <div className="text-xs font-medium text-amber-700">תמיכות</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedReport.supports[0]}</div>
                    <div className="mt-1 text-sm text-slate-600">תמיכה מיידית</div>
                    <div className="mt-3 text-lg font-semibold text-slate-900">{selectedReport.supports[1]}</div>
                    <div className="mt-1 text-sm text-slate-600">תמיכה עמוקה יותר</div>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <div className="text-xs font-medium text-rose-700">התנגדויות</div>
                    <div className="mt-2 space-y-2 text-sm text-slate-700">
                      {selectedReport.resistances.map((item) => (
                        <div key={item} className="rounded-xl bg-white/70 px-3 py-2 font-medium">{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">ממוצעים נעים</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">MA20</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedReport.ma.ma20}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">MA50</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedReport.ma.ma50}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">MA100</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedReport.ma.ma100}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">MA200</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">{selectedReport.ma.ma200}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">תוכנית כניסה</h3>
                <div className="mt-4 space-y-3">
                  {selectedReport.entryPlans.map((plan) => (
                    <div key={plan.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-bold text-slate-900">{plan.title}</div>
                        {plan.range && <div className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">{plan.range}</div>}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{plan.body}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-sm overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-100">
                <BarChart3 size={14} />
                מעקב מניות
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">ספריית המניות של נדב שחם</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                כאן ירוכזו כל המניות שנחקרו דרך הסקיל — עם רשימה נוחה לניווט, כרטיסי מידע מהירים,
                ותצוגת עומק מלאה שנפתחת רק כשנכנסים למניה עצמה.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div><span className="text-slate-400">סה״כ מניות:</span> {loading ? '...' : activeReports.length}</div>
              <div className="mt-1"><span className="text-slate-400">עדכון אחרון:</span> {activeReports[0]?.updatedAt || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">רשימת מניות</h3>
            <p className="mt-1 text-sm text-slate-500">בחר מניה כדי לפתוח את הדוח המלא שלה.</p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם מניה..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white"
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="group relative w-full rounded-2xl border border-slate-200 bg-white transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <button
                  onClick={() => setSelectedId(report.id)}
                  className="w-full p-4 text-right"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{report.company}</div>
                      <div className="mt-1 text-xs text-slate-500">עודכן {report.updatedAt}</div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      פתח דוח
                    </div>
                  </div>
                </button>
                
                <div className="absolute top-2 left-2 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuickView(report.id);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-indigo-600 opacity-100 transition hover:border-indigo-300 hover:bg-indigo-50 md:opacity-0 md:group-hover:opacity-100"
                    title="תצוגה מהירה"
                  >
                    <Zap size={16} />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(report.id, report.company);
                    }}
                    disabled={deleting === report.id}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 opacity-100 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="מחק מניה"
                  >
                    {deleting === report.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-red-600"></div>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {filteredReports.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                לא נמצאו מניות שמתאימות לחיפוש.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
