// Types for the in-process use of fake-pay in core-api's integration tests.
export interface FakePay {
  server: import('node:http').Server;
  controls: { nextMandateCharge: 'succeed' | 'fail'; nextRefund: 'succeed' | 'fail' };
  sent: { eventId: string; type: string; at: string; status: unknown; body: string }[];
  listen(): Promise<number>;
  close(): Promise<void>;
  setWebhookUrl(url: string): void;
  setPublicUrl(url: string): void;
}
export function createFakePay(o?: {
  port?: number;
  publicUrl?: string;
  webhookUrl?: string;
  secret?: string;
  log?: (...a: unknown[]) => void;
}): FakePay;
