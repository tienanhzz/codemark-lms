import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === "win32";
function mavenBinary() {
  const local = join(root, ".tools", "apache-maven-3.9.11", "bin", windows ? "mvn.cmd" : "mvn");
  if (existsSync(local)) return local;
  if (!windows) return "mvn";
  // cmd.exe needs the resolved batch-file path when using this quoted invocation.
  const located = spawnSync("where.exe", ["mvn.cmd"], { encoding: "utf8", windowsHide: true });
  const candidate = (located.stdout || "").split(/\r?\n/).map((line) => line.trim()).find((path) => existsSync(path));
  if (!candidate) {
    console.error("Maven was not found. Install Maven 3.9+ and add its bin directory to PATH.");
    process.exit(1);
  }
  return candidate;
}
export function maven(args) {
  const binary = mavenBinary();
  const parameters = ["-B", "-ntp", `-Dmaven.repo.local=${join(root, ".tools", "m2")}`, ...args];
  const command = windows ? process.env.ComSpec || "cmd.exe" : binary;
  const commandArgs = windows ? ["/d", "/s", "/c", `""${binary}" ${parameters.map((arg) => `"${arg}"`).join(" ")}"`] : parameters;
  const result = spawnSync(command, commandArgs, { cwd: join(root, "backend"), stdio: "inherit", windowsHide: true, windowsVerbatimArguments: windows });
  if (result.error || result.status !== 0) { console.error(result.error?.message || "Maven failed. Install JDK 21+ and Maven 3.9+, then check the build output above."); process.exit(result.status || 1); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) maven(process.argv.slice(2));
