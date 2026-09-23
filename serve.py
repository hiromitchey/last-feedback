#!/usr/bin/env python3
"""開発用サーバー。キャッシュさせない（ES Modules の古い版が残るのを防ぐ）

    python3 serve.py [port]      # 既定 8123 → http://localhost:8123/
"""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
http.server.ThreadingHTTPServer(('0.0.0.0', port), NoCache).serve_forever()
