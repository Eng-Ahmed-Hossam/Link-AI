/**
 * Link's WhatsApp contact (Figma: "Message us on WhatsApp", footer "WhatsApp"). Not chosen yet
 * (Figma note 80:691, item 5): set NEXT_PUBLIC_CONTACT_WHATSAPP to the number in international
 * form (e.g. 2010…). Until then the buttons lead to the form.
 */
export function whatsappUrl(): string | null {
  const n = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '').replace(/\D/g, '');
  return n.length >= 10 ? `https://wa.me/${n}` : null;
}

/**
 * Link's public contact address (footer, the request confirmation; also where requests go when
 * PILOT_REQUEST_TO is not set). Set NEXT_PUBLIC_CONTACT_EMAIL; until then nothing shows.
 */
export function contactEmail(): string | null {
  const e = (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** The request confirmation's "write to us" sentence, when the contact address is set. */
export function emailLine(t: (k: 'landing.form.doneEmail', v: { email: string }) => string) {
  const address = contactEmail();
  return address ? { address, line: t('landing.form.doneEmail', { email: address }) } : null;
}
