"use client";

import { useState, useRef, useEffect } from "react";
import { autocomplete, type GeocodingResult } from "@/lib/geocoding";
import type { LatLng } from "@/lib/types";

interface Props {
  label: string;
  placeholder?: string;
  value: string;
  coords: LatLng | null;
  onChange: (value: string, coords?: LatLng) => void;
  onLocate?: () => void;
  onPin?: () => void;
  pinActive?: boolean;
}

export default function AddressInput({ label, placeholder, value, coords, onChange, onLocate, onPin, pinActive }: Props) {
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(text: string) {
    onChange(text, undefined);
    setOpen(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await autocomplete(text);
      setSuggestions(results);
      setOpen(results.length > 0);
      setLoading(false);
    }, 350);
  }

  function handleSelect(e: React.MouseEvent, r: GeocodingResult) {
    e.preventDefault();
    onChange(r.label, { lat: r.lat, lng: r.lng });
    setSuggestions([]);
    setOpen(false);
  }

  const isValidated = !!coords;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className={`w-full border rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 transition-colors ${
              isValidated
                ? "border-green-400 bg-green-50 focus:ring-green-400"
                : "border-gray-300 focus:ring-blue-500"
            }`}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {loading && (
              <svg className="animate-spin w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {!loading && isValidated && (
              <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        {onLocate && (
          <button
            type="button"
            onClick={onLocate}
            title="Ma position GPS"
            className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-blue-50 border border-gray-300 text-gray-600 hover:text-blue-600 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </button>
        )}

        {onPin && (
          <button
            type="button"
            onClick={onPin}
            title="Placer sur la carte"
            className={`px-3 py-2 rounded-lg border transition-colors shrink-0 ${
              pinActive
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-gray-100 hover:bg-blue-50 border-gray-300 text-gray-600 hover:text-blue-600"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
            </svg>
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={(e) => handleSelect(e, s)}
              className="flex items-start gap-2 px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              </svg>
              <span className="text-gray-700">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
