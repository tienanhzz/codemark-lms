import { createConnection } from "node:net";

export function portInUse(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", error => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
    socket.setTimeout(1500, () => {
      socket.destroy(); reject(new Error(`Timed out checking port ${port}.`));
    });
  });
}

export async function checkDevPorts(ports = [3000, 5000]) {
  const states = await Promise.all(ports.map(async port => ({ port, used: await portInUse(port) })));
  const busy = states.filter(state => state.used).map(state => state.port);
  if (busy.length) throw new Error(
    `Port(s) ${busy.join(", ")} already in use. Stop the previous CodeMark session (Ctrl+C in its terminal) before running npm run dev again. On Windows, a running backend also locks target/classflow-1.0.0.jar and prevents rebuilding.`
  );
}
