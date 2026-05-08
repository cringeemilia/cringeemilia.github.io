const STORAGE_KEYS = {
  users: "party_users",
  orders: "party_orders",
  session: "party_session",
  telegram: "party_telegram",
  about: "party_about",
  portfolio: "party_portfolio",
  hero: "party_hero",
  animators: "party_animators",
  reviews: "party_reviews",
};

const DEFAULT_ANIMATORS = [
  { id: "spider", name: "Человек паук и Женщина паук", price: 7000, image: "./portfolio/animator-spider.jpg" },
  { id: "elsa", name: "Эльза и ее друзья", price: 6800, image: "./portfolio/animator-elsa.jpg" },
  { id: "batman", name: "Бетмен и Робин", price: 7200, image: "./portfolio/animator-batman.jpg" },
  { id: "winx", name: "Феи Винкс", price: 6500, image: "./portfolio/animator-winx.jpg" },
  { id: "dipper", name: "Диппер и Мейбл", price: 6900, image: "./portfolio/animator-dipper.jpg" },
];

const DEFAULT_PORTFOLIO_CATEGORIES = [
  { id: "birthday", title: "День рождения", cover: "./portfolio/1.jpg" },
  { id: "graduation", title: "Выпускной", cover: "./portfolio/2.jpg" },
  { id: "seasonal", title: "Календарные праздники", cover: "./portfolio/3.jpg" },
  { id: "corporate", title: "Корпоративы", cover: "./portfolio/4.jpg" },
];

const DEFAULT_PORTFOLIO_DETAIL_IMAGES = {
  birthday: ["./portfolio/1.jpg", "./portfolio/2.jpg", "./portfolio/3.jpg", "./portfolio/4.jpg", "./portfolio/5.jpg", "./portfolio/6.jpg"],
  graduation: ["./portfolio/2.jpg", "./portfolio/3.jpg", "./portfolio/4.jpg", "./portfolio/5.jpg", "./portfolio/6.jpg", "./portfolio/1.jpg"],
  seasonal: ["./portfolio/3.jpg", "./portfolio/4.jpg", "./portfolio/5.jpg", "./portfolio/6.jpg", "./portfolio/1.jpg", "./portfolio/2.jpg"],
  corporate: ["./portfolio/4.jpg", "./portfolio/5.jpg", "./portfolio/6.jpg", "./portfolio/1.jpg", "./portfolio/2.jpg", "./portfolio/3.jpg"],
};

const ADMIN_IMAGE_PATH_HINT = "Подсказка: для пути/URL загружайте фото в папку public/portfolio/ и указывайте, например, ./portfolio/photo.jpg.";

function isAdminUser() {
  const user = getCurrentUser();
  return Boolean(user && user.role === "admin");
}

function getPortfolioConfig() {
  const defaults = {
    categories: DEFAULT_PORTFOLIO_CATEGORIES,
    details: DEFAULT_PORTFOLIO_DETAIL_IMAGES,
  };
  return getJson(STORAGE_KEYS.portfolio, defaults);
}

function getAnimatorsConfig() {
  return getJson(STORAGE_KEYS.animators, DEFAULT_ANIMATORS);
}

function getJson(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function fileToCompressedDataUrl(file, maxWidth = 1200, quality = 0.72, maxBytes = 240000) {
  if (!file || !file.size) return null;
  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Keep original quality when file already fits expected storage budget.
  if (file.size <= maxBytes) {
    return originalDataUrl;
  }

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = originalDataUrl;
    });

    const scale = Math.min(1, maxWidth / image.width);
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    let currentQuality = quality;
    let dataUrl = canvas.toDataURL("image/jpeg", currentQuality);
    while (dataUrl.length > maxBytes && currentQuality > 0.7) {
      currentQuality -= 0.04;
      dataUrl = canvas.toDataURL("image/jpeg", currentQuality);
    }
    return dataUrl;
  } catch {
    // Fallback for unsupported image decoders in browser.
    return originalDataUrl;
  }
}

async function uploadImageFile(file) {
  if (!file || !file.size) return null;
  const payload = new FormData();
  payload.append("image", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: payload,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.path) {
    throw new Error(result?.error || `HTTP ${response.status}`);
  }
  return result.path;
}

