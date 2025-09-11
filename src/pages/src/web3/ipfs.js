// Lightweight IPFS uploader using nft.storage (preferred) or web3.storage as fallback.
// Configure tokens via Vite env or localStorage:
// - nft.storage: VITE_NFT_STORAGE_TOKEN or localStorage NFT_STORAGE_TOKEN (preferred)
// - web3.storage: VITE_WEB3_STORAGE_TOKEN or localStorage WEB3_STORAGE_TOKEN (fallback)

const NFT_STORAGE_ENDPOINT = 'https://api.nft.storage/upload';
const WEB3_STORAGE_ENDPOINT = 'https://api.web3.storage/upload';

export function getWeb3StorageToken() {
  try {
    // Prefer Vite env, fallback to localStorage for quick testing
    return (import.meta?.env?.VITE_WEB3_STORAGE_TOKEN) || localStorage.getItem('WEB3_STORAGE_TOKEN') || null;
  } catch {
    return null;
  }
}

export function hasIPFSConfig() {
  return !!(getNftStorageToken() || getWeb3StorageToken());
}

export function getNftStorageToken() {
  try {
    return (import.meta?.env?.VITE_NFT_STORAGE_TOKEN) || localStorage.getItem('NFT_STORAGE_TOKEN') || null;
  } catch {
    return null;
  }
}

function dataURLtoFile(dataUrl, filename = 'image') {
  const arr = dataUrl.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

async function uploadBlob(blob) {
  const nftToken = getNftStorageToken();
  const web3Token = getWeb3StorageToken();
  const useNft = !!nftToken;
  const token = useNft ? nftToken : web3Token;
  if (!token) throw new Error('Missing IPFS token (set NFT_STORAGE_TOKEN or WEB3_STORAGE_TOKEN)');
  const endpoint = useNft ? NFT_STORAGE_ENDPOINT : WEB3_STORAGE_ENDPOINT;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status}`);
  const json = await res.json();
  // nft.storage returns { ok, value: { cid } }, web3.storage returns { cid }
  const cid = json?.cid || json?.value?.cid;
  if (!cid) throw new Error('IPFS upload missing CID');
  return `ipfs://${cid}`;
}

export async function uploadImageDataURLToIPFS(dataUrl) {
  const file = dataURLtoFile(dataUrl, 'image');
  return uploadBlob(file);
}

export async function uploadJSONToIPFS(obj, filename = 'metadata.json') {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  // Optionally wrap in a File to preserve a name
  const file = new File([blob], filename, { type: 'application/json' });
  return uploadBlob(file);
}

export function resolveIpfsUrlToHttp(uri) {
  if (typeof uri !== 'string') return uri;
  if (uri.startsWith('ipfs://')) {
    const path = uri.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  return uri;
}
