import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { localHosts } from "../scripts/lan.mjs";

/** @param {string} phase @returns {import('next').NextConfig} */
const config = (phase) => ({
  // Keep production builds from replacing chunks used by the running dev server.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  allowedDevOrigins: localHosts(),
});

export default config;
