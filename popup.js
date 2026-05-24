const DEFAULT_SETTINGS = {
  enabled: true,
  preferredHeight: 1440
};

const resolution = document.querySelector("#resolution");
const enabled = document.querySelector("#enabled");
const apply = document.querySelector("#apply");
const status = document.querySelector("#status");

function setStatus(message) {
  status.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    status.textContent = "";
  }, 2500);
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function saveSettings() {
  const settings = {
    enabled: enabled.checked,
    preferredHeight: Number(resolution.value)
  };

  await chrome.storage.sync.set(settings);
  return settings;
}

async function applyToActiveTab(settings) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "VRS_APPLY_SETTINGS",
      settings
    });
    setStatus("Applied to this tab.");
  } catch {
    setStatus("Reload this tab, then try again.");
  }
}

async function init() {
  const settings = await getSettings();
  resolution.value = String(settings.preferredHeight);
  enabled.checked = Boolean(settings.enabled);

  resolution.addEventListener("change", async () => {
    await saveSettings();
    setStatus("Saved.");
  });

  enabled.addEventListener("change", async () => {
    await saveSettings();
    setStatus(enabled.checked ? "Automatic mode on." : "Automatic mode off.");
  });

  apply.addEventListener("click", async () => {
    const settings = await saveSettings();
    await applyToActiveTab(settings);
  });
}

init();
