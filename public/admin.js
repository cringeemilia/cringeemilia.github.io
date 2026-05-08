const STORAGE_KEYS = {
  orders: "party_orders",
  session: "party_session",
  telegram: "party_telegram",
};

function getJson(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isAdmin() {
  const session = getJson(STORAGE_KEYS.session, null);
  return session && session.role === "admin";
}

function renderTelegramSettings() {
  const wrap = document.getElementById("adminGate");
  const cfg = getJson(STORAGE_KEYS.telegram, { botToken: "", chatId: "" });
  wrap.innerHTML = `
    <h3>Telegram уведомления</h3>
    <p class="small">Укажите данные бота, чтобы получать уведомления о новых заказах.</p>
    <form id="tgForm" class="form-grid">
      <label>Bot Token
        <input name="botToken" value="${cfg.botToken}" placeholder="12345:ABC..." />
      </label>
      <label>Chat ID
        <input name="chatId" value="${cfg.chatId}" placeholder="-1001234567890" />
      </label>
      <button class="btn" type="submit">Сохранить</button>
      <button id="tgTestBtn" class="btn btn-secondary" type="button">Проверить отправку</button>
    </form>
    <p id="tgStatus" class="small"></p>
  `;
  document.getElementById("tgForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setJson(STORAGE_KEYS.telegram, {
      botToken: fd.get("botToken").trim(),
      chatId: fd.get("chatId").trim(),
    });
    document.getElementById("tgStatus").textContent = "Данные Telegram сохранены.";
  });

  document.getElementById("tgTestBtn").addEventListener("click", async () => {
    const status = document.getElementById("tgStatus");
    const form = document.getElementById("tgForm");
    const fd = new FormData(form);
    const botToken = (fd.get("botToken") || "").toString().trim();
    const chatId = (fd.get("chatId") || "").toString().trim();
    if (!botToken || !chatId) {
      status.textContent = "Заполните Bot Token и Chat ID.";
      return;
    }
    status.textContent = "Проверяем отправку...";
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Тестовое уведомление SmailAgent: Telegram подключен.",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        status.textContent = `Ошибка Telegram: ${payload?.description || `HTTP ${response.status}`}`;
        return;
      }
      status.textContent = "Тест отправлен успешно. Проверьте чат Telegram.";
    } catch {
      status.textContent = "Сетевая ошибка: браузер не смог отправить запрос в Telegram API.";
    }
  });
}

function renderOrders() {
  const panel = document.getElementById("ordersWrap");
  const orders = getJson(STORAGE_KEYS.orders, []);
  if (!orders.length) {
    panel.innerHTML = "<p>Заказов пока нет.</p>";
    return;
  }

  panel.innerHTML = orders
    .map((o) => {
      const animators = o.animators.map((a) => a.name).join(", ") || "не выбраны";
      return `
        <article class="card" style="margin-bottom: 10px;">
          <p><strong>${o.fullName}</strong> (${o.phone})</p>
          <p>Дата: ${o.date} ${o.time}</p>
          <p>Адрес: ${o.address}</p>
          <p>Комментарий: ${o.comment || "-"}</p>
          <p>Аниматоры: ${animators}</p>
          <p>Оплата: ${o.paymentStatus}, ${o.totalPrice} ₽</p>
          <label>Статус заказа
            <select data-id="${o.id}">
              ${["Новая", "Подтверждена", "Выполнена", "Отменена"]
                .map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`)
                .join("")}
            </select>
          </label>
        </article>
      `;
    })
    .join("");

  panel.querySelectorAll("select[data-id]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.id;
      const ordersLocal = getJson(STORAGE_KEYS.orders, []);
      const order = ordersLocal.find((x) => x.id === id);
      if (order) {
        order.status = select.value;
        setJson(STORAGE_KEYS.orders, ordersLocal);
      }
    });
  });
}

function main() {
  if (!isAdmin()) {
    document.getElementById("adminGate").innerHTML =
      "<p>Доступ запрещен. Войдите на главной странице как admin.</p>";
    return;
  }
  renderTelegramSettings();
  document.getElementById("adminPanel").style.display = "block";
  renderOrders();
}

main();
