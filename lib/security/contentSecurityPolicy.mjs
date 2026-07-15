export function buildContentSecurityPolicy(environment = process.env.NODE_ENV) {
  const isDevelopment = environment === "development";
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    "https://va.vercel-scripts.com"
  ];
  const connectSources = [
    "'self'",
    "blob:",
    ...(isDevelopment ? ["ws:"] : []),
    "https://*.basemaps.cartocdn.com",
    "https://basemaps.cartocdn.com",
    "https://vitals.vercel-insights.com",
    "https://*.vercel-insights.com"
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "manifest-src 'self'"
  ].join("; ");
}
