/** Zvuky z assets/sounds: Vite ich pri builde skopiruje do dist a import vrati URL. */
declare module '*.wav' {
  const src: string;
  export default src;
}
