import { formatDistanceStrict } from "date-fns";

import type {
  WhatsappCampaignEventInput,
  WhatsappCampaignGroup,
  WhatsappCampaignPayload,
  WhatsappCampaignSendStep,
} from "./types";

const clean = (value: unknown) => String(value || "").trim();
const LOCAL_TZ = "Asia/Jerusalem";

export const getPublicBaseUrl = (preferred?: string) => {
  const cleanPreferred = clean(preferred).replace(/\/$/, "");
  if (cleanPreferred) return cleanPreferred;
  const fromEnv = clean(process.env.NEXT_PUBLIC_BASE_URL).replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "";
};

export const getGeneralRegistrationLink = (preferred?: string) => {
  const baseUrl = getPublicBaseUrl(preferred);
  return baseUrl ? `${baseUrl}/events/register` : "";
};

export const getEventMediaUrls = (event: WhatsappCampaignEventInput) => {
  const urls = [
    event.officialFlyerUrl,
    event.previewImage,
    event.coverImage,
    event.coverImageUrl,
    event.imageUrl,
  ].map(clean).filter(Boolean);
  return Array.from(new Set(urls));
};

export const parseEventDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value && "seconds" in (value as Record<string, unknown>)) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getBaseCampaignText = (event: WhatsappCampaignEventInput) => {
  return clean(event.officialPostText) || clean(event.description);
};

const compactText = (text: string) => text.replace(/\n{3,}/g, "\n\n").trim();

export const formatLocalDateTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: LOCAL_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const buildTimingLead = (scheduledAt: Date, eventDate?: Date | null) => {
  if (!eventDate) return "";
  const diffMs = eventDate.getTime() - scheduledAt.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > 1) return `נשארו עוד ${diffDays} ימים, אז פותחים רגע תזכורת נעימה 💫`;
  if (diffDays === 1) return "מחר זה קורה, אז זה הזמן להיזכר ולהצטרף ✨";
  if (diffDays === 0 && diffMs > 6 * 60 * 60 * 1000) return "זה קורה היום בערב 🎶";
  if (diffDays === 0 && diffMs > 0) return "עוד מעט מתחילים 🎵";
  return `זה כבר ממש קרוב — ${formatDistanceStrict(eventDate, scheduledAt, { addSuffix: true })}`;
};

export const buildMessageVariant = (args: {
  baseText: string;
  scheduledAt: Date;
  eventDate?: Date | null;
  registrationLink?: string;
}) => {
  const lead = buildTimingLead(args.scheduledAt, args.eventDate);
  const parts = [lead, args.baseText, args.registrationLink ? `לכל האירועים וההרשמות: ${args.registrationLink}` : ""]
    .map(clean)
    .filter(Boolean);
  return compactText(parts.join("\n\n"));
};

export const buildSendPlan = (args: {
  event: WhatsappCampaignEventInput;
  targetGroups: WhatsappCampaignGroup[];
  schedule: string[];
  registrationBaseUrl?: string;
}): WhatsappCampaignPayload => {
  const baseText = getBaseCampaignText(args.event);
  if (!baseText) {
    throw new Error("Missing officialPostText/description for campaign");
  }
  if (!args.targetGroups.length) {
    throw new Error("Missing target groups for campaign");
  }

  const eventDate = parseEventDate(args.event.startTime);
  const registrationLink = getGeneralRegistrationLink(args.registrationBaseUrl);
  const sendPlan: WhatsappCampaignSendStep[] = args.schedule.map((raw, index) => {
    const scheduledAt = new Date(raw);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error(`Invalid scheduledAt value for step ${index + 1}`);
    }
    return {
      step: index + 1,
      scheduledAt: scheduledAt.toISOString(),
      scheduledAtLocal: formatLocalDateTime(scheduledAt),
      scheduledLabel: `שליחה ${index + 1} · ${formatLocalDateTime(scheduledAt)}`,
      status: "PENDING",
      targetGroups: args.targetGroups,
      messageText: buildMessageVariant({
        baseText,
        scheduledAt,
        eventDate,
        registrationLink,
      }),
    };
  });

  return {
    campaignType: "whatsapp_event_distribution",
    messageText: baseText,
    messageVariants: sendPlan.map((step) => step.messageText),
    mediaUrls: getEventMediaUrls(args.event),
    targetGroups: args.targetGroups,
    sendPlan,
    sendPlanVersion: new Date().toISOString(),
  };
};
