import { buildSendPlan, parseEventDate } from "@/lib/whatsapp-campaign/builder";
import type { WhatsappCampaignGroup, WhatsappCampaignPayload } from "@/lib/whatsapp-campaign/types";

const LOCAL_TZ = "Asia/Jerusalem";
const INSTAGRAM_ACCOUNT = "bengolano";
const DEFAULT_INSTAGRAM_ACCOUNT_ID = "17841401457319896";

type RawTask = Record<string, unknown> & {
  id?: string;
  specialType?: string;
  status?: string;
  title?: string;
  payload?: Record<string, unknown>;
};

type RawEvent = Record<string, unknown> & {
  id: string;
  title?: string;
  description?: string;
  officialPostText?: string;
  location?: string;
  startTime?: unknown;
  officialFlyerUrl?: string;
  previewImage?: string;
  coverImage?: string;
  coverImageUrl?: string;
  imageUrl?: string;
  image?: string;
};

export interface MarketingSuggestionStateRecord {
  id?: string;
  eventId: string;
  suggestionType: SuggestionType;
  status: "DISMISSED" | "SUPPRESSED" | "ACCEPTED";
  until?: string | null;
}

export type SuggestionType = "whatsapp_campaign" | "instagram_story_campaign";

export interface MarketingSuggestion {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartTime: string | null;
  suggestionType: SuggestionType;
  title: string;
  reason: string;
  ctaLabel: string;
  secondaryLabel: string;
  existingTaskIds: string[];
  blockers: string[];
  summary: {
    hasOfficialText: boolean;
    hasMedia: boolean;
    hasWhatsappGroups: boolean;
    instagramConnected: boolean;
    daysUntilEvent: number | null;
  };
}

export interface InstagramStoryPlanStep {
  stepIndex: number;
  scheduledTime: string;
  contentType: "flyer" | "photo" | "video" | "random_video" | "multi_photo" | "text_only";
  mediaUrls: string[];
  overlayText: string;
  notes?: string;
}

export interface InstagramStoryCampaignPayload {
  campaignType: "instagram_story_event_promotion";
  instagramAccount: string;
  accountId: string;
  storyPlan: InstagramStoryPlanStep[];
  sendPlanVersion: string;
  googlePhotosUrl?: string;
  totalStoriesPosted?: number;
}

export interface MarketingTaskDraft {
  suggestionType: SuggestionType;
  eventId: string;
  eventTitle: string;
  title: string;
  description: string;
  status: "TODO";
  priority: "HIGH";
  executionMode: "MANUAL_TRACKED" | "AUTOMATED";
  requiredCompletions: number;
  remainingCompletions: number;
  dueDate: string;
  specialType: string;
  payload: WhatsappCampaignPayload | InstagramStoryCampaignPayload;
  defaults: Record<string, unknown>;
}

const clean = (value: unknown) => String(value || "").trim();

