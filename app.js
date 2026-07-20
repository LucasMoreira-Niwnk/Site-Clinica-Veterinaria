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
let calendarViewDate = parseLocalDate(selectedAgendaDate);
let patientSearchTerm = "";
let patientPage = 1;
let editingClientId = null;
let editingPetId = null;
let editingAppointmentId = null;
const pageNames = new Set(["dashboard", "agenda", "cadastros", "pacientes", "usuarios"]);
const petsPerPage = 15;
const serviceOptions = ["Banho e tosa", "Consulta", "Vacina", "Cirurgia"];
const appointmentHours = Array.from({ length: 14 }, (_, index) => String(index + 7).padStart(2, "0"));
const appointmentMinutes = ["00", "15", "30", "45"];

const els = {
  userForm: document.querySelector("#userForm"),
  clientForm: document.querySelector("#clientForm"),
  petForm: document.querySelector("#petForm"),
  appointmentForm: document.querySelector("#appointmentForm"),
  logoutButton: document.querySelector("#logoutButton"),
  pages: document.querySelectorAll("[data-page]"),
  navLinks: document.querySelectorAll("[data-nav]"),
  dashboardLinks: document.querySelectorAll("[data-open-page]"),
  petOwner: document.querySelector("#petOwner"),
  appointmentPet: document.querySelector("#appointmentPet"),
  agendaDate: document.querySelector("#agendaDate"),
  agendaDatePicker: document.querySelector("#agendaDatePicker"),
  agendaDateTrigger: document.querySelector("#agendaDateTrigger"),
  agendaDateText: document.querySelector("#agendaDateText"),
  agendaDatePopover: document.querySelector("#agendaDatePopover"),
  agendaCalendarMonth: document.querySelector("#agendaCalendarMonth"),
  agendaCalendarDays: document.querySelector("#agendaCalendarDays"),
  appointmentsList: document.querySelector("#appointmentsList"),
  petHistoryModal: document.querySelector("#petHistoryModal"),
  closePetHistory: document.querySelector("#closePetHistory"),
  petHistoryTitle: document.querySelector("#petHistoryTitle"),
  petHistorySubtitle: document.querySelector("#petHistorySubtitle"),
  petHistoryDetails: document.querySelector("#petHistoryDetails"),
  patientSearch: document.querySelector("#patientSearch"),
  patientCount: document.querySelector("#patientCount"),
  patientPagination: document.querySelector("#patientPagination"),
  directoryList: document.querySelector("#directoryList"),
  usersList: document.querySelector("#usersList"),
  toast: document.querySelector("#toast"),
  todayAppointments: document.querySelector("#todayAppointments"),
  petsWithHistory: document.querySelector("#petsWithHistory"),
  totals: {
    clients: document.querySelector("#totalClientes"),
    pets: document.querySelector("#totalPets"),
    active: document.querySelector("#totalAgendados"),
    canceled: document.querySelector("#totalCancelados")
  }
};

document.querySelector("#appointmentDate").value = selectedAgendaDate;
document.querySelector("#appointmentTime").value = "10:00";
document.querySelector("#appointmentProfessional").value = surgeonName;
els.agendaDate.value = selectedAgendaDate;
updateAgendaDateDisplay();
renderAgendaCalendar();
renderCustomPickers();

document.querySelector("#appointmentType").addEventListener("change", (event) => {
  const professionalInput = document.querySelector("#appointmentProfessional");

  professionalInput.value = surgeonName;
});

window.addEventListener("hashchange", () => {
  openPage(pageFromHash());
});

els.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const page = link.dataset.nav;

    if (!page) return;

    event.preventDefault();
    openPage(page, true);
  });
});

