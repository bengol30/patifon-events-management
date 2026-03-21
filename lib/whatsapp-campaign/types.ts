export interface WhatsappCampaignGroup {
  id: string;
  name: string;
  chatId: string;
}

export interface WhatsappCampaignEventInput {
  id: string;
  title?: string;
  officialPostText?: string;
  description?: string;
  location?: string;
  officialFlyerUrl?: string;
  previewImage?: string;
  coverImage?: string;
  coverImageUrl?: string;
  imageUrl?: string;
  startTime?: unknown;
}

export type WhatsappCampaignStepStatus = "PENDING" | "SENT" | "FAILED" | "CANCELLED";

export interface WhatsappCampaignSendStep {
  step: number;
  scheduledAt: string;
  scheduledAtLocal?: string;
  scheduledLabel?: string;
  status: WhatsappCampaignStepStatus;
  targetGroups: WhatsappCampaignGroup[];
  messageText: string;
  sentAt?: string;
  sentAtLocal?: string;
  error?: string;
}

export interface WhatsappCampaignPayload {
  campaignType: "whatsapp_event_distribution";
  messageText: string;
  messageVariants: string[];
  mediaUrls: string[];
  targetGroups: WhatsappCampaignGroup[];
  sendPlan: WhatsappCampaignSendStep[];
  sendPlanVersion: string;
}

export interface WhatsappCampaignTaskLike {
  id?: string;
  title?: string;
  status?: string;
  specialType?: string;
  description?: string;
  currentStatus?: string;
  nextStep?: string;
  requiredCompletions?: number | null;
  remainingCompletions?: number | null;
  payload?: Partial<WhatsappCampaignPayload> & Record<string, unknown>;
}
