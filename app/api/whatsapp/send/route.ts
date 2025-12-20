import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const normalizePhoneForWhatsApp = (phone: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const readConfig = async () => {
  const envId = process.env.WHATSAPP_ID_INSTANCE || process.env.NEXT_PUBLIC_WHATSAPP_ID_INSTANCE;
  const envToken = process.env.WHATSAPP_API_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_API_TOKEN;
  const envBase = process.env.WHATSAPP_BASE_URL || process.env.NEXT_PUBLIC_WHATSAPP_BASE_URL;
  if (envId && envToken) {
    return {
      idInstance: envId,
      apiTokenInstance: envToken,
      baseUrl: (envBase || "https://api.green-api.com").replace(/\/$/, ""),
    };
  }
  try {
    if (!db) return null;
    const snap = await getDoc(doc(db, "integrations", "whatsapp"));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (!data.idInstance || !data.apiTokenInstance) return null;
    return {
      idInstance: data.idInstance as string,
      apiTokenInstance: data.apiTokenInstance as string,
      baseUrl: (data.baseUrl as string) || "https://api.green-api.com",
    };
  } catch (err) {
    console.warn("Failed reading whatsapp config", err);
    return null;
  }
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const { phone, message } = await request.json();
    if (!phone || !message) {
      return NextResponse.json({ error: "phone and message are required" }, { status: 400, headers: corsHeaders });
    }
    const phoneClean = normalizePhoneForWhatsApp(phone);
    if (!phoneClean) {
      return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400, headers: corsHeaders });
    }

    const cfg = await readConfig();
    if (!cfg) {
      return NextResponse.json({ error: "חסרות הגדרות וואטסאפ (idInstance/apiTokenInstance בסביבה או במסד)" }, { status: 500, headers: corsHeaders });
    }

    const defaultBase = "https://api.green-api.com";
    const baseCandidates = Array.from(new Set([
      (cfg.baseUrl || "").includes("green-api.com") ? (cfg.baseUrl || "").replace(/\/$/, "") : "",
      defaultBase,
    ].filter(Boolean)));

    let lastError: { status: number; message: string } | null = null;

    for (const baseApi of baseCandidates) {
      // Debug log without leaking the token (helps troubleshoot 405/500 issues in dev)
      if (process.env.NODE_ENV !== "production") {
        console.log("[WA send] using base:", baseApi, "instance:", cfg.idInstance, "phone:", phoneClean);
      }

      const endpoint = `${baseApi}/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: `${phoneClean}@c.us`, message }),
        });

        if (res.ok) {
          return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
        }

        const text = await res.text();
        const safe = text?.trim() || `שליחה נכשלה (${res.status})`;
        lastError = { status: res.status || 500, message: safe };

        // Try fallback (green-api) only if the configured base failed
        if (baseApi === defaultBase) break;
      } catch (err) {
        lastError = {
          status: 500,
          message: err instanceof Error ? err.message : "שגיאה בשליחה",
        };
        if (baseApi === defaultBase) break;
      }
    }

    return NextResponse.json(
      { error: lastError?.message || "שגיאה בשליחה" },
      { status: lastError?.status || 500, headers: corsHeaders },
    );
  } catch (err) {
    console.error("WhatsApp send failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "שגיאה בשליחה" }, { status: 500, headers: corsHeaders });
  }
}
