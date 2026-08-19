import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import * as authService from './services/authService.js';

// Load Google Identity Services; call initAuth once script is ready
const gisScript = document.createElement('script');
gisScript.src = 'https://accounts.google.com/gsi/client';
gisScript.async = true;
gisScript.defer = true;
gisScript.onload = () => authService.initAuth();
document.head.appendChild(gisScript);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
