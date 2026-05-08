const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8080;
const publicDir = path.join(__dirname, "public");
const portfolioDir = path.join(publicDir, "portfolio");

if (!fs.existsSync(portfolioDir)) {
  fs.mkdirSync(portfolioDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, portfolioDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const baseName = path.basename(file.originalname || "image", ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeBase = baseName.slice(0, 40) || "image";
    cb(null, `${safeBase}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Можно загружать только изображения."));
  },
});

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Файл не получен." });
    return;
  }
  res.json({ path: `./portfolio/${req.file.filename}` });
});

app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Ошибка загрузки файла." });
});

app.listen(PORT, () => {
  console.log(`SmailAgent started at http://localhost:${PORT}`);
});
