import { foodPresentationPrompt } from "../shared/video-direction";
import { cookwareSchema } from "../shared/cookware";
import { MAX_BASE_INGREDIENTS } from "../shared/limits";
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { locale } from "./i18n";
import { type Dish, ingredients } from "../shared/catalog";
import {
  openingSchema,
  actionSchema,
  connectionSchema,
  type Opening,
  type SessionReply,
  type SavedCreation,
} from "../shared/contracts";
import {
  connectLive,
  prepareLiveAudio,
  recordingSupported as canRecord,
  type LivePlayer,
} from "./lib/live";
import { saveCreation, listCreations, getVideo, getImage } from "./lib/storage";
import { z } from "zod";
const activeCraftKey = "foodieworld.activeCraftId";
const restoredCraftSchema = z.object({
  cookware: cookwareSchema,
  baseIngredients: z.array(z.string()).min(1).max(MAX_BASE_INGREDIENTS),
  opening: openingSchema.optional(),
  imageJob: z.string().optional(),
  imageUrl: z.string().optional(),
  additions: z.array(z.string()),
  animals: z.array(z.string()).default([]),
});
const copy = {
  idle: [
    "选好食材，唤醒这份小小魔法。",
    "Choose your ingredients and awaken a little magic.",
  ],
  planning: ["正在构思你的原创料理…", "Dreaming up your original dish…"],
  imaging: ["正在捏出软乎乎的开场画面…", "Crafting the opening image…"],
  connecting: ["正在打开魔法窗口…", "Opening a window to your kitchen…"],
  live: [
    "魔法正在发生，试着加一点料。",
    "Magic is happening. Add a little something.",
  ],
  stopped: [
    "这轮魔法已结束，可以保存作品。",
    "This spell has ended. Save your creation.",
  ],
  error: [
    "魔法暂时中断，已有画面仍然保留。",
    "The spell was interrupted. Your image is still here.",
  ],
  WRONG_PASSWORD: [
    "口令不对，再试一次吧。",
    "That password is not quite right.",
  ],
  UNAUTHORIZED: ["请先输入厨房口令。", "Enter the kitchen password first."],
  RATE_LIMITED: [
    "尝试太频繁，请稍等一分钟。",
    "Too many attempts. Please wait a minute.",
  ],
  KITCHEN_FULL: [
    "两口魔法锅都在忙，请稍后再来。",
    "Both cauldrons are busy. Try again shortly.",
  ],
  SESSION_EXISTS: [
    "你已有一轮魔法正在进行，请稍后重试。",
    "You already have a spell running. Try again shortly.",
  ],
  SESSION_ENDED: ["这轮魔法已结束。", "This spell has ended."],
  UPSTREAM_UNREACHABLE: [
    "生成服务暂时连接不上，请稍后重试。",
    "The generation service is temporarily unavailable.",
  ],
  agent_server_warming_up: [
    "生成服务正在启动，请稍后重试。",
    "The generation service is warming up. Please try again.",
  ],
  INVALID_AI_OUTPUT: [
    "魔法描述格式有误，请重试。",
    "The generated description was invalid. Please retry.",
  ],
  IMAGE_FAILED: [
    "开场图片生成失败，请保留当前作品稍后重试。",
    "The opening image failed. Keep this creation and retry later.",
  ],
  INSUFFICIENT_BALANCE: [
    "生成额度不足，请联系厨房主人。",
    "Not enough credits. Please contact the kitchen host.",
  ],
  insufficient_balance: [
    "生成额度不足，请联系厨房主人。",
    "Not enough credits. Please contact the kitchen host.",
  ],
  invalid_key: [
    "生成服务的企业密钥暂不可用。",
    "The generation service key is unavailable.",
  ],
  IN_PROGRESS: [
    "这一步正在处理中，请稍等。",
    "This step is already being prepared.",
  ],
  NARRATION_UNAVAILABLE: [
    "主持人配音暂不可用，料理和动物音效仍保留。",
    "Host narration is unavailable. Cooking and animal sounds are preserved.",
  ],
  INVALID_ANIMAL: [
    "这位动物嘉宾不在名单里，请重新选择。",
    "Choose an animal from the guest list.",
  ],
  INGREDIENT_LIMIT: [
    "本轮变化已满，先保存作品吧。",
    "This cauldron is full. Save your creation first.",
  ],
  NETWORK: [
    "连接中断，请稍后重试。",
    "Connection interrupted. Please try again.",
  ],
  generic: [
    "这一步没有完成，请稍后重试。",
    "This step could not complete. Please try again.",
  ],
  adding: ["正在酝酿下一次变化…", "Preparing the next transformation…"],
  saving: ["正在保存作品…", "Saving your creation…"],
  saved: ["作品已保存到共享作品集。", "Saved to the shared collection."],
  replay: [
    "这是收藏的作品；可以用原食材开始新一轮。",
    "A saved creation. Start a new spell with its original ingredients.",
  ],
  uncertain: [
    "变化命令的结果不确定，本轮已停止以避免重复加料。",
    "The change could not be confirmed. This spell stopped to avoid applying it twice.",
  ],
  restored: [
    "已找回料理和开场图。点击开始会开启新一轮视频，不会重新生成开场图。",
    "Your dish and opening image are restored. Start opens a new video session using the existing image.",
  ],
  restoredPending: [
    "已找回未完成的料理。点击开始将继续原任务；不会自动开启视频。",
    "Your unfinished dish is restored. Start continues the same task; no video session starts automatically.",
  ],
  restoredFinished: [
    "已找回料理与加料记录，旧视频不会继续。点击开始将用初始食材制作新一轮。",
    "Your dish and additions are restored, but the previous video cannot resume. Start makes a new dish from the original ingredients.",
  ],
  RESTORE_FAILED: [
    "暂时无法读取上次料理。已保留恢复记录，请刷新后重试。",
    "Your previous dish could not be loaded. Its recovery record is kept; reload to retry.",
  ],
  RESUME_STORAGE_UNAVAILABLE: [
    "浏览器无法保存恢复记录，请允许此页面使用会话存储后重试。",
    "The browser cannot save recovery information. Allow session storage and try again.",
  ],
} as const;
function msg(key: string) {
  const val = copy[key as keyof typeof copy] || copy.generic;
  return val[locale.value === "en" ? 1 : 0];
}
class RequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(180000),
    });
  } catch {
    throw new RequestError("NETWORK");
  }
  const data = await r.json();
  if (!r.ok) throw new RequestError(data?.error?.code || "generic");
  return data as T;
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function useKitchen() {
  const authenticated = ref(false),
    authLoading = ref(true),
    passwordError = ref("");
  const page = ref<"catalog" | "lab">("catalog"),
    tab = ref<"all" | "favorites">("all"),
    selected = ref<Dish | null>(null);
  const stage = ref<
    | "idle"
    | "planning"
    | "imaging"
    | "connecting"
    | "live"
    | "stopped"
    | "error"
  >("idle");
  const selectedCookware = ref<z.infer<typeof cookwareSchema>>();
  const activeCookware = ref<z.infer<typeof cookwareSchema>>();
  const errorCode = ref(""),
    statusCode = ref(""),
    openingUrl = ref(""),
    opening = ref<Opening | null>(null),
    additions = ref<string[]>([]),
    baseIngredients = ref<string[]>([]),
    animals = ref<string[]>([]),
    adding = ref(false),
    remaining = ref(60),
    muted = ref(false),
    audioBlocked = ref(false),
    saved = ref(false),
    favorites = ref<SavedCreation[]>([]),
    videoElement = ref<HTMLVideoElement | null>(null),
    recordingUrl = ref("");
  const recordingSupported = ref(false),
    error = computed(() => (errorCode.value ? msg(errorCode.value) : "")),
    status = computed(() => msg(statusCode.value || stage.value));
  const title = computed(() =>
    opening.value
      ? locale.value === "en"
        ? opening.value.titleEn
        : opening.value.title
      : locale.value === "en"
        ? "Your original creation"
        : "你的原创料理",
  );
  const description = computed(() =>
    opening.value
      ? locale.value === "en"
        ? opening.value.descriptionEn
        : opening.value.description
      : baseIngredients.value
          .map((n) =>
            locale.value === "en"
              ? ingredients.find((i) => i.name === n)?.nameEn || n
              : n,
          )
          .join(" + "),
  );
  let craftId = "",
    session: SessionReply | null = null,
    player: LivePlayer | null = null,
    image: Blob | null = null,
    cover: Blob | null = null,
    recording: Blob | null = null,
    generation = 0,
    timer: ReturnType<typeof setInterval> | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined,
    stopTask: Promise<void> | null = null,
    saveId = randomId();
  let pendingAudio: AudioContext | undefined;
  let latestAudio: { effectsPrompt?: string } = {};
  let latestActionId: string | undefined;
  let voiceGeneration = 0;
  let lastAudioLocale = locale.value;
  function audioPrompt() {
    // Old receipts contain unreliable generated speech: never reuse that track prompt.
    return (
      latestAudio.effectsPrompt ||
      "Gentle skillet sizzling, wooden spatula scraping and soft food bubbling; only cooking sound effects, no human voices or music."
    );
  }
  async function loadNarration(
    actionId: string | undefined,
    language: "zh" | "en",
  ): Promise<ArrayBuffer> {
    const response = await fetch(`/api/crafts/${craftId}/narration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, ...(actionId ? { actionId } : {}) }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new RequestError("NARRATION_UNAVAILABLE");
    return response.arrayBuffer();
  }
  async function narrateCurrent(delay = 0) {
    const current = player;
    if (!current || stage.value !== "live") return;
    const version = ++voiceGeneration;
    const language = locale.value;
    lastAudioLocale = language;
    current.stopSpeech();
    try {
      const [audio] = await Promise.all([
        loadNarration(latestActionId, language),
        wait(delay),
      ]);
      if (
        current !== player ||
        version !== voiceGeneration ||
        stage.value !== "live"
      )
        return;
      await current.speak(audio);
    } catch {
      if (current === player && version === voiceGeneration)
        errorCode.value = "NARRATION_UNAVAILABLE";
    }
  }
  watch(locale, () => {
    if (player && stage.value === "live") {
      voiceGeneration++;
      player.stopSpeech();
    }
  });
  watch([locale, adding], () => {
    if (
      !player ||
      stage.value !== "live" ||
      adding.value ||
      lastAudioLocale === locale.value
    )
      return;
    void narrateCurrent();
  });
  function randomId(): string {
    return crypto.randomUUID();
  }
  function failure(e: unknown) {
    errorCode.value = e instanceof RequestError ? e.code : "generic";
  }
  function rememberCraft() {
    try {
      sessionStorage.setItem(activeCraftKey, craftId);
    } catch {
      throw new RequestError("RESUME_STORAGE_UNAVAILABLE");
    }
  }
  async function restoreCraft() {
    // A recovery link also restores older paid work from before this browser
    // started keeping a session checkpoint. Never create a generation here.
    let id: string | null;
    try {
      id =
        new URL(window.location.href).searchParams.get("craft") ||
        sessionStorage.getItem(activeCraftKey);
    } catch {
      return;
    }
    if (!id || !z.string().uuid().safeParse(id).success) return;
    const run = generation;
    try {
      const state = restoredCraftSchema.parse(await api(`/crafts/${id}`));
      if (run !== generation) return;
      selectedCookware.value = state.cookware;
      selectIngredients(state.baseIngredients);
      craftId = id;
      rememberCraft();
      opening.value = state.opening ?? null;
      additions.value = [...state.additions];
      animals.value = [...state.animals];
      const hasAdditions = state.additions.length + state.animals.length > 0;
      stage.value = hasAdditions ? "stopped" : "idle";
      statusCode.value = hasAdditions ? "restoredFinished" : "restoredPending";
      const restoredRun = generation;
      if (state.imageUrl) {
        const response = await fetch(`/api/crafts/${id}/image`, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new RequestError("IMAGE_FAILED");
        const restoredImage = await response.blob();
        if (restoredRun !== generation) return;
        image = restoredImage;
        openingUrl.value = URL.createObjectURL(image);
        statusCode.value = hasAdditions ? "restoredFinished" : "restored";
      }
      // Reuse an unfinished opening; a dish with applied additions needs a
      // new round because the opening image cannot recreate its last frame.
      stage.value = hasAdditions ? "stopped" : "idle";
      const url = new URL(window.location.href);
      if (url.searchParams.has("craft")) {
        url.searchParams.delete("craft");
        window.history.replaceState(window.history.state, "", url);
      }
    } catch (e) {
      if (e instanceof RequestError && e.code === "NOT_FOUND") {
        try {
          sessionStorage.removeItem(activeCraftKey);
        } catch {
          /* Storage can be blocked. */
        }
      } else {
        errorCode.value = "RESTORE_FAILED";
      }
    }
  }
  async function refresh() {
    try {
      favorites.value = await listCreations();
    } catch (e) {
      failure(e);
    }
  }
  async function login(password: string) {
    authLoading.value = true;
    passwordError.value = "";
    try {
      await api("/auth/login", { password });
      authenticated.value = true;
      await refresh();
      await restoreCraft();
    } catch (e) {
      passwordError.value = msg(e instanceof RequestError ? e.code : "generic");
    } finally {
      authLoading.value = false;
    }
  }
  async function logout() {
    await stop();
    try {
      await api("/auth/logout", {});
      authenticated.value = false;
    } catch (e) {
      failure(e);
    }
  }
  function reset() {
    generation++;
    craftId = randomId();
    saveId = randomId();
    opening.value = null;
    additions.value = [];
    animals.value = [];
    latestActionId = undefined;
    voiceGeneration++;
    image = null;
    cover = null;
    recording = null;
    saved.value = false;
    errorCode.value = "";
    statusCode.value = "";
    stage.value = "idle";
    remaining.value = 60;
    if (openingUrl.value.startsWith("blob:"))
      URL.revokeObjectURL(openingUrl.value);
    openingUrl.value = "";
    if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
    recordingUrl.value = "";
  }
  function selectIngredients(names: string[]) {
    if (!names.length || names.length > MAX_BASE_INGREDIENTS) return;
    reset();
    baseIngredients.value = [...names];
    activeCookware.value = selectedCookware.value;
    selected.value = {
      id: "custom",
      name: "原创料理",
      nameEn: "Original creation",
      description: "",
      descriptionEn: "",
      ingredients: names,
      ingredientsEn: names,
      cuisine: "魔法厨房",
      cuisineEn: "Magic kitchen",
      emoji: "🍲",
      color: "#FF8FC7",
    };
    page.value = "lab";
  }
  function selectDish(dish: Dish) {
    selectIngredients(dish.ingredients);
  }
  async function start() {
    if (
      !selected.value ||
      ["planning", "imaging", "connecting", "live"].includes(stage.value)
    )
      return;
    if (stage.value === "stopped") {
      const names = [...baseIngredients.value];
      selectedCookware.value = activeCookware.value;
      selectIngredients(names);
    }
    // Unlock sound in the click gesture, before image generation awaits.
    const preparedAudio = prepareLiveAudio();
    pendingAudio = preparedAudio;
    let audioTransferred = false;
    audioBlocked.value = false;
    const run = ++generation;
    const runCraftId = craftId;
    const runIngredients = [...baseIngredients.value];
    errorCode.value = "";
    statusCode.value = "";
    recording = null;
    saved.value = false;
    try {
      // Persist before the first potentially paid call, including a request
      // whose response might be lost during a navigation or reload.
      rememberCraft();
      stage.value = "planning";
      await api("/crafts", {
        id: runCraftId,
        ingredients: runIngredients,
        cookware: activeCookware.value,
      });
      if (run !== generation) return;
      let data = await api<{ opening?: Opening; imageUrl?: string }>(
        `/crafts/${runCraftId}/prepare`,
        {},
      );
      if (run !== generation) return;
      if (data.opening) opening.value = openingSchema.parse(data.opening);
      stage.value = "imaging";
      const deadline = Date.now() + 300000;
      while (!data.imageUrl) {
        if (Date.now() > deadline) throw new RequestError("IMAGE_FAILED");
        await wait(2000);
        if (run !== generation) return;
        data = await api(`/crafts/${runCraftId}`);
      }
      const response = await fetch(`/api/crafts/${runCraftId}/image`);
      if (!response.ok) throw new RequestError("IMAGE_FAILED");
      image = await response.blob();
      if (run !== generation) return;
      if (openingUrl.value.startsWith("blob:"))
        URL.revokeObjectURL(openingUrl.value);
      openingUrl.value = URL.createObjectURL(image);
      stage.value = "connecting";
      lastAudioLocale = locale.value;
      const narration = await loadNarration(undefined, lastAudioLocale);
      if (run !== generation) return;
      await nextTick();
      const opened = await api<SessionReply>(`/crafts/${runCraftId}/live`, {});
      connectionSchema.parse(opened.connection);
      if (run !== generation) {
        await api(`/live/${opened.id}/stop`, {});
        return;
      }
      session = opened;
      timer = setInterval(() => {
        remaining.value = Math.max(
          0,
          Math.ceil((opened.expiresAt - Date.now()) / 1000),
        );
        if (!remaining.value) void stop();
      }, 500);
      heartbeat = setInterval(() => {
        void api(`/live/${opened.id}/heartbeat`, {}).catch(() => {
          void stop();
        });
      }, 5000);
      if (!videoElement.value) throw new RequestError("generic");
      videoElement.value.muted = muted.value;
      latestAudio = opening.value!;
      latestActionId = undefined;
      audioTransferred = true;
      pendingAudio = undefined;
      const livePlayer = await connectLive({
        audioContext: preparedAudio,
        narration,
        onNarrationError: () => {
          if (run === generation) errorCode.value = "NARRATION_UNAVAILABLE";
        },
        audioPrompt: audioPrompt(),
        muted: muted.value,
        onAudioBlocked: () => {
          if (run === generation) {
            audioBlocked.value = true;
            muted.value = true;
          }
        },
        connection: opened.connection,
        image,
        prompt: foodPresentationPrompt(opening.value!.videoPrompt),
        video: videoElement.value,
        onError: () => {
          if (run === generation) {
            errorCode.value = "NETWORK";
            void stop();
          }
        },
        onComplete: () => {
          if (run === generation) void stop();
        },
        onPlaying: () => {
          if (run === generation) stage.value = "live";
        },
      });
      if (run !== generation) {
        await livePlayer.close();
        return;
      }
      player = livePlayer;
      if (lastAudioLocale !== locale.value) {
        void narrateCurrent();
      }
    } catch (e) {
      if (run !== generation) return;
      failure(e);
      await stop();
      stage.value = "error";
    } finally {
      if (
        !audioTransferred &&
        preparedAudio &&
        preparedAudio.state !== "closed"
      )
        void preparedAudio.close().catch(() => undefined);
      if (pendingAudio === preparedAudio) pendingAudio = undefined;
    }
  }
  function captureCover(): Promise<Blob | null> {
    const video = videoElement.value;
    if (
      !video ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0 ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !(video.srcObject instanceof MediaStream)
    )
      return Promise.resolve(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) return Promise.resolve(null);
      // Contain the complete received frame, without cropping or stretching.
      // Small aspect-ratio differences use neutral letterboxing.
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(
        canvas.width / video.videoWidth,
        canvas.height / video.videoHeight,
      );
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      context.drawImage(
        video,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
      // drawImage freezes the live frame synchronously, before disconnect can
      // clear srcObject. An unavailable encoder must never block stop/save.
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1500);
        try {
          canvas.toBlob(
            (blob) => {
              clearTimeout(timeout);
              resolve(blob?.size && blob.type === "image/jpeg" ? blob : null);
            },
            "image/jpeg",
            0.88,
          );
        } catch {
          clearTimeout(timeout);
          resolve(null);
        }
      });
    } catch {
      return Promise.resolve(null);
    }
  }
  async function stop() {
    if (stopTask) return stopTask;
    voiceGeneration++;
    const unusedAudio = pendingAudio;
    pendingAudio = undefined;
    if (unusedAudio && unusedAudio.state !== "closed")
      void unusedAudio.close().catch(() => undefined);
    const captured = session;
    session = null;
    generation++;
    clearInterval(timer);
    clearInterval(heartbeat);
    const instance = player;
    player = null;
    const capturedCover = instance ? captureCover() : Promise.resolve(null);
    stopTask = (async () => {
      try {
        cover = (await capturedCover) ?? cover;
        if (instance) {
          recording = await instance.close();
          if (recording) {
            if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
            recordingUrl.value = URL.createObjectURL(recording);
            if (videoElement.value) videoElement.value.muted = muted.value;
          }
        }
      } catch (e) {
        failure(e);
      } finally {
        if (captured)
          try {
            await api(`/live/${captured.id}/stop`, {});
          } catch (e) {
            failure(e);
          }
      }
      if (stage.value !== "idle") stage.value = "stopped";
      adding.value = false;
    })().finally(() => {
      stopTask = null;
    });
    return stopTask;
  }
  async function back() {
    await stop();
    page.value = "catalog";
    await refresh();
  }
  async function addAction(name: string, kind: "ingredient" | "animal") {
    if (adding.value || stage.value !== "live" || !player || !session) return;
    adding.value = true;
    statusCode.value = "adding";
    errorCode.value = "";
    const current = player;
    const liveId = session.id;
    const id = randomId();
    try {
      const action = actionSchema.parse(
        await api(`/live/${liveId}/actions`, { id, ingredient: name, kind }),
      );
      if (player !== current) return;
      latestAudio = action;
      latestActionId = id;
      await current.update(action.prompt, audioPrompt());
      await api(`/live/${liveId}/actions/${id}/ack`, {});
      void narrateCurrent(2000);
      if (kind === "animal") animals.value.push(name);
      else additions.value.push(name);
      if (opening.value)
        Object.assign(opening.value, {
          title: action.title,
          titleEn: action.titleEn,
          description: action.description,
          descriptionEn: action.descriptionEn,
        });
      await wait(4000);
    } catch (e) {
      failure(e);
      statusCode.value = "uncertain";
      await stop();
    } finally {
      adding.value = false;
      if (statusCode.value === "adding") statusCode.value = "";
    }
  }
  const addIngredient = (name: string) => addAction(name, "ingredient");
  const addAnimal = (id: string) => addAction(id, "animal");
  function toggleSound() {
    const wasBlocked = audioBlocked.value;
    muted.value = !muted.value;
    if (player) {
      player.setMuted(muted.value);
      if (!muted.value) {
        void player
          .resumeAudio()
          .then(() => {
            audioBlocked.value = false;
            if (wasBlocked) void narrateCurrent();
          })
          .catch(() => {
            audioBlocked.value = true;
            muted.value = true;
            player?.setMuted(true);
          });
      }
    } else if (videoElement.value) {
      videoElement.value.muted = muted.value;
      void videoElement.value.play().catch(() => undefined);
    }
  }
  async function save() {
    if (!image || !opening.value || saved.value) return;
    if (stage.value === "live" || stage.value === "connecting") await stop();
    statusCode.value = "saving";
    try {
      await saveCreation(
        {
          id: saveId,
          dishId: "custom",
          baseIngredients: [...baseIngredients.value],
          cookware: activeCookware.value,
          title: opening.value.title,
          titleEn: opening.value.titleEn,
          description: opening.value.description,
          descriptionEn: opening.value.descriptionEn,
          ingredients: [...additions.value],
          animals: [...animals.value],
          createdAt: Date.now(),
        },
        image,
        recording,
        cover,
      );
      saved.value = true;
      statusCode.value = "saved";
      await refresh();
    } catch (e) {
      failure(e);
      statusCode.value = "";
    }
  }
  async function openFavorite(item: SavedCreation) {
    selectedCookware.value = item.cookware;
    await stop();
    selectIngredients(
      item.baseIngredients?.length ? item.baseIngredients : ["魔法料理"],
    );
    saveId = item.id;
    try {
      image = await getImage(item.id);
      if (!image) throw new Error("Missing image");
      openingUrl.value = URL.createObjectURL(image);
      opening.value = {
        title: item.title,
        titleEn: item.titleEn || item.title,
        description: item.description,
        descriptionEn: item.descriptionEn || item.description,
        effectsPrompt: "",
        narrationZh: "",
        narrationEn: "",
        audioPromptZh: "",
        audioPromptEn: "",
        imagePrompt: "",
        videoPrompt: "",
      };
      additions.value = [...item.ingredients];
      animals.value = [...(item.animals ?? [])];
      recording = item.hasVideo ? await getVideo(item.id) : null;
      if (recording) recordingUrl.value = URL.createObjectURL(recording);
      stage.value = "stopped";
      saved.value = true;
      statusCode.value = "replay";
    } catch (e) {
      failure(e);
    }
  }
  function downloadRecording() {
    if (!recordingUrl.value) return;
    const link = document.createElement("a");
    link.href = recordingUrl.value;
    link.download = `foodieworld-${Date.now()}.${recording?.type.includes("mp4") ? "mp4" : "webm"}`;
    link.click();
  }
  function leave() {
    if (session)
      void fetch(`/api/live/${session.id}/stop`, {
        method: "POST",
        keepalive: true,
      });
    void stop();
  }
  const hidden = () => {
    if (document.hidden) leave();
  };
  onMounted(async () => {
    if (new URL(window.location.href).searchParams.has("share")) return;
    recordingSupported.value = canRecord();
    try {
      await api("/auth");
      authenticated.value = true;
      await refresh();
      await restoreCraft();
    } catch {
      authenticated.value = false;
    } finally {
      authLoading.value = false;
    }
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
  });
  onUnmounted(() => {
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("pagehide", leave);
    leave();
    if (openingUrl.value.startsWith("blob:"))
      URL.revokeObjectURL(openingUrl.value);
    if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
  });
  return {
    authenticated,
    authLoading,
    passwordError,
    page,
    tab,
    selected,
    stage,
    status,
    error,
    openingUrl,
    title,
    description,
    additions,
    adding,
    remaining,
    muted,
    audioBlocked,
    saved,
    favorites,
    videoElement,
    recordingSupported,
    recordingUrl,
    baseIngredients,
    selectedCookware,
    activeCookware,
    animals,
    login,
    logout,
    selectDish,
    selectIngredients,
    start,
    stop,
    back,
    addIngredient,
    addAnimal,
    toggleSound,
    save,
    openFavorite,
    downloadRecording,
  };
}
