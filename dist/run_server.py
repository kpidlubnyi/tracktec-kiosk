#!/usr/bin/env python3
"""Run the Track Tec website locally from the dist directory."""

from __future__ import annotations

import argparse
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheRequestHandler(SimpleHTTPRequestHandler):
    """Serve static files without retaining stale development assets."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Track Tec local web server.")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=4174, help="Port number (default: 4174)")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    dist_directory = Path(__file__).resolve().parent
    os.chdir(dist_directory)

    server = ThreadingHTTPServer((arguments.host, arguments.port), NoCacheRequestHandler)
    address = f"http://{arguments.host}:{arguments.port}/index.html"
    print(f"Serving Track Tec from: {dist_directory}")
    print(f"Open in your browser: {address}")
    print("Press Ctrl+C to stop the server.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