async function resolveImageValue(file, options = {}) {
  if (!file || !file.size) return null;
  const { maxWidth = 1800, quality = 0.9, maxBytes = 380000 } = options;
  return fileToCompressedDataUrl(file, maxWidth, quality, maxBytes);
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

async function recompressDataUrl(dataUrl, maxWidth = 640, quality = 0.62, maxBytes = 110000) {
  if (!isDataUrl(dataUrl)) return dataUrl;
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });

    const scale = Math.min(1, maxWidth / image.width);
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    let currentQuality = quality;
    let out = canvas.toDataURL("image/jpeg", currentQuality);
    while (out.length > maxBytes && currentQuality > 0.3) {
      currentQuality -= 0.08;
      out = canvas.toDataURL("image/jpeg", currentQuality);
    }
    return out;
  } catch {
    return dataUrl;
  }
}

async function compressPortfolioPayload(payload) {
  const categories = [];
  for (const category of payload.categories || []) {
    categories.push({
      ...category,
      cover: await recompressDataUrl(category.cover),
    });
  }

  const details = {};
  for (const [key, list] of Object.entries(payload.details || {})) {
    const compressedList = [];
    for (const img of list || []) {
      compressedList.push(await recompressDataUrl(img));
    }
    details[key] = compressedList;
  }

  return { categories, details };
}

async function compressAnimatorsPayload(animators) {
  const compressed = [];
  for (const animator of animators || []) {
    compressed.push({
      ...animator,
      image: await recompressDataUrl(animator.image, 700, 0.66, 130000),
    });
  }
  return compressed;
}

function ensureAdminUser() {
  const users = getJson(STORAGE_KEYS.users, []);
  if (users.some((u) => u.role === "admin")) return;
  users.push({ id: crypto.randomUUID(), login: "admin", password: "admin123", role: "admin" });
  setJson(STORAGE_KEYS.users, users);
}

function getCurrentUser() {
  return getJson(STORAGE_KEYS.session, null);
}

function setStatus(form, text, type = "ok") {
  let status = form.querySelector(".status");
  if (!status) {
    status = document.createElement("p");
    status.className = "status";
    form.appendChild(status);
  }
  status.className = `status ${type}`;
  status.textContent = text;
}

function updateAdminLink() {
  const adminLink = document.getElementById("adminLink");
  if (!adminLink) return;
  const user = getCurrentUser();
  adminLink.style.display = user && user.role === "admin" ? "inline-block" : "none";
}

function openAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.remove("hidden");
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.add("hidden");
}

