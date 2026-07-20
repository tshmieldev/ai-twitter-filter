const DEFAULT_SETTINGS = {
  enabled: true,
  apiProvider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  filterPrompt:
    "Is this tweet negative, toxic, or complaining? Reply with true to hide it, false to keep it.",
  savedFilters: [],
  customModels: [],
};

const els = {
  enabled: document.getElementById("enabled"),
  apiProvider: document.getElementById("apiProvider"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  modelTextField: document.getElementById("modelTextField"),
  modelSelect: document.getElementById("modelSelect"),
  modelSelectField: document.getElementById("modelSelectField"),
  addCustomOption: document.getElementById("addCustomOption"),
  customModelField: document.getElementById("customModelField"),
  customModelInput: document.getElementById("customModelInput"),
  addCustomModel: document.getElementById("addCustomModel"),
  apiKeyNotice: document.getElementById("apiKeyNotice"),
  savedFilters: document.getElementById("savedFilters"),
  deleteSavedFilter: document.getElementById("deleteSavedFilter"),
  filterPrompt: document.getElementById("filterPrompt"),
  saveFilter: document.getElementById("saveFilter"),
  status: document.getElementById("status"),
};

let currentSavedFilters = [];
let currentCustomModels = [];

function updateModelVisibility(provider) {
  if (provider === "openrouter") {
    els.modelTextField.style.display = "none";
    els.modelSelectField.style.display = "";
  } else {
    els.modelTextField.style.display = "";
    els.modelSelectField.style.display = "none";
  }
}

function renderCustomModels() {
  // Remove previously rendered custom options
  els.modelSelect.querySelectorAll('option[data-custom="true"]').forEach((opt) => opt.remove());

  for (const slug of currentCustomModels) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = slug;
    opt.dataset.custom = "true";
    els.modelSelect.insertBefore(opt, els.addCustomOption);
  }
}

function renderSavedFilters() {
  // Clear existing options (keep placeholder)
  els.savedFilters.innerHTML =
    '<option value="" disabled selected>Load a saved filter...</option>';

  for (let i = 0; i < currentSavedFilters.length; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    // Truncate long filters for the dropdown label
    const text = currentSavedFilters[i];
    opt.textContent = text.length > 50 ? text.slice(0, 50) + "..." : text;
    opt.title = text;
    els.savedFilters.appendChild(opt);
  }
}

function showStatus(msg) {
  els.status.textContent = msg;
  setTimeout(() => {
    els.status.textContent = "";
  }, 2000);
}

// Load saved settings
chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  els.enabled.checked = settings.enabled;
  els.apiProvider.value = settings.apiProvider;
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  els.filterPrompt.value = settings.filterPrompt;

  updateModelVisibility(settings.apiProvider);
  els.apiKeyNotice.style.display = settings.apiKey ? "none" : "block";

  currentCustomModels = settings.customModels || [];
  renderCustomModels();

  if (settings.apiProvider === "openrouter") {
    els.modelSelect.value = settings.model;
  }

  currentSavedFilters = settings.savedFilters || [];
  renderSavedFilters();
});

// Auto-save on change
function save(key, value) {
  chrome.storage.sync.set({ [key]: value });
}

els.enabled.addEventListener("change", () => {
  save("enabled", els.enabled.checked);
});

els.apiProvider.addEventListener("change", () => {
  const provider = els.apiProvider.value;
  save("apiProvider", provider);
  updateModelVisibility(provider);

  if (provider === "openrouter") {
    save("model", els.modelSelect.value);
  } else {
    save("model", "gpt-4o-mini");
    els.model.value = "gpt-4o-mini";
  }
});

els.apiKey.addEventListener("change", () => {
  save("apiKey", els.apiKey.value);
  els.apiKeyNotice.style.display = els.apiKey.value ? "none" : "block";
});

els.model.addEventListener("change", () => {
  save("model", els.model.value);
});

els.modelSelect.addEventListener("change", () => {
  if (els.modelSelect.value === "__custom__") {
    els.customModelField.style.display = "";
    els.customModelInput.value = "";
    els.customModelInput.focus();
    return;
  }
  els.customModelField.style.display = "none";
  save("model", els.modelSelect.value);
});

function addCustomModel() {
  const slug = els.customModelInput.value.trim();
  if (!slug || !slug.includes("/")) {
    showStatus("Enter a valid provider/model slug");
    return;
  }

  if (!currentCustomModels.includes(slug)) {
    currentCustomModels.push(slug);
    save("customModels", currentCustomModels);
    renderCustomModels();
  }

  els.modelSelect.value = slug;
  save("model", slug);
  els.customModelField.style.display = "none";
  showStatus("Model added");
}

els.addCustomModel.addEventListener("click", addCustomModel);

els.customModelInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCustomModel();
  }
});

els.filterPrompt.addEventListener("change", () => {
  save("filterPrompt", els.filterPrompt.value);
});

// Load a saved filter
els.savedFilters.addEventListener("change", () => {
  const idx = parseInt(els.savedFilters.value, 10);
  if (isNaN(idx) || !currentSavedFilters[idx]) return;

  els.filterPrompt.value = currentSavedFilters[idx];
  save("filterPrompt", currentSavedFilters[idx]);
  showStatus("Filter loaded");
});

// Save current filter
els.saveFilter.addEventListener("click", () => {
  const prompt = els.filterPrompt.value.trim();
  if (!prompt) return;

  // Don't save duplicates
  if (currentSavedFilters.includes(prompt)) {
    showStatus("Already saved");
    return;
  }

  currentSavedFilters.push(prompt);
  save("savedFilters", currentSavedFilters);
  renderSavedFilters();
  showStatus("Filter saved");
});

// Delete selected saved filter
els.deleteSavedFilter.addEventListener("click", () => {
  const idx = parseInt(els.savedFilters.value, 10);
  if (isNaN(idx) || !currentSavedFilters[idx]) {
    showStatus("Select a filter first");
    return;
  }

  currentSavedFilters.splice(idx, 1);
  save("savedFilters", currentSavedFilters);
  renderSavedFilters();
  showStatus("Filter deleted");
});