els.dashboardLinks.forEach((button) => {
  button.addEventListener("click", () => {
    openPage(button.dataset.openPage, true);
  });
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
    name: normalizeName(valueOf("#clientName")),
    phone: valueOf("#clientPhone"),
    email: valueOf("#clientEmail"),
    address: normalizeText(valueOf("#clientAddress"))
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
    name: normalizeName(valueOf("#petName")),
    species: valueOf("#petSpecies"),
    breed: normalizeName(valueOf("#petBreed")),
    age: valueOf("#petAge"),
    notes: normalizeText(valueOf("#petNotes"))
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
    professional: normalizeName(valueOf("#appointmentProfessional") || defaultProfessional(valueOf("#appointmentType"))),
    notes: normalizeText(valueOf("#appointmentNotes")),
    status: "agendado"
  };

  await saveRecord("appointments", appointment);
  els.appointmentForm.reset();
  selectedAgendaDate = appointment.date;
  els.agendaDate.value = selectedAgendaDate;
  calendarViewDate = parseLocalDate(selectedAgendaDate);
  updateAgendaDateDisplay();
  renderAgendaCalendar();
  document.querySelector("#appointmentDate").value = selectedAgendaDate;
  document.querySelector("#appointmentTime").value = "10:00";
  document.querySelector("#appointmentProfessional").value = surgeonName;
  await reloadAfterMutation();
  showToast("Atendimento marcado na agenda.");
});

els.agendaDate.addEventListener("change", () => {
  selectedAgendaDate = els.agendaDate.value || getOffsetDate(0);
  calendarViewDate = parseLocalDate(selectedAgendaDate);
  updateAgendaDateDisplay();
  renderAgendaCalendar();
  renderAppointments();
});

els.agendaDateTrigger.addEventListener("click", () => {
  toggleAgendaCalendar(els.agendaDatePopover.hidden);
});

els.agendaDatePopover.addEventListener("click", (event) => {
  const navButton = event.target.closest("[data-calendar-nav]");
  const dayButton = event.target.closest("[data-date-value]");

  if (navButton) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + (navButton.dataset.calendarNav === "next" ? 1 : -1));
    renderAgendaCalendar();
  }

  if (dayButton) {
    selectAgendaDate(dayButton.dataset.dateValue);
  }
});

document.addEventListener("click", (event) => {
  if (!els.agendaDatePicker.contains(event.target)) {
    toggleAgendaCalendar(false);
  }

  if (!event.target.closest(".custom-picker")) {
    closeCustomPickers();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    toggleAgendaCalendar(false);
    closePetHistory();
  }
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-picker-trigger]");
  const serviceOption = event.target.closest("[data-service-value]");
  const timePart = event.target.closest("[data-time-part]");

  if (trigger) {
    const picker = trigger.closest(".custom-picker");
    const shouldOpen = !picker.classList.contains("is-open");
    closeCustomPickers();
    picker.classList.toggle("is-open", shouldOpen);
    trigger.setAttribute("aria-expanded", String(shouldOpen));
    return;
  }

  if (serviceOption) {
    const picker = serviceOption.closest(".custom-picker");
    const field = document.querySelector(`#${picker.dataset.target}`);
    field.value = serviceOption.dataset.serviceValue;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    renderCustomPickers();
    closeCustomPickers();
    return;
  }

  if (timePart) {
    const picker = timePart.closest(".custom-picker");
    const field = document.querySelector(`#${picker.dataset.target}`);
    const [currentHour = "10", currentMinute = "00"] = (field.value || "10:00").split(":");
    const hour = timePart.dataset.timePart === "hour" ? timePart.dataset.timeValue : currentHour;
    const minute = timePart.dataset.timePart === "minute" ? timePart.dataset.timeValue : currentMinute;
    field.value = `${hour}:${minute}`;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    renderCustomPickers();
  }
});

document.addEventListener("input", (event) => {
  const field = event.target;

  if (!field.matches("[data-capitalize], #clientName, #clientAddress, #petName, #petBreed, #petNotes, #appointmentProfessional, #appointmentNotes")) {
    return;
  }

  capitalizeInputValue(field);
});

