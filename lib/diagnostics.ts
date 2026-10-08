import type { IceServerConfig } from "./ice.ts";

export interface CandidateInfo {
  id?: string;
  type: "host" | "srflx" | "prflx" | "relay" | "unknown";
  protocol: "udp" | "tcp" | "unknown";
  address?: string;
  port?: number;
  tcpType?: string;
  url?: string;
  relayProtocol?: string;
}

export interface CandidatePairInfo {
  id?: string;
  state: string;
  nominated: boolean;
  local: CandidateInfo | null;
  remote: CandidateInfo | null;
  currentRttMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  bytesSent: number;
  bytesReceived: number;
  requestsSent?: number;
  responsesReceived?: number;
}

export interface MediaDiagnostics {
  audio?: {
    codec?: string;
    level?: number;
    jitterMs?: number;
    packetsLost?: number;
    packetsReceived?: number;
  };
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    framesDecoded?: number;
    framesDropped?: number;
  };
}

export interface ConnectionDiagnostics {
  timestamp: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  activePair: CandidatePairInfo | null;
  isRelayed: boolean;
  rttMs: number | null;
  jitterMs: number | null;
  sendBitrateKbps: number;
  recvBitrateKbps: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  packetLossPercent: number | null;
  media: MediaDiagnostics;
  iceRestartCount: number;
  localCandidates: CandidateInfo[];
  remoteCandidates: CandidateInfo[];
}

export interface IceReachabilityReport {
  timestamp: number;
  durationMs: number;
  hostCandidates: number;
  srflxCandidates: number;
  relayCandidates: number;
  hostAvailable: boolean;
  stunAvailable: boolean;
  turnAvailable: boolean;
  gatheredCandidates: CandidateInfo[];
  errors: string[];
  summary: string;
}

export function maskIpAddress(ip?: string): string {
  if (!ip) return "Unknown";
  return "[Hidden for Privacy]";
}

