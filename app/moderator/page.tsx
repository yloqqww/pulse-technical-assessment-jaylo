"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Stats {
  totalActiveSessions: number;
  totalActiveConnections: number;
  totalPendingReports: number;
  totalQuarantined: number;
  communityReactions: number;
}

interface ActiveSession {
  id: string;
  intent: string;
  language: string;
  busy: boolean;
  lastSeen: string;
}

interface ActiveConnection {
  id: string;
  initiatorId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  connectedAt: string | null;
}

interface EnrichedReport {
  id: string;
  reporterSessionId: string;
  reportedSessionId: string;
  reason: string;
  status: string;
  actionTaken: string | null;
  reviewedAt: string | null;
  createdAt: string;
  hadDirectConnection: boolean;
}

interface AbuseRecord {
  id: string;
  targetHash: string;
  action: string;
  count: number;
  strikes: number;
  blockedUntil: string | null;
  updatedAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

type Tab = "reports" | "sessions" | "abuse" | "audit";

export default function ModeratorDashboard() {
  const [moderatorKey, setModeratorKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("pulse_moderator_key") ?? "";
    }
    return "";
  });
  const [keyInput, setKeyInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("reports");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [connections, setConnections] = useState<ActiveConnection[]>([]);
  const [abuseRecords, setAbuseRecords] = useState<AbuseRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchData = useCallback(
    async (keyToUse: string) => {
      if (!keyToUse) return;
      try {
        const res = await fetch("/api/moderator", {
          headers: { "x-moderator-key": keyToUse },
        });

        if (res.status === 401) {
          setAuthenticated(false);
          setError("Invalid Moderator Access Key");
          return;
        }

        if (!res.ok) {
          setError(`Server error: ${res.statusText}`);
          return;
        }

        const data = await res.json();
        setStats(data.stats);
        setReports(data.reports);
        setSessions(data.activeSessions);
        setConnections(data.activeConnections);
        setAbuseRecords(data.abuseRecords);
        setAuditLogs(data.auditLogs);
        setAuthenticated(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load moderator data");
      }
    },
    [],
  );

  useEffect(() => {
    if (!moderatorKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/moderator", {
          headers: { "x-moderator-key": moderatorKey },
        });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthenticated(false);
          setError("Invalid Moderator Access Key");
          return;
        }
        if (!res.ok) {
          setError(`Server error: ${res.statusText}`);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setStats(data.stats);
        setReports(data.reports);
        setSessions(data.activeSessions);
        setConnections(data.activeConnections);
        setAbuseRecords(data.abuseRecords);
        setAuditLogs(data.auditLogs);
        setAuthenticated(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load moderator data");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moderatorKey]);

  useEffect(() => {
    if (!authenticated || !autoRefresh || !moderatorKey) return;
    const interval = setInterval(() => {
      void fetchData(moderatorKey);
    }, 8000);
    return () => clearInterval(interval);
  }, [authenticated, autoRefresh, moderatorKey, fetchData]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    const key = keyInput.trim();
    setLoading(true);
    sessionStorage.setItem("pulse_moderator_key", key);
    setModeratorKey(key);
    await fetchData(key);
    setLoading(false);
  };


  const handleLogout = () => {
    sessionStorage.removeItem("pulse_moderator_key");
    setModeratorKey("");
    setAuthenticated(false);
    setKeyInput("");
  };

  const handleAction = async (action: string, targetId: string, reason?: string) => {
    try {
      setActionInProgress(targetId);
      const res = await fetch("/api/moderator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moderator-key": moderatorKey,
        },
        body: JSON.stringify({ action, targetId, reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Action failed");
        return;
      }

      await fetchData(moderatorKey);
    } catch {
      alert("Network error performing action");
    } finally {
      setActionInProgress(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b12] px-4 font-sans text-neutral-200">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d131f]/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-wide text-white">
              Pulse Trust & Safety
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Moderator Dashboard & Abuse Control
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="moderator-key"
                className="block text-xs font-medium uppercase tracking-wider text-neutral-400"
              >
                Access Key
              </label>
              <input
                id="moderator-key"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter moderator secret key..."
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-neutral-900/80 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/60"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-600/20 transition hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Sign In to Dashboard"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-4 text-center">
            <Link
              href="/"
              className="text-xs text-neutral-400 transition hover:text-white"
            >
              ← Back to World Map
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b12] font-sans text-neutral-200">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0c121e]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
            <h1 className="text-base font-semibold tracking-wide text-white">
              Pulse Moderation Station
            </h1>
            <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
              Live SafeZone
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                autoRefresh
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-neutral-400"
              }`}
            >
              {autoRefresh ? "● Auto-refresh (8s)" : "Paused"}
            </button>
            <button
              onClick={() => void fetchData(moderatorKey)}
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh Now"}
            </button>
            <Link
              href="/"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 hover:bg-white/10"
            >
              Map
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Metric Overview Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                Active Sessions
              </span>
              <p className="mt-1 text-2xl font-bold text-cyan-400">
                {stats.totalActiveSessions}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                Connected Pairs
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-400">
                {stats.totalActiveConnections}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                Pending Reports
              </span>
              <p className="mt-1 text-2xl font-bold text-amber-400">
                {stats.totalPendingReports}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                Quarantined Clients
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-400">
                {stats.totalQuarantined}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                Community Thanks
              </span>
              <p className="mt-1 text-2xl font-bold text-purple-400">
                {stats.communityReactions}
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-white/10">
          <button
            onClick={() => setActiveTab("reports")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === "reports"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            🚨 Safety Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === "sessions"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            👥 Sessions & Connections ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab("abuse")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === "abuse"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            🛡️ Distributed Abuse Shield ({abuseRecords.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === "audit"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            📋 Audit Log ({auditLogs.length})
          </button>
        </div>

        {/* Privacy Assurance Banner */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
          <span className="flex items-center gap-2">
            <span>🛡️</span>
            <span>
              <strong>Zero IP Exposure Policy:</strong> All participant identifiers are
              cryptographically tokenized or hashed. Raw IP addresses are never exposed or
              logged.
            </span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-cyan-400/80">
            Privacy First Architecture
          </span>
        </div>

        {/* TAB 1: REPORTS */}
        {activeTab === "reports" && (
          <div className="mt-4 space-y-3">
            {reports.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-[#0d1422] p-8 text-center text-xs text-neutral-500">
                No safety reports on file. The community is peaceful!
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-xl border border-white/10 bg-[#0d1422] p-4 transition hover:border-white/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                        {report.reason}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] ${
                          report.status === "pending"
                            ? "bg-amber-500/20 text-amber-300"
                            : report.status === "actioned"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        {report.status.toUpperCase()}
                      </span>
                      {report.hadDirectConnection ? (
                        <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">
                          ✓ Verified Connection Pair
                        </span>
                      ) : (
                        <span className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                          Map Discovery Report
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-500">
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-black/30 p-2.5">
                      <span className="text-[10px] uppercase text-neutral-500">
                        Reporter (Anonymized Session)
                      </span>
                      <p className="font-mono text-neutral-300">
                        {report.reporterSessionId}
                      </p>
                    </div>
                    <div className="rounded-lg bg-black/30 p-2.5">
                      <span className="text-[10px] uppercase text-neutral-500">
                        Reported Peer (Anonymized Session)
                      </span>
                      <p className="font-mono text-rose-300">
                        {report.reportedSessionId}
                      </p>
                    </div>
                  </div>

                  {report.status === "pending" && (
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/5 pt-3">
                      <button
                        onClick={() => handleAction("dismiss_report", report.id)}
                        disabled={actionInProgress === report.id}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        Dismiss Report
                      </button>
                      <button
                        onClick={() =>
                          handleAction(
                            "action_report",
                            report.id,
                            `Terminated due to ${report.reason}`,
                          )
                        }
                        disabled={actionInProgress === report.id}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-50"
                      >
                        Action: Terminate Session
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: SESSIONS & CONNECTIONS */}
        {activeTab === "sessions" && (
          <div className="mt-4 space-y-6">
            {/* Active Connections */}
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Server-Authorized Connection Pairs ({connections.length})
              </h2>
              {connections.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-[#0d1422] p-4 text-center text-xs text-neutral-500">
                  No peer connections currently established.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d1422]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/5 bg-white/5 text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Initiator ID</th>
                        <th className="px-3 py-2">Receiver ID</th>
                        <th className="px-3 py-2">Established</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {connections.map((conn) => (
                        <tr key={conn.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-sans ${
                                conn.status === "connected"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {conn.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-neutral-300">
                            {conn.initiatorId.slice(0, 8)}...
                          </td>
                          <td className="px-3 py-2 text-neutral-300">
                            {conn.receiverId.slice(0, 8)}...
                          </td>
                          <td className="px-3 py-2 font-sans text-neutral-400">
                            {new Date(conn.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Active Presence Sessions */}
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Live Presence Sessions ({sessions.length})
              </h2>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d1422]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/5 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Session ID</th>
                      <th className="px-3 py-2">Intent</th>
                      <th className="px-3 py-2">Language</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-neutral-300">
                          {session.id.slice(0, 12)}...
                        </td>
                        <td className="px-3 py-2 capitalize text-cyan-300">
                          {session.intent}
                        </td>
                        <td className="px-3 py-2 uppercase text-neutral-400">
                          {session.language}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              session.busy
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {session.busy ? "In Call" : "Available"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() =>
                              handleAction(
                                "terminate_session",
                                session.id,
                                "Moderator force disconnected",
                              )
                            }
                            disabled={actionInProgress === session.id}
                            className="rounded border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            Disconnect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ABUSE SHIELD */}
        {activeTab === "abuse" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#0d1422] p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Active Distributed Rate Limiters & Quarantines
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Tracks distributed rate limit violators across serverless instances.
                All entries are anonymized hashes without IP storage.
              </p>
            </div>

            {abuseRecords.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-[#0d1422] p-8 text-center text-xs text-neutral-500">
                No active abuse throttles or quarantined clients.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d1422]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/5 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Anonymized Client Token</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Strikes</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {abuseRecords.map((item) => {
                      const isBlocked =
                        item.blockedUntil && new Date(item.blockedUntil) > new Date();
                      return (
                        <tr key={item.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2 text-neutral-300">
                            {item.targetHash}
                          </td>
                          <td className="px-3 py-2 font-sans capitalize text-cyan-300">
                            {item.action}
                          </td>
                          <td className="px-3 py-2 text-amber-400">
                            {item.strikes}
                          </td>
                          <td className="px-3 py-2 font-sans">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] ${
                                isBlocked
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-neutral-800 text-neutral-400"
                              }`}
                            >
                              {isBlocked ? "QUARANTINED" : "THROTTLED"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-sans">
                            <button
                              onClick={() =>
                                handleAction("clear_abuse", item.targetHash)
                              }
                              disabled={actionInProgress === item.targetHash}
                              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              Clear Ban
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: AUDIT LOG */}
        {activeTab === "audit" && (
          <div className="mt-4">
            {auditLogs.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-[#0d1422] p-8 text-center text-xs text-neutral-500">
                No moderator actions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d1422]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/5 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Timestamp</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-neutral-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-semibold text-cyan-300">
                          {log.action}
                        </td>
                        <td className="px-3 py-2 font-mono text-neutral-300">
                          {log.targetId ? `${log.targetId.slice(0, 12)}...` : "—"}
                        </td>
                        <td className="px-3 py-2 text-neutral-400">
                          {log.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