function showBookingContactModal() {
  let modal = document.getElementById("bookingContactModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "bookingContactModal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-booking-modal="true"></div>
      <div class="modal-panel card">
        <button class="modal-close" type="button" data-close-booking-modal="true">×</button>
        <h2>Бронирование оформлено</h2>
        <p class="section-text">Спасибо за оплату! В течение 10-15 минут администратор свяжется с вами для уточнения деталей.</p>
        <button class="btn" type="button" data-close-booking-modal="true">Понятно</button>
      </div>
    `;
    modal.addEventListener("click", (e) => {
      if (e.target?.dataset?.closeBookingModal === "true") {
        modal.classList.add("hidden");
      }
    });
    document.body.appendChild(modal);
  }
  modal.classList.remove("hidden");
}

function initAuthModal() {
  const modal = document.getElementById("authModal");
  const openBtn = document.getElementById("openAuthBtn");
  const closeBtn = document.getElementById("closeAuthBtn");
  const registerForm = document.getElementById("registerForm");
  const loginForm = document.getElementById("loginForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const sessionInfo = document.getElementById("sessionInfo");
  if (!modal || !openBtn || !closeBtn || !registerForm || !loginForm || !logoutBtn || !sessionInfo) return;

  const refreshSessionLabel = () => {
    const user = getCurrentUser();
    sessionInfo.textContent = user ? `Вы вошли как: ${user.login} (${user.role})` : "Вы не авторизованы.";
    updateAdminLink();
  };

  openBtn.addEventListener("click", openAuthModal);
  closeBtn.addEventListener("click", closeAuthModal);
  modal.addEventListener("click", (e) => {
    if (e.target.dataset.closeModal === "true") closeAuthModal();
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(registerForm);
    const login = data.get("login").trim();
    const password = data.get("password").trim();
    const users = getJson(STORAGE_KEYS.users, []);
    if (users.some((u) => u.login === login)) {
      setStatus(registerForm, "Логин уже занят.", "error");
      return;
    }
    users.push({ id: crypto.randomUUID(), login, password, role: "client" });
    setJson(STORAGE_KEYS.users, users);
    setStatus(registerForm, "Регистрация успешна.", "ok");
    registerForm.reset();
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(loginForm);
    const login = data.get("login").trim();
    const password = data.get("password").trim();
    const user = getJson(STORAGE_KEYS.users, []).find((u) => u.login === login && u.password === password);
    if (!user) {
      setStatus(loginForm, "Неверный логин или пароль.", "error");
      return;
    }
    setJson(STORAGE_KEYS.session, { id: user.id, login: user.login, role: user.role });
    setStatus(loginForm, "Вход выполнен.", "ok");
    refreshSessionLabel();
    closeAuthModal();
    window.location.reload();
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.session);
    setStatus(loginForm, "Вы вышли из аккаунта.", "ok");
    refreshSessionLabel();
    window.location.reload();
  });

  refreshSessionLabel();
  if (!getCurrentUser() && location.pathname.endsWith("/index.html")) {
    openAuthModal();
  }
}

function renderPortfolio() {
  const grid = document.getElementById("portfolioGrid");
  if (!grid) return;
  const cfg = getPortfolioConfig();
  grid.innerHTML = "";
  cfg.categories.forEach((category) => {
    const item = document.createElement("div");
    item.className = "portfolio-card card";
    const imgWrap = document.createElement("div");
    imgWrap.className = "portfolio-item category-card";
    const img = document.createElement("img");
    img.src = category.cover || "./portfolio/1.jpg";
    img.alt = category.title || "Праздник";
    img.onerror = () => {
      imgWrap.innerHTML = `<div class="placeholder">Фото не найдено: ${category.cover}</div>`;
    };
    const meta = document.createElement("div");
    meta.className = "portfolio-meta";
    meta.innerHTML = `
      <h3>${category.title || "Категория"}</h3>
      <a class="btn" href="./portfolio-detail.html?type=${category.id}">Подробнее</a>
    `;
    imgWrap.appendChild(img);
    item.appendChild(imgWrap);
    item.appendChild(meta);
    grid.appendChild(item);
  });
}

function renderPortfolioDetails() {
  const titleNode = document.getElementById("portfolioDetailTitle");
  const grid = document.getElementById("portfolioDetailGrid");
  if (!titleNode || !grid) return;

  const cfg = getPortfolioConfig();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "birthday";
  const category = cfg.categories.find((c) => c.id === type) || cfg.categories[0];
  const images = cfg.details[category.id] || [];
  titleNode.textContent = category.title;

  grid.innerHTML = "";
  images.forEach((path, index) => {
    const item = document.createElement("div");
    item.className = "portfolio-item";
    const img = document.createElement("img");
    img.src = path;
    img.alt = `${category.title} ${index + 1}`;
    img.onerror = () => {
      item.innerHTML = `<div class="placeholder">Фото не найдено: ${path}</div>`;
    };
    item.appendChild(img);
    grid.appendChild(item);
  });
}

function initPortfolioAdminEditor() {
  const wrap = document.getElementById("portfolioAdminEditor");
  if (!wrap) return;
  if (!isAdminUser()) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  const cfg = getPortfolioConfig();
  wrap.innerHTML = `
    <h3>Редактор карточек портфолио (админ)</h3>
    <form id="portfolioAdminForm" class="form-grid">
      ${cfg.categories
        .map(
          (c, i) => `
            <label>Название карточки ${i + 1}
              <input name="title_${c.id}" value="${c.title}">
            </label>
            <label>Фото карточки ${i + 1} (путь/URL)
              <input name="cover_${c.id}" value="${c.cover}">
              <p class="small">${ADMIN_IMAGE_PATH_HINT}</p>
            </label>
            <label>Фото карточки ${i + 1} (выбрать файл)
              <input type="file" name="coverFile_${c.id}" accept="image/*">
              <p class="small">${ADMIN_IMAGE_PATH_HINT}</p>
            </label>
          `
        )
        .join("")}
      <button class="btn" type="submit">Сохранить портфолио</button>
    </form>
    <p id="portfolioAdminStatus" class="small"></p>
  `;

  document.getElementById("portfolioAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const status = document.getElementById("portfolioAdminStatus");
    if (status) status.textContent = "Сохраняем...";

    const updated = [];
    for (const c of cfg.categories) {
      const file = fd.get(`coverFile_${c.id}`);
      const uploadedPath = await resolveImageValue(file && file.size ? file : null, {
        maxWidth: 1800,
        quality: 0.9,
        maxBytes: 380000,
      });
      updated.push({
        ...c,
        title: (fd.get(`title_${c.id}`) || c.title).toString().trim() || c.title,
        cover: uploadedPath || (fd.get(`cover_${c.id}`) || c.cover).toString().trim() || c.cover,
      });
    }

    try {
      const compressed = await compressPortfolioPayload({ ...cfg, categories: updated });
      setJson(STORAGE_KEYS.portfolio, compressed);
      if (status) status.textContent = "Карточки портфолио сохранены.";
      renderPortfolio();
      initPortfolioAdminEditor();
    } catch {
      if (status) status.textContent = "Не удалось сохранить: изображения слишком большие. Попробуйте файлы поменьше.";
    }
  });
}

function initPortfolioDetailAdminEditor() {
  const wrap = document.getElementById("portfolioDetailAdminEditor");
  if (!wrap) return;
  if (!isAdminUser()) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";

  const cfg = getPortfolioConfig();
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "birthday";
  const category = cfg.categories.find((c) => c.id === type) || cfg.categories[0];
  const images = cfg.details[category.id] || [];

  wrap.innerHTML = `
    <h3>Редактор раздела "${category.title}" (админ)</h3>
    <form id="portfolioDetailAdminForm" class="form-grid">
      <label>Заголовок раздела
        <input name="detailTitle" value="${category.title}">
      </label>
      ${Array.from({ length: 6 })
        .map(
          (_, idx) => `
            <label>Фото ${idx + 1} (путь/URL)
              <input name="detailImage_${idx}" value="${images[idx] || ""}">
              <p class="small">${ADMIN_IMAGE_PATH_HINT}</p>
            </label>
            <label>Фото ${idx + 1} (выбрать файл)
              <input type="file" name="detailImageFile_${idx}" accept="image/*">
              <p class="small">${ADMIN_IMAGE_PATH_HINT}</p>
            </label>
          `
        )
        .join("")}
      <button class="btn" type="submit">Сохранить раздел</button>
    </form>
    <p id="portfolioDetailStatus" class="small"></p>
  `;

  document.getElementById("portfolioDetailAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const status = document.getElementById("portfolioDetailStatus");
    if (status) status.textContent = "Сохраняем...";
    const title = (fd.get("detailTitle") || category.title).toString().trim() || category.title;

    const newImages = [];
    for (let i = 0; i < 6; i += 1) {
      const file = fd.get(`detailImageFile_${i}`);
      const uploadedPath = await resolveImageValue(file && file.size ? file : null, {
        maxWidth: 1800,
        quality: 0.9,
        maxBytes: 380000,
      });
      const textValue = (fd.get(`detailImage_${i}`) || "").toString().trim();
      newImages.push(uploadedPath || textValue || images[i] || "./portfolio/1.jpg");
    }

    const newCategories = cfg.categories.map((c) => (c.id === category.id ? { ...c, title } : c));
    const newDetails = { ...cfg.details, [category.id]: newImages };
    try {
      const compressed = await compressPortfolioPayload({ categories: newCategories, details: newDetails });
      setJson(STORAGE_KEYS.portfolio, compressed);
      if (status) status.textContent = "Раздел успешно сохранен.";
      renderPortfolioDetails();
      initPortfolioDetailAdminEditor();
    } catch {
      if (status) status.textContent = "Не удалось сохранить: изображения слишком большие. Попробуйте файлы поменьше.";
    }
  });
}

function initAboutSection() {
  const aboutForm = document.getElementById("aboutForm");
  const textInput = document.getElementById("aboutTextInput");
  const imageFileInput = document.getElementById("aboutImageFileInput");
  const imageSecondFileInput = document.getElementById("aboutImageSecondFileInput");
  const textPreview = document.getElementById("aboutTextPreview");
  const imagePreview = document.getElementById("aboutImagePreview");
  const imagePreviewSecond = document.getElementById("aboutImagePreviewSecond");
  const aboutView = document.getElementById("aboutView");
  if (!aboutForm || !textInput || !imageFileInput || !imageSecondFileInput || !textPreview || !imagePreview || !imagePreviewSecond || !aboutView) return;

  const defaults = {
    text: "Мы создаем по-настоящему волшебные торжества под ключ: придумываем идеи, собираем сильную команду аниматоров и превращаем каждый праздник в яркую историю для детей и родителей.",
    image: "./portfolio/about.jpg",
    imageSecond: "./portfolio/2.jpg",
  };
  let saved = getJson(STORAGE_KEYS.about, defaults);
  const isAdmin = isAdminUser();
  textInput.value = saved.text;
  textPreview.textContent = saved.text;
  imagePreview.src = saved.image;
  imagePreviewSecond.src = saved.imageSecond || defaults.imageSecond;
  aboutForm.style.display = isAdmin ? "grid" : "none";
  aboutView.classList.toggle("card", !isAdmin);
  if (isAdmin) {
    const primaryLabel = imageFileInput.closest("label");
    const secondLabel = imageSecondFileInput.closest("label");
    if (primaryLabel && !primaryLabel.querySelector(".admin-photo-hint")) {
      primaryLabel.insertAdjacentHTML("beforeend", `<p class="small admin-photo-hint">${ADMIN_IMAGE_PATH_HINT}</p>`);
    }
    if (secondLabel && !secondLabel.querySelector(".admin-photo-hint")) {
      secondLabel.insertAdjacentHTML("beforeend", `<p class="small admin-photo-hint">${ADMIN_IMAGE_PATH_HINT}</p>`);
    }
  }

  aboutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdminUser()) return;
    const saveAll = (primaryImage, secondImage) => {
      const value = {
        text: textInput.value.trim() || defaults.text,
        image: primaryImage || saved.image || defaults.image,
        imageSecond: secondImage || saved.imageSecond || defaults.imageSecond,
      };
      setJson(STORAGE_KEYS.about, value);
      saved = value;
      textPreview.textContent = value.text;
      imagePreview.src = value.image;
      imagePreviewSecond.src = value.imageSecond;
      imageFileInput.value = "";
      imageSecondFileInput.value = "";
    };

    const primaryFile = imageFileInput.files?.[0];
    const secondFile = imageSecondFileInput.files?.[0];

    if (!primaryFile && !secondFile) {
      saveAll(saved.image || defaults.image, saved.imageSecond || defaults.imageSecond);
      return;
    }
    try {
      const primaryUploaded = await resolveImageValue(primaryFile || null, { maxWidth: 1800, quality: 0.9, maxBytes: 380000 });
      const secondUploaded = await resolveImageValue(secondFile || null, { maxWidth: 1800, quality: 0.9, maxBytes: 380000 });
      saveAll(
        primaryUploaded || saved.image || defaults.image,
        secondUploaded || saved.imageSecond || defaults.imageSecond
      );
      setStatus(aboutForm, "Фото сохранены. Если сервер доступен — в папку, иначе локально в браузере.", "ok");
    } catch {
      setStatus(aboutForm, "Не удалось сохранить фото. Выберите файл меньшего размера.", "error");
    }
  });
}

function initAboutSectionAnimation() {
  const aboutSection = document.querySelector(".about-section");
  if (!aboutSection) return;
  const aboutView = aboutSection.querySelector(".about-view");
  const aboutCollage = aboutSection.querySelector(".about-collage");
  if (!aboutView || !aboutCollage) return;

  aboutView.classList.add("about-slide-left");
  aboutCollage.classList.add("about-slide-right");

  const reveal = () => aboutSection.classList.add("about-in-view");
  if (typeof IntersectionObserver === "undefined") {
    reveal();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          reveal();
          observer.disconnect();
        }
      });
    },
    { threshold: 0.25 }
  );

  observer.observe(aboutSection);
}

function initHeroSection() {
  const heroSection = document.getElementById("heroSection");
  const heroTitle = document.getElementById("heroTitle");
  const heroSubtitle = document.getElementById("heroSubtitle");
  const heroAdminSection = document.getElementById("heroAdminSection");
  const heroForm = document.getElementById("heroForm");
  const heroTitleInput = document.getElementById("heroTitleInput");
  const heroSubtitleInput = document.getElementById("heroSubtitleInput");
  const heroImageFileInput = document.getElementById("heroImageFileInput");
  if (!heroSection || !heroTitle || !heroSubtitle || !heroAdminSection || !heroForm || !heroTitleInput || !heroSubtitleInput || !heroImageFileInput) return;

  const defaults = {
    title: "SmailAgent",
    subtitle: "Праздничное агентство для самых ярких детских событий",
    image: "./portfolio/hero.jpg",
  };
  const heroCloudBackground = "./portfolio/hero-clouds-reference-2.png";
  let saved = getJson(STORAGE_KEYS.hero, defaults);

  const applyHero = (data) => {
    heroTitle.textContent = data.title || defaults.title;
    heroSubtitle.textContent = data.subtitle || defaults.subtitle;
    heroSection.style.backgroundImage = `url("${heroCloudBackground}")`;
  };

  applyHero(saved);

  const isAdmin = isAdminUser();
  heroAdminSection.style.display = isAdmin ? "block" : "none";
  heroTitleInput.value = saved.title || defaults.title;
  heroSubtitleInput.value = saved.subtitle || defaults.subtitle;
  if (isAdmin) {
    const heroImageLabel = heroImageFileInput.closest("label");
    if (heroImageLabel && !heroImageLabel.querySelector(".admin-photo-hint")) {
      heroImageLabel.insertAdjacentHTML("beforeend", `<p class="small admin-photo-hint">${ADMIN_IMAGE_PATH_HINT}</p>`);
    }
  }

  heroForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdminUser()) return;

    const save = (imageValue) => {
      const value = {
        title: heroTitleInput.value.trim() || defaults.title,
        subtitle: heroSubtitleInput.value.trim() || defaults.subtitle,
        image: imageValue || saved.image || defaults.image,
      };
      setJson(STORAGE_KEYS.hero, value);
      saved = value;
      applyHero(value);
      heroImageFileInput.value = "";
    };

    const file = heroImageFileInput.files?.[0];
    if (!file) {
      save(saved.image || defaults.image);
      return;
    }
    try {
      const uploadedPath = await resolveImageValue(file, { maxWidth: 2200, quality: 0.92, maxBytes: 520000 });
      save(uploadedPath || saved.image || defaults.image);
      setStatus(heroForm, "Фото сохранено. Если сервер доступен — в папку, иначе локально в браузере.", "ok");
    } catch {
      setStatus(heroForm, "Не удалось сохранить фото. Выберите файл меньшего размера.", "error");
    }
  });
}

function renderAnimatorOptions() {
  const box = document.getElementById("animators");
  if (!box) return;
  const animators = getAnimatorsConfig();
  box.innerHTML = "";
  animators.forEach((a) => {
    const card = document.createElement("article");
    card.className = "animator-card";
    card.innerHTML = `
      <div class="animator-image-wrap">
        <img src="${a.image}" alt="${a.name}">
      </div>
      <h4>${a.name}</h4>
      <p>${a.price} ₽</p>
      <button class="btn animator-select-btn" type="button">Выбрать</button>
      <input class="animator-checkbox" type="checkbox" value="${a.id}" hidden>
    `;

    const image = card.querySelector("img");
    image.onerror = () => {
      image.parentElement.innerHTML = `<div class="placeholder">Нет фото</div>`;
    };

    const checkbox = card.querySelector(".animator-checkbox");
    const button = card.querySelector(".animator-select-btn");
    button.addEventListener("click", () => {
      checkbox.checked = !checkbox.checked;
      card.classList.toggle("selected", checkbox.checked);
      button.textContent = checkbox.checked ? "Выбрано" : "Выбрать";
    });
    box.appendChild(card);
  });

  initAnimatorImageEditor(animators);
}

function initAnimatorImageEditor(animators) {
  const host = document.getElementById("animatorEditor");
  if (!host) return;
  if (!isAdminUser()) {
    host.style.display = "none";
    host.innerHTML = "";
    return;
  }
  host.style.display = "block";
  host.innerHTML = `
    <h4>Редактирование фото аниматоров</h4>
    <div id="animatorImageForm" class="form-grid">
      ${animators
        .map(
          (a) => `
            <label>${a.name}
              <input type="file" name="file_${a.id}" accept="image/*">
              <p class="small">${ADMIN_IMAGE_PATH_HINT}</p>
            </label>
          `
        )
        .join("")}
      <button id="animatorImageSaveBtn" class="btn" type="button">Сохранить фото аниматоров</button>
    </div>
    <p id="animatorEditorStatus" class="small"></p>
  `;

  document.getElementById("animatorImageSaveBtn").addEventListener("click", async () => {
    if (!isAdminUser()) return;
    const formContainer = document.getElementById("animatorImageForm");
    if (!formContainer) return;
    const fd = new FormData();
    formContainer.querySelectorAll("input[type='file'][name]").forEach((input) => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      if (file) {
        fd.append(input.name, file);
      } else {
        fd.append(input.name, new Blob([]), "");
      }
    });
    const status = document.getElementById("animatorEditorStatus");
    if (status) status.textContent = "Сохраняем...";

    const updated = [];
    for (const animator of animators) {
      const file = fd.get(`file_${animator.id}`);
      const uploadedPath = await resolveImageValue(file && file.size ? file : null, {
        maxWidth: 1800,
        quality: 0.9,
        maxBytes: 380000,
      });
      updated.push({
        ...animator,
        image: uploadedPath || animator.image,
      });
    }

    try {
      const compressedPayload = await compressAnimatorsPayload(updated);
      setJson(STORAGE_KEYS.animators, compressedPayload);
      if (status) status.textContent = "Фото аниматоров сохранены.";
      renderAnimatorOptions();
    } catch {
      if (status) status.textContent = "Не удалось сохранить: фото слишком большие. Выберите файлы меньшего размера.";
    }
  });
}

function getSelectedAnimators() {
  const ids = Array.from(document.querySelectorAll("#animators input:checked")).map((el) => el.value);
  return getAnimatorsConfig().filter((a) => ids.includes(a.id));
}

function recalcPrice() {
  const priceNode = document.getElementById("totalPrice");
  if (!priceNode) return 0;
  const total = getSelectedAnimators().reduce((sum, a) => sum + a.price, 0);
  priceNode.textContent = `${total} ₽`;
  return total;
}

async function sendTelegramNotification(order) {
  const cfg = getJson(STORAGE_KEYS.telegram, { botToken: "", chatId: "" });
  if (!cfg.botToken || !cfg.chatId) {
    return { ok: false, error: "Не задан Bot Token или Chat ID в админке." };
  }
  const text = [
    "Новая заявка на праздник",
    `Клиент: ${order.fullName}`,
    `Телефон: ${order.phone}`,
    `Дата: ${order.date} ${order.time}`,
    `Адрес: ${order.address}`,
    `Аниматоры: ${order.animators.map((a) => a.name).join(", ") || "не выбраны"}`,
    `Сумма: ${order.totalPrice} ₽`,
  ].join("\n");
  try {
    const response = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return { ok: false, error: payload?.description || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сетевая ошибка или блокировка браузером запроса к Telegram API." };
  }
}

function isSlotBusy(date, time) {
  return getJson(STORAGE_KEYS.orders, []).some((o) => o.date === date && o.time === time);
}

function initConstructor() {
  const form = document.getElementById("constructorForm");
  const animatorsBox = document.getElementById("animators");
  if (!form || !animatorsBox) return;
  animatorsBox.addEventListener("change", recalcPrice);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user || user.role !== "client") {
      setStatus(form, "Для оформления войдите как клиент через кнопку Авторизация.", "error");
      return;
    }
    const data = new FormData(form);
    const date = data.get("date");
    const time = data.get("time");
    if (isSlotBusy(date, time)) {
      setStatus(form, "Это время уже занято. Выберите другой слот.", "error");
      return;
    }
    const order = {
      id: crypto.randomUUID(),
      userId: user.id,
      userLogin: user.login,
      fullName: data.get("fullName").trim(),
      phone: data.get("phone").trim(),
      date,
      time,
      address: data.get("address").trim(),
      comment: data.get("comment").trim(),
      animators: getSelectedAnimators(),
      animatorPhotoName: data.get("animatorPhoto")?.name || "",
      totalPrice: recalcPrice(),
      paymentMethod: data.get("paymentMock"),
      paymentStatus: "Оплачено (демо)",
      status: "Новая",
      createdAt: new Date().toISOString(),
    };
    const orders = getJson(STORAGE_KEYS.orders, []);
    orders.push(order);
    setJson(STORAGE_KEYS.orders, orders);
    const telegramResult = await sendTelegramNotification(order);
    if (telegramResult.ok) {
      setStatus(form, "Заявка создана и отправлена. Уведомление в Telegram доставлено.", "ok");
    } else {
      setStatus(form, `Заявка создана, но Telegram не отправлен: ${telegramResult.error}`, "error");
    }
    showBookingContactModal();
    form.reset();
    recalcPrice();
  });
}

function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl || typeof FullCalendar === "undefined") return;
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "ru",
    height: 420,
    events(fetchInfo, successCallback) {
      const events = getJson(STORAGE_KEYS.orders, []).map((o) => ({
        id: o.id,
        title: `${o.time} • занято`,
        start: `${o.date}T${o.time}`,
        color: "#5e9cd2",
      }));
      successCallback(events);
    },
  });
  calendar.render();
}

function renderReviewsList(items) {
  const list = document.getElementById("reviewsList");
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="card"><p class="section-text">Отзывов пока нет.</p></div>`;
    return;
  }
  list.innerHTML = items
    .slice()
    .reverse()
    .map((review) => {
      const safeAuthor = review.author || "Клиент";
      const rating = Number(review.rating) || 5;
      const stars = "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
      return `
        <article class="card">
          <p><strong>${safeAuthor}</strong></p>
          <p>${stars}</p>
          <p class="section-text">${review.text || ""}</p>
        </article>
      `;
    })
    .join("");
}

