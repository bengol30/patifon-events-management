export const DEFAULT_GREEN_API_BASE_URL = "https://api.green-api.com";

export const normalizeWhatsappBaseUrl = (raw?: string | null) => {
  return String(raw || DEFAULT_GREEN_API_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_GREEN_API_BASE_URL;
};

export const isValidGreenApiBaseUrl = (raw?: string | null) => {
  const normalized = normalizeWhatsappBaseUrl(raw);

  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && /(^|\.)green-api\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
};

export const assertValidGreenApiBaseUrl = (raw?: string | null) => {
  const normalized = normalizeWhatsappBaseUrl(raw);
  if (!isValidGreenApiBaseUrl(normalized)) {
    throw new Error(`WhatsApp baseUrl must point to Green API (got: ${normalized})`);
  }
  return normalized;
};
