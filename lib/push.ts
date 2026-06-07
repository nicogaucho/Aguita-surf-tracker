import webpush from "web-push";

let configured = false;

/** Lazily configure web-push with VAPID details (server-only). */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type SendResult =
  | { ok: true }
  | { ok: false; gone: boolean; status?: number; error: string };

/** Send one Web Push message. `gone` signals the subscription should be deleted. */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) {
    return { ok: false, gone: false, error: "VAPID keys not configured" };
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    const gone = status === 404 || status === 410;
    return { ok: false, gone, status, error: (err as Error).message };
  }
}

export function pushConfigured(): boolean {
  return ensureConfigured();
}
