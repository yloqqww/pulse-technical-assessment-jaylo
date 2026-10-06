export type DescType = "offer" | "answer" | "ice";

export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end";

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;

  private readonly polite: boolean;
  private readonly cb: PeerCallbacks;

  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  private localStream: MediaStream | null = null;
  private closed = false;

  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;

    this.pc = new RTCPeerConnection(ICE_CONFIG);

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
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.t === "chat" && typeof msg.text === "string") {
          this.cb.onChat(msg.text);
          return;
        }

        if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl);
        }
      } catch (error) {
        console.error("Invalid data channel message:", error);
      }
    };

    dc.onerror = (error) => {
      console.error("Data channel error:", error);
    };
  }

  async handleSignal(type: DescType, payload: string) {
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

  sendChat(text: string) {
    this.safeSend({
      t: "chat",
      text,
    });
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({
      t: "ctrl",
      ctrl,
    });
  }

  private safeSend(obj: unknown) {
    if (!this.dc || this.dc.readyState !== "open") {
      return;
    }

    try {
      this.dc.send(JSON.stringify(obj));
    } catch (error) {
      console.error("Failed to send data channel message:", error);
    }
  }

  async startVideo(): Promise<MediaStream> {
    if (this.closed) {
      throw new Error("Peer connection is closed");
    }

    if (!this.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      this.localStream = stream;

      for (const track of stream.getTracks()) {
        this.pc.addTrack(track, stream);
      }
    }

    return this.localStream;
  }

  stopVideo() {
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
  }

  close() {
    if (this.closed) return;

    this.closed = true;

    this.stopVideo();

    this.pendingCandidates = [];

    if (this.dc) {
      try {
        this.dc.close();
      } catch {}

      this.dc = null;
    }

    try {
      this.pc.close();
    } catch {}

    this.cb.onRemoteStream(null);
  }
}