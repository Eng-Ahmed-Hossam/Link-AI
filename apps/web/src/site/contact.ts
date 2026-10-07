/**
 * Link's WhatsApp contact (Figma: "Message us on WhatsApp", footer "WhatsApp"). Not chosen yet
 * (Figma note 80:691, item 5): set NEXT_PUBLIC_CONTACT_WHATSAPP to the number in international
 * form (e.g. 2010…). Until then the buttons lead to the form.
 */
export function whatsappUrl(): string | null {
  const n = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '').replace(/\D/g, '');
  return n.length >= 10 ? `https://wa.me/${n}` : null;
}