export function formatBitrate(kbps: number): string {
  if (kbps <= 0 || !Number.isFinite(kbps)) return "0 kbps";
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function parseCandidateType(rawType?: string): CandidateInfo["type"] {
  switch (rawType) {
    case "host":
      return "host";
    case "srflx":
      return "srflx";
    case "prflx":
      return "prflx";
    case "relay":
      return "relay";
    default:
      return "unknown";
  }
}

function parseCandidateProtocol(rawProtocol?: string): CandidateInfo["protocol"] {
  const lower = rawProtocol?.toLowerCase();
  if (lower === "udp") return "udp";
  if (lower === "tcp") return "tcp";
  return "unknown";
}

export function parseIceCandidateString(candidateStr: string): Partial<CandidateInfo> {
  // e.g. "candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host ..."
  const parts = candidateStr.trim().split(/\s+/);
  if (parts.length < 8) return {};

  const protocol = parseCandidateProtocol(parts[2]);
  const address = parts[4];
  const port = Number(parts[5]);
  const typIndex = parts.indexOf("typ");
  const type = typIndex !== -1 && typIndex + 1 < parts.length
    ? parseCandidateType(parts[typIndex + 1])
    : "unknown";

  return {
    protocol,
    address: maskIpAddress(address),
    port: Number.isSafeInteger(port) ? port : undefined,
    type,
  };
}

/**
 * Extracts comprehensive real-time diagnostics from an active RTCPeerConnection.
 */
export async function extractConnectionDiagnostics(
  pc: RTCPeerConnection,
  previous?: ConnectionDiagnostics | null,
  iceRestartCount = 0,
): Promise<ConnectionDiagnostics> {
  const timestamp = Date.now();
  const base: ConnectionDiagnostics = {
    timestamp,
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    signalingState: pc.signalingState,
    activePair: null,
    isRelayed: false,
    rttMs: null,
    jitterMs: null,
    sendBitrateKbps: 0,
    recvBitrateKbps: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    packetsSent: 0,
    packetsReceived: 0,
    packetsLost: 0,
    packetLossPercent: null,
    media: {},
    iceRestartCount,
    localCandidates: [],
    remoteCandidates: [],
  };

  if (typeof pc.getStats !== "function") {
    return base;
  }

  let stats: RTCStatsReport;
  try {
    stats = await pc.getStats();
  } catch {
    return base;
  }

  const candidatePairs: RTCStats[] = [];
  const localCandidatesMap = new Map<string, CandidateInfo>();
  const remoteCandidatesMap = new Map<string, CandidateInfo>();
  let selectedCandidatePairId: string | null = null;

  stats.forEach((report) => {
    if (report.type === "transport" && report.selectedCandidatePairId) {
      selectedCandidatePairId = report.selectedCandidatePairId as string;
    }

    if (report.type === "local-candidate") {
      const candidate: CandidateInfo = {
        id: report.id,
        type: parseCandidateType(report.candidateType),
        protocol: parseCandidateProtocol(report.protocol),
        address: maskIpAddress(report.address ?? report.ip),
        port: report.port,
        tcpType: report.tcpType,
        url: report.url,
        relayProtocol: report.relayProtocol,
      };
      localCandidatesMap.set(report.id, candidate);
      base.localCandidates.push(candidate);
    }

    if (report.type === "remote-candidate") {
      const candidate: CandidateInfo = {
        id: report.id,
        type: parseCandidateType(report.candidateType),
        protocol: parseCandidateProtocol(report.protocol),
        address: maskIpAddress(report.address ?? report.ip),
        port: report.port,
        tcpType: report.tcpType,
      };
      remoteCandidatesMap.set(report.id, candidate);
      base.remoteCandidates.push(candidate);
    }

    if (report.type === "candidate-pair") {
      candidatePairs.push(report);
    }

    // Media & RTP stats
    if (report.type === "inbound-rtp") {
      const kind = report.kind;
      if (kind === "audio") {
        base.media.audio = {
          ...base.media.audio,
          jitterMs: typeof report.jitter === "number" ? Math.round(report.jitter * 1000) : undefined,
          packetsLost: report.packetsLost,
          packetsReceived: report.packetsReceived,
        };
      } else if (kind === "video") {
        base.media.video = {
          ...base.media.video,
          width: report.frameWidth,
          height: report.frameHeight,
          fps: report.framesPerSecond,
          framesDecoded: report.framesDecoded,
          framesDropped: report.framesDropped,
        };
      }
    }

    if (report.type === "codec") {
      if (report.mimeType?.toLowerCase().includes("audio")) {
        base.media.audio = {
          ...base.media.audio,
          codec: report.mimeType?.replace(/^audio\//i, "").toUpperCase(),
        };
      } else if (report.mimeType?.toLowerCase().includes("video")) {
        base.media.video = {
          ...base.media.video,
          codec: report.mimeType?.replace(/^video\//i, "").toUpperCase(),
        };
      }
    }
  });

  // Find the active candidate pair
  let activePairReport: RTCStats | undefined;
  if (selectedCandidatePairId) {
    activePairReport = candidatePairs.find((p) => p.id === selectedCandidatePairId);
  }
  if (!activePairReport) {
    activePairReport = candidatePairs.find(
      (p) => (p as { nominated?: boolean; state?: string }).nominated &&
             (p as { state?: string }).state === "succeeded",
    ) ?? candidatePairs.find((p) => (p as { state?: string }).state === "succeeded");
  }

  if (activePairReport) {
    const pair = activePairReport as unknown as {
      id?: string;
      state: string;
      nominated?: boolean;
      localCandidateId?: string;
      remoteCandidateId?: string;
      currentRoundTripTime?: number;
      availableOutgoingBitrate?: number;
      bytesSent?: number;
      bytesReceived?: number;
      requestsSent?: number;
      responsesReceived?: number;
    };

    const local = pair.localCandidateId ? localCandidatesMap.get(pair.localCandidateId) ?? null : null;
    const remote = pair.remoteCandidateId ? remoteCandidatesMap.get(pair.remoteCandidateId) ?? null : null;
    const rtt = typeof pair.currentRoundTripTime === "number" ? Math.round(pair.currentRoundTripTime * 1000) : null;

    base.activePair = {
      id: pair.id,
      state: pair.state,
      nominated: Boolean(pair.nominated),
      local,
      remote,
      currentRttMs: rtt,
      availableOutgoingBitrateKbps: typeof pair.availableOutgoingBitrate === "number"
        ? Math.round(pair.availableOutgoingBitrate / 1000)
        : null,
      bytesSent: pair.bytesSent ?? 0,
      bytesReceived: pair.bytesReceived ?? 0,
      requestsSent: pair.requestsSent,
      responsesReceived: pair.responsesReceived,
    };

    base.isRelayed = local?.type === "relay" || remote?.type === "relay";
    base.rttMs = rtt;
    base.totalBytesSent = pair.bytesSent ?? 0;
    base.totalBytesReceived = pair.bytesReceived ?? 0;
  }

  // Calculate bitrates if previous sample exists
  if (previous && previous.timestamp < timestamp) {
    const elapsedSeconds = (timestamp - previous.timestamp) / 1000;
    if (elapsedSeconds > 0) {
      const bytesSentDelta = Math.max(0, base.totalBytesSent - previous.totalBytesSent);
      const bytesRecvDelta = Math.max(0, base.totalBytesReceived - previous.totalBytesReceived);

      base.sendBitrateKbps = Math.round((bytesSentDelta * 8) / elapsedSeconds / 1000);
      base.recvBitrateKbps = Math.round((bytesRecvDelta * 8) / elapsedSeconds / 1000);
    }
  }

  return base;
}

/**
 * Runs a standalone pre-flight or on-demand ICE gathering test against the supplied ICE servers.
 * Tests if Host, STUN (srflx), and TURN (relay) candidates are reachable on the current network.
 */
export async function testIceConnectivity(
  iceServers: RTCIceServer[] | IceServerConfig[],
  options?: {
    forceRelay?: boolean;
    timeoutMs?: number;
  },
): Promise<IceReachabilityReport> {
  const startTime = Date.now();
  const timeoutMs = options?.timeoutMs ?? 7000;
  const gatheredCandidates: CandidateInfo[] = [];
  const errors: string[] = [];

  const config: RTCConfiguration = {
    iceServers: iceServers as RTCIceServer[],
    iceTransportPolicy: options?.forceRelay ? "relay" : "all",
  };

  return new Promise<IceReachabilityReport>((resolve) => {
    let pc: RTCPeerConnection | null = null;
    let finished = false;

    const cleanup = () => {
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.onicecandidateerror = null;
          pc.onicegatheringstatechange = null;
          pc.close();
        } catch {
          // ignore cleanup errors
        }
        pc = null;
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      const durationMs = Date.now() - startTime;

      let hostCandidates = 0;
      let srflxCandidates = 0;
      let relayCandidates = 0;

      gatheredCandidates.forEach((c) => {
        if (c.type === "host") hostCandidates++;
        if (c.type === "srflx") srflxCandidates++;
        if (c.type === "relay") relayCandidates++;
      });

      const hostAvailable = hostCandidates > 0;
      const stunAvailable = srflxCandidates > 0;
      const turnAvailable = relayCandidates > 0;

      let summary = "Connectivity check complete. ";
      if (turnAvailable && stunAvailable) {
        summary += "Both STUN and TURN are fully functional. Excellent network compatibility.";
      } else if (turnAvailable) {
        summary += "TURN relay active. Relayed connections will succeed through restrictive firewalls.";
      } else if (stunAvailable) {
        summary += "STUN discovery passed. Direct P2P will work for most standard NAT networks.";
      } else if (hostAvailable) {
        summary += "Only local interface candidates found. STUN/TURN may be blocked by network firewall.";
      } else {
        summary += "No candidates gathered. WebRTC or UDP traffic may be completely restricted.";
      }

      cleanup();

      resolve({
        timestamp: Date.now(),
        durationMs,
        hostCandidates,
        srflxCandidates,
        relayCandidates,
        hostAvailable,
        stunAvailable,
        turnAvailable,
        gatheredCandidates,
        errors,
        summary,
      });
    };

    const timeoutTimer = setTimeout(() => {
      finish();
    }, timeoutMs);

    try {
      pc = new RTCPeerConnection(config);

      // Create a probe data channel to prompt ICE gathering
      pc.createDataChannel("ice-probe");

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const parsed = parseIceCandidateString(event.candidate.candidate);
          const candObj = event.candidate as unknown as Record<string, unknown>;
          const candidate: CandidateInfo = {
            id: event.candidate.sdpMid ?? undefined,
            type: ((candObj.type as string) as CandidateInfo["type"]) ?? parsed.type ?? "unknown",
            protocol: ((candObj.protocol as string) as CandidateInfo["protocol"]) ?? parsed.protocol ?? "unknown",
            address: maskIpAddress((candObj.address as string) ?? parsed.address),
            port: (candObj.port as number) ?? parsed.port,
            tcpType: (candObj.tcpType as CandidateInfo["tcpType"]) ?? undefined,
            url: ((candObj.url ?? candObj.serverUrl) as string) ?? undefined,
          };
          gatheredCandidates.push(candidate);
        } else {
          // Null candidate indicates end of candidate gathering
          clearTimeout(timeoutTimer);
          finish();
        }
      };

      // Candidate error event (e.g. STUN/TURN unreachable or 401 unauthorized)
      const rtcAny = pc as unknown as {
        onicecandidateerror?: (event: {
          url?: string;
          errorCode?: number;
          errorText?: string;
        }) => void;
      };
      rtcAny.onicecandidateerror = (event) => {
        const errorDesc = `ICE server error [${event.errorCode ?? "?"}] ${event.url ?? "unknown server"}: ${event.errorText ?? "Failed to connect"}`;
        errors.push(errorDesc);
      };

      pc.onicegatheringstatechange = () => {
        if (pc?.iceGatheringState === "complete") {
          clearTimeout(timeoutTimer);
          finish();
        }
      };

      // Trigger gathering by creating local offer
      pc.createOffer()
        .then((offer) => pc?.setLocalDescription(offer))
        .catch((err) => {
          errors.push(`Offer error: ${err instanceof Error ? err.message : String(err)}`);
          clearTimeout(timeoutTimer);
          finish();
        });
    } catch (err) {
      errors.push(`Peer connection init error: ${err instanceof Error ? err.message : String(err)}`);
      clearTimeout(timeoutTimer);
      finish();
    }
  });
}
