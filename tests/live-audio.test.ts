import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveConnection } from "../shared/contracts";

const sdk = vi.hoisted(() => ({
  instances: [] as any[],
  replies: new Map<string, string>(),
  failConstructor: false,
  hook: undefined as
    | undefined
    | ((
        name: string,
        data: Record<string, unknown>,
      ) => Promise<{ type: string }>),
}));
vi.mock("@reactor-team/js-sdk", () => ({
  Reactor: class {
    handlers = new Map<string, (...args: any[]) => void>();
    peer = { close: vi.fn() };
    connect = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    uploadFile = vi.fn(async () => "uploaded-image");
    sendCommand = vi.fn(async (name: string, data: Record<string, unknown>) => {
      if (sdk.hook) return sdk.hook(name, data);
      const defaults: Record<string, string> = {
        set_image: "image_accepted",
        set_prompt: "prompt_accepted",
        set_audio_enabled: "audio_enabled_accepted",
        set_audio_prompt: "audio_prompt_accepted",
        start: "generation_started",
      };
      return { type: sdk.replies.get(name) ?? defaults[name] ?? "ok" };
    });
    [Symbol.dispose] = vi.fn();
    constructor() {
      if (sdk.failConstructor) throw new Error("SDK_INIT_FAILED");
      sdk.instances.push(this);
    }
    on(name: string, handler: (...args: any[]) => void) {
      this.handlers.set(name, handler);
    }
    emit(name: string, ...args: any[]) {
      this.handlers.get(name)?.(...args);
    }
    getPeerConnection() {
      return this.peer;
    }
  },
}));

import { connectLive, prepareLiveAudio } from "../src/lib/live";

