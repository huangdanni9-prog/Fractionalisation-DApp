import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Home.css';
import AppHeader from './components/AppHeader';

const propertyImages = [
  'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1505691723518-41cb85eea23e?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1519985176271-adb1088fa94c?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1523217582562-09d0def993a6?auto=format&fit=crop&w=400&q=80',
];

// Header replaced by shared AppHeader

function Hero() {
  return (
    <section className="hero">
      <div className="hero-text">
        <h1>The Future of Real Estate Investing</h1>
        <p>Buy and sell property shares as easily as stocks. Diversify across 100+ properties in 30+ markets starting at just $50. Enjoy instant liquidity and daily rental income.</p>
      </div>
      <div className="hero-images">
        {propertyImages.map((src, i) => (
          <img key={i} src={src} alt={`Property ${i + 1}`} className="hero-img" />
        ))}
      </div>
    </section>
  );
}

function TopProperties() {
  const [properties, setProperties] = useState([]);

  useEffect(() => {
  const props = JSON.parse(localStorage.getItem('properties') || '[]') || [];
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  // Exclude locally archived, globally archived, and inactive items if active flag exists
  const active = props.filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.active === undefined || p.active));
  if (active.length === 0) return setProperties([]);
  const sorted = [...active].sort((a, b) => (Number(b.rentalYield || 0) + Number(b.annualReturn || 0)) - (Number(a.rentalYield || 0) + Number(a.annualReturn || 0)));
  setProperties(sorted.slice(0, 3));
  }, []);

  if (!properties.length) {
    return <div className="top-properties-empty">Properties coming soon.</div>;
  }

  return (
    <div className="top-properties">
      {properties.map((p, i) => (
  <Link to={`/property/${p.id}`} className="product-card" key={i}>
          <img src={p.image} alt={p.title} className="product-img" />
          <div className="product-info">
            <div>
              <div className="product-title">{p.title}</div>
              <div className="product-address">{p.address}</div>
            </div>
            <div className="product-stats">
              <div className="product-yield">{p.rentalYield}% <span>Rental Yield</span></div>
              <div className="product-return">{p.annualReturn}% <span>Annual Return</span></div>
            </div>
          </div>
          <div className="product-availability">Available: {p.availableShares} shares at {p.sharePrice} ETH</div>
  </Link>
      ))}
    </div>
  );
}

function Features() {
  return (
    <section className="features">
      <h2>Why Fractional Real Estate?</h2>
      <p>Unlock new ways to invest, earn, and diversify with our platform. No experience required.</p>
      <div className="features-list">
        <div className="feature-card">
          <div className="feature-icon">{/* SVG 1 */}
            <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e3e6fd"/><rect x="20" y="28" width="24" height="16" rx="4" fill="#4636e3"/><rect x="28" y="36" width="8" height="4" rx="2" fill="#fff"/></svg>
          </div>
          <div>
            <div className="feature-title">No Large Down Payment</div>
            <div className="feature-desc">Start investing in rental properties with small amounts and own fractions instantly.</div>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">{/* SVG 2 */}
            <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e3e6fd"/><path d="M20 36h24v4a4 4 0 01-4 4H24a4 4 0 01-4-4v-4z" fill="#4636e3"/><rect x="28" y="32" width="8" height="8" rx="2" fill="#fff"/></svg>
          </div>
          <div>
            <div className="feature-title">Earn Daily Rental Income</div>
            <div className="feature-desc">Receive rental payouts and property appreciation directly to your account.</div>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">{/* SVG 3 */}
            <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e3e6fd"/><rect x="18" y="28" width="28" height="12" rx="6" fill="#4636e3"/><rect x="26" y="34" width="12" height="4" rx="2" fill="#fff"/></svg>
          </div>
          <div>
            <div className="feature-title">Diversify Easily</div>
            <div className="feature-desc">Own shares in multiple properties and spread your risk, all in one platform.</div>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">{/* SVG 4 */}
            <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e3e6fd"/><rect x="24" y="24" width="16" height="16" rx="8" fill="#4636e3"/><rect x="30" y="32" width="4" height="8" rx="2" fill="#fff"/></svg>
          </div>
          <div>
            <div className="feature-title">Full Control & Flexibility</div>
            <div className="feature-desc">Buy, sell, or reinvest your shares anytime. No lock-in periods or hidden fees.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>&copy; 2025 RealEstate dApp. All rights reserved.</div>
    </footer>
  );
}

export default function Home() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    setUser(userStr ? JSON.parse(userStr) : null);
  }, []);
  return (
    <div className="home-root">
  <AppHeader user={user} />
      <Hero />
      <main className="main">
        <h1>Welcome to Real Estate Fractionalization dApp</h1>
        <p>Invest in real estate with fractional ownership, trade shares, and earn dividends.</p>
        <section style={{ marginTop: 40 }}>
          <TopProperties />
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <Link to="/marketplace" className="btn view-properties">View Properties</Link>
          </div>
        </section>
        <Features />
      </main>
      <Footer />
    </div>
  );
}
