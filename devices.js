/** デフォルトで表示するデバイス（8台） */
const DEFAULT_DEVICES = [
  { id: 'galaxy-s26', name: 'Galaxy S26', width: 360, height: 773, category: 'phone' },
  { id: 'iphone-17', name: 'iPhone 17', width: 402, height: 874, category: 'phone' },
  { id: 'iphone-air', name: 'iPhone Air', width: 420, height: 912, category: 'phone' },
  { id: 'pixel-10-pro-xl', name: 'Pixel 10 Pro XL', width: 448, height: 997, category: 'phone' },
  { id: 'ipad-air-11', name: 'iPad Air 11"', width: 820, height: 1180, category: 'tablet' },
  { id: 'ipad-pro-13', name: 'iPad Pro 13"', width: 1032, height: 1376, category: 'tablet' },
  { id: 'laptop', name: 'Laptop', width: 1366, height: 768, category: 'desktop' },
  { id: 'desktop-fhd', name: 'Desktop FHD', width: 1920, height: 1080, category: 'desktop' },
];

/** 追加可能なデバイス */
const EXTRA_DEVICES = [
  { id: 'iphone-17e', name: 'iPhone 17e', width: 390, height: 844, category: 'phone' },
  { id: 'iphone-17-pro-max', name: 'iPhone 17 Pro Max', width: 440, height: 956, category: 'phone' },
  { id: 'pixel-10', name: 'Pixel 10', width: 360, height: 808, category: 'phone' },
  { id: 'pixel-10-pro', name: 'Pixel 10 Pro', width: 427, height: 952, category: 'phone' },
  { id: 'galaxy-s26-ultra', name: 'Galaxy S26 Ultra', width: 480, height: 1040, category: 'phone' },
  { id: 'ipad-mini-7', name: 'iPad mini 7th', width: 744, height: 1133, category: 'tablet' },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', width: 834, height: 1210, category: 'tablet' },
  { id: 'ipad-air-13', name: 'iPad Air 13"', width: 1024, height: 1366, category: 'tablet' },
  { id: 'laptop-hidpi', name: 'Laptop HiDPI', width: 1536, height: 864, category: 'desktop' },
];

/** 全デバイスリスト（検索用） */
const ALL_DEVICES = [...DEFAULT_DEVICES, ...EXTRA_DEVICES];
