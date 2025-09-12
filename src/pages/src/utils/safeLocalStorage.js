// Utility to safely persist 'properties' without exceeding localStorage quota.
// Strategy:
// 1) Try to save full data.
// 2) On QuotaExceeded, trim heavy fields (images -> first small url only, strip large data URIs, clamp metadataURI).
// 3) If still failing, save a minimal subset of fields needed by UI.

const KEY = 'properties';

function isLargeDataUrl(str) {
  return typeof str === 'string' && str.startsWith('data:') && str.length > 1024;
}

function keepSmallUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (isLargeDataUrl(url)) return '';
  return url;
}

function trimPropertyLight(p) {
  const q = { ...p };
  // Limit images to a single small, non-data URL
  if (Array.isArray(q.images) && q.images.length) {
    const first = keepSmallUrl(q.images[0]);
    q.images = first ? [first] : undefined;
  }
  // Ensure main image is not a huge data URL
  if (q.image) q.image = keepSmallUrl(q.image);
  // Cut very large inline metadata as it explodes storage size
  if (typeof q.metadataURI === 'string' && q.metadataURI.startsWith('data:') && q.metadataURI.length > 2048) {
    q.metadataURI = '';
    q.metadataTruncated = true;
  }
  return q;
}

function minimalProperty(p) {
  // Keep only the essential fields required by UI lists/cards
  const out = {
    id: p.id,
    title: p.title || '',
    address: p.address || '',
    totalShares: p.totalShares || 0,
    availableShares: p.availableShares || 0,
    sharePrice: p.sharePrice || 0,
    token: p.token || p.tokenAddress || '',
    tokenAddress: p.tokenAddress || p.token || '',
    active: p.active !== undefined ? p.active : true,
    rentalYield: p.rentalYield ?? undefined,
    annualReturn: p.annualReturn ?? undefined,
  };
  const img = keepSmallUrl(p.image);
  if (img) out.image = img;
  return out;
}

export function savePropertiesSafe(props) {
  const trySet = (arr) => {
    localStorage.setItem(KEY, JSON.stringify(arr));
  };
  try {
    trySet(props);
    return { saved: true, mode: 'full' };
  } catch (e1) {
    try {
      const light = props.map(trimPropertyLight);
      trySet(light);
      return { saved: true, mode: 'trimmed' };
    } catch (e2) {
      try {
        const minimal = props.map(minimalProperty);
        trySet(minimal);
        return { saved: true, mode: 'minimal' };
      } catch (e3) {
        try {
          const minimal = props.map(minimalProperty);
          const activeOnly = minimal.filter(p => !p.archivedLocal && (p.active === undefined || p.active));
          trySet(activeOnly);
          return { saved: true, mode: 'active-only' };
        } catch (e4) {
          return { saved: false, mode: 'fail', error: e4 };
        }
      }
    }
  }
}

export function getPropertiesSafe() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
