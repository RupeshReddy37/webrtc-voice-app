// src/App.jsx
// Verge (Audio or Video) - routing + fixed top-nav layout + footer.
//
// HashRouter is used deliberately: server.js is a static-only Socket.io
// server (express.static('public')) with no SPA fallback route, and it is
// not touched by this overhaul. Hash URLs (#/audio, #/video, #/chat) let
// every route work on refresh and deep-link without any server changes.
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import TopNavbar from './components/TopNavbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import AudioPage from './pages/AudioPage';
import VideoPage from './pages/VideoPage';
import ChatPage from './pages/ChatPage';

function Layout() {
  return (
    <div className="app-shell">
      <TopNavbar />
      <main className="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="audio" element={<AudioPage />} />
          <Route path="video" element={<VideoPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
