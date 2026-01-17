import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@tensorflow/tfjs',
    '@tensorflow-models/pose-detection',
    '@mediapipe/pose'
  ],
  webpack: (config) => {
    config.resolve.alias['@mediapipe/pose'] = false;
    return config;
  },
};

export default nextConfig;