const formatLocal = (value: Date) => new Intl.DateTimeFormat("he-IL", {
  timeZone: LOCAL_TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(value);

const getEventText = (event: RawEvent) => clean(event.officialPostText) || clean(event.description);

const getEventMediaUrls = (event: RawEvent) => Array.from(new Set([
  event.officialFlyerUrl,
  event.previewImage,
  event.coverImage,
  event.coverImageUrl,
  event.imageUrl,
  event.image,
].map(clean).filter(Boolean)));

const isOpenTask = (task: RawTask, specialType: string) => task.specialType === specialType && task.status !== "DONE";

const getDaysUntilEvent = (startTime: unknown) => {
  const eventDate = parseEventDate(startTime);
  if (!eventDate) return null;
  const now = new Date();
  const eventLocalDay = new Intl.DateTimeFormat('en-CA', { timeZone: LOCAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(eventDate);
  const nowLocalDay = new Intl.DateTimeFormat('en-CA', { timeZone: LOCAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const eventDayDate = new Date(`${eventLocalDay}T00:00:00`);
  const nowDayDate = new Date(`${nowLocalDay}T00:00:00`);
  return Math.round((eventDayDate.getTime() - nowDayDate.getTime()) / (24 * 60 * 60 * 1000));
};

const nextLocalTime = (base: Date, hour: number, minute: number) => {
  const candidate = new Date(base);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= base.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
};

const buildWhatsappSchedule = (eventDate: Date | null, steps: number) => {
  const now = new Date();
  if (!eventDate) {
    return Array.from({ length: steps }, (_, index) => new Date(now.getTime() + (index + 1) * 6 * 60 * 60 * 1000).toISOString());
  }
  const daysUntil = getDaysUntilEvent(eventDate);
  const tomorrowMorning = nextLocalTime(now, 10, 0);
  const todayEvening = nextLocalTime(new Date(now.getTime() - 1), 17, 30);
  const dayBeforeEvening = new Date(eventDate);
  dayBeforeEvening.setDate(dayBeforeEvening.getDate() - 1);
  dayBeforeEvening.setHours(17, 30, 0, 0);

  if (steps <= 2 || (daysUntil !== null && daysUntil <= 1)) {
    const first = todayEvening.getTime() > now.getTime() && todayEvening.getTime() < eventDate.getTime()
      ? todayEvening
      : new Date(Math.min(eventDate.getTime() - 6 * 60 * 60 * 1000, now.getTime() + 2 * 60 * 60 * 1000));
    const second = tomorrowMorning.getTime() > first.getTime() && tomorrowMorning.getTime() < eventDate.getTime()
      ? tomorrowMorning
      : new Date(eventDate.getTime() - 4 * 60 * 60 * 1000);
    return [first.toISOString(), second.toISOString()].slice(0, steps);
  }

  const dayTwoEvening = new Date(eventDate);
  dayTwoEvening.setDate(dayTwoEvening.getDate() - 2);
  dayTwoEvening.setHours(17, 30, 0, 0);

  if (steps === 3) {
    return [
      (dayTwoEvening.getTime() > now.getTime() ? dayTwoEvening : todayEvening).toISOString(),
      (dayBeforeEvening.getTime() > now.getTime() ? dayBeforeEvening : new Date(now.getTime() + 6 * 60 * 60 * 1000)).toISOString(),
      (tomorrowMorning.getTime() < eventDate.getTime() ? tomorrowMorning : new Date(eventDate.getTime() - 4 * 60 * 60 * 1000)).toISOString(),
    ];
  }

  const dayFourEvening = new Date(eventDate);
  dayFourEvening.setDate(dayFourEvening.getDate() - 4);
  dayFourEvening.setHours(17, 30, 0, 0);
  const dayThreeMorning = new Date(eventDate);
  dayThreeMorning.setDate(dayThreeMorning.getDate() - 3);
  dayThreeMorning.setHours(10, 0, 0, 0);

  return [dayFourEvening, dayThreeMorning, dayTwoEvening, dayBeforeEvening, tomorrowMorning]
    .slice(0, steps)
    .map((d, index) => (d.getTime() > now.getTime() ? d : new Date(now.getTime() + (index + 2) * 60 * 60 * 1000)).toISOString());
};

const getRecommendedWhatsappStepCount = (startTime: unknown) => {
  const daysUntil = getDaysUntilEvent(startTime);
  if (daysUntil === null) return 3;
  if (daysUntil <= 1) return 2;
  if (daysUntil <= 4) return 3;
  if (daysUntil <= 7) return 4;
  return 5;
};

const buildOverlayText = (event: RawEvent, stepIndex: number, totalSteps: number, scheduledTime: Date) => {
  const title = clean(event.title);
  const when = formatLocal(scheduledTime).split(",").slice(0, 2).join(",").trim();
  if (stepIndex === totalSteps) return `${title} · היום זה קורה`;
  if (stepIndex === totalSteps - 1) return `${title} · מתקרבים · ${when}`;
  return `${title} · ${when}`.slice(0, 60);
};

const getRecommendedInstagramStepCount = (startTime: unknown) => {
  const daysUntil = getDaysUntilEvent(startTime);
  if (daysUntil === null) return 3;
  if (daysUntil <= 1) return 2;
  if (daysUntil <= 4) return 3;
  return 4;
};

const buildInstagramSchedule = (eventDate: Date | null, steps: number, isTest = false) => {
  const now = new Date();
  const minGapMs = (isTest ? 15 : 240) * 60 * 1000;
  if (!eventDate) {
    return Array.from({ length: steps }, (_, index) => new Date(now.getTime() + (index + 1) * minGapMs).toISOString());
  }

  const eventDayMorning = new Date(eventDate);
  eventDayMorning.setHours(10, 0, 0, 0);
  const dayBeforeEvening = new Date(eventDate);
  dayBeforeEvening.setDate(dayBeforeEvening.getDate() - 1);
  dayBeforeEvening.setHours(18, 45, 0, 0);
  const twoDaysBeforeEvening = new Date(eventDate);
  twoDaysBeforeEvening.setDate(twoDaysBeforeEvening.getDate() - 2);
  twoDaysBeforeEvening.setHours(18, 45, 0, 0);
  const fourDaysBeforeEvening = new Date(eventDate);
  fourDaysBeforeEvening.setDate(fourDaysBeforeEvening.getDate() - 4);
  fourDaysBeforeEvening.setHours(18, 45, 0, 0);

  const candidates = steps <= 2
    ? [dayBeforeEvening, eventDayMorning]
    : steps === 3
      ? [twoDaysBeforeEvening, dayBeforeEvening, eventDayMorning]
      : [fourDaysBeforeEvening, twoDaysBeforeEvening, dayBeforeEvening, eventDayMorning];

  return candidates.slice(0, steps).map((candidate, index) => {
    const fallback = new Date(now.getTime() + Math.max((index + 1) * minGapMs, (index + 1) * 2 * 60 * 60 * 1000));
    const chosen = candidate.getTime() > now.getTime() ? candidate : fallback;
    return chosen.toISOString();
  });
};

export const buildWhatsappCampaignDraft = (args: {
  event: RawEvent;
  groups: WhatsappCampaignGroup[];
  registrationBaseUrl?: string;
  stepCount?: number;
}) : MarketingTaskDraft => {
  const eventDate = parseEventDate(args.event.startTime);
  const stepCount = Math.max(1, Math.min(5, Number(args.stepCount) || getRecommendedWhatsappStepCount(args.event.startTime)));
  const schedule = buildWhatsappSchedule(eventDate, stepCount);
  const payload = buildSendPlan({
    event: {
      id: args.event.id,
      title: args.event.title,
      officialPostText: clean(args.event.officialPostText),
      description: clean(args.event.description),
      location: clean(args.event.location),
      officialFlyerUrl: clean(args.event.officialFlyerUrl),
      previewImage: clean(args.event.previewImage),
      coverImage: clean(args.event.coverImage),
      coverImageUrl: clean(args.event.coverImageUrl),
      imageUrl: clean(args.event.imageUrl || args.event.image),
      startTime: args.event.startTime,
    },
    targetGroups: args.groups,
    schedule,
    registrationBaseUrl: args.registrationBaseUrl,
  });

  const officialText = getEventText(args.event);
  payload.messageText = officialText;
  payload.messageVariants = payload.sendPlan.map(() => officialText);
  payload.sendPlan = payload.sendPlan.map((step) => ({ ...step, messageText: officialText }));

  const descriptionLines = [
    `קמפיין וואטסאפ לאירוע ${clean(args.event.title) || "ללא שם"}`,
    `קבוצות יעד: ${args.groups.map((group) => group.name).join(", ") || "לא נבחרו קבוצות"}`,
    "תוכנית שליחה:",
    ...payload.sendPlan.map((step) => `- ${step.scheduledLabel || formatLocal(new Date(step.scheduledAt))}`),
    "",
    `בוצע: 0 מתוך ${payload.sendPlan.length}`,
    "סטטוס נוכחי: ממתין לתחילת ביצוע",
    `השלב הבא: ${payload.sendPlan[0]?.scheduledLabel || "בהמתנה"}`,
  ];

  return {
    suggestionType: "whatsapp_campaign",
    eventId: args.event.id,
    eventTitle: clean(args.event.title),
    title: "שיווק והפצה לקבוצות ווצאפ",
    description: descriptionLines.join("\n"),
    status: "TODO",
    priority: "HIGH",
    executionMode: "AUTOMATED",
    requiredCompletions: payload.sendPlan.length,
    remainingCompletions: payload.sendPlan.length,
    dueDate: payload.sendPlan[0]?.scheduledAt || new Date().toISOString(),
    specialType: "whatsapp_campaign_patifon",
    payload,
    defaults: {
      stepCount: payload.sendPlan.length,
      targetGroups: args.groups,
      messageText: payload.messageText,
      mediaUrls: payload.mediaUrls,
      schedule,
    },
  };
};

export const buildInstagramStoryCampaignDraft = (args: {
  event: RawEvent;
  accountId?: string;
  storyCount?: number;
  isTest?: boolean;
}) : MarketingTaskDraft => {
  const eventDate = parseEventDate(args.event.startTime);
  const storyCount = Math.max(1, Math.min(5, Number(args.storyCount) || getRecommendedInstagramStepCount(args.event.startTime)));
  const mediaUrls = getEventMediaUrls(args.event);
  const schedule = buildInstagramSchedule(eventDate, storyCount, args.isTest);
  const storyPlan: InstagramStoryPlanStep[] = schedule.map((scheduledTime, index) => {
    const scheduledDate = new Date(scheduledTime);
    return {
      stepIndex: index + 1,
      scheduledTime,
      contentType: mediaUrls.length ? "flyer" : "text_only",
      mediaUrls: mediaUrls.length ? [mediaUrls[index % mediaUrls.length]] : [],
      overlayText: buildOverlayText(args.event, index + 1, storyCount, scheduledDate),
      notes: index + 1 === storyCount ? "דחיפה אחרונה לפני האירוע" : "תזכורת מתוזמנת",
    };
  });
  const payload: InstagramStoryCampaignPayload = {
    campaignType: "instagram_story_event_promotion",
    instagramAccount: INSTAGRAM_ACCOUNT,
    accountId: clean(args.accountId) || DEFAULT_INSTAGRAM_ACCOUNT_ID,
    storyPlan,
    sendPlanVersion: new Date().toISOString(),
    totalStoriesPosted: 0,
  };

  const descriptionLines = [
    `קמפיין סטוריז אינסטגרם — אירוע ${clean(args.event.title) || "ללא שם"}`,
    "תוכנית:",
    ...storyPlan.map((step) => `- סטורי ${step.stepIndex}: ${formatLocal(new Date(step.scheduledTime))} — ${step.notes || step.contentType}`),
    "",
    `בוצע: 0 מתוך ${storyPlan.length}`,
    "סטטוס נוכחי: ממתין לתחילת ביצוע",
    `השלב הבא: סטורי 1 — ${storyPlan[0] ? formatLocal(new Date(storyPlan[0].scheduledTime)) : "בהמתנה"}`,
  ];

  return {
    suggestionType: "instagram_story_campaign",
    eventId: args.event.id,
    eventTitle: clean(args.event.title),
    title: "שיווק סטוריז אינסטגרם",
    description: descriptionLines.join("\n"),
    status: "TODO",
    priority: "HIGH",
    executionMode: "MANUAL_TRACKED",
    requiredCompletions: storyPlan.length,
    remainingCompletions: storyPlan.length,
    dueDate: storyPlan[0]?.scheduledTime || new Date().toISOString(),
    specialType: "instagram_story_campaign_patifon",
    payload,
    defaults: {
      storyCount,
      mediaUrls,
      storyPlan,
      instagramAccount: INSTAGRAM_ACCOUNT,
      accountId: payload.accountId,
      isTest: Boolean(args.isTest),
    },
  };
};

export const generateMarketingSuggestions = (args: {
  events: RawEvent[];
  tasksByEventId: Record<string, RawTask[]>;
  whatsappGroups: WhatsappCampaignGroup[];
  instagramConnected: boolean;
  stateRecords?: MarketingSuggestionStateRecord[];
}) => {
  const stateMap = new Map(
    (args.stateRecords || []).map((record) => [`${record.eventId}:${record.suggestionType}`, record])
  );

  const suggestions: MarketingSuggestion[] = [];
  for (const event of args.events) {
    const eventDate = parseEventDate(event.startTime);
    if (!eventDate || eventDate.getTime() < Date.now() - 6 * 60 * 60 * 1000) continue;

    const tasks = args.tasksByEventId[event.id] || [];
    const daysUntilEvent = getDaysUntilEvent(event.startTime);
    const hasOfficialText = Boolean(getEventText(event));
    const hasMedia = getEventMediaUrls(event).length > 0;
    const existingWhatsapp = tasks.filter((task) => isOpenTask(task, "whatsapp_campaign_patifon"));
    const existingInstagram = tasks.filter((task) => isOpenTask(task, "instagram_story_campaign_patifon"));

    const makeSuggestion = (suggestionType: SuggestionType, input: {
      title: string;
      reason: string;
      blockers: string[];
      existingTaskIds: string[];
    }) => {
      const state = stateMap.get(`${event.id}:${suggestionType}`);
      if (state?.status === "SUPPRESSED") return;
      if (state?.status === "DISMISSED" && state.until) {
        const until = new Date(state.until);
        if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) return;
      }
      suggestions.push({
        id: `${event.id}:${suggestionType}`,
        eventId: event.id,
        eventTitle: clean(event.title) || "אירוע ללא שם",
        eventStartTime: eventDate.toISOString(),
        suggestionType,
        title: input.title,
        reason: input.reason,
        ctaLabel: "פתח משימה",
        secondaryLabel: "לא עכשיו",
        existingTaskIds: input.existingTaskIds,
        blockers: input.blockers,
        summary: {
          hasOfficialText,
          hasMedia,
          hasWhatsappGroups: args.whatsappGroups.length > 0,
          instagramConnected: args.instagramConnected,
          daysUntilEvent,
        },
      });
    };

    if (!existingWhatsapp.length && hasOfficialText && args.whatsappGroups.length > 0) {
      makeSuggestion("whatsapp_campaign", {
        title: "מומלץ לפתוח קמפיין וואטסאפ",
        reason: daysUntilEvent !== null && daysUntilEvent <= 1
          ? "האירוע כבר מחר/היום, כדאי לפתוח רצף תזכורות קצר."
          : "יש מלל רשמי וקבוצות זמינות, אז אפשר לפתוח קמפיין הפצה מוכן מהר.",
        blockers: [],
        existingTaskIds: [],
      });
    }

    if (!existingInstagram.length && hasMedia && args.instagramConnected) {
      makeSuggestion("instagram_story_campaign", {
        title: "מומלץ לפתוח קמפיין סטוריז",
        reason: daysUntilEvent !== null && daysUntilEvent <= 2
          ? "האירוע קרוב ויש פלייר מוכן, אז שווה לעלות סטוריז מדורגים."
          : "יש מדיה זמינה וחשבון אינסטגרם מחובר, אז אפשר להכין קמפיין סטוריז בלחיצה.",
        blockers: [],
        existingTaskIds: [],
      });
    }
  }

  suggestions.sort((a, b) => new Date(a.eventStartTime || 0).getTime() - new Date(b.eventStartTime || 0).getTime());
  return suggestions;
};
