
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
import Marketplace from './Marketplace';
import AboutUs from './AboutUs';
import Submit from './Submit';
import Login from './Login';
import Register from './Register';
import Profile from './Profile';
import Admin from './Admin';
import PropertyDetail from './PropertyDetail';
import SystemStatus from './SystemStatus';
import OwnerGate from './components/OwnerGate';

function App() {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/property/:id" element={<PropertyDetail />} />
          <Route path="/status" element={<SystemStatus />} />
          <Route path="/about_us" element={<AboutUs />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<OwnerGate><Admin /></OwnerGate>} />
          <Route path="/submit" element={<Submit />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
