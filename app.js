(() => {
  "use strict";

  const STORAGE_KEYS = {
    events: "zara_calendar_events",
    adminHash: "zara_admin_hash",
    theme: "zara_theme",
  };

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const CATEGORY_LABELS = {
    birthday: "Cumpleaños",
    anniversary: "Aniversario",
    meeting: "Reunión",
    other: "Otra",
  };

  const today = new Date();

  const state = {
    events: loadEvents(),
    adminActive: false,
    currentMonth: today.getMonth() + 1,
    currentYear: today.getFullYear(),
    filters: { query: "", category: "all" },
    theme: localStorage.getItem(STORAGE_KEYS.theme) || "light",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.events);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidEvent);
    } catch {
      return [];
    }
  }

  function isValidEvent(e) {
    return e && typeof e.id === "string"
      && typeof e.name === "string"
      && Number.isInteger(e.month) && e.month >= 1 && e.month <= 12
      && Number.isInteger(e.day) && e.day >= 1 && e.day <= 31
      && ["birthday", "anniversary", "meeting", "other"].includes(e.category);
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(state.events));
  }

  function uid() {
    return "e_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  async function hashPassword(plain) {
    const enc = new TextEncoder().encode(plain);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function daysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function getEventsForDate(month, day, year) {
    return state.events.filter(e => {
      if (e.month !== month || e.day !== day) return false;
      if (e.recurring || !e.year) return true;
      return e.year === year;
    });
  }

  function matchesFilters(e) {
    if (state.filters.category !== "all" && e.category !== state.filters.category) return false;
    const q = state.filters.query.trim().toLowerCase();
    if (!q) return true;
    return (e.name && e.name.toLowerCase().includes(q))
      || (e.notes && e.notes.toLowerCase().includes(q));
  }

  /* -------------- Rendering -------------- */

  function renderCalendar() {
    const { currentMonth, currentYear } = state;
    $("#month-label").textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

    const grid = $("#calendar-grid");
    grid.innerHTML = "";

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    // Monday-first index (0 = Monday)
    const jsDay = firstDay.getDay(); // 0 = Sunday
    const leading = (jsDay + 6) % 7;
    const totalDays = daysInMonth(currentMonth, currentYear);

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonthDays = daysInMonth(prevMonth, prevYear);

    // Leading days from previous month
    for (let i = leading - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      grid.appendChild(buildDayCell(dayNum, prevMonth, prevYear, true));
    }

    // Current month
    for (let d = 1; d <= totalDays; d++) {
      grid.appendChild(buildDayCell(d, currentMonth, currentYear, false));
    }

    // Trailing days
    const cellsSoFar = leading + totalDays;
    const trailing = (7 - (cellsSoFar % 7)) % 7;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    for (let d = 1; d <= trailing; d++) {
      grid.appendChild(buildDayCell(d, nextMonth, nextYear, true));
    }
  }

  function buildDayCell(day, month, year, outside) {
    const cell = document.createElement("div");
    cell.className = "day-cell" + (outside ? " is-outside" : "");
    cell.setAttribute("role", "gridcell");

    if (
      !outside &&
      day === today.getDate() &&
      month === today.getMonth() + 1 &&
      year === today.getFullYear()
    ) {
      cell.classList.add("is-today");
    }

    const num = document.createElement("div");
    num.className = "day-number";
    num.textContent = day;
    cell.appendChild(num);

    if (!outside) {
      const events = getEventsForDate(month, day, year).filter(matchesFilters);
      if (events.length) {
        const preview = document.createElement("div");
        preview.className = "day-event-preview";
        preview.textContent = events[0].name + (events.length > 1 ? ` +${events.length - 1}` : "");
        cell.appendChild(preview);

        const markers = document.createElement("div");
        markers.className = "day-markers";
        const seen = new Set();
        events.forEach(e => {
          if (seen.has(e.category)) return;
          seen.add(e.category);
          const dot = document.createElement("span");
          dot.className = `day-marker m-${e.category}`;
          markers.appendChild(dot);
        });
        cell.appendChild(markers);
      }

      cell.addEventListener("click", () => openDayModal(month, day, year));
    }

    return cell;
  }

  function renderEventsPanel() {
    const list = $("#events-list");
    const empty = $("#events-empty");
    list.innerHTML = "";

    const { currentMonth, currentYear } = state;
    const monthEvents = [];
    for (let d = 1; d <= daysInMonth(currentMonth, currentYear); d++) {
      getEventsForDate(currentMonth, d, currentYear)
        .filter(matchesFilters)
        .forEach(e => monthEvents.push({ ...e, displayDay: d }));
    }
    monthEvents.sort((a, b) => a.displayDay - b.displayDay);

    $("#events-title").textContent = `Eventos de ${MONTH_NAMES[currentMonth - 1]}`;

    if (!monthEvents.length) {
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    monthEvents.forEach(e => {
      list.appendChild(buildEventItem(e));
    });
  }

  function buildEventItem(e) {
    const li = document.createElement("li");
    li.className = "event-item";
    li.tabIndex = 0;

    const dateBox = document.createElement("div");
    dateBox.className = "event-date";
    dateBox.innerHTML = `<span class="d">${e.day}</span><span class="m">${MONTH_SHORT[e.month - 1]}</span>`;
    li.appendChild(dateBox);

    const body = document.createElement("div");
    body.className = "event-body";

    const name = document.createElement("div");
    name.className = "event-name";
    name.textContent = e.name;
    body.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "event-meta";
    const cat = document.createElement("span");
    cat.className = `event-category c-${e.category}`;
    cat.textContent = CATEGORY_LABELS[e.category];
    meta.appendChild(cat);

    if (e.recurring) {
      const rec = document.createElement("span");
      rec.textContent = "Se repite cada año";
      meta.appendChild(rec);
    } else if (e.year) {
      const yr = document.createElement("span");
      yr.textContent = String(e.year);
      meta.appendChild(yr);
    }
    body.appendChild(meta);

    if (e.notes) {
      const notes = document.createElement("div");
      notes.className = "event-notes";
      notes.textContent = e.notes;
      body.appendChild(notes);
    }

    li.appendChild(body);

    const openEdit = () => {
      if (state.adminActive) openEventForm(e);
    };
    li.addEventListener("click", openEdit);
    li.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openEdit(); }
    });

    return li;
  }

  function renderAdminUI() {
    const btnAdd = $("#btn-add-event");
    const adminTools = $("#admin-tools");
    const btnAdminLabel = $("#btn-admin-label");
    if (state.adminActive) {
      btnAdd.classList.remove("hidden");
      adminTools.classList.remove("hidden");
      btnAdminLabel.textContent = "Admin activo";
    } else {
      btnAdd.classList.add("hidden");
      adminTools.classList.add("hidden");
      btnAdminLabel.textContent = "Admin";
    }
  }

  function renderAll() {
    renderCalendar();
    renderEventsPanel();
    renderAdminUI();
  }

  /* -------------- Theme -------------- */

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    $("#theme-icon").innerHTML = state.theme === "dark" ? "&#9728;" : "&#9790;"; // sun / moon
    $("#btn-theme").setAttribute("aria-label", state.theme === "dark" ? "Activar modo claro" : "Activar modo oscuro");
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    applyTheme();
  }

  /* -------------- Modals -------------- */

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("hidden");
    const firstInput = el.querySelector("input:not([type=hidden]), select, textarea, button");
    if (firstInput) setTimeout(() => firstInput.focus(), 30);
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("hidden");
  }

  function bindModalClose() {
    document.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-close-modal]");
      if (target) closeModal(target.getAttribute("data-close-modal"));
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        $$(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
      }
    });
  }

  /* -------------- Admin login -------------- */

  function openAdminLogin() {
    const hasPassword = !!localStorage.getItem(STORAGE_KEYS.adminHash);
    const intro = $("#admin-intro");
    const confirmWrap = $("#confirm-password-wrap");
    const submitBtn = $("#btn-admin-submit");
    const error = $("#admin-error");
    error.classList.add("hidden");
    error.textContent = "";
    $("#input-admin-password").value = "";
    $("#input-admin-password-confirm").value = "";

    if (state.adminActive) {
      if (confirm("Ya estás en modo admin. ¿Cerrar sesión?")) logoutAdmin();
      return;
    }

    if (!hasPassword) {
      intro.textContent = "Es la primera vez. Crea una contraseña de administrador. Guárdala bien: no se puede recuperar.";
      confirmWrap.classList.remove("hidden");
      $("#input-admin-password").autocomplete = "new-password";
      submitBtn.textContent = "Crear contraseña";
    } else {
      intro.textContent = "Introduce la contraseña de administrador.";
      confirmWrap.classList.add("hidden");
      $("#input-admin-password").autocomplete = "current-password";
      submitBtn.textContent = "Entrar";
    }
    openModal("modal-admin");
  }

  async function handleAdminSubmit(ev) {
    ev.preventDefault();
    const pwd = $("#input-admin-password").value;
    const pwdConfirm = $("#input-admin-password-confirm").value;
    const error = $("#admin-error");
    const hasPassword = !!localStorage.getItem(STORAGE_KEYS.adminHash);

    error.classList.add("hidden");

    if (pwd.length < 4) {
      error.textContent = "La contraseña debe tener al menos 4 caracteres.";
      error.classList.remove("hidden");
      return;
    }

    if (!hasPassword) {
      if (pwd !== pwdConfirm) {
        error.textContent = "Las contraseñas no coinciden.";
        error.classList.remove("hidden");
        return;
      }
      const hash = await hashPassword(pwd);
      localStorage.setItem(STORAGE_KEYS.adminHash, hash);
      state.adminActive = true;
      closeModal("modal-admin");
      renderAdminUI();
      return;
    }

    const storedHash = localStorage.getItem(STORAGE_KEYS.adminHash);
    const hash = await hashPassword(pwd);
    if (hash === storedHash) {
      state.adminActive = true;
      closeModal("modal-admin");
      renderAdminUI();
    } else {
      error.textContent = "Contraseña incorrecta.";
      error.classList.remove("hidden");
    }
  }

  function logoutAdmin() {
    state.adminActive = false;
    renderAdminUI();
  }

  /* -------------- Event form -------------- */

  function openEventForm(event) {
    if (!state.adminActive) return;
    const isEdit = !!event;
    $("#modal-event-title").textContent = isEdit ? "Editar fecha" : "Agregar fecha";
    $("#event-id").value = isEdit ? event.id : "";
    $("#event-name").value = isEdit ? event.name : "";
    $("#event-day").value = isEdit ? event.day : "";
    $("#event-month").value = isEdit ? event.month : (state.currentMonth);
    $("#event-year").value = isEdit && event.year ? event.year : "";
    $("#event-category").value = isEdit ? event.category : "birthday";
    $("#event-recurring").checked = isEdit ? !!event.recurring : true;
    $("#event-notes").value = isEdit ? (event.notes || "") : "";
    $("#event-error").classList.add("hidden");

    const deleteBtn = $("#btn-event-delete");
    if (isEdit) deleteBtn.classList.remove("hidden");
    else deleteBtn.classList.add("hidden");

    openModal("modal-event");
  }

  function handleEventSubmit(ev) {
    ev.preventDefault();
    const id = $("#event-id").value || uid();
    const name = $("#event-name").value.trim();
    const day = parseInt($("#event-day").value, 10);
    const month = parseInt($("#event-month").value, 10);
    const yearRaw = $("#event-year").value.trim();
    const year = yearRaw ? parseInt(yearRaw, 10) : null;
    const category = $("#event-category").value;
    const recurring = $("#event-recurring").checked;
    const notes = $("#event-notes").value.trim();

    const error = $("#event-error");
    error.classList.add("hidden");

    if (!name) {
      error.textContent = "El nombre es obligatorio.";
      error.classList.remove("hidden");
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month, year || 2024)) {
      error.textContent = "Día inválido para el mes seleccionado.";
      error.classList.remove("hidden");
      return;
    }

    const event = { id, name, day, month, year, category, recurring, notes };

    const idx = state.events.findIndex(e => e.id === id);
    if (idx >= 0) state.events[idx] = event;
    else state.events.push(event);

    saveEvents();
    closeModal("modal-event");
    renderAll();
  }

  function handleEventDelete() {
    const id = $("#event-id").value;
    if (!id) return;
    if (!confirm("¿Eliminar esta fecha?")) return;
    state.events = state.events.filter(e => e.id !== id);
    saveEvents();
    closeModal("modal-event");
    renderAll();
  }

  /* -------------- Day modal -------------- */

  let pendingDayContext = null;

  function openDayModal(month, day, year) {
    const events = getEventsForDate(month, day, year).filter(matchesFilters);
    $("#modal-day-title").textContent = `${day} de ${MONTH_NAMES[month - 1]}`;
    const list = $("#day-events-list");
    const empty = $("#day-events-empty");
    list.innerHTML = "";

    if (events.length) {
      empty.classList.add("hidden");
      events.forEach(e => list.appendChild(buildEventItem(e)));
    } else {
      empty.classList.remove("hidden");
    }

    const btnAdd = $("#btn-day-add");
    if (state.adminActive) {
      btnAdd.classList.remove("hidden");
      pendingDayContext = { month, day, year };
    } else {
      btnAdd.classList.add("hidden");
      pendingDayContext = null;
    }

    openModal("modal-day");
  }

  function handleDayAdd() {
    if (!state.adminActive || !pendingDayContext) return;
    const { month, day, year } = pendingDayContext;
    closeModal("modal-day");
    openEventForm(null);
    $("#event-day").value = day;
    $("#event-month").value = month;
    $("#event-year").value = year === state.currentYear ? "" : year;
  }

  /* -------------- Import / Export -------------- */

  function exportJSON() {
    const data = JSON.stringify(state.events, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario-grupo-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Formato inválido");
        const valid = parsed.filter(isValidEvent);
        if (!valid.length) { alert("No se encontraron fechas válidas."); return; }
        if (!confirm(`¿Importar ${valid.length} fecha(s)? Esto reemplaza las fechas actuales.`)) return;
        state.events = valid;
        saveEvents();
        renderAll();
      } catch (err) {
        alert("No se pudo leer el archivo JSON.");
      }
    };
    reader.readAsText(file);
  }

  /* -------------- Navigation -------------- */

  function goToMonth(delta) {
    let m = state.currentMonth + delta;
    let y = state.currentYear;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    state.currentMonth = m;
    state.currentYear = y;
    renderAll();
  }

  function goToToday() {
    state.currentMonth = today.getMonth() + 1;
    state.currentYear = today.getFullYear();
    renderAll();
  }

  /* -------------- Bootstrap -------------- */

  function bindEvents() {
    $("#btn-theme").addEventListener("click", toggleTheme);
    $("#btn-admin").addEventListener("click", openAdminLogin);
    $("#btn-prev").addEventListener("click", () => goToMonth(-1));
    $("#btn-next").addEventListener("click", () => goToMonth(1));
    $("#btn-today").addEventListener("click", goToToday);
    $("#btn-add-event").addEventListener("click", () => openEventForm(null));
    $("#btn-logout").addEventListener("click", logoutAdmin);
    $("#btn-export").addEventListener("click", exportJSON);
    $("#input-import").addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) importJSON(file);
      ev.target.value = "";
    });

    $("#form-admin").addEventListener("submit", handleAdminSubmit);
    $("#form-event").addEventListener("submit", handleEventSubmit);
    $("#btn-event-delete").addEventListener("click", handleEventDelete);
    $("#btn-day-add").addEventListener("click", handleDayAdd);

    $("#input-search").addEventListener("input", (ev) => {
      state.filters.query = ev.target.value || "";
      renderAll();
    });
    $("#select-category").addEventListener("change", (ev) => {
      state.filters.category = ev.target.value;
      renderAll();
    });

    bindModalClose();
  }

  function init() {
    applyTheme();
    bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