class Track {
  stop = vi.fn();
  constructor(
    public kind: string,
    public id: string,
  ) {}
}
class Stream {
  tracks: Track[];
  constructor(tracks: Track[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  addTrack(track: Track) {
    this.tracks.push(track);
  }
  removeTrack(track: Track) {
    this.tracks = this.tracks.filter((item) => item !== track);
  }
}
class AudioNode {
  destinations: AudioNode[] = [];
  connect = vi.fn((destination: AudioNode) => {
    this.destinations.push(destination);
  });
  disconnect = vi.fn(() => {
    this.destinations = [];
  });
}
class BufferSource extends AudioNode {
  buffer: unknown;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
  end() {
    this.onended?.();
  }
}
class Context {
  static instances: Context[] = [];
  state = "suspended";
  destination = new AudioNode();
  monitor = Object.assign(new AudioNode(), { gain: { value: 1 } });
  effects = Object.assign(new AudioNode(), { gain: { value: 1 } });
  gainCalls = 0;
  bufferSources: BufferSource[] = [];
  decodeAudioData = vi
    .fn<(audio: ArrayBuffer) => Promise<{ duration: number }>>()
    .mockResolvedValue({ duration: 2 });
  recording = Object.assign(new AudioNode(), {
    stream: new Stream([new Track("audio", "mixed-audio")]),
  });
  sources: AudioNode[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    Context.instances.push(this);
  }
  createGain() {
    return this.gainCalls++ === 0 ? this.monitor : this.effects;
  }
  createBufferSource() {
    const source = new BufferSource();
    this.bufferSources.push(source);
    return source;
  }
  createMediaStreamDestination() {
    return this.recording;
  }
  createMediaStreamSource(_stream: Stream) {
    const source = new AudioNode();
    this.sources.push(source);
    return source;
  }
}
class Recorder extends EventTarget {
  static instances: Recorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onerror?: () => void;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["recorded-video-and-audio"], { type: this.mimeType }),
    });
    this.dispatchEvent(new Event("stop"));
  });
  constructor(public stream: Stream) {
    super();
    Recorder.instances.push(this);
  }
}
class Video extends EventTarget {
  muted = false;
  srcObject: Stream | null = null;
  paused = false;
  readyState = 2;
  videoWidth = 640;
  play = vi.fn(async () => {});
  requestVideoFrameCallback = vi.fn(() => 1);
  cancelVideoFrameCallback = vi.fn();
}
const connection: LiveConnection = {
  protocol: "webrtc",
  apiBase: "https://example.invalid",
  sessionId: "existing-session",
  jwt: "test-token",
  modelSlug: "test-model",
};
function args(video = new Video(), context?: Context) {
  return {
    connection,
    image: new Blob(["image"]),
    prompt: "Visual cooking",
    audioPrompt: "Chinese cooking narration and sizzling",
    video: video as unknown as HTMLVideoElement,
    audioContext: context as unknown as AudioContext | undefined,
    muted: false,
    onAudioBlocked: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
    onPlaying: vi.fn(),
  };
}
beforeEach(() => {
  sdk.instances.length = 0;
  sdk.replies.clear();
  sdk.hook = undefined;
  sdk.failConstructor = false;
  Context.instances.length = 0;
  Recorder.instances.length = 0;
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("MediaStream", Stream);
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live audio protocol and routing", () => {
  it("resumes during the user gesture and enables/ACKs audio before the only start", async () => {
    const prepared = prepareLiveAudio();
    const context = Context.instances[0];
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.state).toBe("running");
    const player = await connectLive({ ...args(), audioContext: prepared });
    expect(Context.instances).toHaveLength(1);
    expect(sdk.instances[0].sendCommand.mock.calls).toEqual([
      ["set_image", { image: "uploaded-image" }],
      ["set_audio_enabled", { audio_enabled: true }],
      [
        "set_audio_prompt",
        { prompt: "Chinese cooking narration and sizzling" },
      ],
      ["set_prompt", { prompt: "Visual cooking", passthrough: true }],
      ["start", {}],
    ]);
    await player.close();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("serializes action audio before visual and language-only audio without restarting", async () => {
    const player = await connectLive(args());
    const client = sdk.instances[0];
    client.sendCommand.mockClear();
    let release!: () => void;
    sdk.hook = async (name, data) => {
      if (name === "set_audio_prompt" && data.prompt === "action audio")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return {
        type:
          name === "set_audio_prompt"
            ? "audio_prompt_accepted"
            : "prompt_accepted",
      };
    };
    const action = player.update("action visual", "action audio");
    const language = player.updateAudio("English narration");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(client.sendCommand.mock.calls).toEqual([
      ["set_audio_prompt", { prompt: "action audio" }],
    ]);
    release();
    await Promise.all([action, language]);
    expect(client.sendCommand.mock.calls).toEqual([
      ["set_audio_prompt", { prompt: "action audio" }],
      ["set_prompt", { prompt: "action visual", passthrough: true }],
      ["set_audio_prompt", { prompt: "English narration" }],
    ]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    await player.close();
  });

  it.each(["set_audio_enabled", "set_audio_prompt"])(
    "rejects an unconfirmed %s and tears down before start",
    async (command) => {
      sdk.replies.set(command, "state");
      const context = new Context();
      await expect(connectLive(args(new Video(), context))).rejects.toThrow(
        "LIVE_COMMAND_UNCONFIRMED",
      );
      const client = sdk.instances[0];
      expect(
        client.sendCommand.mock.calls.some(
          ([name]: [string]) => name === "start",
        ),
      ).toBe(false);
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(client.peer.close).toHaveBeenCalledOnce();
      expect(context.close).toHaveBeenCalledOnce();
    },
  );

  it("does not send a visual update after a rejected audio ACK", async () => {
    const input = args();
    const player = await connectLive(input);
    const client = sdk.instances[0];
    client.sendCommand.mockClear();
    sdk.replies.set("set_audio_prompt", "command_error");
    await expect(player.update("new visual", "new audio")).rejects.toThrow(
      "LIVE_COMMAND_FAILED",
    );
    expect(client.sendCommand.mock.calls).toEqual([
      ["set_audio_prompt", { prompt: "new audio" }],
    ]);
    expect(input.onError).toHaveBeenCalledOnce();
    await player.close();
  });

  it("records late audio through a stable track while listener mute only changes its gain", async () => {
    const context = new Context(),
      video = new Video();
    const player = await connectLive(args(video, context));
    const client = sdk.instances[0];
    const videoTrack = new Track("video", "main-video"),
      audioTrack = new Track("audio", "main-audio");
    client.emit("trackReceived", "main_video", videoTrack);
    const recorder = Recorder.instances[0];
    const initialTracks = recorder.stream.getTracks();
    expect(initialTracks.map((track) => track.id)).toEqual([
      "main-video",
      "mixed-audio",
    ]);
    client.emit("trackReceived", "main_audio", audioTrack);
    await Promise.resolve();
    expect(context.sources[0].destinations).toEqual([context.effects]);
    expect(context.effects.destinations).toEqual([
      context.monitor,
      context.recording,
    ]);
    expect(context.monitor.destinations).toEqual([context.destination]);
    expect(video.muted).toBe(true);
    expect(context.monitor.gain.value).toBe(1);
    player.setMuted(true);
    expect(context.monitor.gain.value).toBe(0);
    expect(context.effects.destinations).toContain(context.recording);
    expect(recorder.stream.getTracks()).toEqual(initialTracks);
    player.setMuted(false);
    await player.resumeAudio();
    expect(context.monitor.gain.value).toBe(1);
    expect(video.muted).toBe(true);
    const recording = await player.close();
    expect(recording?.size).toBeGreaterThan(0);
    await player.close();
    expect(context.close).toHaveBeenCalledOnce();
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
    expect(context.monitor.disconnect).toHaveBeenCalledOnce();
    expect(context.recording.stream.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it("reports a blocked context once per blocked period, then allows a gesture retry", async () => {
    const context = new Context();
    context.resume.mockRejectedValue(
      new DOMException("blocked", "NotAllowedError"),
    );
    const input = args(new Video(), context);
    const player = await connectLive(input);
    await expect(player.resumeAudio()).rejects.toThrow(
      "AUDIO_PLAYBACK_BLOCKED",
    );
    expect(context.monitor.gain.value).toBe(0);
    player.setMuted(false);
    await expect(player.resumeAudio()).rejects.toThrow(
      "AUDIO_PLAYBACK_BLOCKED",
    );
    expect(input.onAudioBlocked).toHaveBeenCalledOnce();
    expect(input.onError).not.toHaveBeenCalled();
    expect(context.monitor.gain.value).toBe(0);
    context.resume.mockImplementation(async () => {
      context.state = "running";
    });
    await player.resumeAudio();
    context.state = "suspended";
    context.resume.mockRejectedValue(
      new DOMException("blocked", "NotAllowedError"),
    );
    player.setMuted(false);
    await expect(player.resumeAudio()).rejects.toThrow(
      "AUDIO_PLAYBACK_BLOCKED",
    );
    expect(input.onAudioBlocked).toHaveBeenCalledTimes(2);
    await player.close();
  });

  it("closes a transferred context when the SDK constructor fails", async () => {
    const context = new Context();
    sdk.failConstructor = true;
    await expect(connectLive(args(new Video(), context))).rejects.toThrow(
      "SDK_INIT_FAILED",
    );
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("rejects unlock when the context remains suspended after resume resolves", async () => {
    const context = new Context();
    context.resume.mockImplementation(async () => {});
    const input = args(new Video(), context);
    const player = await connectLive(input);
    await expect(player.resumeAudio()).rejects.toThrow(
      "AUDIO_PLAYBACK_BLOCKED",
    );
    expect(input.onAudioBlocked).toHaveBeenCalledOnce();
    expect(context.monitor.gain.value).toBe(0);
    await player.close();
  });

  it("falls back to native audio and exposes autoplay blocking without failing the session", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const video = new Video();
    const input = args(video);
    const player = await connectLive(input);
    video.play.mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );
    sdk.instances[0].emit(
      "trackReceived",
      "main_video",
      new Track("video", "native-video"),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(input.onAudioBlocked).toHaveBeenCalledOnce();
    expect(video.muted).toBe(true);
    expect(input.onError).not.toHaveBeenCalled();
    player.setMuted(false);
    await player.resumeAudio();
    expect(video.muted).toBe(false);
    player.setMuted(true);
    expect(video.muted).toBe(true);
    await player.close();
  });
});

describe("real narration mixing", () => {
  it("mixes decoded narration into monitoring and the stable recording track, ducking only background effects", async () => {
    const context = new Context();
    const player = await connectLive(args(new Video(), context));
    sdk.instances[0].emit(
      "trackReceived",
      "main_video",
      new Track("video", "video"),
    );
    sdk.instances[0].emit(
      "trackReceived",
      "main_audio",
      new Track("audio", "effects"),
    );
    player.setMuted(true);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const spoken = player.speak(bytes);
    await vi.waitFor(() => expect(context.bufferSources).toHaveLength(1));
    const voice = context.bufferSources[0];
    expect(context.decodeAudioData.mock.calls[0][0]).not.toBe(bytes);
    expect(voice.destinations).toEqual([context.monitor, context.recording]);
    expect(context.sources[0].destinations).toEqual([context.effects]);
    expect(context.effects.gain.value).toBe(0.3);
    expect(context.monitor.gain.value).toBe(0);
    expect(Recorder.instances[0].stream.getAudioTracks()[0].id).toBe(
      "mixed-audio",
    );
    voice.end();
    await spoken;
    expect(context.effects.gain.value).toBe(1);
    expect(voice.disconnect).toHaveBeenCalledOnce();
    expect(context.monitor.gain.value).toBe(0);
    await player.close();
  });

  it("replaces an old narration and ignores its delayed ended callback", async () => {
    const context = new Context();
    const player = await connectLive(args(new Video(), context));
    const first = player.speak(new ArrayBuffer(4));
    await vi.waitFor(() => expect(context.bufferSources).toHaveLength(1));
    const old = context.bufferSources[0],
      lateEnded = old.onended!;
    const second = player.speak(new ArrayBuffer(6));
    await first;
    expect(old.stop).toHaveBeenCalledOnce();
    expect(old.disconnect).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(context.bufferSources).toHaveLength(2));
    lateEnded();
    expect(context.effects.gain.value).toBe(0.3);
    context.bufferSources[1].end();
    await second;
    expect(context.effects.gain.value).toBe(1);
    await player.close();
  });

  it("cancels pending decode immediately on language changes without playing stale narration", async () => {
    const context = new Context();
    let decode!: (value: { duration: number }) => void;
    context.decodeAudioData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          decode = resolve;
        }),
    );
    const player = await connectLive(args(new Video(), context));
    const pending = player.speak(new ArrayBuffer(2));
    player.stopSpeech();
    await pending;
    decode({ duration: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(context.bufferSources).toHaveLength(0);
    expect(context.effects.gain.value).toBe(1);
    await player.close();
  });

  it("stops and resolves active narration before closing the mixer", async () => {
    const context = new Context();
    const player = await connectLive(args(new Video(), context));
    const pending = player.speak(new ArrayBuffer(2));
    await vi.waitFor(() => expect(context.bufferSources).toHaveLength(1));
    await player.close();
    await pending;
    expect(context.bufferSources[0].stop).toHaveBeenCalledOnce();
    expect(context.bufferSources[0].disconnect).toHaveBeenCalledOnce();
    expect(context.effects.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("starts the opening narration once after the first picture, without blocking connect", async () => {
    vi.useFakeTimers();
    const context = new Context(),
      video = new Video();
    const player = await connectLive({
      ...args(video, context),
      narration: new ArrayBuffer(8),
    });
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    video.dispatchEvent(new Event("playing"));
    video.dispatchEvent(new Event("loadeddata"));
    await vi.advanceTimersByTimeAsync(800);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.bufferSources).toHaveLength(1);
    video.dispatchEvent(new Event("playing"));
    await vi.advanceTimersByTimeAsync(800);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    context.bufferSources[0].end();
    await player.close();
  });

  it("clears the scheduled opening narration when explicitly stopped", async () => {
    vi.useFakeTimers();
    const context = new Context();
    const player = await connectLive({
      ...args(new Video(), context),
      narration: new ArrayBuffer(2),
    });
    player.stopSpeech();
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    await player.close();
  });

  it("rejects narration without Web Audio rather than using unrecorded speech synthesis", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const player = await connectLive(args());
    await expect(player.speak(new ArrayBuffer(2))).rejects.toThrow(
      "NARRATION_UNAVAILABLE",
    );
    await player.close();
  });

  it("surfaces decode failure without leaving background effects ducked", async () => {
    const context = new Context();
    context.decodeAudioData.mockRejectedValue(new Error("bad wav"));
    const player = await connectLive(args(new Video(), context));
    await expect(player.speak(new ArrayBuffer(2))).rejects.toThrow("bad wav");
    expect(context.effects.gain.value).toBe(1);
    expect(context.bufferSources).toHaveLength(0);
    await player.close();
  });
});

describe("opening narration errors", () => {
  it("reports automatic narration failure without closing the paid video session", async () => {
    vi.useFakeTimers();
    const context = new Context();
    context.decodeAudioData.mockRejectedValue(
      new Error("NARRATION_DECODE_FAILED"),
    );
    const input = args(new Video(), context),
      onNarrationError = vi.fn();
    const player = await connectLive({
      ...input,
      narration: new ArrayBuffer(2),
      onNarrationError,
    });
    await vi.advanceTimersByTimeAsync(800);
    expect(onNarrationError).toHaveBeenCalledOnce();
    expect(input.onError).not.toHaveBeenCalled();
    expect(sdk.instances[0].disconnect).not.toHaveBeenCalled();
    await player.updateAudio("Kitchen ambience only");
    await player.close();
  });
});
