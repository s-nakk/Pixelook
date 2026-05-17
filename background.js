// プレビュータブIDの管理
const previewTabIds = new Set();

// ===== Service Worker起動時にセッションルールから復元 =====

async function restorePreviewTabIds() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    rules.forEach((rule) => {
      if (rule.condition?.tabIds) {
        rule.condition.tabIds.forEach((id) => previewTabIds.add(id));
      }
    });
  } catch (e) {
    console.warn('セッションルール復元失敗:', e);
  }
}

restorePreviewTabIds();

// ===== ヘッダー除去ルール管理 =====

/**
 * プレビュータブ用のヘッダー除去ルールを設定
 * @param {number} tabId - プレビュータブのID
 */
async function setupHeaderRules(tabId) {
  // 既存ルールがあれば先に削除（再クリック時のID重複防止）
  await removeHeaderRules(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            // declarativeNetRequestでは個別ディレクティブ(frame-ancestors)の
            // 書き換えができないため、CSPヘッダー全体を除去する
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: {
          resourceTypes: ['sub_frame'],
          tabIds: [tabId],
        },
      },
    ],
  });
}

/**
 * プレビュータブのヘッダー除去ルールを削除
 * @param {number} tabId - プレビュータブのID
 */
async function removeHeaderRules(tabId) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [tabId],
    });
  } catch (e) {
    console.warn('ルール削除失敗:', e);
  }
}

// ===== iframe注入スクリプト =====

/**
 * iframe内に注入する同期スクリプト
 * - スクロール同期（scrollPercentベース）
 * - URL変化検知（location.href ポーリング + popstate/hashchange）
 */
function pixelookInjectedScript() {
  // 多重注入を防止
  if (window.__pixelookInjected) return;
  window.__pixelookInjected = true;

  // ===== スクロール同期 =====

  let pendingFrame = false;
  let suppressUntil = 0;

  function getScrollRoot() {
    return document.scrollingElement || document.documentElement;
  }

  window.addEventListener('scroll', () => {
    // 自分が scrollTo された直後はイベントを無視（フィードバックループ防止）
    if (Date.now() < suppressUntil) return;
    if (pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(() => {
      pendingFrame = false;
      if (Date.now() < suppressUntil) return;
      const root = getScrollRoot();
      const max = root.scrollHeight - root.clientHeight;
      const scrollPercent = max > 0 ? root.scrollTop / max : 0;
      window.parent.postMessage({
        type: 'pixelook-scroll',
        scrollPercent,
      }, '*');
    });
  }, { passive: true });

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'pixelook-set-scroll') return;
    // scrollTo後のスクロールイベントを200ms間抑制
    suppressUntil = Date.now() + 200;
    const root = getScrollRoot();
    // overflow:hidden等で clientHeight > scrollHeight になり負値になるケースをクランプ
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = max * event.data.scrollPercent;
  });

  // ===== URL変化検知 =====

  let lastUrl = location.href;

  function reportUrl() {
    window.parent.postMessage({
      type: 'pixelook-url',
      url: lastUrl,
    }, '*');
  }

  function checkUrlChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    reportUrl();
  }

  // 初期URL報告（親のURLバー同期 & ループ抑制の基準値設定）
  reportUrl();

  // SPA pushState/replaceState はイベントが飛ばないので軽量ポーリング
  setInterval(checkUrlChanged, 200);
  window.addEventListener('popstate', checkUrlChanged);
  window.addEventListener('hashchange', checkUrlChanged);

  // ===== リンククリックの先取り（全ペイン同時遷移用） =====

  // 自前で遷移する前に親にURLを投げ、親が全iframeを同時にsrc=新URLに揃える
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = e.target.closest && e.target.closest('a');
    if (!anchor || !anchor.href) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.href.startsWith('javascript:')) return;

    e.preventDefault();
    window.parent.postMessage({
      type: 'pixelook-navigate',
      url: anchor.href,
    }, '*');
  }, true);
}

// ===== イベントリスナー =====

/**
 * アイコンクリック時にプレビュータブを開く
 */
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  const previewUrl = chrome.runtime.getURL('preview.html') + '?url=' + encodeURIComponent(url);

  const previewTab = await chrome.tabs.create({
    url: previewUrl,
    active: true,
  });

  previewTabIds.add(previewTab.id);
  await setupHeaderRules(previewTab.id);
});

/**
 * プレビュータブ閉鎖時のクリーンアップ
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (!previewTabIds.has(tabId)) return;
  previewTabIds.delete(tabId);
  await removeHeaderRules(tabId);
});

/**
 * プレビュータブからのメッセージ処理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'capture-tab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * iframe読み込み完了時に同期スクリプトを注入
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // メインフレームは無視、プレビュータブのサブフレームのみ対象
  if (details.frameId === 0) return;
  if (!previewTabIds.has(details.tabId)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      func: pixelookInjectedScript,
    });
  } catch (e) {
    // chrome://, edge://, Web Store等は注入不可（想定内）
    console.warn('同期スクリプト注入失敗:', details.url, e);
  }
});
