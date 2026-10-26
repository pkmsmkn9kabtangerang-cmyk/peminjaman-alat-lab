// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import App from './App';
import './index.css';
import { Analytics } from '@vercel/analytics/react';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Analytics />
    <App />
  </React.StrictMode>
);
