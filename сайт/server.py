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
DEFAULT_UPLOAD_DIR = PUBLIC_DIR / "portfolio"
DATA_DIR = pathlib.Path(os.getenv("DATA_DIR", str(ROOT_DIR / "data"))).resolve()
UPLOAD_DIR = DATA_DIR / "portfolio"
STATE_FILE = DATA_DIR / "data_store.json"
HOST = "0.0.0.0"
PORT = 8080


def ensure_dirs():
  DATA_DIR.mkdir(parents=True, exist_ok=True)
  UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
  if UPLOAD_DIR != DEFAULT_UPLOAD_DIR and DEFAULT_UPLOAD_DIR.exists():
    for src in DEFAULT_UPLOAD_DIR.iterdir():
      if not src.is_file():
        continue
      dst = UPLOAD_DIR / src.name
      if not dst.exists():
        shutil.copy2(src, dst)
  if not STATE_FILE.exists():
    STATE_FILE.write_text("{}", encoding="utf-8")


def read_state():
  try:
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))
  except Exception:
    return {}


def write_state(payload: dict):
  STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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
    if words and words[0] == "portfolio":
      out_path = str(UPLOAD_DIR)
      words = words[1:]
    else:
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
    path = self.path.rstrip("/")
    if path == "/api/upload":
      self.handle_upload()
      return
    if path == "/api/state":
      self.handle_state_write()
      return
    self.send_error(404, "Not Found")

  def do_GET(self):
    clean_path = self.path.rstrip("/")
    if clean_path == "/api/state":
      self.respond_json(200, {"state": read_state()})
      return
    if clean_path == "/api/health":
      self.respond_json(200, {"ok": True})
      return
    super().do_GET()

  def handle_upload(self):
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

  def handle_state_write(self):
    try:
      raw_length = int(self.headers.get("Content-Length", "0"))
    except ValueError:
      raw_length = 0
    raw_body = self.rfile.read(raw_length) if raw_length > 0 else b"{}"
    try:
      payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
      self.respond_json(400, {"error": "Некорректный JSON."})
      return

    key = payload.get("key")
    value = payload.get("value")
    if not isinstance(key, str) or not key:
      self.respond_json(400, {"error": "Не передан ключ."})
      return

    state = read_state()
    state[key] = value
    write_state(state)
    self.respond_json(200, {"ok": True})

  def respond_json(self, status: int, payload: dict):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


def run():
  ensure_dirs()
  host = os.getenv("HOST", HOST)
  try:
    port = int(os.getenv("PORT", str(PORT)))
  except ValueError:
    port = PORT
  server = ThreadingHTTPServer((host, port), AppHandler)
  print(f"SmailAgent started at http://localhost:{port}")
  server.serve_forever()


if __name__ == "__main__":
  run()
