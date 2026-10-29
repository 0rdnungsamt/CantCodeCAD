"""Bruecke zu einem externen Blechnesting (Flask-App): startet dessen app.py unveraendert und erlaubt cantcodecad den Zugriff.

cantcodecad laeuft auf einem anderen Port (localhost:8765 bzw. 8770 im Desktop-Programm). Damit der Browser die
Nesting-Schnittstelle direkt ansprechen darf, haengt diese Bruecke CORS-Kopfzeilen an jede Antwort - nur fuer
Anfragen von localhost/127.0.0.1. Am Nester selbst wird nichts geaendert.

Aufruf:  <nester>\\.venv\\Scripts\\python.exe nester_bridge.py
Umgebung: NESTER_DIR = Ordner mit app.py (Pflicht), PORT = Port (Standard 5057)
"""
import os
import re
import sys

NESTER_DIR = os.environ.get("NESTER_DIR", "")
if not NESTER_DIR or not os.path.isfile(os.path.join(NESTER_DIR, "app.py")):
    sys.exit("NESTER_DIR zeigt nicht auf den Nester-Ordner mit app.py")
sys.path.insert(0, NESTER_DIR)
os.chdir(NESTER_DIR)

import app as nester  # noqa: E402  (der Nester selbst, unveraendert)
from flask import request  # noqa: E402

LOKAL = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


@nester.app.after_request
def _cors(resp):
    origin = request.headers.get("Origin", "")
    if LOKAL.match(origin):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Vary"] = "Origin"
    return resp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5057"))
    print(f"Nester fuer cantcodecad auf http://127.0.0.1:{port}", flush=True)
    nester.app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
