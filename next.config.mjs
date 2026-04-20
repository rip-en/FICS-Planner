/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static.satisfactory-calculator.com" },
      { protocol: "https", hostname: "www.satisfactorytools.com" },
    ],
  },
  webpack: (config) => {
    // javascript-lp-solver ships an optional `lpsolve` external that imports
    // node-only fs/child_process. They're unused at runtime - alias them to
    // nothing so the browser bundle doesn't try to resolve them.
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      fs: false,
      child_process: false,
    };
    return config;
  },
};

export default nextConfig;
