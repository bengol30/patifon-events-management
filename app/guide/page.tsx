"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, MousePointerClick, Calendar, ClipboardCheck, Paperclip, Users, MessageCircle, Sparkles, ArrowDownCircle } from "lucide-react";

const steps = [
    {
        title: "1. התחברות",
        desc: "נכנסים עם משתמש/סיסמה. חדש? נרשמים וממלאים פרטים בסיסיים.",
        icon: <MousePointerClick size={22} />,
        accent: "bg-indigo-50 text-indigo-700"
    },
    {
        title: "2. פותחים אירוע",
        desc: "לחיצה על ״אירוע חדש״, מילוי שם, תאריך/שעה, מיקום ואיש קשר.",
        icon: <Calendar size={22} />,
        accent: "bg-orange-50 text-orange-700"
    },
    {
        title: "3. מתייגים משימות",
        desc: "פותחים ״רעיונות למשימות״, מוסיפים משימות ומגדירים אחראים ודדליין.",
        icon: <ClipboardCheck size={22} />,
        accent: "bg-green-50 text-green-700"
    }
];

export default function GuidePage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-3 rounded-full text-indigo-700">
                            <BookOpen size={26} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold">מדריך מהיר</p>
                            <h1 className="text-3xl font-bold text-gray-900">לימדו את המערכת</h1>
                            <p className="text-gray-600 mt-1">תרשים זרימה קצר, אייקונים וחצים. הכל ברור וקצר.</p>
                        </div>
                    </div>
                    <Link href="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                        <ArrowRight size={16} />
                        חזרה לדשבורד
                    </Link>
                </div>

                <div className="relative">
                    <div className="grid gap-3">
                        {steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition">
                                <div className={`p-3 rounded-full ${step.accent}`}>
                                    {step.icon}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900">{step.title}</h3>
                                    <p className="text-sm text-gray-600">{step.desc}</p>
                                </div>
                                {idx < steps.length - 1 && <ArrowDownCircle className="text-gray-300" size={20} />}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">כמה זה פשוט?</h2>
                    <p className="text-gray-700 text-sm leading-relaxed">
                        שלושה צעדים ותוכנית האירוע באוויר: מתחברים, פותחים אירוע, מתייגים משימות. זהו — הכל מרוכז, ברור ומוכן לפעולה.
                    </p>
                </div>
            </div>
        </div>
    );
}
