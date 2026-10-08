"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { INTENT_DETAILS, type ConversationIntent } from "@/lib/intent";
import { LANGUAGE_DETAILS } from "@/lib/language";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

export default function WorldMap({
  peers,
  me,
  myIntent,
  onPeerClick,
  onFindMatch,
  canConnect,
  communityThanks,
  onOpenDiagnostics,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  myIntent: ConversationIntent;
  onPeerClick: (id: string) => void;
  onFindMatch: () => void;
  canConnect: boolean;
  communityThanks: number;
  onOpenDiagnostics?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        // Open centered on the user if we know where they are, else world view.
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        attributionControl: true,
        fadeDuration: 180,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        const label = document.createElement("span");
        label.className = "pulse-me-label";
        el.append(label);
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }

      const element = meMarkerRef.current.getElement();
      element.dataset.intent = myIntent;
      element.title = `You are here to ${INTENT_DETAILS[myIntent].label}`;
      const label = element.querySelector(".pulse-me-label");
      if (label) label.textContent = `You · ${INTENT_DETAILS[myIntent].label}`;
    })();

    return () => {
      cancelled = true;
    };
  }, [me, myIntent, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.style.background = dotColor(peer.id);
          el.type = "button";
          el.title = peer.busy ? "Currently in a conversation" : "Connect with this person";
          el.setAttribute("aria-label", peer.busy ? "Person is currently busy" : "Connect with this person");
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        marker.getElement().dataset.busy = String(peer.busy);
        marker.getElement().dataset.intent = peer.intent;
        marker.getElement().dataset.language = peer.language;
        marker.getElement().dataset.intentSymbol = INTENT_DETAILS[peer.intent].symbol;
        marker.getElement().style.opacity = peer.busy ? "0.42" : "1";
        marker.getElement().title = peer.busy
          ? `${INTENT_DETAILS[peer.intent].label} · Currently in a conversation`
          : `Connect · Here to ${INTENT_DETAILS[peer.intent].label}`;
        marker.getElement().setAttribute(
          "aria-label",
          peer.busy
            ? `${LANGUAGE_DETAILS[peer.language].nativeLabel} speaker here to ${INTENT_DETAILS[peer.intent].label} is currently busy`
            : `Connect with a ${LANGUAGE_DETAILS[peer.language].nativeLabel} speaker here to ${INTENT_DETAILS[peer.intent].label}`,
        );
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="pulse-map h-full w-full bg-[#0b0f11]" />
      <div className="map-vignette" aria-hidden="true" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="glass-panel max-w-md rounded-2xl p-5 text-sm leading-6 text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-5">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="map-chip flex h-10 items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold tracking-[-0.02em] text-white">
            <span className="h-2 w-2 rounded-full bg-[#74e8bd] shadow-[0_0_12px_rgba(116,232,189,0.65)]" aria-hidden="true" />
            Pulse
          </div>
          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              aria-label="Open Network & TURN Diagnostics"
              title="Network & TURN diagnostics"
              className="map-chip pressable flex h-10 items-center gap-2 rounded-xl px-3 text-[11px] font-medium text-zinc-300 hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#74e8bd]" fill="none">
                <path d="M2.5 10.5h2.5l2-5 2.5 8 2-4h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Network & TURN</span>
              <span className="sm:hidden">Diagnostics</span>
            </button>
          )}
          <a
            href="/moderator"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Moderator Station"
            title="Moderator station & safety control"
            className="map-chip pressable flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium text-zinc-400 hover:text-white"
          >
            <span className="text-xs">🛡️</span>
            <span className="hidden md:inline">Moderator</span>
          </a>
        </div>

        <div
          className="map-chip flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] text-zinc-400 sm:px-3.5 sm:text-[11px]"
          title="Anonymous appreciation shared today"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path d="M8 13.5S2.75 10.45 2.75 6.3A2.8 2.8 0 0 1 8 4.9a2.8 2.8 0 0 1 5.25 1.4C13.25 10.45 8 13.5 8 13.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold text-zinc-200">{communityThanks}</span>
          <span className="hidden sm:inline">thanks today</span>
          <span className="sm:hidden">thanks</span>
        </div>
      </div>

      <div
        aria-live="polite"
        className="map-chip absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs text-zinc-300 sm:bottom-5 sm:left-5"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#74e8bd] opacity-35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#74e8bd]" />
        </span>
        <span className="font-medium text-zinc-100">{peers.length}</span>
        <span className="text-zinc-500">online now</span>
      </div>

      <button
        type="button"
        onClick={onFindMatch}
        disabled={!canConnect}
        className="map-chip pressable focus-ring absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45 sm:bottom-5 sm:right-5"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 text-[#74e8bd]"
          fill="none"
        >
          <path
            d="M2.5 5.25h7m0 0L7.25 3m2.25 2.25L7.25 7.5M13.5 10.75h-7m0 0L8.75 8.5M6.5 10.75 8.75 13"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Find a match
      </button>
    </div>
  );
}
