// Static asset imports. Next.js returns StaticImageData ({ src, … }); Vite returns a URL string.
declare module '*.svg' {
  const value: string | { src: string };
  export default value;
}
declare module '*.png' {
  const value: string | { src: string };
  export default value;
}
declare module '*.webp' {
  const value: string | { src: string };
  export default value;
}
