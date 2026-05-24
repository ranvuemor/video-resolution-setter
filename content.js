const DEFAULT_SETTINGS = {
  enabled: true,
  preferredHeight: 1440
};

const QUALITY_LABELS = [
  { height: 4320, patterns: [/4320p/i, /\b8k\b/i] },
  { height: 2160, patterns: [/2160p/i, /\b4k\b/i, /uhd/i] },
  { height: 1440, patterns: [/1440p/i, /\b2k\b/i, /qhd/i] },
  { height: 1080, patterns: [/1080p/i, /full\s*hd/i, /\bfhd\b/i] },
  { height: 720, patterns: [/720p/i, /\bhd\b/i] },
  { height: 480, patterns: [/480p/i] },
  { height: 360, patterns: [/360p/i] },
  { height: 240, patterns: [/240p/i] },
  { height: 144, patterns: [/144p/i] }
];

const QUALITY_MENU_PATTERNS = [
  /quality/i,
  /resolution/i,
  /\bhd\b/i,
  /settings/i,
  /gear/i,
  /cog/i
];

let currentSettings = { ...DEFAULT_SETTINGS };
let applyTimer = 0;
let pageBridgeInjected = false;
let lastAppliedSignature = "";

function visible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function textFor(element) {
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-title"),
    element.getAttribute("data-tooltip"),
    element.getAttribute("role")
  ]
    .filter(Boolean)
    .join(" ");
}

function heightFromText(text) {
  for (const label of QUALITY_LABELS) {
    if (label.patterns.some((pattern) => pattern.test(text))) {
      return label.height;
    }
  }

  return 0;
}

function chooseHeight(heights, preferredHeight) {
  const ranked = [...new Set(heights)]
    .filter((height) => height > 0)
    .sort((a, b) => b - a);

  return ranked.find((height) => height <= preferredHeight) ?? ranked[ranked.length - 1] ?? 0;
}

function candidateControls() {
  return [...document.querySelectorAll("button, [role='button'], [aria-label], [title], select")]
    .filter(visible)
    .filter((element) => QUALITY_MENU_PATTERNS.some((pattern) => pattern.test(textFor(element))));
}

function qualityOptions() {
  return [...document.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], li, span, div, option")]
    .filter(visible)
    .map((element) => ({ element, height: heightFromText(textFor(element)) }))
    .filter((entry) => entry.height > 0);
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  element.click();
}

function applyNativeSelect(preferredHeight) {
  const selects = [...document.querySelectorAll("select")].filter(visible);

  for (const select of selects) {
    const options = [...select.options].map((option) => ({
      option,
      height: heightFromText(option.textContent || option.value)
    }));
    const selectedHeight = chooseHeight(options.map((entry) => entry.height), preferredHeight);
    const selected = options.find((entry) => entry.height === selectedHeight);

    if (selected) {
      select.value = selected.option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { applied: true, site: "generic-select", height: selectedHeight };
    }
  }

  return { applied: false };
}

async function applyGenericQuality(preferredHeight) {
  const selectResult = applyNativeSelect(preferredHeight);
  if (selectResult.applied) {
    return selectResult;
  }

  const controls = candidateControls();
  for (const control of controls.slice(0, 6)) {
    clickElement(control);
    await new Promise((resolve) => setTimeout(resolve, 180));

    const options = qualityOptions();
    const selectedHeight = chooseHeight(options.map((entry) => entry.height), preferredHeight);
    const selected = options.find((entry) => entry.height === selectedHeight);
    if (selected) {
      clickElement(selected.element);
      return { applied: true, site: "generic-menu", height: selectedHeight };
    }
  }

  return { applied: false, reason: "No compatible quality selector found." };
}

function injectPageBridge() {
  if (pageBridgeInjected) {
    return;
  }

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).append(script);
  pageBridgeInjected = true;
}

function applyYouTubeQuality(preferredHeight) {
  injectPageBridge();

  const requestId = `${Date.now()}-${Math.random()}`;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ applied: false, reason: "Timed out waiting for YouTube player." });
    }, 1200);

    function onMessage(event) {
      if (event.source !== window || event.data?.type !== "VRS_YOUTUBE_RESULT" || event.data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data.result);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type: "VRS_APPLY_YOUTUBE", requestId, preferredHeight }, "*");
  });
}

async function applyResolution(settings = currentSettings) {
  if (!settings.enabled || !document.querySelector("video")) {
    return { applied: false, reason: "Disabled or no video found." };
  }

  const videos = [...document.querySelectorAll("video")];
  const signature = `${location.href}|${settings.preferredHeight}|${videos.length}|${videos.map((video) => video.currentSrc || video.src).join("|")}`;
  if (signature === lastAppliedSignature) {
    return { applied: false, reason: "Already applied for this video state." };
  }

  let result = { applied: false };
  if (location.hostname.includes("youtube.com")) {
    result = await applyYouTubeQuality(settings.preferredHeight);
  }

  if (!result.applied) {
    result = await applyGenericQuality(settings.preferredHeight);
  }

  if (result.applied) {
    lastAppliedSignature = signature;
    console.info("[Video Resolution Setter] Applied quality:", result);
  }

  return result;
}

function scheduleApply(delay = 600) {
  window.clearTimeout(applyTimer);
  applyTimer = window.setTimeout(() => applyResolution(), delay);
}

async function loadSettings() {
  currentSettings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  scheduleApply(900);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "VRS_APPLY_SETTINGS") {
    return false;
  }

  currentSettings = { ...DEFAULT_SETTINGS, ...message.settings };
  lastAppliedSignature = "";
  applyResolution(currentSettings).then(sendResponse);
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }

  currentSettings = {
    ...currentSettings,
    ...Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]))
  };
  lastAppliedSignature = "";
  scheduleApply(250);
});

const observer = new MutationObserver(() => scheduleApply());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("playing", scheduleApply, true);
document.addEventListener("loadedmetadata", scheduleApply, true);
window.addEventListener("yt-navigate-finish", () => {
  lastAppliedSignature = "";
  scheduleApply(900);
});

loadSettings();
