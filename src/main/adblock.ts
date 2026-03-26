import { session, app, WebContents } from "electron";

const ad_script = `
(function() {
  if (window.__ytmAdBlockInjected) return;
  window.__ytmAdBlockInjected = true;

  function skipAd() {
    const player = document.querySelector('#movie_player');
    const isAd = player?.classList.contains('ad-showing') || player?.classList.contains('ad-interrupting');
    
    if (isAd) {
      const video = player.querySelector('video');
      if (video) {
        video.muted = true;
        video.playbackRate = 16;
        if (isFinite(video.duration)) video.currentTime = video.duration - 0.1;
      }
      
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button-modern, .ytp-ad-skip-button-modern');
      if (skipBtn) skipBtn.click();
    }

    const promos = [
      'ytmusic-mealbar-promo-renderer', 
      '#player-ads', 
      '#rendering-content.ytd-video-masthead-ad-v3-renderer'
    ];
    promos.forEach(s => {
      document.querySelectorAll(s).forEach(el => el.style.setProperty('display', 'none', 'important'));
    });
  }

  const originalFetch = window.fetch;
  window.fetch = function() {
    const url = typeof arguments[0] === 'string' ? arguments[0] : arguments[0].url;
    
    return originalFetch.apply(this, arguments).then(async (response) => {
      if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
        const data = await response.clone().json();
        
        if (data.adPlacements) data.adPlacements = [];
        if (data.adSlots) data.adSlots = [];
        if (data.playerAds) data.playerAds = [];
        if (data.adBreakHeartbeatParams) delete data.adBreakHeartbeatParams;

        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      return response;
    });
  };

  setInterval(skipAd, 500);
})();
`;

export function setupAdBlockerSession(): void {
  const partition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
  const ytmSession = session.fromPartition(partition);

  const filter = {
    urls: [
      "*://*.doubleclick.net/*",
      "*://googleads.g.doubleclick.net/*",
      "*://pagead2.googlesyndication.com/*",
      "*://www.youtube.com/api/stats/ads*",
      "*://music.youtube.com/youtubei/v1/log_event*"
    ]
  };

  ytmSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    callback({ cancel: true });
  });

  ytmSession.webRequest.onBeforeSendHeaders({ urls: ["*://music.youtube.com/youtubei/v1/player*"] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers["Sec-CH-UA"];
    callback({ requestHeaders: headers });
  });
}

export function setupAdBlockerView(webContents: WebContents): void {
  const inject = () => webContents.executeJavaScript(ad_script).catch(() => {});

  webContents.on("did-start-loading", inject);
  webContents.on("did-finish-load", inject);
  webContents.on("did-navigate-in-page", inject);
}
