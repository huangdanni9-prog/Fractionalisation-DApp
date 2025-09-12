import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import AppHeader from './components/AppHeader';
import Carousel from './components/Carousel';
import { getPropertiesSafe } from './utils/safeLocalStorage';

// 9 fixed real-estate photos with two backups each (multi-fallback)
const propertyImages = [
  [
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505691723518-41cb85eea23e?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1521783988139-893ce2d60a1b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1470309864661-68328b2cd0a5?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505691723518-41cb85eea23e?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1501183638710-841dd1904471?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1502673530728-f79b4cab31b1?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1560185127-6ed189bf05b0?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80'
  ],
  [
    'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80'
  ],
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
        {propertyImages.map((imgSet, i) => (
          <img
            key={i}
            src={imgSet[0]}
            alt={`Property ${i + 1}`}
            className="hero-img"
            referrerPolicy="no-referrer"
            loading="lazy"
            data-attempt="0"
            onError={(e) => {
              const attempt = Number(e.currentTarget.getAttribute('data-attempt') || '0');
              const next = imgSet[attempt + 1];
              if (next) {
                e.currentTarget.setAttribute('data-attempt', String(attempt + 1));
                e.currentTarget.src = next;
              } else {
                e.currentTarget.src = 'https://placehold.co/400x300?text=Property';
              }
            }}
          />
        ))}
      </div>
    </section>
  );
}

function TopProperties() {
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    const props = getPropertiesSafe();
    const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    // Exclude locally archived, globally archived, and inactive items if active flag exists
    const active = props.filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.active === undefined || p.active));
    if (active.length === 0) return setProperties([]);
    const sorted = [...active].sort((a, b) => (Number(b.rentalYield || 0) + Number(b.annualReturn || 0)) - (Number(a.rentalYield || 0) + Number(a.annualReturn || 0)));
    setProperties(sorted);
  }, []);

  if (!properties.length) {
    return <div className="top-properties-empty">Properties coming soon.</div>;
  }

  const items = properties.map((p) => (
    <Link to={`/property/${p.id}`} className="product-card" key={p.id}>
      <img
        src={p.image || 'https://placehold.co/600x400?text=Property'}
        alt={p.title || 'Property'}
        className="product-img"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x400?text=Property'; }}
      />
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
  ));

  return (
    <div className="top-properties">
      <h2 className="section-title center">Featured Properties</h2>
      <p className="section-subtitle center">Handpicked listings with attractive yields and steady income</p>
      <Carousel
        items={items}
        autoPlay={true}
        interval={3000}
        breakpoints={[ { width: 0, slides: 1 }, { width: 768, slides: 2 }, { width: 1024, slides: 3 } ]}
      />
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
