// ===== 状態 =====

let activeDevices = [...DEFAULT_DEVICES];
let syncEnabled = true;
let currentUrl = '';
let activeCategories = new Set(['phone', 'tablet', 'desktop']);

const CATEGORY_LABELS = { phone: 'スマホ', tablet: 'タブレット', desktop: 'デスクトップ' };
const TOOLBAR_HEIGHT = 48;
const LABEL_HEIGHT = 34;
const GRID_PADDING = 16;
const PANE_BORDER = 2;

// ===== 初期化 =====

async function init() {
  const params = new URLSearchParams(location.search);
  currentUrl = params.get('url') || '';

  document.getElementById('url-input').value = currentUrl;

  await loadSavedDevices();
  renderDevices();
  setupEventListeners();
}

/** 保存済みアクティブデバイスを読み込み */
async function loadSavedDevices() {
  const stored = await chrome.storage.local.get('activeDevices');
  if (stored.activeDevices && stored.activeDevices.length > 0) {
    activeDevices = stored.activeDevices;
  }
}

/** アクティブデバイスを保存 */
async function saveActiveDevices() {
  await chrome.storage.local.set({ activeDevices });
}

// ===== コンテナ高さ計算 =====

/** iframeコンテナの利用可能高さを算出 */
function getContainerHeight() {
  return window.innerHeight - TOOLBAR_HEIGHT - GRID_PADDING * 2 - LABEL_HEIGHT - PANE_BORDER;
}

// ===== デバイスグリッド描画 =====

/** 全デバイスペインを描画 */
function renderDevices() {
  const grid = document.getElementById('viewport-grid');
  grid.innerHTML = '';

  activeDevices.forEach((device) => {
    grid.appendChild(createDevicePane(device));
  });
}

/** カテゴリフィルターを適用して表示/非表示を切り替え */
function applyCategoryFilter() {
  document.querySelectorAll('.device-pane').forEach((pane) => {
    const deviceId = pane.dataset.deviceId;
    const device = activeDevices.find((d) => d.id === deviceId);
    if (device) {
      pane.style.display = activeCategories.has(device.category) ? '' : 'none';
    }
  });
}

/**
 * 1つのデバイスペインを生成
 * iframeは実デバイス幅で1:1表示。高さは画面に収まる分だけ表示
 * @param {{ id: string, name: string, width: number, height: number, category: string }} device
 * @returns {HTMLElement}
 */
function createDevicePane(device) {
  const containerHeight = getContainerHeight();

  const pane = document.createElement('div');
  pane.className = 'device-pane';
  pane.dataset.deviceId = device.id;
  pane.style.width = device.width + 'px';

  // ラベル
  const label = document.createElement('div');
  label.className = 'device-label';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'device-name';
  nameSpan.textContent = device.name;
  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'device-size';
  sizeSpan.textContent = `${device.width} \u00D7 ${device.height}`;
  label.appendChild(nameSpan);
  label.appendChild(sizeSpan);

  // iframeコンテナ - 高さは画面に収まる分まで
  const container = document.createElement('div');
  container.className = 'iframe-container';
  container.style.width = device.width + 'px';
  container.style.height = containerHeight + 'px';

  // iframe - 実デバイスサイズで1:1表示（スケーリングなし）
  const iframe = document.createElement('iframe');
  iframe.style.width = device.width + 'px';
  iframe.style.height = device.height + 'px';
  iframe.dataset.deviceId = device.id;

  if (currentUrl && isLoadableUrl(currentUrl)) {
    iframe.src = currentUrl;
  }

  container.appendChild(iframe);
  pane.appendChild(label);
  pane.appendChild(container);

  return pane;
}

// ===== URL操作 =====

/** iframeに読み込み可能なURLか判定 */
function isLoadableUrl(url) {
  return /^https?:\/\//.test(url);
}

/** 全iframeを指定URLに遷移 */
function navigateAll(url) {
  currentUrl = url;
  if (!isLoadableUrl(url)) return;
  document.querySelectorAll('#viewport-grid iframe').forEach((iframe) => {
    iframe.src = url;
  });
}

// ===== スクロール同期 =====

/**
 * iframeからのスクロールメッセージを他のiframeに転送
 * @param {MessageEvent} event
 */
function handleScrollMessage(event) {
  if (!syncEnabled) return;
  if (event.data?.type !== 'multiviewer-scroll') return;
  if (!event.source) return;

  const iframes = document.querySelectorAll('#viewport-grid iframe');

  // 送信元が自拡張のiframeであることを検証
  const isFromOurIframe = Array.from(iframes).some(
    (iframe) => iframe.contentWindow === event.source
  );
  if (!isFromOurIframe) return;

  // 送信元以外のiframeにスクロール位置を転送
  for (const iframe of iframes) {
    if (iframe.contentWindow !== event.source) {
      iframe.contentWindow.postMessage({
        type: 'multiviewer-set-scroll',
        scrollPercent: event.data.scrollPercent,
      }, '*');
    }
  }
}

// ===== デバイス管理モーダル =====

function openDeviceModal() {
  renderModalDeviceLists();
  document.getElementById('device-modal').classList.remove('hidden');
}

function closeDeviceModal() {
  document.getElementById('device-modal').classList.add('hidden');
}

