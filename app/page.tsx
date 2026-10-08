"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import CommunityThanksPrompt from "./components/CommunityThanksPrompt";
import SafetyShield from "./components/SafetyShield";
import ConnectionDiagnosticsModal from "./components/ConnectionDiagnosticsModal";
import {
  fetchIceServers,
  type IceServerConfig,
  type IceServersResponse,
} from "@/lib/ice";
import {
  getCommunityPulse,
  isUnavailableSignalError,
  join,
  leave,
  poll,
  sendCommunityThanks,
  sendSafetyAction,
  sendSignal,
  type SessionCredentials,
} from "@/lib/api";
import {
  PeerSession,
  type ChatReaction,
  type DescType,
  isRecoverableConnectionState,
  type PeerAttachment,
  type PeerReply,
  type PeerControl,
} from "@/lib/webrtc";
import {
  INTENT_DETAILS,
  pickIntentMatch,
  type ConversationIntent,
} from "@/lib/intent";
import type { CommunityPulse, CommunityReaction } from "@/lib/community";
import type { SafetyAction, SafetyReportReason } from "@/lib/safety";
import {
  LANGUAGE_DETAILS,
  type SessionLanguage,
} from "@/lib/language";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import {
  playCallEndedSound,
  playConnectedSound,
  playIncomingMessageSound,
  playSentMessageSound,
  primeAudio,
  startRingtone,
} from "@/lib/sounds";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "reconnecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_GRACE_MS = 12_000;
const RECONNECT_RETRY_MS = 4_000;
const RECONNECT_START_DELAY_MS = 1_250;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [session, setSession] = useState<SessionCredentials | null>(null);
  const sessionRef = useRef<SessionCredentials | null>(null);
  const [intent, setIntent] = useState<ConversationIntent | null>(null);
  const [language, setLanguage] = useState<SessionLanguage | null>(null);
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [candidatePeerId, setCandidatePeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [communityPulse, setCommunityPulse] = useState<CommunityPulse | null>(null);
  const [thanksPromptOpen, setThanksPromptOpen] = useState(false);
  const [thanksSubmitting, setThanksSubmitting] = useState(false);
  const [thanksError, setThanksError] = useState<string | null>(null);
  const [hasThanked, setHasThanked] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetySubmitting, setSafetySubmitting] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [iceConfig, setIceConfig] = useState<IceServersResponse | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [forceRelay, setForceRelay] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem("pulse_force_relay");
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  const [customTurn, setCustomTurn] = useState<IceServerConfig | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("pulse_custom_turn");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!session) return;
    void fetchIceServers(session).then((cfg) => {
      setIceConfig(cfg);
    });
  }, [session]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteCaption, setRemoteCaption] = useState("");
  const callWindowRef = useRef<Window | null>(null);
  const [callRoot, setCallRoot] = useState<HTMLElement | null>(null);
  const callRootRef = useRef<HTMLElement | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDeadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRetryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionEstablishedRef = useRef(false);
  const leaveSent = useRef(false);
  const attachmentUrlsRef = useRef<string[]>([]);
  const stopRingtoneRef = useRef<(() => void) | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const callSummaryLoggedRef = useRef(false);
  const peerTypingTimerRef = useRef<number | null>(null);
  const remoteCaptionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unlockAudio = () => primeAudio();
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  function updateCallWindow(value: Window | null) {
    const current = callWindowRef.current;
    callWindowRef.current = value;
    if (value === null) {
      callRootRef.current = null;
      setCallRoot(null);
    }
    if (value === null && current && !current.closed) {
      window.setTimeout(() => {
        if (!current.closed) current.close();
      }, 0);
    }
  }

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(
    mine: boolean,
    text: string,
    wireId: string,
    replyTo?: PeerReply,
  ) {
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, wireId, mine, text, replyTo },
    ]);
  }

  function addSystemMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, mine: false, system: true, text },
    ]);
  }

  function stopRinging() {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
  }

  function beginRinging() {
    stopRinging();
    stopRingtoneRef.current = startRingtone();
  }

  function clearReconnectTimers() {
    if (reconnectDeadlineTimer.current) {
      clearTimeout(reconnectDeadlineTimer.current);
      reconnectDeadlineTimer.current = null;
    }
    if (reconnectStartTimer.current) {
      clearTimeout(reconnectStartTimer.current);
      reconnectStartTimer.current = null;
    }
    if (reconnectRetryTimer.current) {
      clearInterval(reconnectRetryTimer.current);
      reconnectRetryTimer.current = null;
    }
  }

  function addAttachment(
    mine: boolean,
    attachment: PeerAttachment | File,
    wireId: string,
  ) {
    const blob = attachment instanceof File ? attachment : attachment.blob;
    const url = URL.createObjectURL(blob);
    attachmentUrlsRef.current.push(url);
    setMessages((prev) => [
      ...prev,
      {
        id: msgId.current++,
        wireId,
        mine,
        attachment: {
          name: attachment.name,
          mime:
            attachment instanceof File
              ? attachment.type || "application/octet-stream"
              : attachment.mime,
          size: attachment.size,
          url,
        },
      },
    ]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    clearReconnectTimers();
    stopRinging();
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    updateCallWindow(null);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    setSharingScreen(false);
    setCallStartedAt(null);
    if (remoteCaptionTimerRef.current) clearTimeout(remoteCaptionTimerRef.current);
    remoteCaptionTimerRef.current = null;
    setRemoteCaption("");
    if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
    peerTypingTimerRef.current = null;
    setPeerTyping(false);
    setVideo("none");
    attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentUrlsRef.current = [];
    setMessages([]);
    connectionEstablishedRef.current = false;
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function transmitSignal(
    peerId: string,
    type: Parameters<typeof sendSignal>[2],
    payload?: string,
  ) {
    const credentials = sessionRef.current;
    if (!credentials) return Promise.reject(new Error("session unavailable"));
    return sendSignal(credentials, peerId, type, payload);
  }

  function handleUnavailableSignal(peerId: string, error: unknown): boolean {
    if (!isUnavailableSignalError(error)) return false;

    setPeers((current) => current.filter((peer) => peer.id !== peerId));
    setCandidatePeerId((current) => (current === peerId ? null : current));

    const connection = connRef.current;
    if ("peerId" in connection && connection.peerId === peerId) {
      teardown("This person is no longer available.");
    }

    return true;
  }

  function queueSignal(
    peerId: string,
    type: Parameters<typeof sendSignal>[2],
    payload?: string,
  ) {
    void transmitSignal(peerId, type, payload).catch((error: unknown) => {
      if (handleUnavailableSignal(peerId, error)) return;
      const connection = connRef.current;
      if (
        connection.kind === "reconnecting" &&
        connection.peerId === peerId
      ) return;
      console.error("Signal request failed:", error);
      showNotice("Connection update failed.");
    });
  }

  function attemptIceRestart(peerId: string) {
    const connection = connRef.current;
    if (
      connection.kind !== "reconnecting" ||
      connection.peerId !== peerId
    ) return;
    peerRef.current?.requestIceRestart();
  }

  function beginReconnect(peerId: string) {
    const connection = connRef.current;
    if (
      (connection.kind !== "connecting" &&
        connection.kind !== "connected" &&
        connection.kind !== "reconnecting") ||
      connection.peerId !== peerId
    ) return;

    if (connection.kind !== "reconnecting") {
      setConn({ kind: "reconnecting", peerId });
    }
    if (reconnectDeadlineTimer.current) return;

    reconnectStartTimer.current = setTimeout(() => {
      reconnectStartTimer.current = null;
      attemptIceRestart(peerId);
      reconnectRetryTimer.current = setInterval(
        () => attemptIceRestart(peerId),
        RECONNECT_RETRY_MS,
      );
    }, RECONNECT_START_DELAY_MS);

    reconnectDeadlineTimer.current = setTimeout(() => {
      reconnectDeadlineTimer.current = null;
      const current = connRef.current;
      if (current.kind !== "reconnecting" || current.peerId !== peerId) return;

      const completedConversation = connectionEstablishedRef.current;
      queueSignal(peerId, "end");
      teardown("Connection lost. You can find another match.");
      if (completedConversation && !hasThanked) {
        setThanksError(null);
        setThanksPromptOpen(true);
      }
    }, RECONNECT_GRACE_MS);
  }

  function startPeer(peerId: string, initiator: boolean) {
    clearReconnectTimers();
    connectionEstablishedRef.current = false;
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        queueSignal(peerId, type, payload);
      },
      onChat: (message) => {
        addMessage(
          false,
          message.text,
          message.id,
          message.replyTo
            ? { ...message.replyTo, mine: !message.replyTo.mine }
            : undefined,
        );
        playIncomingMessageSound();
      },
      onTyping: (active) => {
        if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
        setPeerTyping(active);
        peerTypingTimerRef.current = active
          ? window.setTimeout(() => {
              setPeerTyping(false);
              peerTypingTimerRef.current = null;
            }, 3_000)
          : null;
      },
      onReaction: (messageId, reaction) => {
        setMessages((current) => current.map((message) =>
          message.wireId === messageId
            ? {
                ...message,
                reactions: { ...message.reactions, peer: reaction ?? undefined },
              }
            : message,
        ));
      },
      onCaption: (caption) => {
        if (remoteCaptionTimerRef.current) clearTimeout(remoteCaptionTimerRef.current);
        setRemoteCaption(caption.text);
        remoteCaptionTimerRef.current = window.setTimeout(() => {
          setRemoteCaption("");
          remoteCaptionTimerRef.current = null;
        }, caption.final ? 6_000 : 3_000);
      },
      onAttachment: (attachment) => {
        addAttachment(false, attachment, attachment.id);
        playIncomingMessageSound();
      },
      onCallSummary: (durationSeconds) => {
        const startedAt = callStartedAtRef.current;
        if (startedAt === null || callSummaryLoggedRef.current) return;
        const localDuration = Math.max(
          0,
          Math.round((Date.now() - startedAt) / 1000),
        );
        if (Math.abs(durationSeconds - localDuration) > 10) return;
        callSummaryLoggedRef.current = true;
        addSystemMessage(`Video call ended · ${formatCallDuration(durationSeconds)}`);
      },
      onControl: (ctrl) => handleControl(ctrl),
      onLocalStream: (stream) => setLocalStream(stream),
      onScreenShareChange: (sharing) => setSharingScreen(sharing),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "connected") {
          const connection = connRef.current;
          if (
            connection.kind === "reconnecting" &&
            connection.peerId === peerId
          ) {
            clearReconnectTimers();
            setConn({ kind: "connected", peerId });
            showNotice("Connection restored.");
          }
          return;
        }
        if (isRecoverableConnectionState(state)) {
          beginReconnect(peerId);
        }
      },
      onChannelOpen: () => {
        clearReconnectTimers();
        const firstConnection = !connectionEstablishedRef.current;
        connectionEstablishedRef.current = true;
        setConn({ kind: "connected", peerId });
        if (firstConnection) playConnectedSound();
      },
    }, {
      iceServers: [
        ...(iceConfig?.iceServers ?? []),
        ...(customTurn ? [customTurn] : []),
      ] as RTCIceServer[],
      iceTransportPolicy:
        forceRelay && (Boolean(iceConfig?.turnConfigured) || Boolean(customTurn))
          ? "relay"
          : "all",
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") {
          setVideo("incoming");
          beginRinging();
        }
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          stopRinging();
          activateCallWindow();
          startLocalMedia(ps);
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          stopRinging();
          playCallEndedSound();
          updateCallWindow(null);
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        finishVideoCall(false);
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void transmitSignal(peerId, "request").catch((error: unknown) => {
      if (handleUnavailableSignal(peerId, error)) return;
      console.error("Connection request failed:", error);
      teardown("Unable to request a connection.");
    });
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        queueSignal(peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function previewConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setCandidatePeerId(peerId);
  }

  function confirmCandidate() {
    if (!candidatePeerId) return;
    const peerId = candidatePeerId;
    setCandidatePeerId(null);
    requestConnection(peerId);
  }

  function findIntentMatch() {
    if (connRef.current.kind !== "idle" || !intent || !language) return;

    const match = pickIntentMatch(peers, intent, language);
    if (!match) {
      showNotice(
        `No ${LANGUAGE_DETAILS[language].nativeLabel} match is available just yet.`,
      );
      return;
    }

    previewConnection(match.id);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      queueSignal(connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    queueSignal(peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    queueSignal(connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    const completedConversation = connectionEstablishedRef.current;
    if (
      c.kind === "connecting" ||
      c.kind === "reconnecting" ||
      c.kind === "connected"
    ) {
      queueSignal(c.peerId, "end");
    }
    teardown();
    if (completedConversation && !hasThanked) {
      setThanksError(null);
      setThanksPromptOpen(true);
    }
  }

  function leaveFromSafety() {
    const c = connRef.current;
    setSafetyOpen(false);
    if (
      c.kind === "connecting" ||
      c.kind === "reconnecting" ||
      c.kind === "connected"
    ) {
      queueSignal(c.peerId, "end");
    }
    teardown();
  }

  async function performSafetyAction(
    action: SafetyAction,
    reason?: SafetyReportReason,
  ) {
    const credentials = sessionRef.current;
    const c = connRef.current;
    if (
      !credentials ||
      safetySubmitting ||
      (c.kind !== "connecting" &&
        c.kind !== "reconnecting" &&
        c.kind !== "connected")
    ) return;

    const targetId = c.peerId;
    setSafetySubmitting(true);
    setSafetyError(null);
    const endRequest = transmitSignal(targetId, "end").catch(() => undefined);
    setSafetyOpen(false);
    teardown();

    try {
      await endRequest;
      await sendSafetyAction(credentials, targetId, action, reason);
      setPeers((current) => current.filter((peer) => peer.id !== targetId));
      showNotice(action === "report" ? "Report submitted and session blocked." : "Session blocked.");
    } catch (error) {
      console.error("Safety action failed:", error);
      showNotice("You left safely, but the block could not be saved.");
    } finally {
      setSafetySubmitting(false);
    }
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    openCallWindow();
    beginRinging();
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    openCallWindow();
    stopRinging();
    ps.sendControl("video-accept");
    activateCallWindow();
    startLocalMedia(ps);
  }

  function declineVideo() {
    stopRinging();
    playCallEndedSound();
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    finishVideoCall(true);
  }

  function finishVideoCall(notifyPeer: boolean) {
    const ps = peerRef.current;
    const startedAt = callStartedAtRef.current;
    const wasInCall = startedAt !== null || videoRef.current !== "none";
    stopRinging();

    if (startedAt !== null && !callSummaryLoggedRef.current) {
      const durationSeconds = Math.max(
        0,
        Math.round((Date.now() - startedAt) / 1000),
      );
      if (notifyPeer) ps?.sendCallSummary(durationSeconds);
      callSummaryLoggedRef.current = true;
      addSystemMessage(`Video call ended · ${formatCallDuration(durationSeconds)}`);
    }

    if (notifyPeer) ps?.sendControl("video-end");
    callStartedAtRef.current = null;
    setCallStartedAt(null);
    if (wasInCall) playCallEndedSound();

    ps?.stopVideo();
    setLocalStream(null);
    setRemoteStream(null);
    updateCallWindow(null);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    setSharingScreen(false);
    setVideo("none");
  }

  function openCallWindow() {
    // On mobile devices and touch screens, always keep the call in the current viewport
    if (typeof window !== "undefined" && (window.innerWidth < 768 || "ontouchstart" in window)) {
      updateCallWindow(null);
      return;
    }

    const existing = callWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }

    const popup = window.open(
      "",
      "pulse-video-call",
      "popup=yes,width=1040,height=720,resizable=yes,scrollbars=no",
    );
    if (popup) {
      popup.document.title = "Pulse · Connecting call";
      popup.document.documentElement.lang = "en";
      popup.document.body.className = document.body.className;
      popup.document.body.style.cssText = "margin:0;background:#050708";
      document.head
        .querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
          'link[rel="stylesheet"], style',
        )
        .forEach((node) => popup.document.head.append(node.cloneNode(true)));
      const root = popup.document.createElement("div");
      root.id = "pulse-call-root";
      root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;color:#939d9a;font:14px system-ui">Connecting private call…</div>';
      popup.document.body.replaceChildren(root);
      callRootRef.current = root;
      setCallRoot(root);
      popup.addEventListener("beforeunload", () => {
        if (callWindowRef.current === popup) endVideo();
      });
    }
    updateCallWindow(popup);
  }

  function activateCallWindow() {
    stopRinging();
    if (videoRef.current !== "active") {
      const startedAt = Date.now();
      callStartedAtRef.current = startedAt;
      setCallStartedAt(startedAt);
      callSummaryLoggedRef.current = false;
      playConnectedSound();
    }
    const popup = callWindowRef.current;
    if (popup?.closed) updateCallWindow(null);
    else if (popup) popup.document.title = "Pulse · Video call";
    callRootRef.current?.replaceChildren();
    setVideo("active");
  }

  function startLocalMedia(ps: PeerSession) {
    void ps
      .startVideo()
      .then((stream) => {
        setMicrophoneEnabled(stream.getAudioTracks().some((track) => track.enabled));
        setCameraEnabled(stream.getVideoTracks().some((track) => track.enabled));
      })
      .catch(() => {
        setLocalStream(null);
        setMicrophoneEnabled(false);
        setCameraEnabled(false);
        showNotice("Camera or microphone is unavailable. The call is still connected.");
      });
  }

  function toggleMicrophone() {
    const next = !microphoneEnabled;
    if (peerRef.current?.setMicrophoneEnabled(next)) setMicrophoneEnabled(next);
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    if (peerRef.current?.setCameraEnabled(next)) setCameraEnabled(next);
  }

  async function toggleScreenShare() {
    const ps = peerRef.current;
    if (!ps) return;
    try {
      if (sharingScreen) {
        await ps.stopScreenShare();
        setSharingScreen(false);
      } else {
        await ps.startScreenShare();
        setSharingScreen(true);
      }
    } catch {
      showNotice("Screen sharing was not started.");
    }
  }

  async function selectCallDevice(
    kind: "audioinput" | "videoinput",
    deviceId: string,
  ) {
    const ps = peerRef.current;
    if (!ps) return;
    try {
      const stream = await ps.switchMediaDevice(kind, deviceId);
      setMicrophoneEnabled(
        stream.getAudioTracks().some((track) => track.enabled),
      );
      if (kind === "videoinput") {
        setCameraEnabled(stream.getVideoTracks().some((track) => track.enabled));
      }
    } catch {
      showNotice("That call device could not be selected.");
    }
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setCandidatePeerId(null);
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          queueSignal(sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" ||
          c.kind === "reconnecting" ||
          c.kind === "connected"
            ? c.peerId
            : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "reconnecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else {
            const completedConversation = connectionEstablishedRef.current;
            teardown("Stranger disconnected.");
            if (completedConversation && !hasThanked) {
              setThanksError(null);
              setThanksPromptOpen(true);
            }
          }
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(session);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch (error) {
        if (
          navigator.onLine &&
          connRef.current.kind !== "reconnecting"
        ) {
          console.error("Poll failed:", error);
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, session]);

  useEffect(() => {
    const retryWhenOnline = () => {
      if (connRef.current.kind === "reconnecting") {
        peerRef.current?.requestIceRestart();
      }
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    let active = true;

    const refreshCommunityPulse = async () => {
      try {
        const pulse = await getCommunityPulse();
        if (active) setCommunityPulse(pulse);
      } catch (error) {
        console.error("Community pulse failed:", error);
      }
    };

    void refreshCommunityPulse();
    const timer = window.setInterval(refreshCommunityPulse, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (!session || phase !== "live") return;
    const onLeave = () => {
      if (leaveSent.current) return;
      leaveSent.current = true;
      leave(session);
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [session, phase]);

  async function handleReady(
    lat: number,
    lng: number,
    selectedIntent: ConversationIntent,
    selectedLanguage: SessionLanguage,
  ) {
    setMyLocation({ lat, lng });
    const credentials = await join(lat, lng, selectedIntent, selectedLanguage);
    sessionRef.current = credentials;
    setSession(credentials);
    setIntent(selectedIntent);
    setLanguage(selectedLanguage);
    setPhase("live");
  }

  async function submitCommunityThanks(reaction: CommunityReaction) {
    if (!session || thanksSubmitting || hasThanked) return;
    setThanksSubmitting(true);
    setThanksError(null);
    try {
      const pulse = await sendCommunityThanks(session, reaction);
      setCommunityPulse(pulse);
      setHasThanked(true);
      setThanksPromptOpen(false);
      showNotice("Your anonymous thanks joined the community pulse.");
    } catch (error) {
      setThanksError(
        error instanceof Error
          ? error.message.replace(/^community thanks failed:\s*/i, "")
          : "Could not share your thanks.",
      );
    } finally {
      setThanksSubmitting(false);
    }
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  if (!intent || !language) return null;

  const inChat =
    conn.kind === "connecting" ||
    conn.kind === "reconnecting" ||
    conn.kind === "connected";
  const contextualPeerId = candidatePeerId ?? ("peerId" in conn ? conn.peerId : null);
  const contextualIntent = contextualPeerId
    ? peers.find((peer) => peer.id === contextualPeerId)?.intent
    : undefined;
  const contextualLanguage = contextualPeerId
    ? peers.find((peer) => peer.id === contextualPeerId)?.language
    : undefined;

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#07090b]">
      <WorldMap
        peers={peers}
        me={myLocation}
        myIntent={intent}
        onPeerClick={previewConnection}
        onFindMatch={findIntentMatch}
        canConnect={conn.kind === "idle" && !candidatePeerId}
        communityThanks={communityPulse?.total ?? 0}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
      />

      {thanksPromptOpen && (
        <CommunityThanksPrompt
          submitting={thanksSubmitting}
          error={thanksError}
          onSubmit={(reaction) => void submitCommunityThanks(reaction)}
          onSkip={() => {
            setThanksError(null);
            setThanksPromptOpen(false);
          }}
        />
      )}

      {notice && (
        <div
          role="status"
          className="map-chip ui-enter-fast absolute left-1/2 top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-xs text-zinc-200"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          <span className="whitespace-nowrap">{notice}</span>
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="map-chip ui-enter-fast absolute left-1/2 top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl py-1.5 pl-3.5 pr-1.5 text-xs text-zinc-200">
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="locating-spinner !h-3.5 !w-3.5 !border-white/15 !border-t-[#74e8bd]" />
            Requesting {contextualIntent
              ? `someone here to ${INTENT_DETAILS[contextualIntent].label}`
              : "connection"}…
          </span>
          <button
            onClick={cancelRequest}
            className="focus-ring pressable min-h-8 rounded-lg border border-white/8 bg-white/[0.06] px-3 text-[11px] font-medium text-zinc-300 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          subtitle={
            contextualIntent
              ? `Here to ${INTENT_DETAILS[contextualIntent].label} in ${contextualLanguage ? LANGUAGE_DETAILS[contextualLanguage].nativeLabel : "your language"}.`
              : undefined
          }
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {candidatePeerId && conn.kind === "idle" && (
        <ConnectionPrompt
          eyebrow="Intent match"
          title="Start a conversation?"
          subtitle={
            contextualIntent
              ? `Here to ${INTENT_DETAILS[contextualIntent].label} in ${contextualLanguage ? LANGUAGE_DETAILS[contextualLanguage].nativeLabel : "your language"}.`
              : "Send a private connection request?"
          }
          acceptLabel="Send request"
          declineLabel="Not now"
          onAccept={confirmCandidate}
          onDecline={() => setCandidatePeerId(null)}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          reconnecting={conn.kind === "reconnecting"}
          peerTyping={peerTyping}
          videoBusy={video !== "none"}
          onSend={(text, replyTo) => {
            const wireId = peerRef.current?.sendChat(text, replyTo);
            if (wireId) {
              addMessage(true, text, wireId, replyTo);
              playSentMessageSound();
              return true;
            } else {
              showNotice("Message could not be sent.");
              return false;
            }
          }}
          onTypingChange={(active) => {
            peerRef.current?.sendTyping(active);
          }}
          onReact={(messageId, reaction: ChatReaction | null) => {
            if (!peerRef.current?.sendReaction(messageId, reaction)) {
              showNotice("Reaction could not be sent.");
              return;
            }
            setMessages((current) => current.map((message) =>
              message.wireId === messageId
                ? {
                    ...message,
                    reactions: { ...message.reactions, mine: reaction ?? undefined },
                  }
                : message,
            ));
          }}
          onSendAttachment={async (file) => {
            const wireId = await peerRef.current?.sendAttachment(file);
            if (wireId) {
              addAttachment(true, file, wireId);
              playSentMessageSound();
            }
            return Boolean(wireId);
          }}
          onStartVideo={startVideoRequest}
          onSafety={() => {
            setSafetyError(null);
            setSafetyOpen(true);
          }}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="map-chip ui-enter-fast absolute bottom-[max(5rem,calc(env(safe-area-inset-bottom)+5rem))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-xs text-zinc-200">
          <span className="locating-spinner !h-3.5 !w-3.5 !border-white/15 !border-t-[#74e8bd]" />
          <span className="whitespace-nowrap">Waiting for video approval…</span>
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="Only accept if you feel comfortable. You can turn off your camera or leave at any time."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {safetyOpen && (
        <SafetyShield
          submitting={safetySubmitting}
          error={safetyError}
          onLeave={leaveFromSafety}
          onBlock={() => void performSafetyAction("block")}
          onReport={(reason) => void performSafetyAction("report", reason)}
          onClose={() => setSafetyOpen(false)}
        />
      )}

      {diagnosticsOpen && (
        <ConnectionDiagnosticsModal
          getPeerSession={() => peerRef.current}
          hasActivePeer={
            conn.kind === "connected" ||
            conn.kind === "reconnecting" ||
            conn.kind === "connecting"
          }
          iceConfig={iceConfig}
          forceRelay={forceRelay}
          onToggleForceRelay={(val) => {
            setForceRelay(val);
            try {
              localStorage.setItem("pulse_force_relay", JSON.stringify(val));
            } catch {}
          }}
          customTurnConfig={customTurn}
          onApplyCustomTurn={(config) => {
            setCustomTurn(config);
            try {
              if (config) {
                localStorage.setItem("pulse_custom_turn", JSON.stringify(config));
              } else {
                localStorage.removeItem("pulse_custom_turn");
              }
            } catch {}
          }}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}

      {video === "active" && callStartedAt !== null && (
        callRoot
          ? createPortal(
              <VideoPanel
                localStream={localStream}
                remoteStream={remoteStream}
                microphoneEnabled={microphoneEnabled}
                cameraEnabled={cameraEnabled}
                sharingScreen={sharingScreen}
                callStartedAt={callStartedAt}
                language={language}
                remoteCaption={remoteCaption}
                onCaption={(text, final) => {
                  peerRef.current?.sendCaption(text, final);
                }}
                onSelectDevice={selectCallDevice}
                onToggleMicrophone={toggleMicrophone}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={() => void toggleScreenShare()}
                onOpenDiagnostics={() => setDiagnosticsOpen(true)}
                onEnd={endVideo}
              />,
              callRoot,
            )
          : <VideoPanel
              localStream={localStream}
              remoteStream={remoteStream}
              microphoneEnabled={microphoneEnabled}
              cameraEnabled={cameraEnabled}
              sharingScreen={sharingScreen}
              callStartedAt={callStartedAt}
              language={language}
              remoteCaption={remoteCaption}
              onCaption={(text, final) => {
                peerRef.current?.sendCaption(text, final);
              }}
              onSelectDevice={selectCallDevice}
              onToggleMicrophone={toggleMicrophone}
              onToggleCamera={toggleCamera}
              onToggleScreenShare={() => void toggleScreenShare()}
              onOpenDiagnostics={() => setDiagnosticsOpen(true)}
              onEnd={endVideo}
            />
      )}
    </main>
  );
}

function formatCallDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
