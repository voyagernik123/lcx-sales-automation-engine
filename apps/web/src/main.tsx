import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initGoogleAuthListener } from './lib/auth';
import './styles/globals.css';

initGoogleAuthListener();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
