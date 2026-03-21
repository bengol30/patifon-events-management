import { adminDb } from "../firebase-admin.ts";

const clean = (value: unknown) => String(value || "").trim();

export interface WhatsappConfig {
  idInstance: string;
  apiTokenInstance: string;
  baseUrl: string;
}

const normalizeGreenApiBaseUrl = (value: string) => {
  const cleanValue = clean(value).replace(/\/$/, "");
  if (!cleanValue) return "https://api.green-api.com";
  if (cleanValue.includes("green-api.com")) return cleanValue;
  return "https://api.green-api.com";
};

export const readWhatsappConfig = async (): Promise<WhatsappConfig | null> => {
  const envId = clean(process.env.WHATSAPP_ID_INSTANCE || process.env.NEXT_PUBLIC_WHATSAPP_ID_INSTANCE);
  const envToken = clean(process.env.WHATSAPP_API_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_API_TOKEN);
  const envBase = normalizeGreenApiBaseUrl(clean(process.env.WHATSAPP_BASE_URL || process.env.NEXT_PUBLIC_WHATSAPP_BASE_URL || "https://api.green-api.com"));
  if (envId && envToken) {
    return { idInstance: envId, apiTokenInstance: envToken, baseUrl: envBase };
  }
  if (!adminDb) return null;
  const snap = await adminDb.collection("integrations").doc("whatsapp").get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const idInstance = clean(data.idInstance);
  const apiTokenInstance = clean(data.apiTokenInstance);
  if (!idInstance || !apiTokenInstance) return null;
  return {
    idInstance,
    apiTokenInstance,
    baseUrl: normalizeGreenApiBaseUrl(clean(data.baseUrl || "https://api.green-api.com")),
  };
};

export const sendWhatsappTextToChat = async (chatId: string, message: string) => {
  const cfg = await readWhatsappConfig();
  if (!cfg) throw new Error("WhatsApp config missing");
  if (!clean(chatId).endsWith("@g.us")) throw new Error("Refusing to send campaign step without group chatId");
  const endpoint = `${cfg.baseUrl}/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `WhatsApp send failed (${res.status})`);
  }
  return res.json().catch(() => ({ ok: true }));
};

export const sendWhatsappFileToChat = async (chatId: string, urlFile: string, caption?: string) => {
  const cfg = await readWhatsappConfig();
  if (!cfg) throw new Error("WhatsApp config missing");
  if (!clean(chatId).endsWith("@g.us")) throw new Error("Refusing to send campaign step without group chatId");
  const endpoint = `${cfg.baseUrl}/waInstance${cfg.idInstance}/SendFileByUrl/${cfg.apiTokenInstance}`;
  const fileName = urlFile.split("/").pop() || "event-media";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, urlFile, fileName, ...(caption ? { caption } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `WhatsApp file send failed (${res.status})`);
  }
  return res.json().catch(() => ({ ok: true }));
};
