/** Native: no tile map yet (J01 keeps the drawn map and the list with distances). */
export interface WebMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}
export function WebMap(props: { pins: WebMapPin[]; label: string; lang: 'ar' | 'en' }) {
  void props;
  return null;
}
