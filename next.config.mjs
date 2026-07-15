import { buildContentSecurityPolicy } from "./lib/security/contentSecurityPolicy.mjs";

const adminServerActionAllowedOrigins = parseAdminServerActionAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGINS);

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
      ...(adminServerActionAllowedOrigins.length ? { allowedOrigins: adminServerActionAllowedOrigins } : {})
    }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

function parseAdminServerActionAllowedOrigins(value) {
  if (!value?.trim()) return [];
  return value.split(",").map((entry) => {
    const origin = entry.trim();
    try {
      const url = new URL(origin);
      if (url.origin !== origin.replace(/\/$/, "")) throw new Error("origin must not contain a path");
      return url.host;
    } catch {
      throw new Error("ADMIN_ALLOWED_ORIGINS must contain comma-separated absolute origins without paths.");
    }
  });
}

// Next hydration and the current MapLibre/chart styling require inline scripts and styles.
// Replace these two allowances with nonces or hashes in the next CSP hardening pass.
const contentSecurityPolicy = buildContentSecurityPolicy();

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" }
];

export default nextConfig;
