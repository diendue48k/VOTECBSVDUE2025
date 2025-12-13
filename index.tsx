import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// --- SECURITY: Chặn các phím tắt Developer Tools & Chuột phải ---
const enableSecurityRestrictions = () => {
  // 1. Chặn Click chuột phải (Context Menu)
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // 2. Chặn các phím tắt bàn phím
  document.addEventListener('keydown', (event) => {
    // Chặn F12
    if (event.key === 'F12' || event.keyCode === 123) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Chặn Ctrl + Shift + I, J, C (Inspect Element, Console)
    if (
      event.ctrlKey && 
      event.shiftKey && 
      ['I', 'J', 'C', 'i', 'j', 'c'].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Chặn Ctrl + U (View Source)
    if (event.ctrlKey && ['U', 'u'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  });
};

// Kích hoạt bảo mật ngay khi ứng dụng khởi chạy
enableSecurityRestrictions();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);