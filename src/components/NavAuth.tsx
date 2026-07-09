"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import AuthModal from "./AuthModal";

export default function NavAuth() {
  const { user, loading, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (loading) return <div className="w-20 h-7 bg-gray-800 rounded-full animate-pulse" />;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="text-sm bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold px-4 py-1.5 rounded-full transition-colors"
        >
          Sign In
        </button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  const initials = user.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={dropRef} className="relative">
      <button
        onClick={() => setShowDropdown((v) => !v)}
        className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-yellow-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </span>
        <span className="hidden sm:block max-w-32 truncate">{user.displayName}</span>
        <span className="text-gray-600 text-xs">▾</span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-2 w-52 z-50">
          <div className="px-3 py-2 border-b border-gray-800 mb-1">
            <div className="text-xs font-medium text-white truncate">{user.displayName}</div>
            <div className="text-xs text-gray-500 truncate">{user.email}</div>
          </div>
          <button
            onClick={() => { logout(); setShowDropdown(false); }}
            className="w-full text-left text-sm text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
