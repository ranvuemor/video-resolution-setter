const DEFAULT_SETTINGS = {
  enabled: true,
  preferredHeight: 1440,
  ignoredSites: []
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

const QUALITY_SUBMENU_PATTERNS = [
  /quality/i,
  /resolution/i,
  /advanced/i
];

const INTERACTIVE_MENU_SELECTOR = [
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[aria-label]",
  "[title]",
  "[data-title]",
  "[data-tooltip]",
  ".vjs-menu-item",
  ".jw-settings-content-item",
  ".plyr__control"
].join(", ");

const PLAYER_ADAPTERS = [
  {
    name: "videojs",
    rootSelector: ".video-js",
    controlSelectors: [
      ".vjs-quality-selector",
      ".vjs-resolution-button",
      ".vjs-quality-menu-button",
      ".vjs-resolution-menu-button",
      ".vjs-menu-button",
      "[aria-label*='quality' i]",
      "[aria-label*='resolution' i]",
      "[title*='quality' i]",
      "[title*='resolution' i]"
    ],
    optionRootSelectors: [".vjs-menu"]
  },
  {
    name: "jwplayer",
    rootSelector: ".jwplayer",
    controlSelectors: [
      ".jw-icon-settings",
      ".jw-icon-hd",
      ".jw-settings-quality",
      ".jw-settings-submenu-button",
      "[aria-label*='quality' i]",
      "[aria-label*='settings' i]"
    ],
    optionRootSelectors: [".jw-settings-menu", ".jw-settings-submenu-quality"]
  },
  {
    name: "plyr",
    rootSelector: ".plyr",
    controlSelectors: [
      "button[data-plyr='settings']",
      "button[data-plyr='quality']",
      ".plyr__control",
      "[aria-label*='quality' i]",
      "[aria-label*='settings' i]"
    ],
    optionRootSelectors: [".plyr__menu"]
  }
];

const PLAYER_ROOT_SELECTOR = [
  ".html5-video-player",
  ".video-js",
  ".jwplayer",
  ".plyr",
  ".mejs__container",
  "[data-player]",
  "[data-video-player]",
  "[class*='player']",
  "[class*='Player']"
].join(", ");

const STRONG_PLAYER_ROOT_SELECTOR = [
  ".html5-video-player",
  ".video-js",
  ".jwplayer",
  ".plyr",
  ".mejs__container",
  "[data-player]",
  "[data-video-player]"
].join(", ");

const THUMBNAIL_CONTEXT_SELECTOR = [
  "a",
  "article",
  "li",
  "[class*='thumb' i]",
  "[class*='preview' i]",
  "[class*='teaser' i]",
  "[class*='tile' i]",
  "[class*='card' i]",
  "[class*='grid' i]"
].join(", ");

let currentSettings = { ...DEFAULT_SETTINGS };
let applyTimer = 0;
let pageBridgeInjected = false;
let lastAppliedSignature = "";

function isYouTubeHost() {
  return /(^|\.)youtube\.com$/i.test(location.hostname);
}

function isYouTubePlayerPage() {
  return ["/watch", "/embed/", "/shorts/", "/live/"].some((path) => location.pathname.startsWith(path));
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

function isIgnoredSite(settings = currentSettings) {
  const currentHost = normalizeHostname(location.hostname);
  return (settings.ignoredSites || [])
    .map(normalizeHostname)
    .filter(Boolean)
    .some((ignoredHost) => currentHost === ignoredHost || currentHost.endsWith(`.${ignoredHost}`));
}

function visible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function playerRootFor(video) {
  return video.closest(PLAYER_ROOT_SELECTOR);
}

function isPlayingVideo(video) {
  return !video.paused && !video.ended && video.readyState > 2;
}

function isThumbnailVideo(video) {
  return !video.controls
    && !isPlayingVideo(video)
    && !video.closest(STRONG_PLAYER_ROOT_SELECTOR)
    && Boolean(video.closest(THUMBNAIL_CONTEXT_SELECTOR));
}

function videoScore(video) {
  const rect = video.getBoundingClientRect();
  const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
  const area = rect.width * rect.height;
  const areaRatio = area / viewportArea;
  const hasSource = Boolean(video.currentSrc || video.src || video.querySelector("source"));
  const isPlaying = isPlayingVideo(video);
  const hasControls = video.controls || Boolean(playerRootFor(video));
  const longEnough = !Number.isFinite(video.duration) || video.duration === 0 || video.duration >= 20;

  if (isThumbnailVideo(video)) {
    return 0;
  }

  let score = 0;
  if (hasSource) {
    score += 2;
  }
  if (hasControls) {
    score += 3;
  }
  if (isPlaying) {
    score += 4;
  }
  if (longEnough) {
    score += 1;
  }
  if (areaRatio >= 0.08) {
    score += 4;
  } else if (areaRatio >= 0.02) {
    score += 2;
  }
  if (rect.width < 180 || rect.height < 100) {
    score -= 4;
  }

  return score;
}

function visibleVideos() {
  return [...document.querySelectorAll("video")]
    .filter(visible)
    .map((video) => ({ video, score: videoScore(video) }))
    .filter((entry) => entry.score >= 5)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.video);
}

function videoControlRoots() {
  const roots = new Set();

  for (const video of visibleVideos()) {
    const explicitRoot = playerRootFor(video);

    roots.add(explicitRoot || video.parentElement);
  }

  return [...roots].filter((root) => root instanceof HTMLElement && visible(root));
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

function candidateControls(root) {
  return [...root.querySelectorAll("button, [role='button'], [aria-label], [title], select")]
    .filter(visible)
    .filter((element) => QUALITY_MENU_PATTERNS.some((pattern) => pattern.test(textFor(element))));
}

function qualityOptions(root = document) {
  return [...root.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], li, span, div, option")]
    .filter(visible)
    .map((element) => ({ element, height: heightFromText(textFor(element)) }))
    .filter((entry) => entry.height > 0);
}

function qualitySubmenuControls(roots) {
  return roots
    .flatMap((root) => [...root.querySelectorAll(INTERACTIVE_MENU_SELECTOR)])
    .filter(visible)
    .filter((element) => heightFromText(textFor(element)) === 0)
    .filter((element) => QUALITY_SUBMENU_PATTERNS.some((pattern) => pattern.test(textFor(element))));
}

function qualityOptionRoots(playerRoots) {
  const menuRoots = [...document.querySelectorAll([
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    ".ytp-panel",
    ".vjs-menu",
    ".jw-settings-menu",
    ".plyr__menu",
    "[class*='quality']",
    "[class*='Quality']",
    "[class*='resolution']",
    "[class*='Resolution']"
  ].join(", "))].filter(visible);

  return [...new Set([...playerRoots, ...menuRoots])];
}

function queryVisible(selector, root = document) {
  try {
    return [...root.querySelectorAll(selector)].filter(visible);
  } catch {
    return [];
  }
}

function uniqueElements(elements) {
  return [...new Set(elements)].filter((element) => element instanceof HTMLElement);
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  element.click();
}

function applyNativeSelect(preferredHeight, roots) {
  const selects = roots.flatMap((root) => [...root.querySelectorAll("select")]).filter(visible);

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

function adapterRoots(adapter) {
  return queryVisible(adapter.rootSelector);
}

function adapterControls(adapter, roots) {
  const explicitControls = roots.flatMap((root) =>
    adapter.controlSelectors.flatMap((selector) => queryVisible(selector, root))
  );
  const textControls = roots.flatMap(candidateControls);

  return uniqueElements([...explicitControls, ...textControls]);
}

function adapterOptionRoots(adapter, roots) {
  const optionRoots = (adapter.optionRootSelectors || [])
    .flatMap((selector) => queryVisible(selector));

  return uniqueElements([...roots, ...optionRoots]);
}

async function selectVisibleQualityOption(preferredHeight, roots) {
  const options = qualityOptionRoots(roots).flatMap(qualityOptions);
  const selectedHeight = chooseHeight(options.map((entry) => entry.height), preferredHeight);
  const selected = options.find((entry) => entry.height === selectedHeight);

  if (!selected) {
    return { applied: false };
  }

  clickElement(selected.element);
  return { applied: true, site: "generic-menu", height: selectedHeight };
}

async function applyNestedQualityMenu(preferredHeight, roots, depth = 0, visited = new WeakSet()) {
  const optionResult = await selectVisibleQualityOption(preferredHeight, roots);
  if (optionResult.applied || depth >= 3) {
    return optionResult;
  }

  const submenuControls = qualitySubmenuControls(qualityOptionRoots(roots))
    .filter((control) => !visited.has(control));

  for (const control of submenuControls.slice(0, 8)) {
    visited.add(control);
    clickElement(control);
    await new Promise((resolve) => setTimeout(resolve, 180));

    const nestedResult = await applyNestedQualityMenu(preferredHeight, roots, depth + 1, visited);
    if (nestedResult.applied) {
      return {
        ...nestedResult,
        site: depth === 0 ? "generic-nested-menu" : nestedResult.site
      };
    }
  }

  return { applied: false };
}

async function applyPlayerAdapter(adapter, preferredHeight) {
  const roots = adapterRoots(adapter);
  if (!roots.length) {
    return { applied: false };
  }

  const selectResult = applyNativeSelect(preferredHeight, roots);
  if (selectResult.applied) {
    return { ...selectResult, site: `${adapter.name}-select` };
  }

  const controls = adapterControls(adapter, roots);
  for (const control of controls.slice(0, 8)) {
    clickElement(control);
    await new Promise((resolve) => setTimeout(resolve, 180));

    const menuResult = await applyNestedQualityMenu(preferredHeight, adapterOptionRoots(adapter, roots));
    if (menuResult.applied) {
      return { ...menuResult, site: adapter.name };
    }
  }

  return { applied: false };
}

async function applyKnownPlayerQuality(preferredHeight) {
  for (const adapter of PLAYER_ADAPTERS) {
    const result = await applyPlayerAdapter(adapter, preferredHeight);
    if (result.applied) {
      return result;
    }
  }

  return { applied: false };
}

async function applyGenericQuality(preferredHeight) {
  const roots = videoControlRoots();
  if (!roots.length) {
    return { applied: false, reason: "No visible video player found." };
  }

  const selectResult = applyNativeSelect(preferredHeight, roots);
  if (selectResult.applied) {
    return selectResult;
  }

  const knownPlayerResult = await applyKnownPlayerQuality(preferredHeight);
  if (knownPlayerResult.applied) {
    return knownPlayerResult;
  }

  const controls = roots.flatMap(candidateControls);
  for (const control of controls.slice(0, 6)) {
    clickElement(control);
    await new Promise((resolve) => setTimeout(resolve, 180));

    const menuResult = await applyNestedQualityMenu(preferredHeight, roots);
    if (menuResult.applied) {
      return menuResult;
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
  if (isIgnoredSite(settings)) {
    return { applied: false, ignored: true, reason: "This site is ignored." };
  }

  if (!settings.enabled || !document.querySelector("video")) {
    return { applied: false, reason: "Disabled or no video found." };
  }

  if (isYouTubeHost() && !isYouTubePlayerPage()) {
    return { applied: false, reason: "YouTube page does not have a playback player." };
  }

  const videos = visibleVideos();
  if (!videos.length) {
    return { applied: false, reason: "No visible video found." };
  }

  const signature = `${location.href}|${settings.preferredHeight}|${videos.length}|${videos.map((video) => video.currentSrc || video.src).join("|")}`;
  if (signature === lastAppliedSignature) {
    return { applied: false, reason: "Already applied for this video state." };
  }

  let result = { applied: false };
  if (isYouTubeHost()) {
    result = await applyYouTubeQuality(settings.preferredHeight);
  } else {
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
