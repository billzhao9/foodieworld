import { Reactor } from "@reactor-team/js-sdk";
import type { LiveConnection } from "../../shared/contracts";

export interface LivePlayer {
  update(prompt: string, audioPrompt: string): Promise<void>;
  updateAudio(prompt: string): Promise<void>;
  setMuted(muted: boolean): void;
  speak(audio: ArrayBuffer): Promise<void>;
  stopSpeech(): void;
  resumeAudio(): Promise<void>;
  close(): Promise<Blob | null>;
}

const formats = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4",
  "video/webm",
];
export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    formats.some((type) => MediaRecorder.isTypeSupported(type))
  );
}

function bounded<T>(
  promise: Promise<T>,
  milliseconds: number,
  code: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Call synchronously from the start button, before image generation awaits.
// The resumed context is transferred to connectLive, which owns its cleanup.
export function prepareLiveAudio(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    void context.resume().catch(() => {});
    return context;
  } catch {
    if (context) void context.close().catch(() => {});
    return undefined;
  }
}

export async function connectLive(args: {
  connection: LiveConnection;
  image: Blob;
  prompt: string;
  audioPrompt: string;
  audioContext?: AudioContext;
  narration?: ArrayBuffer;
  onNarrationError?: (error: Error) => void;
  muted: boolean;
  onAudioBlocked: () => void;
  video: HTMLVideoElement;
  onError: (error: Error) => void;
  onComplete: () => void;
  onPlaying: () => void;
}): Promise<LivePlayer> {
  let client: Reactor;
  try {
    client = new Reactor({
      modelName: args.connection.modelSlug,
      apiUrl: args.connection.apiBase,
      readyTimeoutMs: 20_000,
      controlRequestTimeoutMs: 10_000,
      maxSessionAttempts: 20,
      // SDP negotiation polls the same session; one poll expires before the
      // remote answer can arrive. This does not create additional paid sessions.
      maxSdpAttempts: 20,
      logLevel: "off",
    });
  } catch (error) {
    if (args.audioContext)
      await bounded(
        args.audioContext.close(),
        2000,
        "AUDIO_CLOSE_TIMEOUT",
      ).catch(() => {});
    throw error;
  }
  const output = new MediaStream();
  let recorder: MediaRecorder | undefined;
  let recordingError: Error | undefined;
  const chunks: Blob[] = [];
  let closed = false;
  let complete = false;
  let reported = false;
  let closePromise: Promise<Blob | null> | undefined;
  let audioContext: AudioContext | undefined = args.audioContext;
  let listenerGain: GainNode | undefined;
  let effectsGain: GainNode | undefined;
  let narrationTimer: ReturnType<typeof setTimeout> | undefined;
  let openingNarrationScheduled = false;
  type Speech = {
    source?: AudioBufferSourceNode;
    resolve: () => void;
    reject: (error: Error) => void;
  };
  let speech: Speech | undefined;
  let audioMuted = args.muted;
  let audioBlockedReported = false;
  let updates: Promise<void> = Promise.resolve();
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  const audioSources: MediaStreamAudioSourceNode[] = [];
  // Listening and recording use independent branches. Muting the listener
  // must not silence a saved creation or change an active recorder's tracks.
  try {
    audioContext ??= prepareLiveAudio();
    if (audioContext) {
      listenerGain = audioContext.createGain();
      listenerGain.gain.value = audioMuted ? 0 : 1;
      listenerGain.connect(audioContext.destination);
      effectsGain = audioContext.createGain();
      effectsGain.gain.value = 1;
      effectsGain.connect(listenerGain);
      if (recordingSupported())
        audioDestination = audioContext.createMediaStreamDestination();
      if (audioDestination) effectsGain.connect(audioDestination);
    }
  } catch {
    listenerGain?.disconnect();
    effectsGain?.disconnect();
    listenerGain = undefined;
    effectsGain = undefined;
    if (audioContext) void audioContext.close().catch(() => {});
    audioContext = undefined;
    audioDestination = undefined;
  }
  // The element is only the picture when Web Audio handles monitoring.
  args.video.muted = audioContext ? true : audioMuted;

  function audioBlocked() {
    if (closed || audioMuted) return;
    setMuted(true);
    if (audioBlockedReported) return;
    audioBlockedReported = true;
    args.onAudioBlocked();
  }

  function setMuted(muted: boolean) {
    audioMuted = muted;
    if (listenerGain) listenerGain.gain.value = muted ? 0 : 1;
    args.video.muted = audioContext ? true : muted;
  }

  async function resumeAudio() {
    if (closed) throw new Error("LIVE_CLOSED");
    if (audioContext) {
      try {
        if (audioContext.state !== "running")
          await bounded(audioContext.resume(), 3000, "AUDIO_RESUME_TIMEOUT");
        if (audioContext.state === "running") audioBlockedReported = false;
        else throw new Error("AUDIO_CONTEXT_SUSPENDED");
      } catch {
        audioBlocked();
        throw new Error("AUDIO_PLAYBACK_BLOCKED");
      }
    } else {
      // Also retry playback here: on browsers without Web Audio, this method
      // runs inside the sound button's gesture to unlock native media audio.
      args.video.muted = audioMuted;
      try {
        await bounded(args.video.play(), 5000, "AUDIO_PLAYBACK_TIMEOUT");
        audioBlockedReported = false;
      } catch {
        audioBlocked();
        args.video.muted = true;
        void args.video.play().catch(() => {});
        throw new Error("AUDIO_PLAYBACK_BLOCKED");
      }
    }
  }

  function finishSpeech(current: Speech, error?: Error) {
    if (speech !== current) return;
    speech = undefined;
    if (current.source) {
      current.source.onended = null;
      current.source.disconnect();
    }
    if (effectsGain) effectsGain.gain.value = 1;
    if (error) current.reject(error);
    else current.resolve();
  }

  function stopSpeech() {
    // An explicit replacement also cancels an opening voice awaiting frames.
    openingNarrationScheduled = true;
    clearTimeout(narrationTimer);
    narrationTimer = undefined;
    const current = speech;
    if (!current) return;
    // Settle before stop: browsers may dispatch ended immediately or later.
    finishSpeech(current);
    try {
      current.source?.stop();
    } catch {
      /* A naturally ended source is already stopped. */
    }
  }

  function speak(audio: ArrayBuffer): Promise<void> {
    stopSpeech();
    if (closed) return Promise.reject(new Error("LIVE_CLOSED"));
    const context = audioContext;
    if (!context || !listenerGain || !effectsGain)
      return Promise.reject(new Error("NARRATION_UNAVAILABLE"));
    return new Promise<void>((resolve, reject) => {
      const current: Speech = { resolve, reject };
      speech = current;
      void (async () => {
        // decodeAudioData may detach its input, so preserve reusable TTS bytes.
        const buffer = await bounded(
          context.decodeAudioData(audio.slice(0)),
          10_000,
          "NARRATION_DECODE_TIMEOUT",
        );
        if (closed || speech !== current) return;
        await resumeAudio();
        if (closed || speech !== current) return;
        const source = context.createBufferSource();
        current.source = source;
        source.buffer = buffer;
        // Narration bypasses background ducking and listener mute for recording.
        source.connect(listenerGain!);
        if (audioDestination) source.connect(audioDestination);
        source.onended = () => finishSpeech(current);
        effectsGain!.gain.value = 0.3;
        source.start();
      })().catch((error: unknown) => {
        finishSpeech(
          current,
          error instanceof Error ? error : new Error("NARRATION_FAILED"),
        );
      });
    });
  }

  let mediaTimer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let firstFrame: number | undefined;
  let phase = "connect";
  function diagnostic(error: unknown) {
    if (!import.meta.env.DEV) return;
    const detail =
      error instanceof Error ? error.message : "Unknown live error";
    console.warn(
      "FoodieWorld live",
      phase,
      detail
        .replace(/eyJ[\w.-]+/g, "[credential]")
        .replace(/Bearer\s+\S+/gi, "Bearer [credential]")
        .replace(/https?:\/\/\S+/g, "[endpoint]"),
    );
  }
  const onPlaying = () => {
    if (!closed && started && args.video.videoWidth > 0) {
      clearTimeout(mediaTimer);
      args.onPlaying();
      if (closed) return;
      if (args.narration && !openingNarrationScheduled) {
        openingNarrationScheduled = true;
        narrationTimer = setTimeout(() => {
          narrationTimer = undefined;
          void speak(args.narration!).catch((error: unknown) => {
            const failure =
              error instanceof Error ? error : new Error("NARRATION_FAILED");
            diagnostic(failure);
            args.onNarrationError?.(failure);
          });
        }, 800);
      }
    }
  };
  args.video.addEventListener("playing", onPlaying);
  args.video.addEventListener("loadeddata", onPlaying);

  async function close(): Promise<Blob | null> {
    if (closePromise) return closePromise;
    closed = true;
    stopSpeech();
    clearTimeout(mediaTimer);
    args.video.removeEventListener("playing", onPlaying);
    args.video.removeEventListener("loadeddata", onPlaying);
    if (firstFrame !== undefined)
      args.video.cancelVideoFrameCallback(firstFrame);
    closePromise = (async () => {
      try {
        if (recorder && recorder.state !== "inactive") {
          const current = recorder;
          await bounded(
            new Promise<void>((resolve, reject) => {
              current.addEventListener("stop", () => resolve(), { once: true });
              current.addEventListener(
                "error",
                () => reject(new Error("RECORDING_FAILED")),
                { once: true },
              );
              current.stop();
            }),
            4000,
            "RECORDING_STOP_TIMEOUT",
          );
        }
        if (recordingError) throw recordingError;
        return chunks.length
          ? new Blob(chunks, { type: recorder?.mimeType || chunks[0].type })
          : null;
      } finally {
        // Preserve an already captured recording even if the remote teardown
        // cannot acknowledge; force-close the local transport below.
        try {
          await bounded(
            client.disconnect(),
            3000,
            "LIVE_DISCONNECT_TIMEOUT",
          ).catch(() => {});
        } finally {
          client.getPeerConnection()?.close();
          client[Symbol.dispose]();
          output.getTracks().forEach((track) => track.stop());
          audioSources.forEach((source) => source.disconnect());
          listenerGain?.disconnect();
          effectsGain?.disconnect();
          audioDestination?.disconnect();
          audioDestination?.stream.getTracks().forEach((track) => track.stop());
          if (audioContext)
            await bounded(
              audioContext.close(),
              2000,
              "AUDIO_CLOSE_TIMEOUT",
            ).catch(() => {});
          if (args.video.srcObject === output) args.video.srcObject = null;
        }
      }
    })();
    return closePromise;
  }

  function fail(value: unknown) {
    if (closed) return;
    diagnostic(value);
    const error = value instanceof Error ? value : new Error("LIVE_FAILED");
    void close().catch(() => {});
    if (!reported) {
      reported = true;
      args.onError(error);
    }
  }

  client.on("error", fail);
  client.on("message", (message) => {
    if (closed) return;
    if (message.type === "command_error" || message.type === "error")
      fail(new Error("LIVE_COMMAND_FAILED"));
    if (message.type === "generation_complete") {
      complete = true;
      args.onComplete();
    }
    if (message.type === "generation_started") complete = false;
  });
  client.on("trackReceived", (name, track) => {
    if (closed || !["main_video", "main_audio"].includes(name)) return;
    if (output.getTracks().some((item) => item.id === track.id)) return;
    try {
      output
        .getTracks()
        .filter((item) => item.kind === track.kind)
        .forEach((item) => output.removeTrack(item));
      output.addTrack(track);
      if (name === "main_audio" && audioContext && effectsGain) {
        audioSources.splice(0).forEach((source) => source.disconnect());
        const source = audioContext.createMediaStreamSource(
          new MediaStream([track]),
        );
        source.connect(effectsGain);
        audioSources.push(source);
        void resumeAudio().catch(() => {});
      }
      if (args.video.srcObject !== output) args.video.srcObject = output;
      // A track can arrive before upload/start, with no frames available yet.
      // The post-start media timer owns the first-frame deadline.
      args.video.muted = audioContext ? true : audioMuted;
      void args.video.play().catch((error) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          audioBlocked();
          // Keep the picture moving while the UI offers a sound-unlock tap.
          args.video.muted = true;
          void args.video.play().catch(() => {});
        } else if (
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          fail(error);
        }
      });
      if (name === "main_video" && !recorder && recordingSupported()) {
        const stream = new MediaStream([
          track,
          ...(audioDestination?.stream.getAudioTracks() ??
            output.getAudioTracks()),
        ]);
        recorder = new MediaRecorder(stream, {
          mimeType: formats.find((type) => MediaRecorder.isTypeSupported(type)),
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror = () => {
          recordingError = new Error("RECORDING_FAILED");
          fail(recordingError);
        };
        recorder.start(1000);
      }
    } catch (error) {
      fail(error);
    }
  });

  async function command(name: string, data: Record<string, unknown> = {}) {
    if (closed) throw new Error("LIVE_CLOSED");
    const reply = await bounded(
      client.sendCommand(name, data),
      10_000,
      "LIVE_COMMAND_TIMEOUT",
    );
    if (closed || reply?.type === "command_error" || reply?.type === "error")
      throw new Error("LIVE_COMMAND_FAILED");
    if (
      (name === "set_image" && reply?.type !== "image_accepted") ||
      (name === "set_prompt" && reply?.type !== "prompt_accepted") ||
      (name === "set_audio_enabled" &&
        reply?.type !== "audio_enabled_accepted") ||
      (name === "set_audio_prompt" && reply?.type !== "audio_prompt_accepted")
    )
      throw new Error("LIVE_COMMAND_UNCONFIRMED");
  }
  try {
    await bounded(
      client.connect(args.connection.jwt, {
        sessionId: args.connection.sessionId,
        maxAttempts: 20,
      }),
      25_000,
      "LIVE_CONNECT_TIMEOUT",
    );
    if (closed) throw new Error("LIVE_CLOSED");
    phase = "upload";
    const image = await bounded(
      client.uploadFile(args.image),
      12_000,
      "LIVE_UPLOAD_TIMEOUT",
    );
    phase = "set_image";
    await command("set_image", { image });
    phase = "set_audio_enabled";
    await command("set_audio_enabled", { audio_enabled: true });
    phase = "set_audio_prompt";
    await command("set_audio_prompt", { prompt: args.audioPrompt });
    phase = "set_prompt";
    await command("set_prompt", { prompt: args.prompt, passthrough: true });
    phase = "start";
    await command("start");
    phase = "playback";
    started = true;
    firstFrame = args.video.requestVideoFrameCallback?.(() => onPlaying());
    onPlaying();
    if (
      args.video.paused ||
      args.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    )
      mediaTimer = setTimeout(
        () => fail(new Error("LIVE_VIDEO_TIMEOUT")),
        25_000,
      );
  } catch (error) {
    diagnostic(error);
    await close().catch(() => {});
    throw error;
  }
  function enqueueUpdate(action: () => Promise<void>): Promise<void> {
    const pending = updates
      .then(async () => {
        if (closed) throw new Error("LIVE_CLOSED");
        if (complete) throw new Error("LIVE_COMPLETE");
        await action();
      })
      .catch((error: unknown) => {
        fail(error);
        throw error;
      });
    // A rejected operation must not leave later callers waiting forever.
    updates = pending.catch(() => {});
    return pending;
  }
  return {
    resumeAudio,
    setMuted,
    speak,
    stopSpeech,
    update(prompt, audioPrompt) {
      return enqueueUpdate(async () => {
        await command("set_audio_prompt", { prompt: audioPrompt });
        await command("set_prompt", { prompt, passthrough: true });
      });
    },
    updateAudio(prompt) {
      return enqueueUpdate(() => command("set_audio_prompt", { prompt }));
    },
    close,
  };
}
