// Types for the tests that run whatsapp-fake in-process (apps/core-api/test/helpers.ts).
export interface WhatsAppFake {
  server: import('node:http').Server;
  messages: Map<
    string,
    { id: string; to: string; body: string; ref: string | null; status: string }
  >;
  sent: { eventId: string; body: string; delivered?: boolean; status?: unknown }[];
  listen(): Promise<number>;
  close(): Promise<void>;
  setWebhookUrl(url: string): void;
}
export function createWhatsAppFake(opts?: {
  port?: number;
  webhookUrl?: string;
  secret?: string;
}): WhatsAppFake;