els.patientSearch.addEventListener("input", () => {
  patientSearchTerm = els.patientSearch.value.trim().toLowerCase();
  patientPage = 1;
  renderDirectory();
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
    editingAppointmentId = null;
    await reloadAfterMutation();
    showToast("Agendamento desmarcado.");
  }

  if (button.dataset.action === "reactivate") {
    await updateAppointmentStatus(appointment.id, "agendado");
    editingAppointmentId = null;
    await reloadAfterMutation();
    showToast("Agendamento remarcado como ativo.");
  }

  if (button.dataset.action === "edit-appointment") {
    editingAppointmentId = appointment.id;
    renderAppointments();
  }

  if (button.dataset.action === "cancel-appointment-edit") {
    editingAppointmentId = null;
    renderAppointments();
  }

  if (button.dataset.action === "save-appointment") {
    await saveAppointmentEdit(appointment.id);
  }
});

els.directoryList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const { action, clientId, petId } = button.dataset;

  if (action === "edit-client") {
    editingClientId = clientId;
    renderDirectory();
  }

  if (action === "cancel-client") {
    editingClientId = null;
    renderDirectory();
  }

  if (action === "save-client") {
    await saveClientEdit(clientId);
  }

  if (action === "delete-client") {
    await deleteClient(clientId);
  }

  if (action === "edit-pet") {
    editingPetId = petId;
    renderDirectory();
  }

  if (action === "view-pet-history") {
    openPetHistory(petId);
  }

  if (action === "cancel-pet") {
    editingPetId = null;
    renderDirectory();
  }

  if (action === "save-pet") {
    await savePetEdit(petId);
  }

  if (action === "delete-pet") {
    await deletePet(petId);
  }
});

els.patientPagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page-number]");

  if (!button) return;

  patientPage = Number(button.dataset.pageNumber);
  renderDirectory();
});

els.closePetHistory.addEventListener("click", closePetHistory);

els.petHistoryModal.addEventListener("click", (event) => {
  if (event.target === els.petHistoryModal) {
    closePetHistory();
  }
});

els.petHistoryDetails.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");

  if (!button || button.dataset.action !== "edit-history-appointment") return;

  openAppointmentEdit(button.dataset.id);
});

els.logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
});

init();

