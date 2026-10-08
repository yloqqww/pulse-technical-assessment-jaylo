type StopSound = () => void;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

export function primeAudio(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume();
}

function tone(
  frequency: number,
  duration: number,
  delay = 0,
  volume = 0.035,
  type: OscillatorType = "sine",
): void {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function playConnectedSound(): void {
  tone(523.25, 0.12, 0, 0.028);
  tone(783.99, 0.17, 0.09, 0.025);
}

export function playIncomingMessageSound(): void {
  tone(659.25, 0.08, 0, 0.022);
  tone(880, 0.1, 0.065, 0.018);
}

export function playSentMessageSound(): void {
  tone(587.33, 0.07, 0, 0.014);
}

export function playCallEndedSound(): void {
  tone(493.88, 0.13, 0, 0.026, "triangle");
  tone(329.63, 0.2, 0.1, 0.023, "triangle");
}

export function startRingtone(): StopSound {
  if (typeof window === "undefined") return () => undefined;

  let stopped = false;
  const playPattern = () => {
    if (stopped) return;
    tone(440, 0.22, 0, 0.026);
    tone(554.37, 0.22, 0.28, 0.024);
  };

  playPattern();
  const timer = window.setInterval(playPattern, 1_700);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
