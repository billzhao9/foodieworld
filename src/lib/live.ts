import { Reactor } from "@reactor-team/js-sdk";
import type { LiveConnection } from "../../shared/contracts";

export interface LivePlayer {
  update(prompt: string): Promise<void>;
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

export async function connectLive(args: {
  connection: LiveConnection;
  image: Blob;
  prompt: string;
  video: HTMLVideoElement;
  onError: (error: Error) => void;
  onComplete: () => void;
  onPlaying: () => void;
}): Promise<LivePlayer> {
  const client = new Reactor({
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
  const output = new MediaStream();
  let recorder: MediaRecorder | undefined;
  let recordingError: Error | undefined;
  const chunks: Blob[] = [];
  let closed = false;
  let complete = false;
  let reported = false;
  let closePromise: Promise<Blob | null> | undefined;
  let audioContext: AudioContext | undefined;
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  const audioSources: MediaStreamAudioSourceNode[] = [];
  // A stable mixed audio track lets audio arrive after video without changing
  // the track set of an active MediaRecorder (which browsers forbid).
  try {
    if (recordingSupported() && typeof AudioContext !== "undefined") {
      audioContext = new AudioContext();
      audioDestination = audioContext.createMediaStreamDestination();
      void bounded(audioContext.resume(), 3000, "AUDIO_RESUME_TIMEOUT").catch(
        () => {},
      );
    }
  } catch {
    audioContext = undefined;
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
    }
  };
  args.video.addEventListener("playing", onPlaying);
  args.video.addEventListener("loadeddata", onPlaying);

  async function close(): Promise<Blob | null> {
    if (closePromise) return closePromise;
    closed = true;
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
      if (name === "main_audio" && audioContext && audioDestination) {
        audioSources.forEach((source) => source.disconnect());
        const source = audioContext.createMediaStreamSource(
          new MediaStream([track]),
        );
        source.connect(audioDestination);
        audioSources.push(source);
      }
      if (args.video.srcObject !== output) args.video.srcObject = output;
      // A track can arrive before upload/start, with no frames available yet.
      // The post-start media timer owns the first-frame deadline.
      void args.video.play().catch((error) => {
        // Mobile autoplay can require the visible native play button.
        if (
          !(
            error instanceof DOMException &&
            ["NotAllowedError", "AbortError"].includes(error.name)
          )
        )
          fail(error);
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
      (name === "set_prompt" && reply?.type !== "prompt_accepted")
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
  return {
    async resumeAudio() {
      if (audioContext?.state === "suspended") await audioContext.resume();
    },
    async update(prompt) {
      try {
        await command("set_prompt", { prompt, passthrough: true });
        if (complete) {
          await command("start");
          complete = false;
        }
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    close,
  };
}