function initReviewsPage() {
  const form = document.getElementById("reviewsForm");
  const list = document.getElementById("reviewsList");
  if (!form || !list) return;

  const reviews = getJson(STORAGE_KEYS.reviews, []);
  renderReviewsList(reviews);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user || user.role !== "client") {
      setStatus(form, "Оставить отзыв может только авторизованный клиент.", "error");
      return;
    }

    const data = new FormData(form);
    const author = data.get("author").toString().trim();
    const text = data.get("text").toString().trim();
    const rating = data.get("rating").toString().trim();
    if (!author || !text || !rating) {
      setStatus(form, "Заполните все поля отзыва.", "error");
      return;
    }

    const updated = getJson(STORAGE_KEYS.reviews, []);
    updated.push({
      id: crypto.randomUUID(),
      author,
      text,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      createdAt: new Date().toISOString(),
      userId: user.id,
    });
    setJson(STORAGE_KEYS.reviews, updated);
    renderReviewsList(updated);
    setStatus(form, "Спасибо! Ваш отзыв добавлен.", "ok");
    form.reset();
  });
}

function initDemoTelegramDefaults() {
  if (!getJson(STORAGE_KEYS.telegram, null)) {
    setJson(STORAGE_KEYS.telegram, { botToken: "", chatId: "" });
  }
}

function main() {
  ensureAdminUser();
  initDemoTelegramDefaults();
  initAuthModal();
  initHeroSection();
  initAboutSection();
  initAboutSectionAnimation();
  renderPortfolio();
  renderPortfolioDetails();
  initPortfolioAdminEditor();
  initPortfolioDetailAdminEditor();
  renderAnimatorOptions();
  initCalendar();
  initConstructor();
  initReviewsPage();
}

main();
