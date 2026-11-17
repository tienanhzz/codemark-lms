"""Explicitly launched dormant runner queue dispatcher/consumer commands."""

import argparse
import socket
import time
import uuid

from redis.exceptions import RedisError

from .database import SessionLocal
from .runner_queue import consume_once, dispatch_once, redis_client


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    dispatch = commands.add_parser("dispatch", help="Publish committed runner outbox jobs")
    dispatch.add_argument("--once", action="store_true")
    consume = commands.add_parser(
        "consume", help="Admit stream jobs to PostgreSQL; never execute source"
    )
    consume.add_argument("--once", action="store_true")
    args = parser.parse_args()
    try:
        client = redis_client()
    except ValueError as exc:
        print(str(exc))
        return 2
    delay = 1
    consumer_id = f"{socket.gethostname()}-{uuid.uuid4()}"
    failed = False
    try:
        while True:
            try:
                if args.command == "dispatch":
                    count = dispatch_once(SessionLocal, client)
                else:
                    count = consume_once(SessionLocal, client, consumer_id)
                if count:
                    print(f"Processed {count} runner queue record(s).")
                delay = 1
            except (RedisError, OSError):
                print("Runner queue dependency unavailable; retrying with capped delay.")
                failed = True
                if args.once:
                    break
                time.sleep(delay)
                delay = min(delay * 2, 30)
            if args.once:
                break
    finally:
        client.close()
    return int(failed and args.once)


if __name__ == "__main__":
    raise SystemExit(main())
