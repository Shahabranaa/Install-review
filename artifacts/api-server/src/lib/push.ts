import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { logger } from "./logger.js";

const expo = new Expo();

export interface SendPushOptions {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendPushResult {
  success: boolean;
  error?: string;
}

export async function sendPushToTokens(opts: SendPushOptions): Promise<SendPushResult> {
  const validTokens = opts.tokens.filter((t) => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) {
    return { success: false, error: "No valid push tokens registered" };
  }

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title: opts.title,
    body: opts.body,
    data: opts.data ?? {},
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }

    const errorTickets = tickets.filter((t) => t.status === "error");
    if (tickets.length > 0 && errorTickets.length === tickets.length) {
      const message = errorTickets
        .map((t) => ("message" in t ? t.message : "Unknown push error"))
        .join("; ");
      return { success: false, error: message };
    }
    if (errorTickets.length > 0) {
      return { success: true, error: `${errorTickets.length}/${tickets.length} device(s) failed` };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Expo push send error");
    return { success: false, error: message };
  }
}

// ── Push message copy builders (mirror the email templates, kept short for notification UI) ──

export function buildExpiryNotificationPush(opts: { count: number }): { title: string; body: string } {
  return {
    title: "Certification Expiry Notice",
    body: opts.count === 1
      ? "One of your certifications is expiring soon. Open the app for details."
      : `${opts.count} of your certifications are expiring soon. Open the app for details.`,
  };
}

export function buildLoginInfoPush(): { title: string; body: string } {
  return {
    title: "Your Workforce Compliance Manager Account",
    body: "Your account login details have been sent to your email.",
  };
}

export function buildCustomPush(opts: { subject: string; textBody: string }): { title: string; body: string } {
  const trimmed = opts.textBody.trim();
  return {
    title: opts.subject || "New message",
    body: trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed,
  };
}
