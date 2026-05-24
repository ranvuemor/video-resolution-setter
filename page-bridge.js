(() => {
  const QUALITY_HEIGHTS = {
    highres: 4320,
    hd2880: 2880,
    hd2160: 2160,
    hd1440: 1440,
    hd1080: 1080,
    hd720: 720,
    large: 480,
    medium: 360,
    small: 240,
    tiny: 144,
    auto: 0
  };

  function chooseQuality(available, preferredHeight) {
    const ranked = available
      .map((quality) => ({
        quality,
        height: QUALITY_HEIGHTS[quality] ?? Number.parseInt(String(quality).match(/\d+/)?.[0] ?? "0", 10)
      }))
      .filter((entry) => entry.height > 0)
      .sort((a, b) => b.height - a.height);

    return ranked.find((entry) => entry.height <= preferredHeight) ?? ranked[ranked.length - 1] ?? null;
  }

  function applyYouTubeQuality(preferredHeight) {
    const player = document.querySelector("#movie_player");
    if (!player || typeof player.getAvailableQualityLevels !== "function") {
      return { applied: false, reason: "YouTube player API is not ready." };
    }

    const available = player.getAvailableQualityLevels();
    const selected = chooseQuality(available, preferredHeight);
    if (!selected) {
      return { applied: false, reason: "No fixed quality levels are available yet." };
    }

    if (typeof player.setPlaybackQualityRange === "function") {
      player.setPlaybackQualityRange(selected.quality, selected.quality);
    }

    if (typeof player.setPlaybackQuality === "function") {
      player.setPlaybackQuality(selected.quality);
    }

    return {
      applied: true,
      site: "youtube",
      quality: selected.quality,
      height: selected.height,
      available
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "VRS_APPLY_YOUTUBE") {
      return;
    }

    const result = applyYouTubeQuality(event.data.preferredHeight);
    window.postMessage({ type: "VRS_YOUTUBE_RESULT", requestId: event.data.requestId, result }, "*");
  });
})();
