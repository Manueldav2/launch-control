/** @type {import('next').NextConfig} */
const nextConfig = {
  // Media (fal-generated) is served from external hosts; allow them in <img>/<video>.
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // The motion-video engine shells out to the ffmpeg-static binary and reads the
  // bundled font; make sure both get traced into the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/generate-media": [
      "node_modules/ffmpeg-static/**",
      "assets/fonts/**",
    ],
  },
};
export default nextConfig;
