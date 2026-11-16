FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        gcc \
        g++ \
        default-jdk-headless \
        sqlite3 \
        coreutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
USER 65534:65534
CMD ["sleep", "infinity"]
