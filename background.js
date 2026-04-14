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

// ===== スクロール同期スクリプト注入 =====

/** iframe内に注入するスクロール同期スクリプト */
function scrollSyncScript() {
  // 多重注入を防止
  if (window.__multiviewerScrollSync) return;
  window.__multiviewerScrollSync = true;

  let syncCooldownUntil = 0;
  let scrollTimeout = null;

  window.addEventListener('scroll', () => {
    // クールダウン中はスクロールイベントを無視（フィードバックループ防止）
    if (Date.now() < syncCooldownUntil) return;
    if (scrollTimeout) return;

    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      if (Date.now() < syncCooldownUntil) return;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = scrollHeight > 0 ? window.scrollY / scrollHeight : 0;
      window.parent.postMessage({
        type: 'multiviewer-scroll',
        scrollPercent,
      }, '*');
    }, 50);
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'multiviewer-set-scroll') return;
    // scrollTo後のスクロールイベントを150ms間抑制
    syncCooldownUntil = Date.now() + 150;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, scrollHeight * event.data.scrollPercent);
  });
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
 * iframe読み込み完了時にスクロール同期スクリプトを注入
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // メインフレームは無視、プレビュータブのサブフレームのみ対象
  if (details.frameId === 0) return;
  if (!previewTabIds.has(details.tabId)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      func: scrollSyncScript,
    });
  } catch (e) {
    // chrome://, edge://, Web Store等は注入不可（想定内）
    console.warn('スクロール同期スクリプト注入失敗:', details.url, e);
  }
});
