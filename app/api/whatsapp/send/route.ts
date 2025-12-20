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
  console.log("[API] /api/whatsapp/send called");
  try {
    const body = await request.json();
    const { phone, message, method, chatId, file, fileName, urlFile, caption, idInstance, apiTokenInstance } = body;

    console.log(`[API] Method: ${method || "text"}, Phone: ${phone}, ChatId: ${chatId}`);

    // File sending mode
    if (method === "base64" || method === "url") {
      if (!chatId || !idInstance || !apiTokenInstance) {
        console.error("[API] Missing required parameters for file send");
        return NextResponse.json(
          { error: "Missing required parameters: chatId, idInstance, apiTokenInstance" },
          { status: 400, headers: corsHeaders }
        );
      }

      const baseApi = "https://api.green-api.com";
      let endpoint = "";
      let requestBody: any = { chatId };

      if (method === "base64") {
        if (!file || !fileName) {
          return NextResponse.json(
            { error: "Missing file or fileName for base64 method" },
            { status: 400, headers: corsHeaders }
          );
        }
        endpoint = `${baseApi}/waInstance${idInstance}/SendFileByBase64/${apiTokenInstance}`;
        requestBody = {
          chatId,
          file,
          fileName,
          ...(caption ? { caption } : {}),
        };
      } else if (method === "url") {
        if (!urlFile) {
          return NextResponse.json(
            { error: "Missing urlFile for url method" },
            { status: 400, headers: corsHeaders }
          );
        }
        endpoint = `${baseApi}/waInstance${idInstance}/SendFileByUrl/${apiTokenInstance}`;
        requestBody = {
          chatId,
          urlFile,
          fileName: fileName || "file",
          ...(caption ? { caption } : {}),
        };
      }

      console.log(`[API] Sending to Green API: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log(`[API] Green API response status: ${response.status}`);

      if (!response.ok) {
        console.error("Green API error:", responseText);
        return NextResponse.json(
          { error: responseText || "Failed to send file" },
          { status: response.status, headers: corsHeaders }
        );
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      return NextResponse.json(responseData, { headers: corsHeaders });
    }

    // Regular text message mode
    if (!phone || !message) {
      return NextResponse.json({ error: "phone and message are required" }, { status: 400, headers: corsHeaders });
    }
    const phoneClean = normalizePhoneForWhatsApp(phone);
    if (!phoneClean) {
      return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400, headers: corsHeaders });
    }

    const cfg = await readConfig();
    if (!cfg) {
      console.error("[API] Failed to read config");
      return NextResponse.json({ error: "חסרות הגדרות וואטסאפ (idInstance/apiTokenInstance בסביבה או במסד)" }, { status: 500, headers: corsHeaders });
    }

    const defaultBase = "https://api.green-api.com";
    const baseCandidates = Array.from(new Set([
      (cfg.baseUrl || "").includes("green-api.com") ? (cfg.baseUrl || "").replace(/\/$/, "") : "",
      defaultBase,
    ].filter(Boolean)));

    let lastError: { status: number; message: string } | null = null;

    for (const baseApi of baseCandidates) {
      const endpoint = `${baseApi}/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
      console.log(`[API] Sending text to: ${endpoint}`);
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
        console.error(`[API] Green API error (text): ${text}`);
        const safe = text?.trim() || `שליחה נכשלה (${res.status})`;
        lastError = { status: res.status || 500, message: safe };

        if (baseApi === defaultBase) break;
      } catch (err) {
        console.error("[API] Fetch error:", err);
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
    console.error("[API] Fatal error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "שגיאה בשליחה" }, { status: 500, headers: corsHeaders });
  }
}
