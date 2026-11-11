import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localOrigins } from "./lan.mjs";
import { maven } from "./maven.mjs";
import { checkDevPorts } from "./dev-preflight.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(root, "backend");
const frontendDir = join(root, "frontend");
const isWindows = process.platform === "win32";

function nextBinary() {
  const candidates = [
    join(root, "node_modules", "next", "dist", "bin", "next"),
    join(frontendDir, "node_modules", "next", "dist", "bin", "next"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const children = [];

function start(name, command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: false,
  });
  child.on("error", (error) => {
    console.error(`[dev] ${name}: ${error.message}`);
    stopAll();
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      stopAll();
      process.exit(code);
    }
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || child.killed) continue;
    if (isWindows && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

try {
  await checkDevPorts();
} catch (error) {
  console.error(`[dev] ${error.message}`);
  process.exit(1);
}

maven(["-DskipTests", "package"]);
console.log("[dev] backend: Spring Boot on http://localhost:5000");
start("backend", "java", ["-jar", "target/classflow-1.0.0.jar"], {
  cwd: backendDir,
  env: { DEV_LAN_ORIGINS: localOrigins().join(",") },
});

const next = nextBinary();
if (!next) {
  console.error("[dev] Next.js was not found. Run npm install first.");
  stopAll();
  process.exit(1);
}
console.log("[dev] frontend: next dev on http://localhost:3000");
start("frontend", process.execPath, [next, "dev", "-H", "0.0.0.0", "-p", "3000"], {
  cwd: frontendDir,
  env: {},
});

console.log("[dev] API: http://localhost:5000  UI: http://localhost:3000");
for (const origin of localOrigins().filter((origin) => !/localhost|127\.0\.0\.1/.test(origin))) {
  console.log(`[dev] LAN: ${origin} (use the Wi-Fi/Ethernet address shared with other devices)`);
}
console.log("[dev] Press Ctrl+C to stop both processes.");