function renderModalDeviceLists() {
  const activeList = document.getElementById('active-devices-list');
  activeList.innerHTML = '';

  if (activeDevices.length === 0) {
    activeList.innerHTML = '<div class="empty-message">デバイスが選択されていません</div>';
  } else {
    activeDevices.forEach((device) => {
      activeList.appendChild(createDeviceListItem(device, 'remove'));
    });
  }

  const activeIds = new Set(activeDevices.map((d) => d.id));
  const available = ALL_DEVICES.filter((d) => !activeIds.has(d.id));

  const availableList = document.getElementById('available-devices-list');
  availableList.innerHTML = '';

  if (available.length === 0) {
    availableList.innerHTML = '<div class="empty-message">全デバイスが表示中です</div>';
  } else {
    available.forEach((device) => {
      availableList.appendChild(createDeviceListItem(device, 'add'));
    });
  }
}

function createDeviceListItem(device, action) {
  const item = document.createElement('div');
  item.className = 'device-list-item';

  const info = document.createElement('div');
  info.className = 'device-info';
  const badge = document.createElement('span');
  badge.className = `category-badge ${device.category}`;
  badge.textContent = CATEGORY_LABELS[device.category] || device.category;
  const nameEl = document.createElement('span');
  nameEl.textContent = device.name;
  const dims = document.createElement('span');
  dims.className = 'device-dims';
  dims.textContent = `${device.width} \u00D7 ${device.height}`;
  info.appendChild(badge);
  info.appendChild(nameEl);
  info.appendChild(dims);

  const btn = document.createElement('button');
  btn.className = action === 'remove' ? 'remove-btn' : 'add-btn';
  btn.textContent = action === 'remove' ? '削除' : '追加';
  btn.addEventListener('click', () => {
    const grid = document.getElementById('viewport-grid');
    if (action === 'remove') {
      const pane = grid.querySelector(`.device-pane[data-device-id="${CSS.escape(device.id)}"]`);
      if (pane) pane.remove();
      activeDevices = activeDevices.filter((d) => d.id !== device.id);
    } else {
      activeDevices.push(device);
      const pane = createDevicePane(device);
      if (!activeCategories.has(device.category)) pane.style.display = 'none';
      grid.appendChild(pane);
    }
    saveActiveDevices();
    renderModalDeviceLists();
  });

  item.appendChild(info);
  item.appendChild(btn);
  return item;
}

function addCustomDevice(name, width, height, category) {
  const id = 'custom-' + Date.now();
  const device = { id, name, width, height, category };

  EXTRA_DEVICES.push(device);
  ALL_DEVICES.push(device);
  activeDevices.push(device);

  chrome.storage.local.get('customDevices', (result) => {
    const customs = result.customDevices || [];
    customs.push(device);
    chrome.storage.local.set({ customDevices: customs });
  });

  saveActiveDevices();
  renderModalDeviceLists();
  document.getElementById('viewport-grid').appendChild(createDevicePane(device));
}

// ===== イベントリスナー =====

function setupEventListeners() {
  // URL
  document.getElementById('url-go').addEventListener('click', () => {
    navigateAll(document.getElementById('url-input').value);
  });

  document.getElementById('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateAll(e.target.value);
  });

  // スクロール同期
  document.getElementById('sync-toggle').addEventListener('change', (e) => {
    syncEnabled = e.target.checked;
  });

  window.addEventListener('message', handleScrollMessage);

  // カテゴリフィルター
  document.querySelectorAll('#category-filters input').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        activeCategories.add(e.target.value);
      } else {
        activeCategories.delete(e.target.value);
      }
      applyCategoryFilter();
    });
  });

  // デバイス管理モーダル
  document.getElementById('manage-devices-btn').addEventListener('click', openDeviceModal);
  document.getElementById('modal-close').addEventListener('click', closeDeviceModal);
  document.querySelector('.modal-backdrop').addEventListener('click', closeDeviceModal);

  // カスタムデバイス追加
  document.getElementById('custom-device-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('custom-name').value.trim();
    const width = parseInt(document.getElementById('custom-width').value, 10);
    const height = parseInt(document.getElementById('custom-height').value, 10);
    const category = document.getElementById('custom-category').value;

    if (name && Number.isFinite(width) && Number.isFinite(height)
        && width >= 200 && width <= 3840 && height >= 200 && height <= 3840) {
      addCustomDevice(name, width, height, category);
      e.target.reset();
    }
  });

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeviceModal();
  });

  // ウィンドウリサイズ時にコンテナ高さを更新
  window.addEventListener('resize', () => {
    const containerHeight = getContainerHeight();
    document.querySelectorAll('.iframe-container').forEach((container) => {
      container.style.height = containerHeight + 'px';
    });
  });
}

// ===== カスタムデバイスの復元 =====

async function restoreCustomDevices() {
  const stored = await chrome.storage.local.get('customDevices');
  if (stored.customDevices) {
    stored.customDevices.forEach((device) => {
      if (!ALL_DEVICES.find((d) => d.id === device.id)) {
        EXTRA_DEVICES.push(device);
        ALL_DEVICES.push(device);
      }
    });
  }
}

// ===== 起動 =====

restoreCustomDevices().then(() => init());
