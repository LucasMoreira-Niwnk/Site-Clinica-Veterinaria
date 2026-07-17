const surgeonName = "Luiz Wagner Krieger Amorim";

let state = {
  users: [],
  clients: [],
  pets: [],
  appointments: [],
  updatedAt: null
};
let agendaFilter = "ativos";
let selectedAgendaDate = getOffsetDate(0);

const els = {
  userForm: document.querySelector("#userForm"),
  clientForm: document.querySelector("#clientForm"),
  petForm: document.querySelector("#petForm"),
  appointmentForm: document.querySelector("#appointmentForm"),
  logoutButton: document.querySelector("#logoutButton"),
  petOwner: document.querySelector("#petOwner"),
  appointmentPet: document.querySelector("#appointmentPet"),
  agendaDate: document.querySelector("#agendaDate"),
  appointmentsList: document.querySelector("#appointmentsList"),
  directoryList: document.querySelector("#directoryList"),
  usersList: document.querySelector("#usersList"),
  toast: document.querySelector("#toast"),
  totals: {
    clients: document.querySelector("#totalClientes"),
    pets: document.querySelector("#totalPets"),
    active: document.querySelector("#totalAgendados"),
    canceled: document.querySelector("#totalCancelados")
  }
};

document.querySelector("#appointmentDate").value = selectedAgendaDate;
document.querySelector("#appointmentTime").value = "10:00";
els.agendaDate.value = selectedAgendaDate;

document.querySelector("#appointmentType").addEventListener("change", (event) => {
  const professionalInput = document.querySelector("#appointmentProfessional");

  if (event.target.value === "Cirurgia") {
    professionalInput.value = surgeonName;
  }
});

els.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = {
    id: crypto.randomUUID(),
    username: valueOf("#newUsername"),
    password: valueOf("#newUserPassword")
  };

  await saveRecord("users", user);
  els.userForm.reset();
  await reloadAfterMutation();
  showToast("Usuário criado. MFA será configurado no primeiro login.");
});

els.clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const client = {
    id: crypto.randomUUID(),
    name: valueOf("#clientName"),
    phone: valueOf("#clientPhone"),
    email: valueOf("#clientEmail"),
    address: valueOf("#clientAddress")
  };

  await saveRecord("clients", client);
  els.clientForm.reset();
  await reloadAfterMutation();
  showToast("Cliente cadastrado com sucesso.");
});

els.petForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const pet = {
    id: crypto.randomUUID(),
    ownerId: valueOf("#petOwner"),
    name: valueOf("#petName"),
    species: valueOf("#petSpecies"),
    breed: valueOf("#petBreed"),
    age: valueOf("#petAge"),
    notes: valueOf("#petNotes")
  };

  await saveRecord("pets", pet);
  els.petForm.reset();
  await reloadAfterMutation();
  showToast("Pet vinculado ao tutor.");
});

els.appointmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const appointment = {
    id: crypto.randomUUID(),
    petId: valueOf("#appointmentPet"),
    type: valueOf("#appointmentType"),
    date: valueOf("#appointmentDate"),
    time: valueOf("#appointmentTime"),
    professional: valueOf("#appointmentProfessional") || defaultProfessional(valueOf("#appointmentType")),
    notes: valueOf("#appointmentNotes"),
    status: "agendado"
  };

  await saveRecord("appointments", appointment);
  els.appointmentForm.reset();
  selectedAgendaDate = appointment.date;
  els.agendaDate.value = selectedAgendaDate;
  document.querySelector("#appointmentDate").value = selectedAgendaDate;
  document.querySelector("#appointmentTime").value = "10:00";
  await reloadAfterMutation();
  showToast("Atendimento marcado na agenda.");
});

els.agendaDate.addEventListener("change", () => {
  selectedAgendaDate = els.agendaDate.value || getOffsetDate(0);
  renderAppointments();
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    agendaFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderAppointments();
  });
});

els.appointmentsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const appointment = state.appointments.find((item) => item.id === button.dataset.id);

  if (!appointment) return;

  if (button.dataset.action === "cancel") {
    await updateAppointmentStatus(appointment.id, "cancelado");
    await reloadAfterMutation();
    showToast("Agendamento desmarcado.");
  }

  if (button.dataset.action === "reactivate") {
    await updateAppointmentStatus(appointment.id, "agendado");
    await reloadAfterMutation();
    showToast("Agendamento remarcado como ativo.");
  }
});

els.logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
});

init();

async function init() {
  setFormsDisabled(true);

  try {
    await refreshState();
  } catch {
    render();
    showToast("Backend indisponivel. Verifique o servidor.");
  } finally {
    setFormsDisabled(false);
  }
}

async function refreshState() {
  const data = await apiRequest("/api/state");

  state = {
    users: Array.isArray(data.users) ? data.users : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
    pets: Array.isArray(data.pets) ? data.pets : [],
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    updatedAt: data.updatedAt || null
  };
  render();
}

async function reloadAfterMutation() {
  await refreshState();
}

async function saveRecord(resource, record) {
  await apiRequest(`/api/${resource}`, {
    method: "POST",
    body: JSON.stringify(record)
  });
}

