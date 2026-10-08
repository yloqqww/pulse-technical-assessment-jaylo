"use client";

import { useEffect, useRef, useState } from "react";
import type { PeerSession } from "@/lib/webrtc";
import {
  formatBitrate,
  formatBytes,
  testIceConnectivity,
  type ConnectionDiagnostics,
  type IceReachabilityReport,
} from "@/lib/diagnostics.ts";
import type { IceServerConfig, IceServersResponse } from "@/lib/ice.ts";

interface ConnectionDiagnosticsModalProps {
  getPeerSession: () => PeerSession | null;
  hasActivePeer: boolean;
  iceConfig: IceServersResponse | null;
  forceRelay: boolean;
  onToggleForceRelay: (forceRelay: boolean) => void;
  onApplyCustomTurn: (config: IceServerConfig | null) => void;
  customTurnConfig: IceServerConfig | null;
  onClose: () => void;
}

type TabKey = "live" | "test" | "turn";

export default function ConnectionDiagnosticsModal({
  getPeerSession,
  hasActivePeer,
  iceConfig,
  forceRelay,
  onToggleForceRelay,
  onApplyCustomTurn,
  customTurnConfig,
  onClose,
}: ConnectionDiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("live");
  const [diagnostics, setDiagnostics] = useState<ConnectionDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);
  const [restartingIce, setRestartingIce] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  // ICE Tester state
  const [testingIce, setTestingIce] = useState(false);
  const [testReport, setTestReport] = useState<IceReachabilityReport | null>(null);

  // Custom TURN input state
  const [customUrl, setCustomUrl] = useState(
    Array.isArray(customTurnConfig?.urls)
      ? customTurnConfig.urls.join(", ")
      : customTurnConfig?.urls ?? "",
  );
  const [customUsername, setCustomUsername] = useState(
    customTurnConfig?.username ?? "",
  );
  const [customCredential, setCustomCredential] = useState(
    customTurnConfig?.credential ?? "",
  );
  const [customSavedMessage, setCustomSavedMessage] = useState<string | null>(null);

  const prevDiagnosticsRef = useRef<ConnectionDiagnostics | null>(null);

  // Poll peer connection stats while modal is open
  useEffect(() => {
    let cancelled = false;

    const pollStats = async () => {
      const session = getPeerSession();
      if (!session) {
        if (!cancelled) setDiagnostics(null);
        return;
      }
      try {
        const next = await session.getDiagnostics(prevDiagnosticsRef.current);
        if (!cancelled) {
          prevDiagnosticsRef.current = next;
          setDiagnostics(next);
        }
      } catch {
        // Peer may be closing
      }
    };

    void pollStats();
    const interval = window.setInterval(pollStats, 1_500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [getPeerSession]);

  // Handle escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleRunIceTest = async () => {
    setTestingIce(true);
    setTestReport(null);
    try {
      const activeServers = [
        ...(iceConfig?.iceServers ?? []),
        ...(customTurnConfig ? [customTurnConfig] : []),
      ];
      const report = await testIceConnectivity(activeServers, {
        forceRelay,
        timeoutMs: 8_000,
      });
      setTestReport(report);
    } catch (err) {
      console.error("ICE connectivity test failed:", err);
    } finally {
      setTestingIce(false);
    }
  };

  const handleForceIceRestart = () => {
    const session = getPeerSession();
    if (!session) return;
    setRestartingIce(true);
    const success = session.requestIceRestart();
    if (success) {
      setRestartMessage("ICE restart offer initiated");
      setTimeout(() => setRestartMessage(null), 3_000);
    } else {
      setRestartMessage("Connection is not in a restartable state");
      setTimeout(() => setRestartMessage(null), 3_000);
    }
    setRestartingIce(false);
  };

  const handleSaveCustomTurn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = customUrl.trim();
    if (!trimmedUrl) {
      onApplyCustomTurn(null);
      setCustomSavedMessage("Custom TURN cleared (using default servers).");
      setTimeout(() => setCustomSavedMessage(null), 3_000);
      return;
    }

    const urls = trimmedUrl.includes(",")
      ? trimmedUrl.split(",").map((u) => u.trim()).filter(Boolean)
      : trimmedUrl;

    const config: IceServerConfig = {
      urls,
      username: customUsername.trim() || undefined,
      credential: customCredential.trim() || undefined,
    };

    onApplyCustomTurn(config);
    setCustomSavedMessage("Custom TURN server saved & active.");
    setTimeout(() => setCustomSavedMessage(null), 3_000);
  };

  const handleClearCustomTurn = () => {
    setCustomUrl("");
    setCustomUsername("");
    setCustomCredential("");
    onApplyCustomTurn(null);
    setCustomSavedMessage("Custom TURN removed.");
    setTimeout(() => setCustomSavedMessage(null), 3_000);
  };

  const handleCopyReport = async () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      forceRelayEnabled: forceRelay,
      iceConfiguration: {
        serverCount: (iceConfig?.iceServers ?? []).length,
        turnConfigured: iceConfig?.turnConfigured ?? false,
        customTurnActive: Boolean(customTurnConfig),
        servers: iceConfig?.iceServers?.map((s) => ({
          urls: s.urls,
          hasCredentials: Boolean(s.username),
        })),
      },
      connectionDiagnostics: diagnostics
        ? {
            connectionState: diagnostics.connectionState,
            iceConnectionState: diagnostics.iceConnectionState,
            iceGatheringState: diagnostics.iceGatheringState,
            signalingState: diagnostics.signalingState,
            isRelayed: diagnostics.isRelayed,
            rttMs: diagnostics.rttMs,
            sendBitrateKbps: diagnostics.sendBitrateKbps,
            recvBitrateKbps: diagnostics.recvBitrateKbps,
            totalBytesSent: diagnostics.totalBytesSent,
            totalBytesReceived: diagnostics.totalBytesReceived,
            iceRestartCount: diagnostics.iceRestartCount,
            activePair: diagnostics.activePair
              ? {
                  state: diagnostics.activePair.state,
                  nominated: diagnostics.activePair.nominated,
                  currentRttMs: diagnostics.activePair.currentRttMs,
                  local: diagnostics.activePair.local
                    ? {
                        type: diagnostics.activePair.local.type,
                        protocol: diagnostics.activePair.local.protocol,
                        privacy: "IP Hidden",
                      }
                    : null,
                  remote: diagnostics.activePair.remote
                    ? {
                        type: diagnostics.activePair.remote.type,
                        protocol: diagnostics.activePair.remote.protocol,
                        privacy: "IP Hidden",
                      }
                    : null,
                }
              : null,
            media: diagnostics.media,
          }
        : null,
      iceReachabilityTest: testReport
        ? {
            ...testReport,
            gatheredCandidates: testReport.gatheredCandidates.map((c) => ({
              type: c.type,
              protocol: c.protocol,
              privacy: "IP Hidden",
              url: c.url,
            })),
          }
        : null,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(reportData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // ignore clipboard error
    }
  };

  const isRelayed = diagnostics?.isRelayed ?? false;
  const isDirect = diagnostics && !isRelayed && diagnostics.connectionState === "connected";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostics-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-180"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#090c0e]/95 text-zinc-100 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/8 p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#74e8bd]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                >
                  <path
                    d="M3 13.5h3l2.5-7 3 10 2.5-6h3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h2
                id="diagnostics-title"
                className="text-base font-semibold tracking-[-0.015em] text-white"
              >
                Connection & TURN Diagnostics
              </h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Real-time WebRTC telemetry, ICE traversal stats, and TURN relay verification.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close diagnostics"
            className="focus-ring pressable flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
            >
              <path
                d="M4 4l8 8m0-8l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Status Highlights Bar */}
        <div className="grid grid-cols-2 gap-2 border-b border-white/8 bg-white/[0.015] px-5 py-3 sm:grid-cols-4">
          {/* Connection State */}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              State
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              <span
                className={`h-2 w-2 rounded-full ${
                  diagnostics?.connectionState === "connected"
                    ? "bg-[#74e8bd] shadow-[0_0_8px_rgba(116,232,189,0.5)]"
                    : diagnostics?.connectionState === "connecting"
                      ? "bg-amber-300 animate-pulse"
                      : "bg-zinc-600"
                }`}
              />
              <span className="text-xs font-medium text-zinc-200 capitalize">
                {diagnostics?.connectionState ?? (hasActivePeer ? "connecting" : "idle")}
              </span>
            </div>
          </div>

          {/* Network Path */}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Traversal Path
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              {isRelayed ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  <span>🔄</span> TURN Relay
                </span>
              ) : isDirect ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <span>⚡</span> Direct P2P
                </span>
              ) : (
                <span className="text-xs text-zinc-500">No active pair</span>
              )}
            </div>
          </div>

          {/* RTT */}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Latency (RTT)
            </span>
            <div className="mt-0.5 text-xs font-semibold text-zinc-200">
              {diagnostics?.rttMs !== null && diagnostics?.rttMs !== undefined ? (
                <span
                  className={
                    diagnostics.rttMs < 80
                      ? "text-emerald-400"
                      : diagnostics.rttMs < 180
                        ? "text-amber-300"
                        : "text-red-400"
                  }
                >
                  {diagnostics.rttMs} ms
                </span>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </div>
          </div>

          {/* TURN Provisioning */}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              TURN Status
            </span>
            <div className="mt-0.5 text-xs font-medium">
              {iceConfig?.turnConfigured || customTurnConfig ? (
                <span className="text-[#74e8bd]">Provisioned</span>
              ) : (
                <span className="text-zinc-500">STUN Only</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/8 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`pressable relative border-b-2 pb-2.5 pt-1.5 text-xs font-medium transition-colors ${
              activeTab === "live"
                ? "border-[#74e8bd] text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Live Telemetry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("test")}
            className={`pressable relative ml-6 border-b-2 pb-2.5 pt-1.5 text-xs font-medium transition-colors ${
              activeTab === "test"
                ? "border-[#74e8bd] text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            ICE & TURN Reachability Check
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("turn")}
            className={`pressable relative ml-6 border-b-2 pb-2.5 pt-1.5 text-xs font-medium transition-colors ${
              activeTab === "turn"
                ? "border-[#74e8bd] text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            TURN Config & Privacy
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="chat-scroll flex-1 overflow-y-auto p-5 text-xs">
          {/* TAB 1: LIVE TELEMETRY */}
          {activeTab === "live" && (
            <div className="space-y-4">
              {diagnostics ? (
                <>
                  {/* Active Candidate Pair Card */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Selected Candidate Pair
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-[#74e8bd]/15 px-2 py-0.5 text-[10px] font-medium text-[#74e8bd]">
                        <span>🛡️</span> IP Address Protected
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Local Candidate */}
                      <div className="rounded-lg border border-white/6 bg-black/30 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase text-zinc-500">Local (You)</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-300">
                            {diagnostics.activePair?.local?.type ?? "unknown"}
                          </span>
                        </div>
                        <p className="mt-1.5 flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#74e8bd]" />
                          Anonymous Local Endpoint
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-500 uppercase">
                          Protocol: {diagnostics.activePair?.local?.protocol ?? "UDP"} · IP Redacted
                        </p>
                      </div>

                      {/* Remote Candidate */}
                      <div className="rounded-lg border border-white/6 bg-black/30 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase text-zinc-500">Remote (Peer)</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-300">
                            {diagnostics.activePair?.remote?.type ?? "unknown"}
                          </span>
                        </div>
                        <p className="mt-1.5 flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#74e8bd]" />
                          Anonymous Peer Endpoint
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-500 uppercase">
                          Protocol: {diagnostics.activePair?.remote?.protocol ?? "UDP"} · IP Redacted
                        </p>
                      </div>
                    </div>

                    {/* Relay explanation */}
                    <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.015] px-3 py-2 text-[11px] text-zinc-400">
                      {isRelayed ? (
                        <p>
                          <strong className="text-amber-300 font-semibold">Relayed through TURN:</strong> Both peers are communicating through an encrypted TURN relay server. Direct peer-to-peer UDP was blocked by symmetric NAT or a strict firewall, but TURN successfully bridged the path.
                        </p>
                      ) : (
                        <p>
                          <strong className="text-emerald-300 font-semibold">Direct P2P Connection:</strong> Traffic is flowing directly between peer endpoints discovered via STUN without relay overhead.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Network Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="text-[10px] uppercase text-zinc-500">RTT Latency</span>
                      <p className="mt-1 font-mono text-sm font-semibold text-zinc-200">
                        {diagnostics.rttMs !== null ? `${diagnostics.rttMs} ms` : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="text-[10px] uppercase text-zinc-500">Throughput (In / Out)</span>
                      <p className="mt-1 font-mono text-sm font-semibold text-zinc-200 truncate">
                        ↓ {formatBitrate(diagnostics.recvBitrateKbps)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-400 truncate">
                        ↑ {formatBitrate(diagnostics.sendBitrateKbps)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="text-[10px] uppercase text-zinc-500">Data Transferred</span>
                      <p className="mt-1 font-mono text-sm font-semibold text-zinc-200">
                        {formatBytes(diagnostics.totalBytesReceived + diagnostics.totalBytesSent)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        ↑ {formatBytes(diagnostics.totalBytesSent)} · ↓ {formatBytes(diagnostics.totalBytesReceived)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="text-[10px] uppercase text-zinc-500">ICE Restarts</span>
                      <p className="mt-1 font-mono text-sm font-semibold text-zinc-200">
                        {diagnostics.iceRestartCount}
                      </p>
                    </div>
                  </div>

                  {/* Media Stats (if active) */}
                  {(diagnostics.media.audio || diagnostics.media.video) && (
                    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Active Media Stream Stats
                      </span>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {diagnostics.media.audio && (
                          <div className="rounded-lg border border-white/6 bg-black/20 p-2.5">
                            <span className="text-[10px] uppercase text-zinc-500">Audio Track</span>
                            <p className="mt-1 text-xs text-zinc-200">
                              Codec: <strong className="font-mono">{diagnostics.media.audio.codec ?? "Opus"}</strong>
                            </p>
                            {diagnostics.media.audio.jitterMs !== undefined && (
                              <p className="text-[10px] text-zinc-400">
                                Jitter: {diagnostics.media.audio.jitterMs} ms · Lost: {diagnostics.media.audio.packetsLost ?? 0}
                              </p>
                            )}
                          </div>
                        )}
                        {diagnostics.media.video && (
                          <div className="rounded-lg border border-white/6 bg-black/20 p-2.5">
                            <span className="text-[10px] uppercase text-zinc-500">Video Track</span>
                            <p className="mt-1 text-xs text-zinc-200">
                              Codec: <strong className="font-mono">{diagnostics.media.video.codec ?? "VP8 / H.264"}</strong>
                            </p>
                            {diagnostics.media.video.width && (
                              <p className="text-[10px] text-zinc-400">
                                Resolution: {diagnostics.media.video.width}x{diagnostics.media.video.height} @ {Math.round(diagnostics.media.video.fps ?? 0)} fps
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Force ICE Restart Button */}
                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.015] p-3.5">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Trigger ICE Restart</p>
                      <p className="text-[10px] text-zinc-500">
                        Force peer renegotiation and candidate gathering to test reconnection without dropping session.
                      </p>
                      {restartMessage && (
                        <p className="mt-1 text-[11px] font-medium text-emerald-400">{restartMessage}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleForceIceRestart}
                      disabled={restartingIce}
                      className="focus-ring pressable shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                    >
                      Restart ICE
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-8 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-500">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M10 6v4m0 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="mt-3 text-sm font-medium text-zinc-300">
                    No active peer connection currently
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                    Connect with an anonymous stranger on the world map to stream live RTT latency, packet loss, and candidate pair telemetry.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("test")}
                    className="focus-ring pressable mt-4 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Run Pre-Call ICE & TURN Check →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ICE & TURN TESTER */}
          {activeTab === "test" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Pre-Call Network Traversal Test
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Probes your current local network adapters, STUN server reflexivity, and TURN relay allocation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunIceTest}
                    disabled={testingIce}
                    className="focus-ring pressable flex shrink-0 items-center gap-2 rounded-xl border border-[#74e8bd]/40 bg-[#74e8bd]/15 px-4 py-2 text-xs font-semibold text-[#74e8bd] hover:bg-[#74e8bd]/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testingIce ? (
                      <>
                        <span className="locating-spinner !h-3.5 !w-3.5 !border-[#74e8bd]/30 !border-t-[#74e8bd]" />
                        Gathering Candidates…
                      </>
                    ) : (
                      <>
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                          <path d="M3 8a5 5 0 1 0 10 0A5 5 0 0 0 3 8Zm5-2.5v5m-2.5-2.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                        Run Connectivity Test
                      </>
                    )}
                  </button>
                </div>

                {testReport && (
                  <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
                    {/* Test Results Banner */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {/* Host */}
                      <div className="flex items-center gap-3 rounded-lg border border-white/6 bg-black/25 p-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          testReport.hostAvailable
                            ? "border border-emerald-400/30 bg-emerald-400/20 text-emerald-300"
                            : "border border-red-400/30 bg-red-400/20 text-red-300"
                        }`}>
                          {testReport.hostAvailable ? "✓" : "✗"}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-zinc-200">Host (Interface)</p>
                          <p className="text-[10px] text-zinc-400">
                            {testReport.hostCandidates} candidates
                          </p>
                        </div>
                      </div>

                      {/* STUN */}
                      <div className="flex items-center gap-3 rounded-lg border border-white/6 bg-black/25 p-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          testReport.stunAvailable
                            ? "border border-emerald-400/30 bg-emerald-400/20 text-emerald-300"
                            : "border border-amber-400/30 bg-amber-400/20 text-amber-300"
                        }`}>
                          {testReport.stunAvailable ? "✓" : "!"}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-zinc-200">STUN (NAT Reflex)</p>
                          <p className="text-[10px] text-zinc-400">
                            {testReport.srflxCandidates} candidates
                          </p>
                        </div>
                      </div>

                      {/* TURN */}
                      <div className="flex items-center gap-3 rounded-lg border border-white/6 bg-black/25 p-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          testReport.turnAvailable
                            ? "border border-emerald-400/30 bg-emerald-400/20 text-emerald-300"
                            : "border border-zinc-700 bg-zinc-800 text-zinc-400"
                        }`}>
                          {testReport.turnAvailable ? "✓" : "—"}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-zinc-200">TURN (Relay)</p>
                          <p className="text-[10px] text-zinc-400">
                            {testReport.relayCandidates} candidates
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-zinc-300">
                      <p className="font-medium text-white">{testReport.summary}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Gathering completed in {testReport.durationMs} ms · {testReport.gatheredCandidates.length} total candidates discovered.
                      </p>
                    </div>

                    {/* Candidate table */}
                    {testReport.gatheredCandidates.length > 0 && (
                      <div className="mt-2 overflow-x-auto rounded-lg border border-white/6">
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead className="bg-white/[0.04] text-zinc-400">
                            <tr>
                              <th className="p-2">Type</th>
                              <th className="p-2">Protocol</th>
                              <th className="p-2">Privacy Status</th>
                              <th className="p-2">Server Route</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-zinc-300">
                            {testReport.gatheredCandidates.map((c, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.02]">
                                <td className="p-2 font-semibold">
                                  <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${
                                    c.type === "relay"
                                      ? "bg-amber-400/20 text-amber-300"
                                      : c.type === "srflx"
                                        ? "bg-emerald-400/20 text-emerald-300"
                                        : "bg-white/10 text-zinc-300"
                                  }`}>
                                    {c.type}
                                  </span>
                                </td>
                                <td className="p-2 uppercase">{c.protocol}</td>
                                <td className="p-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-300 font-sans">
                                    <span>🔒</span> IP Hidden
                                  </span>
                                </td>
                                <td className="p-2 text-zinc-500 truncate max-w-[140px]">
                                  {c.url ?? "Local interface"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TURN CONFIG & PRIVACY */}
          {activeTab === "turn" && (
            <div className="space-y-4">
              {/* Privacy / Force Relay Toggle */}
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between">
                  <div className="pr-4">
                    <span className="text-xs font-semibold text-white">
                      Force TURN Relay Mode (IP Privacy)
                    </span>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                      Restricts ICE candidates to <code className="text-[#74e8bd]">relay</code> only. Forces WebRTC media and data to route exclusively through TURN relays, completely preventing your private/public IP address from being exposed to the stranger.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={forceRelay}
                    onClick={() => onToggleForceRelay(!forceRelay)}
                    className={`focus-ring pressable relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-180 ease-in-out ${
                      forceRelay ? "bg-[#74e8bd]" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-180 ease-in-out ${
                        forceRelay ? "translate-x-5 !bg-black" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Active Server Configuration List */}
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Active ICE Servers ({iceConfig?.iceServers.length ?? 0})
                </span>
                <div className="mt-2.5 space-y-1.5 font-mono text-[11px]">
                  {iceConfig?.iceServers.map((server, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-black/25 px-3 py-2"
                    >
                      <span className="text-zinc-300 truncate">
                        {Array.isArray(server.urls) ? server.urls.join(", ") : server.urls}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {server.username ? "Authenticated" : "Public STUN"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom TURN Server Override */}
              <form
                onSubmit={handleSaveCustomTurn}
                className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Custom / Tester TURN Server
                  </span>
                  {customTurnConfig && (
                    <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      Custom Active
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Provide your own Coturn, Twilio, or Metered.ca TURN relay server to test connectivity.
                </p>

                <div className="mt-3 space-y-2.5">
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500">TURN URLs (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="turn:turn.example.com:3478?transport=udp, turns:turn.example.com:5349"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="focus-ring mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] uppercase text-zinc-500">Username</label>
                      <input
                        type="text"
                        placeholder="turn-user"
                        value={customUsername}
                        onChange={(e) => setCustomUsername(e.target.value)}
                        className="focus-ring mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-zinc-500">Credential / Password</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={customCredential}
                        onChange={(e) => setCustomCredential(e.target.value)}
                        className="focus-ring mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {customSavedMessage && (
                  <p className="mt-2 text-[11px] text-[#74e8bd]">{customSavedMessage}</p>
                )}

                <div className="mt-3 flex items-center justify-end gap-2">
                  {customTurnConfig && (
                    <button
                      type="button"
                      onClick={handleClearCustomTurn}
                      className="focus-ring pressable rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                    >
                      Clear Custom
                    </button>
                  )}
                  <button
                    type="submit"
                    className="focus-ring pressable rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Save & Use TURN
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/8 bg-white/[0.02] p-4">
          <button
            type="button"
            onClick={handleCopyReport}
            className="focus-ring pressable flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
          >
            {copied ? (
              <>
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-emerald-400" fill="none">
                  <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-emerald-400">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-zinc-400" fill="none">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>Copy Diagnostics JSON</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring pressable rounded-lg border border-white/10 bg-white/[0.08] px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/12"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
