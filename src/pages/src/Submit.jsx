import React, { useEffect, useState } from 'react';
import AppHeader from './components/AppHeader';
import './Admin.css';
import { web3Client } from './web3/client';
import { hasIPFSConfig, uploadImageDataURLToIPFS, uploadJSONToIPFS } from './web3/ipfs';
import { compressMany } from './utils/image';
import { ethers } from 'ethers';
import { getPropertiesSafe, savePropertiesSafe } from './utils/safeLocalStorage';

const statusText = (s) => ({ 0: 'Pending', 1: 'Approved', 2: 'Rejected', 3: 'Finalized', 4: 'Removed' }[Number(s) || 0] || 'Pending');

export default function Submit() {
  const [user, setUser] = useState(null);
  const [acct, setAcct] = useState('');
  const [apps, setApps] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] });
  const [previews, setPreviews] = useState([]);
  const [ipfsProgress, setIpfsProgress] = useState({ current: 0, total: 0 });

  useEffect(() => { (async () => {
    try {
      const info = await web3Client.connect();
      setAcct(info.account); setUser({ address: info.account });
      try { const arr = await web3Client.getMyApplications(); setApps(arr); } catch {}
    } catch (e) { setMsg(e?.message || 'Connect wallet to submit'); }
  })(); }, []);

  const onImages = (e) => {
    const files = Array.from(e.target.files || []).slice(0,5);
    const reads = files.map(f => new Promise((res) => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.onerror = () => res(null); r.readAsDataURL(f); }));
    Promise.all(reads).then(urls => { const u = urls.filter(Boolean); setPreviews(u); setForm(f => ({ ...f, images: u })); });
  };

  const submit = async () => {
    setMsg('');
    const { title, address, rentalYield, annualReturn, totalShares, sharePrice, images } = form;
    if (!title || !address || rentalYield === '' || annualReturn === '' || totalShares === '' || sharePrice === '' || !images?.length) { setMsg('Fill all fields and upload at least 1 image.'); return; }
    const nShares = Number(totalShares); const priceEth = Number(sharePrice);
    if (!Number.isFinite(nShares) || nShares <= 0) { setMsg('Total shares must be > 0'); return; }
    if (!Number.isFinite(priceEth) || priceEth <= 0) { setMsg('Share price must be > 0'); return; }
    // Build metadata
    const meta = { name: title, title, address, image: images[0], images: images.slice(0,5), rentalYield: Number(rentalYield), annualReturn: Number(annualReturn), description: `${title} fractional property` };
    let metadataURI = '';
    try {
      if (hasIPFSConfig()) {
        const imgUris = []; setIpfsProgress({ current: 0, total: Math.min(images.length,5) });
        for (const dataUrl of images.slice(0,5)) { if (dataUrl?.startsWith('data:')) { imgUris.push(await uploadImageDataURLToIPFS(dataUrl)); setIpfsProgress(p => ({ current: Math.min(p.current+1, p.total), total: p.total })); } }
        const ipfsMeta = { ...meta, image: imgUris[0] || meta.image, images: imgUris.length ? imgUris : meta.images };
        metadataURI = await uploadJSONToIPFS(ipfsMeta);
      } else {
        const minimal = { name: meta.name, title: meta.title, address: meta.address, image: '', rentalYield: meta.rentalYield, annualReturn: meta.annualReturn, description: meta.description };
        const s = JSON.stringify(minimal); metadataURI = `data:application/json,${encodeURIComponent(s)}`;
      }
    } catch {
      const minimal = { name: meta.name, title: meta.title, address: meta.address, image: '', rentalYield: meta.rentalYield, annualReturn: meta.annualReturn, description: meta.description };
      metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(minimal))}`;
    }
    if ((metadataURI || '').startsWith('data:') && metadataURI.length > 8192) { setMsg('Metadata too large. Enable IPFS.'); return; }
    try {
      const { receipt, appId } = await web3Client.submitListingApplication({ title, addressText: address, rentalYield, annualReturn, totalShares: nShares, sharePriceEth: priceEth, images, metadataURI });
      setMsg(appId ? `Application #${appId} submitted.` : 'Application submitted.');
      // Store a local mapping of appId -> uploaded images for later finalize (in case IPFS is disabled)
      try {
        if (appId) {
          const key = 'appImages';
          const raw = localStorage.getItem(key);
          const map = raw ? JSON.parse(raw) : {};
          const thumbs = await compressMany((images || []).slice(0,5), { maxWidth: 800, quality: 0.7 });
          map[String(appId)] = thumbs;
          localStorage.setItem(key, JSON.stringify(map));
        }
      } catch {}
      const arr = await web3Client.getMyApplications(); setApps(arr);
      setForm({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] }); setPreviews([]); setIpfsProgress({ current: 0, total: 0 });
    } catch (e) {
      setMsg(e?.shortMessage || e?.reason || e?.message || 'Submit failed');
    }
  };

  const finalize = async (id) => {
    try {
      const { receipt, propertyId, token } = await web3Client.finalizeMyApplication(id);
      setMsg(propertyId !== undefined ? `Finalized to property #${propertyId}` : 'Finalized.');
      const arr = await web3Client.getMyApplications(); setApps(arr);
      // Best-effort: persist the user's uploaded previews into local cache for the new property
      try {
        if (propertyId !== undefined) {
          const current = getPropertiesSafe() || [];
          const idx = current.findIndex(p => Number(p.id) === Number(propertyId));
          const base = idx >= 0 ? current[idx] : { id: Number(propertyId) };
          // Prefer images saved at submit-time for this application if previews are empty
          let gallery = previews && previews.length ? previews.slice(0,5) : [];
          try {
            if (!gallery.length) {
              const key = 'appImages';
              const raw = localStorage.getItem(key);
              const map = raw ? JSON.parse(raw) : {};
              const byId = map[String(id)] || [];
              if (Array.isArray(byId) && byId.length) gallery = byId.slice(0,5);
            }
          } catch {}
          // Ensure we keep lightweight thumbnails in persistent map
          try {
            const thumbs = await compressMany(gallery, { maxWidth: 800, quality: 0.7 });
            const k = 'propertyImages';
            const raw2 = localStorage.getItem(k);
            const mp = raw2 ? JSON.parse(raw2) : {};
            if (thumbs.length) { mp[String(propertyId)] = thumbs; localStorage.setItem(k, JSON.stringify(mp)); }
          } catch {}
          const next = {
            ...base,
            id: Number(propertyId),
            title: form.title || base.title,
            address: form.address || base.address,
            image: (gallery && gallery[0]) || base.image,
            images: (gallery && gallery.length ? gallery : base.images),
            rentalYield: (form.rentalYield !== '' ? Number(form.rentalYield) : base.rentalYield),
            annualReturn: (form.annualReturn !== '' ? Number(form.annualReturn) : base.annualReturn)
          };
          const updated = idx >= 0 ? [...current.slice(0, idx), next, ...current.slice(idx + 1)] : [...current, next];
          savePropertiesSafe(updated);
          // Also store a lightweight propertyId -> images map to avoid localStorage trimming
          try {
            const k = 'propertyImages';
            const raw = localStorage.getItem(k);
            const map = raw ? JSON.parse(raw) : {};
            const galleryToSave = Array.isArray(next.images) ? next.images.slice(0,5) : (next.image ? [next.image] : []);
            if (galleryToSave.length) {
              map[String(propertyId)] = galleryToSave;
              localStorage.setItem(k, JSON.stringify(map));
            }
          } catch {}
          // Cleanup stored app images for this id
          try {
            const key = 'appImages';
            const raw = localStorage.getItem(key);
            const map = raw ? JSON.parse(raw) : {};
            if (map[String(id)]) { delete map[String(id)]; localStorage.setItem(key, JSON.stringify(map)); }
          } catch {}
        }
      } catch {}
    } catch (e) {
      setMsg(e?.shortMessage || e?.reason || e?.message || 'Finalize failed');
    }
  };

  return (
    <div className="admin-root">
      <AppHeader user={user} />
      <main>
        <div className="container">
          <div className="admin-container">
            <div className="card" style={{ paddingTop: 12 }}>
              <div className="admin-title" style={{ marginTop: 0, marginBottom: 12 }}>Submit Property Listing</div>
              <div className="small" style={{ marginBottom: 12, color: '#374151' }}>
                Provide details and 1–5 images. Your request will be reviewed by an admin. If approved,
                you'll finalize on-chain to mint your property tokens and have it listed.
              </div>
              <input placeholder="Property name (e.g. Damansara Villa)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <input placeholder="Address (e.g. No. 12, Jalan Damansara, 47800 Petaling Jaya, Selangor)" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              <input placeholder="Rental Yield (%)" type="number" step="0.01" value={form.rentalYield} onChange={e => setForm(f => ({ ...f, rentalYield: e.target.value }))} />
              <input placeholder="Projected Annual Return (%)" type="number" step="0.01" value={form.annualReturn} onChange={e => setForm(f => ({ ...f, annualReturn: e.target.value }))} />
              <input placeholder="Total shares (e.g. 10000)" type="number" min="1" value={form.totalShares} onChange={e => setForm(f => ({ ...f, totalShares: e.target.value }))} />
              <input placeholder="Price per share (ETH)" type="number" step="0.0001" value={form.sharePrice} onChange={e => setForm(f => ({ ...f, sharePrice: e.target.value }))} />
              <label htmlFor="imgs">Property Images (1–5). First image will be the thumbnail. {hasIPFSConfig() ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>IPFS enabled</span>
              ) : (
                <span className="small" style={{ color: '#6b7280' }}>inline metadata (only thumbnail saved). Set VITE_WEB3_STORAGE_TOKEN to enable full gallery via IPFS.</span>
              )}</label>
              <input id="imgs" type="file" accept="image/*" multiple onChange={onImages} />
              {previews?.length ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {previews.map((u, i) => (
                    <img key={`pv-${i}`} src={u} alt={`preview ${i+1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  ))}
                </div>
              ) : null}
              {ipfsProgress.total > 0 && (
                <div className="small">Uploading: {ipfsProgress.current}/{ipfsProgress.total}</div>
              )}
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={submit}>Submit for review</button>
              <div className="small" style={{ color: '#444', marginTop: 6 }}>{msg}</div>
            </div>

            <div className="card">
              <h3>My Applications</h3>
              {apps.length === 0 ? (
                <div>No applications yet.</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th><th>Status</th><th>Title</th><th>Shares</th><th>Price (ETH)</th><th>Note</th><th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((a, idx) => (
                        <tr key={`app-${idx}`}>
                          <td>{idx+1}</td>
                          <td>{statusText(a.status)}</td>
                          <td>{a.name?.replace(/ Shares$/,'')}</td>
                          <td>{a.totalShares}</td>
                          <td>{a.sharePrice}</td>
                          <td>{a.reviewNote}</td>
                          <td>
                            {Number(a.status) === 1 && (
                              <button className="btn btn-primary" onClick={() => finalize(a.id || (idx+1))}>Finalize</button>
                            )}
                            {Number(a.status) === 3 && a.propertyId ? (
                              <span>Property #{a.propertyId}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
