import { localHosts } from "../scripts/lan.mjs";

/** @type {import('next').NextConfig} */
const config = {
  allowedDevOrigins: localHosts(),
};

export default config;
