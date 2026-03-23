# PATIFON WhatsApp Campaign Spec

## Goal

Provide a safe builder + runner flow for WhatsApp event campaigns that stays grounded in PATIFON data and updates PATIFON after each successful send.

## Source of truth

- Event/task/group data comes from Firestore in PATIFON.
- Before each send, re-read the task from Firestore.
- If the task is missing, the step is missing, or the step is no longer `PENDING`, stop.

## Builder flow

Input:
- `eventId`
- selected group ids or full group records
- optional custom schedule
- optional custom total steps
- optional preferred base URL

Builder responsibilities:
- read the event from PATIFON
- derive the base campaign text from `officialPostText` with fallback to `description`
- derive media URLs from official event image fields
- build message variants that stay close to the original event text and only add a small timing-aware wrapper
- append the general registration link (`/events/register`) when a base URL is available
- create a `payload.sendPlan` where every step has its own message text and target groups

## Runner flow

Input:
- `eventId`
- `taskId`
- `step`

Runner responsibilities:
- load the task from Firestore
- verify `specialType === "whatsapp_campaign_patifon"`
- verify the requested send-plan step exists and is still `PENDING`
- send to group `chatId` only, never to a personal number fallback
- if media exists, send media first with caption when possible, then text only if needed
- on success:
  - mark step `SENT`
  - set `sentAt`
  - decrement `remainingCompletions`
  - update `status`, `currentStatus`, `nextStep`, `description`
- on failure:
  - mark step `FAILED`
  - keep the rest of the campaign intact
  - return a clear error message

## Message rules

- stay close to `officialPostText` / `description`
- do not invent event facts
- allow only a small timing-aware prefix/suffix such as:
  - נשארו X ימים
  - זה קורה השבוע
  - היום בערב
  - עוד מעט מתחילים
- keep natural WhatsApp-friendly formatting
- emoji are OK if they feel natural
- avoid GPT-looking bullet spam in outbound copy

## Data shape

Task fields:
- `specialType: "whatsapp_campaign_patifon"`
- `requiredCompletions`
- `remainingCompletions`
- `currentStatus`
- `nextStep`
- `payload.messageText`
- `payload.messageVariants`
- `payload.mediaUrls`
- `payload.targetGroups`
- `payload.sendPlan`

Send-plan step fields:
- `step`
- `scheduledAt`
- `status`
- `targetGroups`
- `messageText`
- `sentAt`
- `error`

## Test scope

- builder creates variants and send plan from real event shape
- runner refuses deleted/missing/non-pending steps
- runner updates progress counters correctly
- runner uses group chat ids only
