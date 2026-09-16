import React, { useEffect } from 'react';
import Layout from './Layout';
import { useNavigate } from 'react-router-dom';
import YouTubeVideos from './YouTubeVideos';
import { asset } from './utils/asset';

function App() {
  useEffect(() => { document.title = 'Black Bridge Mindset | Podcast'; }, []);
  const navigate = useNavigate();
  const handlePlatformClick = (e) => {
    e.preventDefault();
    navigate('/podcast/#bbm-platforms');
    setTimeout(() => {
      const el = document.getElementById('bbm-platforms');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };
  return (
    <Layout>
      <header className="bbm-hero" id="top">
        <div className="bbm-overlay">
          <div className="bbm-hero-hosts">
            <img className="bbm-avatar" src={asset('images/Lovett.png')} alt="Host Mike Lovett" decoding="async" width="92" height="92" />
            <img className="bbm-avatar" src={asset('images/CJ.jpg')} alt="Co-host Chris Johnson" decoding="async" width="92" height="92" />
            <img className="bbm-avatar" src={asset('images/Ken.png')} alt="Co-host Ken Peak" decoding="async" width="92" height="92" />
          </div>
          <h1 className="bbm-title">The Black Bridge Mindset</h1>
          <h2 className="bbm-subtitle">Where culture and entrepreneurship collide!</h2>
          <p className="bbm-intro">Welcome to The Black Bridge Mindset podcast, where culture, entrepreneurship, and business intersect to fuel inspiration. This podcast celebrates the power of diverse voices shaping the future of business.</p>
        </div>
      </header>
      <section className="bbm-section bbm-about">
        <h2>About the Podcast</h2>
        <p>
          From the small business dreamers to the big business disruptors, we’re here to uncover the challenges, triumphs, and transformative ideas that redefine success. Because when culture and ambition come together, the results are game-changing.<br /><br />
          Each episode we’ll delve deep into the challenges, triumphs, and transformative ideas that redefine success. Because when culture and ambition come together, the results are game-changing.<br /><br />
          So, whether you’re building a business, breaking barriers, or just looking for some serious inspiration, you’re in the right place.<br /><br />
          <strong>The Black Bridge Mindset: Where culture and entrepreneurship collide!</strong>
        </p>
        <div style={{textAlign: 'center', marginTop: '2rem'}}>
          <a href="/podcast/#bbm-platforms" className="bbm-scroll-btn" onClick={handlePlatformClick}>
            Listen on Your Favorite Platform
          </a>
        </div>
      </section>

      <section className="bbm-section bbm-youtube-home">
        <YouTubeVideos variant="row" limit={6} showChannelLink={false} controls="chevrons" />
      </section>
    </Layout>
  );
}

export default App;
