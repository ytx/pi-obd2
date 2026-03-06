#!/usr/bin/env python3
"""Simple HTTP server with Range request support (for PMTiles)."""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class RangeHTTPRequestHandler(SimpleHTTPRequestHandler):
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            pass  # Browser closed connection early — normal for Range requests

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        range_header = self.headers.get('Range')
        if not range_header:
            return super().send_head()

        # Parse Range: bytes=start-end
        try:
            range_spec = range_header.replace('bytes=', '')
            parts = range_spec.split('-')
            file_size = os.path.getsize(path)
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1
        except (ValueError, IndexError):
            self.send_error(416, 'Invalid Range')
            return None

        f = open(path, 'rb')
        f.seek(start)

        self.send_response(206)
        ctype = self.guess_type(path)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        return f

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Range')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('0.0.0.0', port), RangeHTTPRequestHandler)
    print(f'Serving on http://0.0.0.0:{port}/ (with Range support)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
