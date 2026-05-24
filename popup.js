const DEFAULT_SETTINGS = {
  enabled: true,
  preferredHeight: 1440,
  ignoredSites: []
};

const resolution = document.querySelector("#resolution");
const enabled = document.querySelector("#enabled");
const ignoredSites = document.querySelector("#ignored-sites");
const ignoreCurrent = document.querySelector("#ignore-current");
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

function normalizeHostname(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname
      .replace(/^\*\./, "")
      .replace(/^www\./, "")
      .replace(/^\.+/, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .split(/[/?#:]/)[0]
      .replace(/^\*\./, "")
      .replace(/^www\./, "")
      .replace(/^\.+/, "");
  }
}

function parseIgnoredSites(value) {
  return [...new Set(value.split(/[\n,]+/).map(normalizeHostname).filter(Boolean))];
}

function formatIgnoredSites(sites) {
  return (sites || []).map(normalizeHostname).filter(Boolean).join("\n");
}

async function saveSettings() {
  const settings = {
    enabled: enabled.checked,
    preferredHeight: Number(resolution.value),
    ignoredSites: parseIgnoredSites(ignoredSites.value)
  };

  await chrome.storage.sync.set(settings);
  return settings;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostnameFromTab(tab) {
  if (!tab?.url) {
    return "";
  }

  try {
    const url = new URL(tab.url);
    return ["http:", "https:"].includes(url.protocol) ? normalizeHostname(url.hostname) : "";
  } catch {
    return "";
  }
}

async function applyToActiveTab(settings) {
  const tab = await activeTab();
  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "VRS_APPLY_SETTINGS",
      settings
    });
    setStatus(response?.ignored ? "This site is ignored." : "Applied to this tab.");
  } catch {
    setStatus("Reload this tab, then try again.");
  }
}

async function init() {
  const settings = await getSettings();
  resolution.value = String(settings.preferredHeight);
  enabled.checked = Boolean(settings.enabled);
  ignoredSites.value = formatIgnoredSites(settings.ignoredSites);

  resolution.addEventListener("change", async () => {
    await saveSettings();
    setStatus("Saved.");
  });

  enabled.addEventListener("change", async () => {
    await saveSettings();
    setStatus(enabled.checked ? "Automatic mode on." : "Automatic mode off.");
  });

  ignoredSites.addEventListener("change", async () => {
    const settings = await saveSettings();
    ignoredSites.value = formatIgnoredSites(settings.ignoredSites);
    setStatus("Ignored websites saved.");
  });

  ignoreCurrent.addEventListener("click", async () => {
    const host = hostnameFromTab(await activeTab());
    if (!host) {
      setStatus("This page cannot be ignored.");
      return;
    }

    const sites = parseIgnoredSites(ignoredSites.value);
    if (!sites.includes(host)) {
      sites.push(host);
    }

    ignoredSites.value = formatIgnoredSites(sites);
    await saveSettings();
    setStatus(`${host} ignored.`);
  });

  apply.addEventListener("click", async () => {
    const settings = await saveSettings();
    await applyToActiveTab(settings);
  });
}

init();
