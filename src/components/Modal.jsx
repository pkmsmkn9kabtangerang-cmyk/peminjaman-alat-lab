// src/components/Modal.jsx
// Komponen Modal dialog

import { useEffect } from 'react';
import { IconX } from '@tabler/icons-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-surface w-full ${maxWidth} rounded-2xl shadow-xl border border-main flex flex-col max-h-[90vh] animate-fadeIn`}>
        <div className="flex items-center justify-between p-4 border-b border-main">
          <h3 className="font-bold text-main">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <IconX size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
