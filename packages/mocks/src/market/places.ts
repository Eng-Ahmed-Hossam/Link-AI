/**
 * Sample places for the dev geocoder (core-api `GEOCODER_PROVIDER=dev`) and the mock backend:
 * the address search and reverse lookup of the C02 location picker without any map provider.
 * Sample data only (the Maadi demo world); a real provider replaces it behind the same interface.
 */
export interface SamplePlace {
  id: string;
  lat: number;
  lng: number;
  governorate: { en: string; ar: string };
  area: { en: string; ar: string };
  street: { en: string; ar: string };
  /** Other ways people write it (search matches these too). */
  aliases: string[];
}

const CAIRO = { en: 'Cairo', ar: 'القاهرة' };
const GIZA = { en: 'Giza', ar: 'الجيزة' };

export const samplePlaces: SamplePlace[] = [
  {
    id: 'maadi-road-9',
    lat: 29.9602,
    lng: 31.2569,
    governorate: CAIRO,
    area: { en: 'Maadi', ar: 'المعادي' },
    street: { en: 'Road 9', ar: 'شارع ٩' },
    aliases: ['road 9', 'شارع 9', 'maadi', 'المعادى'],
  },
  {
    id: 'degla-road-233',
    lat: 29.9665,
    lng: 31.2761,
    governorate: CAIRO,
    area: { en: 'Degla', ar: 'دجلة' },
    street: { en: 'Road 233', ar: 'شارع ٢٣٣' },
    aliases: ['233', 'degla maadi'],
  },
  {
    id: 'sarayat-road-79',
    lat: 29.9531,
    lng: 31.2498,
    governorate: CAIRO,
    area: { en: 'Sarayat El Maadi', ar: 'سرايات المعادي' },
    street: { en: 'Road 79', ar: 'شارع ٧٩' },
    aliases: ['road 79', 'شارع 79'],
  },
  {
    id: 'zahraa-street-18',
    lat: 29.9719,
    lng: 31.2934,
    governorate: CAIRO,
    area: { en: 'Zahraa El Maadi', ar: 'زهراء المعادي' },
    street: { en: 'Street 18', ar: 'شارع ١٨' },
    aliases: ['zahraa', 'زهراء'],
  },
  {
    id: 'new-cairo-90th',
    lat: 30.0074,
    lng: 31.4913,
    governorate: CAIRO,
    area: { en: 'New Cairo', ar: 'القاهرة الجديدة' },
    street: { en: '90th Street', ar: 'شارع التسعين' },
    aliases: ['90th', 'التسعين', 'tagamoa', 'التجمع'],
  },
  {
    id: 'zamalek-26-july',
    lat: 30.0614,
    lng: 31.2194,
    governorate: CAIRO,
    area: { en: 'Zamalek', ar: 'الزمالك' },
    street: { en: '26th of July Street', ar: 'شارع ٢٦ يوليو' },
    aliases: ['26 july', '٢٦ يوليو'],
  },
  {
    id: 'heliopolis-baghdad',
    lat: 30.0878,
    lng: 31.3242,
    governorate: CAIRO,
    area: { en: 'Heliopolis', ar: 'مصر الجديدة' },
    street: { en: 'Baghdad Street', ar: 'شارع بغداد' },
    aliases: ['masr el gedida', 'korba', 'الكوربة'],
  },
  {
    id: 'nasr-city-abbas',
    lat: 30.0566,
    lng: 31.3455,
    governorate: CAIRO,
    area: { en: 'Nasr City', ar: 'مدينة نصر' },
    street: { en: 'Abbas El Akkad Street', ar: 'شارع عباس العقاد' },
    aliases: ['abbas el akkad', 'عباس العقاد'],
  },
  {
    id: 'dokki-tahrir',
    lat: 30.0384,
    lng: 31.2111,
    governorate: GIZA,
    area: { en: 'Dokki', ar: 'الدقي' },
    street: { en: 'Tahrir Street', ar: 'شارع التحرير' },
    aliases: ['tahrir dokki'],
  },
  {
    id: 'mohandessin-gameat',
    lat: 30.0546,
    lng: 31.2001,
    governorate: GIZA,
    area: { en: 'Mohandessin', ar: 'المهندسين' },
    street: { en: 'Gameat El Dowal Street', ar: 'شارع جامعة الدول العربية' },
    aliases: ['gameat el dowal', 'جامعة الدول'],
  },
  {
    id: 'october-central-axis',
    lat: 29.9724,
    lng: 30.9437,
    governorate: GIZA,
    area: { en: '6th of October', ar: '٦ أكتوبر' },
    street: { en: 'Central Axis', ar: 'المحور المركزي' },
    aliases: ['october', 'اكتوبر', 'أكتوبر'],
  },
  {
    id: 'sheikh-zayed-26',
    lat: 30.0444,
    lng: 30.9759,
    governorate: GIZA,
    area: { en: 'Sheikh Zayed', ar: 'الشيخ زايد' },
    street: { en: '26th of July Corridor', ar: 'محور ٢٦ يوليو' },
    aliases: ['zayed', 'زايد'],
  },
];

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Lower-case, Western digits, no Arabic diacritics or tatweel, one form of alef / yeh / teh. */
export function normalisePlaceText(s: string) {
  return s
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance in km between two points (haversine). */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  governorate: string;
  area: string;
  street: string;
}

const view = (p: SamplePlace, lang: 'ar' | 'en'): PlaceResult => ({
  label: [p.street[lang], p.area[lang], p.governorate[lang]].join(lang === 'ar' ? '، ' : ', '),
  lat: p.lat,
  lng: p.lng,
  governorate: p.governorate[lang],
  area: p.area[lang],
  street: p.street[lang],
});

/** Address search over the sample places (every word must match), best 5. */
export function searchSamplePlaces(q: string, lang: 'ar' | 'en'): PlaceResult[] {
  const words = normalisePlaceText(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return samplePlaces
    .filter((p) => {
      const hay = normalisePlaceText(
        [
          p.area.en,
          p.area.ar,
          p.street.en,
          p.street.ar,
          p.governorate.en,
          p.governorate.ar,
          ...p.aliases,
        ].join(' '),
      );
      return words.every((w) => hay.includes(w));
    })
    .slice(0, 5)
    .map((p) => view(p, lang));
}

/** The nearest sample place within 3 km, or null. */
export function reverseSamplePlace(
  lat: number,
  lng: number,
  lang: 'ar' | 'en',
): PlaceResult | null {
  let best: SamplePlace | null = null;
  let bestKm = 3;
  for (const p of samplePlaces) {
    const km = kmBetween(p, { lat, lng });
    if (km <= bestKm) [best, bestKm] = [p, km];
  }
  return best ? { ...view(best, lang), lat, lng } : null;
}
