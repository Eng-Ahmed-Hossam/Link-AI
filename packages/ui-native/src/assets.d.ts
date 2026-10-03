// Metro resolves a static image import to an asset reference and picks the @2x/@3x file for the screen.
declare module '*.png' {
  const value: import('react-native').ImageSourcePropType;
  export default value;
}
