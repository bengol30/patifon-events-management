/**
 * Dynamic event content fetcher
 * 
 * This module ensures campaign tasks always use the latest event content
 * instead of relying on stale snapshots from payload.
 */

import { adminDb } from "./firebase-admin";

const clean = (value: unknown) => String(value || "").trim();

export interface EventContent {
  text: string;
  mediaUrls: string[];
  title: string;
  location: string;
  startTime: string | null;
}

/**
 * Fetch current event content dynamically
 * Always returns the LATEST version from Firestore
 */
export const fetchEventContent = async (eventId: string): Promise<EventContent> => {
  if (!adminDb) {
    throw new Error("Firebase Admin is not configured");
  }

  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  
  if (!eventSnap.exists) {
    throw new Error(`Event ${eventId} not found`);
  }

  const event = eventSnap.data() as Record<string, unknown>;
  
  // Text: officialPostText takes priority, fallback to description
  const text = clean(event.officialPostText) || clean(event.description);
  
  // Media: collect from all possible fields, deduplicate
  const mediaUrls = Array.from(new Set([
    event.officialFlyerUrl,
    event.previewImage,
    event.coverImage,
    event.coverImageUrl,
    event.imageUrl,
    event.image,
  ].map(clean).filter(Boolean)));

  // Basic event metadata
  const title = clean(event.title);
  const location = clean(event.location);
  const startTime = event.startTime ? String(event.startTime) : null;

  return {
    text,
    mediaUrls,
    title,
    location,
    startTime,
  };
};

/**
 * Check if payload content differs from current event content
 * Returns null if no drift, otherwise returns the fresh content
 */
export const detectEventContentDrift = async (
  eventId: string,
  payloadText: string,
  payloadMediaUrls: string[]
): Promise<EventContent | null> => {
  const current = await fetchEventContent(eventId);
  
  const textChanged = current.text !== clean(payloadText);
  const mediaChanged = JSON.stringify(current.mediaUrls.sort()) !== 
                       JSON.stringify(payloadMediaUrls.map(clean).filter(Boolean).sort());
  
  if (textChanged || mediaChanged) {
    return current;
  }
  
  return null;
};
