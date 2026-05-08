import cgi
import json
import os
import pathlib
import posixpath
import re
import shutil
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


ROOT_DIR = pathlib.Path(__file__).resolve().parent
PUBLIC_DIR = ROOT_DIR / "public"
UPLOAD_DIR = PUBLIC_DIR / "portfolio"
HOST = "0.0.0.0"
PORT = 8080


def ensure_dirs():
  UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
  name = pathlib.Path(filename or "image.jpg").name
  base, ext = os.path.splitext(name)
  base = re.sub(r"[^a-zA-Z0-9_-]+", "_", base).strip("_") or "image"
  ext = ext.lower() if ext else ".jpg"
  return f"{base[:40]}{ext}"


class AppHandler(SimpleHTTPRequestHandler):
  def translate_path(self, path):
    path = path.split("?", 1)[0].split("#", 1)[0]
    path = posixpath.normpath(urllib.parse.unquote(path))
    words = [w for w in path.split("/") if w]
    out_path = str(PUBLIC_DIR)
    for word in words:
      _, word = os.path.splitdrive(word)
      _, word = os.path.split(word)
      if word in (os.curdir, os.pardir):
        continue
      out_path = os.path.join(out_path, word)
    return out_path

  def end_headers(self):
    self.send_header("Cache-Control", "no-store")
    super().end_headers()

  def do_POST(self):
    if self.path.rstrip("/") != "/api/upload":
      self.send_error(404, "Not Found")
      return

    ctype, pdict = cgi.parse_header(self.headers.get("content-type", ""))
    if ctype != "multipart/form-data":
      self.respond_json(400, {"error": "Ожидается multipart/form-data."})
      return

    form = cgi.FieldStorage(
      fp=self.rfile,
      headers=self.headers,
      environ={
        "REQUEST_METHOD": "POST",
        "CONTENT_TYPE": self.headers.get("content-type"),
      },
    )
    if "image" not in form:
      self.respond_json(400, {"error": "Файл не получен."})
      return

    file_item = form["image"]
    if not getattr(file_item, "file", None):
      self.respond_json(400, {"error": "Пустой файл."})
      return

    safe_name = sanitize_filename(getattr(file_item, "filename", "image.jpg"))
    target = UPLOAD_DIR / safe_name
    counter = 1
    while target.exists():
      stem, ext = os.path.splitext(safe_name)
      target = UPLOAD_DIR / f"{stem}-{counter}{ext}"
      counter += 1

    with open(target, "wb") as output:
      shutil.copyfileobj(file_item.file, output)

    self.respond_json(200, {"path": f"./portfolio/{target.name}"})

  def respond_json(self, status: int, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


def run():
  ensure_dirs()
  server = ThreadingHTTPServer((HOST, PORT), AppHandler)
  print(f"SmailAgent started at http://localhost:{PORT}")
  server.serve_forever()


if __name__ == "__main__":
  run()