async function init() {
  setFormsDisabled(true);
  openPage(pageFromHash(), false);

  try {
    await refreshState();
  } catch {
    render();
    showToast("Backend indisponível. Verifique o servidor.");
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

async function updateRecord(resource, id, record) {
  await apiRequest(`/api/${resource}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(record)
  });
}

async function deleteRecord(resource, id) {
  await apiRequest(`/api/${resource}/${encodeURIComponent(id)}`, {
    method: "DELETE"
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
  renderDashboard();
  renderCustomPickers();
}

function openPage(page, updateHash = false) {
  const nextPage = pageNames.has(page) ? page : "dashboard";

  els.pages.forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === nextPage);
  });
  els.navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === nextPage);
  });

  if (updateHash) {
    history.pushState(null, "", `#${nextPage}`);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function pageFromHash() {
  return window.location.hash.replace("#", "") || "dashboard";
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
            <p class="card-meta">${formatDate(appointment.date)} às ${escapeHtml(appointment.time)} - ${escapeHtml(owner?.name || "Tutor não encontrado")}</p>
            <p class="card-meta">${escapeHtml(displayAppointmentProfessional(appointment))}</p>
          </div>
          <span class="status ${appointment.status}">${formatAppointmentStatus(appointment.status)}</span>
        </div>
        ${appointment.notes ? `<p class="card-meta">${escapeHtml(appointment.notes)}</p>` : ""}
        <div class="card-actions">
          <button class="ghost-button" type="button" data-action="edit-appointment" data-id="${appointment.id}">Editar</button>
          ${
            appointment.status === "agendado"
              ? `<button class="danger-button" type="button" data-action="cancel" data-id="${appointment.id}">Desmarcar</button>`
              : `<button class="ghost-button" type="button" data-action="reactivate" data-id="${appointment.id}">Reativar</button>`
          }
        </div>
        ${editingAppointmentId === appointment.id ? renderAppointmentEditForm(appointment) : ""}
      </article>
    `;
  }).join("");
  renderCustomPickers();
}

function renderDirectory() {
  const filteredPets = getFilteredPets();
  const totalPages = Math.max(1, Math.ceil(filteredPets.length / petsPerPage));

  if (patientPage > totalPages) {
    patientPage = totalPages;
  }

  const start = (patientPage - 1) * petsPerPage;
  const pagePets = filteredPets.slice(start, start + petsPerPage);
  els.patientCount.textContent = `${filteredPets.length} ${filteredPets.length === 1 ? "Pet" : "Pets"}`;

  if (!state.pets.length) {
    els.directoryList.innerHTML = `<div class="empty">Cadastre pets para montar a lista de pacientes.</div>`;
    els.patientPagination.innerHTML = "";
    return;
  }

  if (!pagePets.length) {
    els.directoryList.innerHTML = `<div class="empty">Nenhum pet encontrado para a busca.</div>`;
    els.patientPagination.innerHTML = "";
    return;
  }

  els.directoryList.innerHTML = pagePets.map((pet) => renderPatientCard(pet)).join("");
  renderPatientPagination(totalPages);
}

function renderAppointmentEditForm(appointment) {
  return `
    <div class="edit-form appointment-edit-form" data-edit-appointment-id="${escapeHtml(appointment.id)}">
      <label>Pet<select data-field="petId">
        ${state.pets.map((pet) => {
          const owner = findOwner(pet.ownerId);
          return `<option value="${pet.id}" ${pet.id === appointment.petId ? "selected" : ""}>${escapeHtml(pet.name)} - ${escapeHtml(owner?.name || "Sem tutor")}</option>`;
        }).join("")}
      </select></label>
      <label>Serviço<select id="appointmentType-${escapeHtml(appointment.id)}" class="native-control-hidden" data-field="type" data-service-select>
        ${serviceOptions.map((type) => `<option value="${type}" ${type === appointment.type ? "selected" : ""}>${type}</option>`).join("")}
      </select><div class="custom-picker" data-picker="service" data-target="appointmentType-${escapeHtml(appointment.id)}"></div></label>
      <label>Data<input data-field="date" type="date" value="${escapeHtml(appointment.date)}" /></label>
      <label>Horário<input id="appointmentTime-${escapeHtml(appointment.id)}" class="native-control-hidden" data-field="time" type="time" value="${escapeHtml(appointment.time)}" /><div class="custom-picker" data-picker="time" data-target="appointmentTime-${escapeHtml(appointment.id)}"></div></label>
      <label>Profissional<input data-field="professional" data-capitalize="name" value="${escapeHtml(displayAppointmentProfessional(appointment))}" /></label>
      <label>Status<select data-field="status">
        <option value="agendado" ${appointment.status === "agendado" ? "selected" : ""}>Agendado</option>
        <option value="cancelado" ${appointment.status === "cancelado" ? "selected" : ""}>Desmarcado</option>
      </select></label>
      <label class="edit-wide">Observações<textarea data-field="notes" data-capitalize rows="3">${escapeHtml(appointment.notes)}</textarea></label>
      <div class="card-actions">
        <button class="primary-button" type="button" data-action="save-appointment" data-id="${appointment.id}">Salvar atendimento</button>
        <button class="ghost-button" type="button" data-action="cancel-appointment-edit" data-id="${appointment.id}">Cancelar</button>
      </div>
    </div>
  `;
}

function getFilteredPets() {
  return state.pets.filter((pet) => {
    const owner = findOwner(pet.ownerId);
    const haystack = [
      pet.name,
      pet.species,
      pet.breed,
      pet.age,
      pet.notes,
      owner?.name,
      owner?.phone,
      owner?.email,
      owner?.address
    ].join(" ").toLowerCase();

    return !patientSearchTerm || haystack.includes(patientSearchTerm);
  });
}

function renderPatientCard(pet) {
  const owner = findOwner(pet.ownerId);

  return `
    <article class="client-card patient-card" data-client-id="${escapeHtml(owner?.id || "")}" data-pet-id="${escapeHtml(pet.id)}">
      <div class="patient-sections">
        <section class="patient-section patient-owner">
          <div class="card-top patient-card-head">
            <div class="patient-info">
              <p class="eyebrow">Tutor</p>
              <h3 class="card-title">${escapeHtml(owner?.name || "Tutor não encontrado")}</h3>
              <p class="card-meta">${escapeHtml(owner?.phone || "")}${owner?.email ? ` - ${escapeHtml(owner.email)}` : ""}</p>
              ${owner?.address ? `<p class="card-meta">${escapeHtml(owner.address)}</p>` : ""}
            </div>
            ${owner ? `
              <div class="card-actions patient-actions">
                <button class="ghost-button" type="button" data-action="edit-client" data-client-id="${owner.id}">Editar tutor</button>
                <button class="danger-button" type="button" data-action="delete-client" data-client-id="${owner.id}">Excluir tutor</button>
              </div>
            ` : ""}
          </div>
          ${owner && editingClientId === owner.id ? renderClientEditForm(owner) : ""}
        </section>

        <section class="patient-section patient-pet">
          <div class="card-top patient-card-head">
            <div class="patient-info">
              <p class="eyebrow">Pet</p>
              <h3 class="card-title">${escapeHtml(pet.name)}</h3>
              <p class="card-meta">${escapeHtml(pet.species)}${pet.breed ? ` - ${escapeHtml(pet.breed)}` : ""}${pet.age ? ` - ${escapeHtml(pet.age)} ano(s)` : ""}</p>
              ${pet.notes ? `<p class="card-meta">${escapeHtml(pet.notes)}</p>` : ""}
            </div>
            <div class="card-actions patient-actions">
              <button class="primary-button compact-button" type="button" data-action="view-pet-history" data-pet-id="${pet.id}">Ver histórico</button>
              <button class="ghost-button" type="button" data-action="edit-pet" data-pet-id="${pet.id}">Editar pet</button>
              <button class="danger-button" type="button" data-action="delete-pet" data-pet-id="${pet.id}">Excluir pet</button>
            </div>
          </div>
          ${editingPetId === pet.id ? renderPetEditForm(pet) : ""}
          ${renderPetHistory(pet)}
        </section>
      </div>
    </article>
  `;
}

function renderClientEditForm(client) {
  return `
    <div class="edit-form" data-edit-client-id="${escapeHtml(client.id)}">
      <label>Nome<input data-field="name" data-capitalize="name" value="${escapeHtml(client.name)}" /></label>
      <label>Telefone<input data-field="phone" value="${escapeHtml(client.phone)}" /></label>
      <label>E-mail<input data-field="email" value="${escapeHtml(client.email)}" /></label>
      <label>Endereço<input data-field="address" data-capitalize value="${escapeHtml(client.address)}" /></label>
      <div class="card-actions">
        <button class="primary-button" type="button" data-action="save-client" data-client-id="${client.id}">Salvar tutor</button>
        <button class="ghost-button" type="button" data-action="cancel-client" data-client-id="${client.id}">Cancelar</button>
      </div>
    </div>
  `;
}

function renderPetEditForm(pet) {
  return `
    <div class="edit-form" data-edit-pet-id="${escapeHtml(pet.id)}">
      <label>Tutor<select data-field="ownerId">${state.clients.map((client) => `
        <option value="${client.id}" ${client.id === pet.ownerId ? "selected" : ""}>${escapeHtml(client.name)}</option>
      `).join("")}</select></label>
      <label>Nome<input data-field="name" data-capitalize="name" value="${escapeHtml(pet.name)}" /></label>
      <label>Espécie<select data-field="species">
        ${["Cão", "Gato", "Ave", "Outro"].map((species) => `<option value="${species}" ${species === pet.species ? "selected" : ""}>${species}</option>`).join("")}
      </select></label>
      <label>Raça<input data-field="breed" data-capitalize="name" value="${escapeHtml(pet.breed)}" /></label>
      <label>Idade<input data-field="age" type="number" min="0" max="80" value="${escapeHtml(pet.age)}" /></label>
      <label class="edit-wide">Observações<textarea data-field="notes" data-capitalize rows="3">${escapeHtml(pet.notes)}</textarea></label>
      <div class="card-actions">
        <button class="primary-button" type="button" data-action="save-pet" data-pet-id="${pet.id}">Salvar pet</button>
        <button class="ghost-button" type="button" data-action="cancel-pet" data-pet-id="${pet.id}">Cancelar</button>
      </div>
    </div>
  `;
}

function renderPatientPagination(totalPages) {
  if (totalPages <= 1) {
    els.patientPagination.innerHTML = "";
    return;
  }

  els.patientPagination.innerHTML = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    return `<button class="${page === patientPage ? "is-active" : ""}" type="button" data-page-number="${page}">${page}</button>`;
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
        <span class="history-count">${history.length} ${history.length === 1 ? "Atendimento" : "Atendimentos"}</span>
      </div>
      ${
        history.length
          ? `<ol class="history-list">
              ${history.slice(0, 5).map((appointment) => `
                <li>
                  <strong>${escapeHtml(appointment.type)}</strong>
                  <span>${formatDate(appointment.date)} às ${escapeHtml(appointment.time)} - ${formatAppointmentStatus(appointment.status)}</span>
                </li>
              `).join("")}
            </ol>`
          : `<p class="pet-line">Sem histórico de atendimentos.</p>`
      }
    </div>
  `;
}

function openPetHistory(petId) {
  const pet = findPet(petId);

  if (!pet) return;

  const owner = findOwner(pet.ownerId);
  const history = state.appointments
    .filter((appointment) => appointment.petId === pet.id)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  els.petHistoryTitle.textContent = pet.name;
  els.petHistorySubtitle.textContent = [
    pet.species,
    pet.breed,
    owner?.name ? `Tutor: ${owner.name}` : "Tutor não encontrado"
  ].filter(Boolean).join(" - ");

  els.petHistoryDetails.innerHTML = history.length
    ? `
      <div class="history-summary">
        <span>${history.length} ${history.length === 1 ? "Atendimento registrado" : "Atendimentos registrados"}</span>
        <span>Mais recente: ${formatDate(history[0].date)}</span>
      </div>
      <div class="history-detail-list">
        ${history.map((appointment) => renderPetHistoryDetail(appointment)).join("")}
      </div>
    `
    : `<div class="empty">Este pet ainda não possui histórico de atendimentos.</div>`;

  els.petHistoryModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closePetHistory() {
  if (!els.petHistoryModal || els.petHistoryModal.hidden) return;

  els.petHistoryModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function openAppointmentEdit(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) return;

  closePetHistory();
  selectedAgendaDate = appointment.date;
  editingAppointmentId = appointment.id;
  calendarViewDate = parseLocalDate(selectedAgendaDate);
  updateAgendaDateDisplay();
  renderAgendaCalendar();
  openPage("agenda", true);
  renderAppointments();
}

function renderPetHistoryDetail(appointment) {
  return `
    <article class="history-detail-card">
      <div class="history-detail-head">
        <div>
          <p class="eyebrow">${formatDate(appointment.date)} às ${escapeHtml(appointment.time)}</p>
          <h3>${escapeHtml(appointment.type)}</h3>
        </div>
        <div class="history-detail-actions">
          <span class="status ${appointment.status}">${formatAppointmentStatus(appointment.status)}</span>
          <button class="ghost-button" type="button" data-action="edit-history-appointment" data-id="${appointment.id}">Editar</button>
        </div>
      </div>
      <dl class="history-detail-grid">
        <div>
          <dt>Motivo / Serviço</dt>
          <dd>${escapeHtml(appointment.type)}</dd>
        </div>
        <div>
          <dt>Profissional</dt>
          <dd>${escapeHtml(displayAppointmentProfessional(appointment))}</dd>
        </div>
        <div class="history-detail-wide">
          <dt>Observações</dt>
          <dd>${appointment.notes ? escapeHtml(appointment.notes) : "Sem observações registradas."}</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderTotals() {
  els.totals.clients.textContent = state.clients.length;
  els.totals.pets.textContent = state.pets.length;
  els.totals.active.textContent = state.appointments.filter((item) => item.status === "agendado").length;
  els.totals.canceled.textContent = state.appointments.filter((item) => item.status === "cancelado").length;
}

function renderDashboard() {
  const today = getOffsetDate(0);
  const petIdsWithHistory = new Set(state.appointments.map((appointment) => appointment.petId));

  els.todayAppointments.textContent = state.appointments.filter((appointment) => {
    return appointment.date === today && appointment.status === "agendado";
  }).length;
  els.petsWithHistory.textContent = state.pets.filter((pet) => petIdsWithHistory.has(pet.id)).length;
}

async function saveClientEdit(clientId) {
  const form = document.querySelector(`[data-edit-client-id="${cssEscape(clientId)}"]`);
  const payload = readEditFields(form, ["name", "phone", "email", "address"]);
  payload.name = normalizeName(payload.name);
  payload.address = normalizeText(payload.address);

  await updateRecord("clients", clientId, payload);
  editingClientId = null;
  await reloadAfterMutation();
  showToast("Tutor atualizado.");
}

async function deleteClient(clientId) {
  const owner = findOwner(clientId);

  if (!window.confirm(`Excluir ${owner?.name || "este tutor"}? Os pets e históricos vinculados também serão removidos.`)) return;

  await deleteRecord("clients", clientId);
  editingClientId = null;
  editingPetId = null;
  await reloadAfterMutation();
  showToast("Tutor excluído.");
}

async function savePetEdit(petId) {
  const form = document.querySelector(`[data-edit-pet-id="${cssEscape(petId)}"]`);
  const payload = readEditFields(form, ["ownerId", "name", "species", "breed", "age", "notes"]);
  payload.name = normalizeName(payload.name);
  payload.breed = normalizeName(payload.breed);
  payload.notes = normalizeText(payload.notes);

  await updateRecord("pets", petId, payload);
  editingPetId = null;
  await reloadAfterMutation();
  showToast("Pet atualizado.");
}

async function deletePet(petId) {
  const pet = findPet(petId);

  if (!window.confirm(`Excluir ${pet?.name || "este pet"}? O histórico de atendimentos dele também será removido.`)) return;

  await deleteRecord("pets", petId);
  editingPetId = null;
  await reloadAfterMutation();
  showToast("Pet excluído.");
}

async function saveAppointmentEdit(appointmentId) {
  const form = document.querySelector(`[data-edit-appointment-id="${cssEscape(appointmentId)}"]`);
  const payload = readEditFields(form, ["petId", "type", "date", "time", "professional", "notes", "status"]);
  payload.professional = normalizeName(payload.professional || surgeonName);
  payload.notes = normalizeText(payload.notes);

  await updateRecord("appointments", appointmentId, payload);
  editingAppointmentId = null;
  selectedAgendaDate = payload.date;
  calendarViewDate = parseLocalDate(selectedAgendaDate);
  updateAgendaDateDisplay();
  renderAgendaCalendar();
  await reloadAfterMutation();
  showToast("Atendimento atualizado.");
}

function readEditFields(container, fields) {
  return Object.fromEntries(fields.map((field) => {
    return [field, container.querySelector(`[data-field="${field}"]`).value.trim()];
  }));
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
      <span class="status ${user.mfaEnabled ? "agendado" : "cancelado"}">${user.mfaEnabled ? "MFA Ativo" : "MFA Pendente"}</span>
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

function normalizeText(value) {
  return String(value || "").replace(/^(\s*)(\p{L})/u, (_, spacing, letter) => spacing + letter.toLocaleUpperCase("pt-BR"));
}

function normalizeName(value) {
  return String(value || "").replace(/(^|\s)(\p{L})/gu, (_, spacing, letter) => spacing + letter.toLocaleUpperCase("pt-BR"));
}

function capitalizeInputValue(field) {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const nextValue = field.dataset.capitalize === "name" ? normalizeName(field.value) : normalizeText(field.value);

  if (field.value !== nextValue) {
    field.value = nextValue;

    if (typeof start === "number" && typeof end === "number") {
      field.setSelectionRange(start, end);
    }
  }
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

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function updateAgendaDateDisplay() {
  els.agendaDate.value = selectedAgendaDate;
  els.agendaDateText.textContent = formatDate(selectedAgendaDate);
}

function toggleAgendaCalendar(open) {
  els.agendaDatePopover.hidden = !open;
  els.agendaDateTrigger.setAttribute("aria-expanded", String(open));

  if (open) {
    renderAgendaCalendar();
  }
}

function selectAgendaDate(value) {
  selectedAgendaDate = value;
  calendarViewDate = parseLocalDate(value);
  updateAgendaDateDisplay();
  renderAgendaCalendar();
  renderAppointments();
  toggleAgendaCalendar(false);
}

function renderAgendaCalendar() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const todayValue = getOffsetDate(0);

  els.agendaCalendarMonth.textContent = firstDay.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });

  els.agendaCalendarDays.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = toDateValue(date);
    const classes = [
      "date-day",
      date.getMonth() !== month ? "is-muted" : "",
      value === todayValue ? "is-today" : "",
      value === selectedAgendaDate ? "is-selected" : ""
    ].filter(Boolean).join(" ");

    return `<button class="${classes}" type="button" data-date-value="${value}">${date.getDate()}</button>`;
  }).join("");
}

function closeCustomPickers() {
  document.querySelectorAll(".custom-picker.is-open").forEach((picker) => {
    picker.classList.remove("is-open");
    picker.querySelector("[data-picker-trigger]")?.setAttribute("aria-expanded", "false");
  });
}

function renderCustomPickers() {
  document.querySelectorAll(".custom-picker").forEach((picker) => {
    const field = document.getElementById(picker.dataset.target);

    if (!field) return;

    if (picker.dataset.picker === "service") {
      renderServicePicker(picker, field);
    }

    if (picker.dataset.picker === "time") {
      renderTimePicker(picker, field);
    }
  });
}

function renderServicePicker(picker, field) {
  const value = field.value || serviceOptions[0];

  picker.innerHTML = `
    <button class="picker-trigger" type="button" data-picker-trigger aria-haspopup="listbox" aria-expanded="false">
      <span>${escapeHtml(value)}</span>
      <span class="picker-chevron" aria-hidden="true"></span>
    </button>
    <div class="picker-popover service-popover" role="listbox">
      ${serviceOptions.map((option) => `
        <button class="picker-option ${option === value ? "is-selected" : ""}" type="button" data-service-value="${escapeHtml(option)}" role="option" aria-selected="${option === value}">
          ${escapeHtml(option)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderTimePicker(picker, field) {
  const [hour = "10", minute = "00"] = (field.value || "10:00").split(":");
  const minutes = appointmentMinutes.includes(minute) ? appointmentMinutes : [...appointmentMinutes, minute].sort();

  picker.innerHTML = `
    <button class="picker-trigger" type="button" data-picker-trigger aria-haspopup="dialog" aria-expanded="false">
      <span>${escapeHtml(hour)}:${escapeHtml(minute)}</span>
      <span class="time-trigger-icon" aria-hidden="true"></span>
    </button>
    <div class="picker-popover time-popover">
      <div class="time-column" aria-label="Hora">
        ${appointmentHours.map((option) => `
          <button class="time-option ${option === hour ? "is-selected" : ""}" type="button" data-time-part="hour" data-time-value="${option}">${option}</button>
        `).join("")}
      </div>
      <div class="time-column" aria-label="Minuto">
        ${minutes.map((option) => `
          <button class="time-option ${option === minute ? "is-selected" : ""}" type="button" data-time-part="minute" data-time-value="${option}">${option}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function defaultProfessional(type) {
  return surgeonName;
}

function displayAppointmentProfessional(appointment) {
  const professional = String(appointment.professional || "").trim();

  if (!professional || professional.toLocaleLowerCase("pt-BR") === "luiz") {
    return surgeonName;
  }

  return professional;
}

function formatAppointmentStatus(status) {
  const labels = {
    agendado: "Agendado",
    cancelado: "Desmarcado"
  };

  return labels[status] || escapeHtml(status);
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

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}
