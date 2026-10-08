import { DEFAULT_STUN_SERVERS } from "./ice.ts";
import {
  extractConnectionDiagnostics,
  type ConnectionDiagnostics,
} from "./diagnostics.ts";

export type DescType = "offer" | "answer" | "ice";

export function isRecoverableConnectionState(
  state: RTCPeerConnectionState,
): boolean {
  return state === "disconnected" || state === "failed";
}

export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end";

export interface PeerAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
}

export const CHAT_REACTIONS = {
  heart: "♥",
  like: "👍",
  laugh: "😂",
  surprised: "😮",
} as const;

export type ChatReaction = keyof typeof CHAT_REACTIONS;

export interface PeerReply {
  messageId: string;
  preview: string;
  mine: boolean;
}

export interface PeerChatMessage {
  id: string;
  text: string;
  replyTo?: PeerReply;
}

export interface PeerCaption {
  text: string;
  final: boolean;
}

const MAX_CALL_DURATION_SECONDS = 7 * 24 * 60 * 60;

export function isValidCallDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CALL_DURATION_SECONDS
  );
}

const MAX_CHAT_BYTES = 4 * 1024;
const MAX_REPLY_PREVIEW_BYTES = 512;
const MAX_CAPTION_BYTES = 768;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_DATA_CHANNEL_MESSAGE_BYTES = 24 * 1024;
const ATTACHMENT_CHUNK_BYTES = 12 * 1024;
const MAX_ATTACHMENT_NAME_LENGTH = 120;
const MAX_ATTACHMENT_MIME_LENGTH = 100;
const MAX_BUFFERED_AMOUNT = 256 * 1024;
const MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatReaction(value: unknown): value is ChatReaction {
  return typeof value === "string" && value in CHAT_REACTIONS;
}

export function isValidMessageId(value: unknown): value is string {
  return typeof value === "string" && MESSAGE_ID_PATTERN.test(value);
}

export function isValidReply(value: unknown): value is PeerReply {
  if (typeof value !== "object" || value === null) return false;
  const reply = value as Partial<PeerReply>;
  return (
    isValidMessageId(reply.messageId) &&
    typeof reply.preview === "string" &&
    reply.preview.length > 0 &&
    new TextEncoder().encode(reply.preview).byteLength <=
      MAX_REPLY_PREVIEW_BYTES &&
    typeof reply.mine === "boolean"
  );
}

export function isValidPeerChatMessage(value: unknown): value is PeerChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<PeerChatMessage>;
  return (
    isValidMessageId(message.id) &&
    typeof message.text === "string" &&
    message.text.trim().length > 0 &&
    new TextEncoder().encode(message.text).byteLength <= MAX_CHAT_BYTES &&
    (message.replyTo === undefined || isValidReply(message.replyTo))
  );
}

export function isValidPeerCaption(value: unknown): value is PeerCaption {
  if (typeof value !== "object" || value === null) return false;
  const caption = value as Partial<PeerCaption>;
  return (
    typeof caption.text === "string" &&
    caption.text.length > 0 &&
    new TextEncoder().encode(caption.text).byteLength <= MAX_CAPTION_BYTES &&
    typeof caption.final === "boolean"
  );
}

export function isValidAttachmentMetadata(value: {
  name: unknown;
  mime: unknown;
  size: unknown;
}): value is { name: string; mime: string; size: number } {
  return (
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= MAX_ATTACHMENT_NAME_LENGTH &&
    typeof value.mime === "string" &&
    value.mime.length <= MAX_ATTACHMENT_MIME_LENGTH &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    value.size <= MAX_ATTACHMENT_BYTES
  );
}
const VALID_CONTROLS = new Set<PeerControl>([
  "video-request",
  "video-accept",
  "video-decline",
  "video-end",
]);

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (message: PeerChatMessage) => void;
  onTyping: (active: boolean) => void;
  onReaction: (messageId: string, reaction: ChatReaction | null) => void;
  onCaption: (caption: PeerCaption) => void;
  onAttachment: (attachment: PeerAttachment) => void;
  onCallSummary: (durationSeconds: number) => void;
  onControl: (ctrl: PeerControl) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onScreenShareChange: (sharing: boolean) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

export interface PeerSessionOptions {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;

  private readonly polite: boolean;
  private readonly cb: PeerCallbacks;
  private readonly options?: PeerSessionOptions;
  private iceRestartCount = 0;

  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private closed = false;

