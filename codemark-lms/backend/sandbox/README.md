# Code-runner image

The API never executes submitted code in its own process. It launches an
ephemeral container per test case with:

- no network (`--network none`);
- read-only root filesystem, read-only `/src` mount and tmpfs `/work`;
- unprivileged user, all capabilities dropped, `no-new-privileges`;
- CPU, memory, PID and wall-clock limits;
- automatic removal after the result is captured.

Build the image once on the host that runs Docker:

```bash
docker build -t codemark-classflow-runner:latest backend/sandbox
```

Then set `CODE_RUNNER_ENABLED=true` in the server environment (PowerShell:
`$env:CODE_RUNNER_ENABLED="true"`) and restart Spring Boot. Set
`CODE_RUNNER_IMAGE` if using a different image. Spring does not load the root
`.env` automatically. When Docker, its daemon or the image is unavailable,
`GET /api/runner/status` reports
`available: false` and code execution returns `runner_unavailable`; the API
never falls back to a host subprocess.
