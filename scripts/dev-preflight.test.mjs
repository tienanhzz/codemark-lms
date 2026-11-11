import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { checkDevPorts, portInUse } from "./dev-preflight.mjs";

test("detects an occupied port before build and accepts it once released", async () => {
  const server = createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    assert.equal(await portInUse(port), true);
    await assert.rejects(checkDevPorts([port]), /already in use.*Stop the previous CodeMark session/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(await portInUse(port), false);
  await checkDevPorts([port]);
});
