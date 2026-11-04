import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { maven, root } from "./maven.mjs";

maven(["-DskipTests", "package"]);
const result = spawnSync("java", ["-jar", "target/classflow-1.0.0.jar", "--seed", "--spring.main.web-application-type=none"], {
  cwd: join(root, "backend"),
  stdio: "inherit",
  windowsHide: true,
});
process.exit(result.status ?? 1);
