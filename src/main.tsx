import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import './styles/global.css';

const assetBase = import.meta.env.BASE_URL;
document.documentElement.style.setProperty('--auth-mountain-dark-webp', `url("${assetBase}assets/auth/auth-ink-mountain-dark-v1.webp")`);
document.documentElement.style.setProperty('--auth-mountain-dark-png', `url("${assetBase}assets/auth/auth-ink-mountain-dark-v1.png")`);
document.documentElement.style.setProperty('--auth-login-background', `url("${assetBase}assets/auth/lushan-archive-login-bg-v2.webp")`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