  private incomingAttachments = new Map<
    string,
    {
      name: string;
      mime: string;
      size: number;
      received: number;
      chunks: Uint8Array[];
    }
  >();

  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    initiator: boolean,
    cb: PeerCallbacks,
    options?: PeerSessionOptions,
  ) {
    this.cb = cb;
    this.polite = !initiator;
    this.options = options;

    const config: RTCConfiguration = {
      iceServers:
        options?.iceServers && options.iceServers.length > 0
          ? options.iceServers
          : (DEFAULT_STUN_SERVERS as RTCIceServer[]),
      iceTransportPolicy: options?.iceTransportPolicy ?? "all",
    };

    this.pc = new RTCPeerConnection(config);

    // Send ICE candidates to the other peer.
    this.pc.onicecandidate = ({ candidate }) => {
      if (!candidate || this.closed) return;

      this.cb.onSignal("ice", JSON.stringify(candidate));
    };

    // Called whenever WebRTC needs a new SDP negotiation.
    this.pc.onnegotiationneeded = async () => {
      if (this.closed) return;

      try {
        this.makingOffer = true;

        await this.pc.setLocalDescription();

        if (this.pc.localDescription) {
          this.cb.onSignal(
            "offer",
            JSON.stringify(this.pc.localDescription),
          );
        }
      } catch (error) {
        console.error("Negotiation error:", error);
      } finally {
        this.makingOffer = false;
      }
    };

    // Receive remote media.
    this.pc.ontrack = ({ streams }) => {
      this.cb.onRemoteStream(streams[0] ?? null);
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    // Initiator creates the data channel.
    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      // Receiver waits for the initiator's data channel.
      this.pc.ondatachannel = (event) => {
        this.dc = event.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this.cb.onChannelOpen();
    };

    dc.onmessage = (event) => {
      if (
        typeof event.data !== "string" ||
        new TextEncoder().encode(event.data).byteLength >
        MAX_DATA_CHANNEL_MESSAGE_BYTES
      ) {
        console.warn("Ignoring oversized or non-text data channel message");
        return;
      }

      try {
        const msg: unknown = JSON.parse(event.data);

        if (typeof msg !== "object" || msg === null) return;

        if ("t" in msg && msg.t === "chat" && isValidPeerChatMessage(msg)) {
          this.cb.onChat({
            id: msg.id,
            text: msg.text,
            ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          });
          return;
        }

        if (
          "t" in msg &&
          msg.t === "typing" &&
          "active" in msg &&
          typeof msg.active === "boolean"
        ) {
          this.cb.onTyping(msg.active);
          return;
        }

        if ("t" in msg && msg.t === "caption" && isValidPeerCaption(msg)) {
          this.cb.onCaption({ text: msg.text, final: msg.final });
          return;
        }

        if (
          "t" in msg &&
          msg.t === "reaction" &&
          "messageId" in msg &&
          isValidMessageId(msg.messageId) &&
          "reaction" in msg &&
          (msg.reaction === null || isChatReaction(msg.reaction))
        ) {
          this.cb.onReaction(msg.messageId, msg.reaction);
          return;
        }

        if (
          "t" in msg &&
          msg.t === "ctrl" &&
          "ctrl" in msg &&
          typeof msg.ctrl === "string" &&
          isPeerControl(msg.ctrl)
        ) {
          this.cb.onControl(msg.ctrl);
          return;
        }

        if (
          "t" in msg &&
          msg.t === "call-summary" &&
          "durationSeconds" in msg &&
          isValidCallDuration(msg.durationSeconds)
        ) {
          this.cb.onCallSummary(msg.durationSeconds);
          return;
        }

        this.handleAttachmentMessage(msg);
      } catch (error) {
        console.error("Invalid data channel message:", error);
      }
    };

    dc.onerror = (event) => {
      if (
        this.closed ||
        dc.readyState === "closing" ||
        dc.readyState === "closed"
      ) {
        return;
      }

      const rtcEvent = event as RTCErrorEvent;

      console.warn("WebRTC data channel warning:", {
        message: rtcEvent.error?.message ?? "Unknown data channel error",
        detail: rtcEvent.error?.errorDetail,
        readyState: dc.readyState,
      });
    };
  }

  private handleAttachmentMessage(msg: object): void {
    if (!("t" in msg) || typeof msg.t !== "string") return;

    if (msg.t === "file-start") {
      const metadata = {
        name: "name" in msg ? msg.name : null,
        mime: "mime" in msg ? msg.mime : null,
        size: "size" in msg ? msg.size : null,
      };
      if (
        !("id" in msg) ||
        typeof msg.id !== "string" ||
        msg.id.length > 64 ||
        !isValidAttachmentMetadata(metadata) ||
        this.incomingAttachments.size >= 2 ||
        this.incomingAttachments.has(msg.id)
      ) {
        return;
      }

      this.incomingAttachments.set(msg.id, {
        name: metadata.name,
        mime: metadata.mime || "application/octet-stream",
        size: metadata.size,
        received: 0,
        chunks: [],
      });
      return;
    }

    if (msg.t === "file-chunk") {
      if (
        !("id" in msg) ||
        !("data" in msg) ||
        typeof msg.id !== "string" ||
        typeof msg.data !== "string"
      ) {
        return;
      }

      const transfer = this.incomingAttachments.get(msg.id);
      if (!transfer) return;

      const chunk = decodeBase64(msg.data);
      if (!chunk || chunk.byteLength > ATTACHMENT_CHUNK_BYTES) {
        this.incomingAttachments.delete(msg.id);
        return;
      }

      transfer.received += chunk.byteLength;
      if (transfer.received > transfer.size) {
        this.incomingAttachments.delete(msg.id);
        return;
      }
      transfer.chunks.push(chunk);
      return;
    }

    if (
      msg.t === "file-end" &&
      "id" in msg &&
      typeof msg.id === "string"
    ) {
      const transfer = this.incomingAttachments.get(msg.id);
      this.incomingAttachments.delete(msg.id);
      if (!transfer || transfer.received !== transfer.size) return;

      const blob = new Blob(transfer.chunks as BlobPart[], {
        type: transfer.mime,
      });
      this.cb.onAttachment({
        id: msg.id,
        name: transfer.name,
        mime: transfer.mime,
        size: transfer.size,
        blob,
      });
    }
  }

  async handleSignal(type: DescType, payload: string): Promise<void> {
    if (this.closed) return;

    let data: unknown;

    try {
      data = JSON.parse(payload);
    } catch {
      console.error("Invalid signaling payload");
      return;
    }

    // ─────────────────────────────────────────────
    // ICE CANDIDATE
    // ─────────────────────────────────────────────

    if (type === "ice") {
      // Ignore candidates belonging to an offer that we intentionally ignored.
      if (this.ignoreOffer) return;

      const candidate = data as RTCIceCandidateInit;

      // Remote SDP must exist before ICE candidates are added.
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(candidate);
        return;
      }

      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        if (!this.ignoreOffer) {
          console.error("Failed to add ICE candidate:", error);
        }
      }

      return;
    }

    // ─────────────────────────────────────────────
    // SDP OFFER / ANSWER
    // ─────────────────────────────────────────────

    const desc = data as RTCSessionDescriptionInit;

    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === "stable" ||
        this.isSettingRemoteAnswerPending);

    const offerCollision =
      desc.type === "offer" && !readyForOffer;

    // The impolite peer ignores an incoming offer during collision.
    this.ignoreOffer = !this.polite && offerCollision;

    if (this.ignoreOffer) {
      return;
    }

    /*
     * An answer can only be applied when we currently have
     * a local offer waiting for that answer.
     *
     * This also prevents stale/duplicate answers from causing:
     *
     * "Failed to set remote answer SDP:
     * Called in wrong state: have-remote-offer"
     */
    if (
      desc.type === "answer" &&
      this.pc.signalingState !== "have-local-offer"
    ) {
      console.warn(
        "Ignoring stale answer. Current state:",
        this.pc.signalingState,
      );

      return;
    }

    this.isSettingRemoteAnswerPending = desc.type === "answer";

    try {
      await this.pc.setRemoteDescription(desc);
    } catch (error) {
      console.error(
        "Failed to set remote description:",
        desc.type,
        this.pc.signalingState,
        error,
      );

      return;
    } finally {
      this.isSettingRemoteAnswerPending = false;
    }

    /*
     * Important:
     * ICE candidates queued before the remote SDP arrived
     * can only be processed AFTER setRemoteDescription().
     */
    await this.flushPendingCandidates();

    // If we received an offer, create and send the answer.
    if (desc.type === "offer") {
      try {
        await this.pc.setLocalDescription();

        if (this.pc.localDescription) {
          this.cb.onSignal(
            "answer",
            JSON.stringify(this.pc.localDescription),
          );
        }
      } catch (error) {
        console.error("Failed to create WebRTC answer:", error);
      }
    }
  }

  requestIceRestart(): boolean {
    if (this.closed || this.pc.signalingState === "closed") return false;

    try {
      this.iceRestartCount += 1;
      // This schedules negotiationneeded; the existing perfect-negotiation
      // path creates and signals the ICE-restart offer.
      this.pc.restartIce();
      return true;
    } catch (error) {
      console.warn("ICE restart could not be requested:", error);
      return false;
    }
  }

  getPeerConnection(): RTCPeerConnection {
    return this.pc;
  }

  getIceRestartCount(): number {
    return this.iceRestartCount;
  }

  getIceConfiguration(): RTCConfiguration {
    return this.pc.getConfiguration();
  }

  async getDiagnostics(
    previous?: ConnectionDiagnostics | null,
  ): Promise<ConnectionDiagnostics> {
    return extractConnectionDiagnostics(this.pc, previous, this.iceRestartCount);
  }

  private async flushPendingCandidates() {
    if (
      !this.pc.remoteDescription ||
      this.pendingCandidates.length === 0
    ) {
      return;
    }

    const queued = this.pendingCandidates;
    this.pendingCandidates = [];

    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        if (!this.ignoreOffer) {
          console.error(
            "Failed to add queued ICE candidate:",
            error,
          );
        }
      }
    }
  }

  sendChat(text: string, replyTo?: PeerReply): string | null {
    const message: PeerChatMessage = {
      id: crypto.randomUUID(),
      text,
      ...(replyTo ? { replyTo } : {}),
    };
    if (!isValidPeerChatMessage(message)) return null;

    return this.safeSend({
      t: "chat",
      ...message,
    })
      ? message.id
      : null;
  }

  sendTyping(active: boolean): boolean {
    return this.safeSend({ t: "typing", active });
  }

  sendReaction(
    messageId: string,
    reaction: ChatReaction | null,
  ): boolean {
    if (!isValidMessageId(messageId)) return false;
    if (reaction !== null && !isChatReaction(reaction)) return false;
    return this.safeSend({ t: "reaction", messageId, reaction });
  }

  sendCaption(text: string, final: boolean): boolean {
    const caption = { text: text.trim(), final };
    if (!isValidPeerCaption(caption)) return false;
    return this.safeSend({ t: "caption", ...caption });
  }

  sendControl(ctrl: PeerControl): boolean {
    return this.safeSend({
      t: "ctrl",
      ctrl,
    });
  }

  sendCallSummary(durationSeconds: number): boolean {
    if (!isValidCallDuration(durationSeconds)) return false;
    return this.safeSend({ t: "call-summary", durationSeconds });
  }

  async sendAttachment(file: File): Promise<string | null> {
    if (
      !this.dc ||
      this.dc.readyState !== "open" ||
      !isValidAttachmentMetadata({
        name: file.name,
        mime: file.type,
        size: file.size,
      })
    ) {
      return null;
    }

    const id = crypto.randomUUID();
    if (
      !this.safeSend({
        t: "file-start",
        id,
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
      })
    ) {
      return null;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    for (let offset = 0; offset < bytes.byteLength; offset += ATTACHMENT_CHUNK_BYTES) {
      if (!(await this.waitForDataChannel())) return null;
      const chunk = bytes.subarray(
        offset,
        Math.min(offset + ATTACHMENT_CHUNK_BYTES, bytes.byteLength),
      );
      if (!this.safeSend({ t: "file-chunk", id, data: encodeBase64(chunk) })) {
        return null;
      }
    }

    return this.safeSend({ t: "file-end", id }) ? id : null;
  }

  private async waitForDataChannel(): Promise<boolean> {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") return false;
    if (dc.bufferedAmount <= MAX_BUFFERED_AMOUNT) return true;

    dc.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT / 2;
    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => {
        dc.removeEventListener("bufferedamountlow", onLow);
        resolve(false);
      }, 5_000);
      const onLow = () => {
        window.clearTimeout(timeout);
        resolve(dc.readyState === "open");
      };
      dc.addEventListener("bufferedamountlow", onLow, { once: true });
    });
  }

  private safeSend(obj: unknown): boolean {
    if (!this.dc || this.dc.readyState !== "open") {
      return false;
    }

    try {
      this.dc.send(JSON.stringify(obj));
      return true;
    } catch (error) {
      console.error("Failed to send data channel message:", error);
      return false;
    }
  }

  async startVideo(): Promise<MediaStream> {
    if (this.closed) {
      throw new Error("Peer connection is closed");
    }

    if (!this.localStream) {
      const stream = await this.acquireLocalMedia();

      this.localStream = stream;

      for (const track of stream.getTracks()) {
        this.pc.addTrack(track, stream);
      }

      this.cb.onLocalStream(stream);
    }

    return this.localStream;
  }

  private async acquireLocalMedia(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw error;
      }

      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return navigator.mediaDevices.getUserMedia({ video: true });
      }
    }
  }

  setMicrophoneEnabled(enabled: boolean): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = enabled;
    return true;
  }

  setCameraEnabled(enabled: boolean): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = enabled;
    return true;
  }

  async switchMediaDevice(
    kind: "audioinput" | "videoinput",
    deviceId: string,
  ): Promise<MediaStream> {
    if (this.closed || !this.localStream || !deviceId) {
      throw new Error("Media device switching is unavailable");
    }

    const trackKind = kind === "audioinput" ? "audio" : "video";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "audioinput" ? { deviceId: { exact: deviceId } } : false,
      video: kind === "videoinput" ? { deviceId: { exact: deviceId } } : false,
    });
    const nextTrack = kind === "audioinput"
      ? stream.getAudioTracks()[0]
      : stream.getVideoTracks()[0];
    if (!nextTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Selected media device is unavailable");
    }

    const previousTrack = trackKind === "audio"
      ? this.localStream.getAudioTracks()[0]
      : this.localStream.getVideoTracks()[0];
    nextTrack.enabled = previousTrack?.enabled ?? true;

    const sender = this.pc.getSenders().find((item) => {
      if (item.track?.kind !== trackKind) return false;
      return trackKind !== "video" || !this.screenStream;
    });
    if (sender) await sender.replaceTrack(nextTrack);
    else if (trackKind !== "video" || !this.screenStream) {
      this.pc.addTrack(nextTrack, this.localStream);
    }

    const retainedTracks = this.localStream
      .getTracks()
      .filter((track) => track.kind !== trackKind);
    previousTrack?.stop();
    this.localStream = new MediaStream([...retainedTracks, nextTrack]);

    const preview = this.screenStream
      ? new MediaStream([
          ...this.screenStream.getVideoTracks(),
          ...this.localStream.getAudioTracks(),
        ])
      : this.localStream;
    this.cb.onLocalStream(preview);
    return preview;
  }

  async startScreenShare(): Promise<MediaStream> {
    if (this.closed || !this.localStream) {
      throw new Error("Video is not active");
    }

    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const screenTrack = display.getVideoTracks()[0];
    const sender = this.pc
      .getSenders()
      .find((item) => item.track?.kind === "video");
    if (!screenTrack || !sender) {
      display.getTracks().forEach((track) => track.stop());
      throw new Error("Screen sharing is unavailable");
    }

    if (this.screenStream) await this.stopScreenShare();
    await sender.replaceTrack(screenTrack);
    this.screenStream = display;
    this.cb.onScreenShareChange(true);
    screenTrack.addEventListener(
      "ended",
      () => {
        void this.stopScreenShare();
      },
      { once: true },
    );

    const preview = new MediaStream([
      screenTrack,
      ...this.localStream.getAudioTracks(),
    ]);
    this.cb.onLocalStream(preview);
    return preview;
  }

  async stopScreenShare(): Promise<MediaStream | null> {
    if (!this.screenStream) return this.localStream;

    const cameraTrack = this.localStream?.getVideoTracks()[0] ?? null;
    const sender = this.pc
      .getSenders()
      .find((item) => item.track?.kind === "video");
    if (sender) await sender.replaceTrack(cameraTrack);

    const screen = this.screenStream;
    this.screenStream = null;
    screen.getTracks().forEach((track) => track.stop());
    this.cb.onScreenShareChange(false);
    this.cb.onLocalStream(this.localStream);
    return this.localStream;
  }

  stopVideo() {
    if (this.screenStream) {
      const screen = this.screenStream;
      this.screenStream = null;
      screen.getTracks().forEach((track) => track.stop());
      this.cb.onScreenShareChange(false);
    }
    if (!this.localStream) return;

    for (const track of this.localStream.getTracks()) {
      track.stop();
    }

    for (const sender of this.pc.getSenders()) {
      if (!sender.track) continue;

      try {
        this.pc.removeTrack(sender);
      } catch {
        // Connection may already be closing.
      }
    }

    this.localStream = null;
    this.cb.onLocalStream(null);
  }

  close() {
    if (this.closed) return;

    this.closed = true;

    this.stopVideo();

    this.pendingCandidates = [];
    this.incomingAttachments.clear();

    if (this.dc) {
      try {
        this.dc.close();
      } catch { }

      this.dc = null;
    }

    try {
      this.pc.close();
    } catch { }

    this.cb.onRemoteStream(null);
  }
}

function isPeerControl(value: string): value is PeerControl {
  return VALID_CONTROLS.has(value as PeerControl);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