async function updateAppointmentStatus(id, status) {
  await apiRequest(`/api/appointments/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Sessão expirada");
  }

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

function render() {
  renderSelects();
  renderAppointments();
  renderDirectory();
  renderUsers();
  renderTotals();
}

function renderSelects() {
  els.petOwner.innerHTML = state.clients.length
    ? state.clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("")
    : `<option value="">Cadastre um cliente primeiro</option>`;

  els.appointmentPet.innerHTML = state.pets.length
    ? state.pets.map((pet) => {
        const owner = findOwner(pet.ownerId);
        return `<option value="${pet.id}">${escapeHtml(pet.name)} - ${escapeHtml(owner?.name || "Sem tutor")}</option>`;
      }).join("")
    : `<option value="">Cadastre um pet primeiro</option>`;

  els.petOwner.disabled = !state.clients.length;
  els.appointmentPet.disabled = !state.pets.length;
  els.petForm.querySelector("button").disabled = !state.clients.length;
  els.appointmentForm.querySelector("button").disabled = !state.pets.length;
}

function renderAppointments() {
  const items = state.appointments
    .filter((appointment) => appointment.date === selectedAgendaDate)
    .filter((appointment) => agendaFilter === "todos" || appointment.status === "agendado")
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  if (!items.length) {
    els.appointmentsList.innerHTML = `<div class="empty">Nenhum atendimento em ${formatDate(selectedAgendaDate)} para este filtro.</div>`;
    return;
  }

  els.appointmentsList.innerHTML = items.map((appointment) => {
    const pet = findPet(appointment.petId);
    const owner = pet ? findOwner(pet.ownerId) : null;
    const serviceClass = appointment.type.split(" ")[0];

    return `
      <article class="appointment-card ${serviceClass} ${appointment.status}">
        <div class="card-top">
          <div>
            <h4 class="card-title">${escapeHtml(appointment.type)} - ${escapeHtml(pet?.name || "Pet removido")}</h4>
            <p class="card-meta">${formatDate(appointment.date)} as ${escapeHtml(appointment.time)} - ${escapeHtml(owner?.name || "Tutor nao encontrado")}</p>
            <p class="card-meta">${escapeHtml(appointment.professional || "Profissional a definir")}</p>
          </div>
          <span class="status ${appointment.status}">${appointment.status}</span>
        </div>
        ${appointment.notes ? `<p class="card-meta">${escapeHtml(appointment.notes)}</p>` : ""}
        <div class="card-actions">
          ${
            appointment.status === "agendado"
              ? `<button class="danger-button" type="button" data-action="cancel" data-id="${appointment.id}">Desmarcar</button>`
              : `<button class="ghost-button" type="button" data-action="reactivate" data-id="${appointment.id}">Reativar</button>`
          }
        </div>
      </article>
    `;
  }).join("");
}

function renderDirectory() {
  if (!state.clients.length) {
    els.directoryList.innerHTML = `<div class="empty">Cadastre clientes para montar a lista de vinculos.</div>`;
    return;
  }

  els.directoryList.innerHTML = state.clients.map((client) => {
    const pets = state.pets.filter((pet) => pet.ownerId === client.id);

    return `
      <article class="client-card">
        <div>
          <h3 class="card-title">${escapeHtml(client.name)}</h3>
          <p class="card-meta">${escapeHtml(client.phone)}${client.email ? ` - ${escapeHtml(client.email)}` : ""}</p>
          ${client.address ? `<p class="card-meta">${escapeHtml(client.address)}</p>` : ""}
        </div>
        <div class="pet-chip-list">
          ${
            pets.length
              ? pets.map((pet) => renderPetHistory(pet)).join("")
              : `<span class="pet-line">Nenhum pet vinculado</span>`
          }
        </div>
      </article>
    `;
  }).join("");
}

function renderPetHistory(pet) {
  const history = state.appointments
    .filter((appointment) => appointment.petId === pet.id)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  return `
    <div class="pet-history">
      <div class="pet-history-head">
        <span class="pet-chip">${escapeHtml(pet.name)} - ${escapeHtml(pet.species)}</span>
        <span class="history-count">${history.length} atendimento${history.length === 1 ? "" : "s"}</span>
      </div>
      ${
        history.length
          ? `<ol class="history-list">
              ${history.slice(0, 5).map((appointment) => `
                <li>
                  <strong>${escapeHtml(appointment.type)}</strong>
                  <span>${formatDate(appointment.date)} as ${escapeHtml(appointment.time)} - ${escapeHtml(appointment.status)}</span>
                </li>
              `).join("")}
            </ol>`
          : `<p class="pet-line">Sem histórico de atendimentos.</p>`
      }
    </div>
  `;
}

function renderTotals() {
  els.totals.clients.textContent = state.clients.length;
  els.totals.pets.textContent = state.pets.length;
  els.totals.active.textContent = state.appointments.filter((item) => item.status === "agendado").length;
  els.totals.canceled.textContent = state.appointments.filter((item) => item.status === "cancelado").length;
}

function renderUsers() {
  if (!state.users.length) {
    els.usersList.innerHTML = `<div class="empty">Nenhum usuário cadastrado.</div>`;
    return;
  }

  els.usersList.innerHTML = state.users.map((user) => `
    <article class="user-card">
      <div>
        <h4 class="card-title">${escapeHtml(user.username)}</h4>
        <p class="card-meta">Criado em ${formatDateTime(user.createdAt)}</p>
      </div>
      <span class="status ${user.mfaEnabled ? "agendado" : "cancelado"}">${user.mfaEnabled ? "MFA ativo" : "MFA pendente"}</span>
    </article>
  `).join("");
}

function setFormsDisabled(disabled) {
  els.userForm.querySelector("button").disabled = disabled;
  els.clientForm.querySelector("button").disabled = disabled;
  els.petForm.querySelector("button").disabled = disabled;
  els.appointmentForm.querySelector("button").disabled = disabled;
}

function valueOf(selector) {
  return document.querySelector(selector).value.trim();
}

function findOwner(ownerId) {
  return state.clients.find((client) => client.id === ownerId);
}

function findPet(petId) {
  return state.pets.find((pet) => pet.id === petId);
}

function getOffsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultProfessional(type) {
  return type === "Cirurgia" ? surgeonName : "";
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}
