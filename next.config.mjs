/** @type {import('next').NextConfig} */
const nextConfig = {
  // Media (fal-generated) is served from external hosts; allow them in <img>/<video>.
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
export default nextConfig;
