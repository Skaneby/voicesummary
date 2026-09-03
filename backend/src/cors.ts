// Origins som får anropa API:t från webbläsarkontext. Curl/server-till-server
// utan Origin-header påverkas inte — CORS är enbart webbläsarens skydd.
// Egen modul så att enhetstesterna kan importera logiken utan att dra in
// Workers-beroendena i index.ts.
const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost", // iOS Capacitor default
  "https://localhost", // Android Capacitor default (Capacitor 5+)
  "ionic://localhost", // legacy Capacitor / Ionic
  "https://skaneby.github.io", // webbversionen — inloggade prenumeranter i webbläsare
]);
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}
