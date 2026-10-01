import { connectManagedLive } from "./lib/managed-webrtc";
import { foodPresentationPrompt } from "../shared/video-direction";
import { cookwareSchema } from "../shared/cookware";
import { MAX_BASE_INGREDIENTS, LIVE_ROUND_SECONDS } from "../shared/limits";
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
import { listCreations, getVideo, getImage } from "./lib/storage";
import { keepPendingCreation, pendingCreations, uploadPendingCreation, type PendingCreation } from "./lib/recording-outbox";
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
  managedPartial: ["已保存可播放片段，但本轮部分画面未完整取回。", "Playable footage was saved, but part of this round could not be recovered."],
  managedBackground: ["云端正在烹饪，离开页面也会继续；完成后自动进入画廊。", "Cooking in the cloud. You can leave; the finished video will appear in the gallery."],
  managedSaving: ["录像已交给云端归档，可稍后在画廊查看。", "Your recording is being archived. Find it in the gallery shortly."],
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
  saved: ["作品已保存到画廊。", "Saved to the gallery."],
  RECORDING_MISSING: [
    "直播已结束，但浏览器未交付录像。当前仅有图片，未保存视频；请勿把图片收藏当作录像。",
    "The live stream ended, but the browser did not return a recording. Only the image is available; no video was saved.",
  ],
  QUEUE_FULL: [
    "队列已有 8 项，请等一项完成后继续添加。",
    "Eight changes are pending. Wait for one to finish before adding more.",
  ],
  QUEUE_CLOSED: [
    "这一轮已结束，未发送的加料不会自动开启新一轮。",
    "This round has ended. Pending changes will not start a new paid session.",
  ],
  SAVE_FAILED: [
    "自动保存未完成，录像仍在本页，请点保存重试后再离开。",
    "Saving failed. Your recording is still on this page; retry saving before leaving.",
  ],
  replay: [
    "这是收藏的作品；可以用原食材开始新一轮。",
    "A saved creation. Start a new spell with its original ingredients.",
  ],
  uncertain: [
    "变化命令的结果不确定，本轮已停止以避免重复加料。",
    "The change could not be confirmed. This spell stopped to avoid applying it twice.",
  ],
  additionPaused: [
    "这次加料未能确认，后续排队已取消；视频仍会继续播放和保存。",
    "This addition could not be confirmed. Queued changes were cancelled; video playback and saving continue.",
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
async function api<T>(path: string, body?: unknown, timeout = 180000): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new RequestError("NETWORK");
  }
  const data = await r.json();
  if (!r.ok) throw new RequestError(data?.error?.code || "generic");
  return data as T;
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export interface QueuedAddition {
  id: string;
  name: string;
  kind: "ingredient" | "animal";
  status:
    | "queued"
    | "preparing"
    | "applying"
    | "sent"
    | "failed"
    | "cancelled"
    | "uncertain";
}
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
  const additionQueue = ref<QueuedAddition[]>([]);
  let queueEpoch = 0;
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
    remaining = ref(LIVE_ROUND_SECONDS),
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
    hadPlayback = false,
    generation = 0,
    timer: ReturnType<typeof setInterval> | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined,
    stopTask: Promise<void> | null = null,
    saveTask: Promise<void> | null = null,
    saveId = randomId();
  let pendingAudio: AudioContext | undefined;
  let connectingPlayer: Promise<LivePlayer> | null = null;
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
  const galleryLoading = ref(false);
  const galleryError = ref(false);
  let galleryRevision = 0;
  function updateCreationLike(id: string, result: { liked: boolean; likeCount: number }) {
    galleryRevision++;
    const item = favorites.value.find(item => item.id === id);
    if (item) Object.assign(item, result);
  }
  let refreshTask: Promise<void> | null = null;
  function refresh(): Promise<void> {
    if (refreshTask) return refreshTask;
    galleryLoading.value = true;
    galleryError.value = false;
    refreshTask = (async () => {
      try {
        const revision = galleryRevision;
        const rows = await listCreations();
        if (revision !== galleryRevision) {
          // A fetch begun before the click must not overwrite its confirmed result.
          for (const row of rows) {
            const current = favorites.value.find(item => item.id === row.id);
            if (current) { row.liked = current.liked; row.likeCount = current.likeCount; }
          }
        }
        favorites.value = rows;
      } catch {
        // Keep the last successful collection and report errors in the gallery.
        galleryError.value = true;
      } finally {
        galleryLoading.value = false;
        refreshTask = null;
      }
    })();
    return refreshTask;
  }
  const galleryVisible = () =>
    authenticated.value && page.value === "catalog" && tab.value === "favorites";
  watch([page, tab], () => {
    if (galleryVisible()) void refresh();
  });
  async function login(password: string) {
    authLoading.value = true;
    passwordError.value = "";
    try {
      await api("/auth/login", { password });
      authenticated.value = true;
      await refresh();
      void recoverPendingSaves();
      await restoreCraft();
      await recoverManaged();
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
    cancelPendingAdditions();
    additionQueue.value = [];
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
    hadPlayback = false;
    saved.value = false;
    if (saveState.value === "saved" || saveState.value === "missing") saveState.value = "idle";
    errorCode.value = "";
    statusCode.value = "";
    stage.value = "idle";
    remaining.value = LIVE_ROUND_SECONDS;
    if (openingUrl.value.startsWith("blob:"))
      URL.revokeObjectURL(openingUrl.value);
    openingUrl.value = "";
    if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
    recordingUrl.value = "";
  }
  function selectIngredients(names: string[]) {
    if (["planning", "imaging", "connecting", "live"].includes(stage.value)) {
      page.value = "lab";
      return;
    }
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
  async function editIngredients(
    names: string[],
    cookware?: z.infer<typeof cookwareSchema>,
  ) {
    if (
      !names.length ||
      names.length > MAX_BASE_INGREDIENTS ||
      ["planning", "imaging", "connecting"].includes(stage.value)
    )
      return false;
    await stop();
    if (recording?.size && !saved.value) {
      await persistCreation();
      if (!saved.value) return false;
    }
    selectedCookware.value = cookware;
    selectIngredients(names);
    return true;
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
    if (stopTask) await stopTask;
    if (recording?.size && !saved.value) {
      await persistCreation();
      if (!saved.value) return;
    }
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
    hadPlayback = false;
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
      const opened = await api<SessionReply>(`/crafts/${runCraftId}/live`, { language: locale.value });
      if (opened.managed) {
        if (run !== generation) return;
        await attachManaged(opened, run, preparedAudio);
        audioTransferred = true;
        // A queued managed session already has a playback URL. Only release
        // this reference once the running viewer actually owns the context.
        if (opened.status === "running") pendingAudio = undefined;
        return;
      }
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
      const connectionTask = connectLive({
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
          if (run === generation) {
            hadPlayback = true;
            stage.value = "live";
          }
        },
      });
      connectingPlayer = connectionTask;
      const livePlayer = await connectionTask.finally(() => {
        if (connectingPlayer === connectionTask) connectingPlayer = null;
      });
      // stop() owns a pending connection too, including its final recording.
      if (run !== generation) return;
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
      if (!audioTransferred && pendingAudio === preparedAudio) pendingAudio = undefined;
    }
  }
  type ManagedStatus = Extract<SessionReply, { managed: true }> & {
    status: string; recordingStatus: string; creationId?: string; error?: string;
    commands: Array<{ commandId: string; status: string }>;
  };
  let managedPoll: ReturnType<typeof setInterval> | undefined;
  let managedPolling = false;
  async function pollManaged() {
    if (!session?.managed || managedPolling) return;
    managedPolling = true;
    const id = session.id;
    try {
      const data = await api<{ session: ManagedStatus }>(`/live/${id}`);
      if (session?.id !== id) return;
      if (!player && data.session.status === "running") {
        await attachManaged(data.session, generation, pendingAudio);
        pendingAudio = undefined;
      }
      if (session?.id !== id) return;
      if (["ended", "stopping", "failed"].includes(data.session.status)) {
        // The provider peer can close before archiving finishes. Retire this
        // viewer immediately so its reconnect loop cannot join a stopped round.
        const endedPlayer = player; player = null;
        await endedPlayer?.close();
      }
      if (session?.id !== id) return;
      session.expiresAt = data.session.expiresAt;
      remaining.value = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
      if (data.session.creationId) {
        saveId = data.session.creationId;
        saved.value = true; saveState.value = "saved";
        clearInterval(managedPoll);
        session = null;
        const finishedPlayer = player; player = null;
        await finishedPlayer?.close();
        recordingUrl.value = `/api/creations/${encodeURIComponent(saveId)}/video`;
        statusCode.value = data.session.error?.startsWith("PARTIAL_RECORDING") ? "managedPartial" : "replay"; stage.value = "stopped";
        await refresh();
      } else if (data.session.recordingStatus === "failed") {
        stage.value = "stopped"; saveState.value = "failed";
        statusCode.value = "managedSaving";
      } else if (["ended", "stopping", "failed"].includes(data.session.status)) {
        stage.value = "stopped"; saveState.value = "saving";
        statusCode.value = "managedSaving";
      }
    } catch { /* Viewing network loss does not stop the server-owned round. */ }
    finally { managedPolling = false; }
  }
  async function attachManaged(opened: Extract<SessionReply, { managed: true }>, run: number, audioContext?: AudioContext) {
    session = opened;
    clearInterval(managedPoll);
    managedPoll = setInterval(() => void pollManaged(), 2000);
    if (opened.status !== "running") { pendingAudio = audioContext; return; }
    await nextTick();
    if (!videoElement.value) throw new RequestError("generic");
    let openingSpoken = false;
    const viewing = await connectManagedLive({
      video: videoElement.value, getConnection: () => api(`/live/${opened.id}/connection`, undefined, 10000), expiresAt: opened.expiresAt, muted: muted.value, audioContext,
      onPlaying: () => { if (run === generation && session?.id === opened.id) { hadPlayback = true; stage.value = "live"; statusCode.value = "managedBackground"; if (!openingSpoken) { openingSpoken = true; setTimeout(() => { if (session?.id === opened.id) void narrateCurrent(); }, 800); } } },
      onAudioBlocked: () => { audioBlocked.value = true; muted.value = true; },
      onError: () => { errorCode.value = "NETWORK"; },
    });
    if (run !== generation) { await viewing.close(); return; }
    player = viewing;
    clearInterval(managedPoll);
    managedPoll = setInterval(() => void pollManaged(), 2000);
    void pollManaged();
  }
  async function recoverManaged() {
    if (session) return;
    try {
      const data = await api<{ session: ManagedStatus; craftId: string; craft: z.infer<typeof restoredCraftSchema> } | null>("/live/recover");
      if (!data || session) return;
      craftId = data.craftId; rememberCraft();
      opening.value = data.craft.opening ?? null;
      baseIngredients.value = [...data.craft.baseIngredients];
      additions.value = [...data.craft.additions]; animals.value = [...data.craft.animals];
      activeCookware.value = data.craft.cookware;
      if (!openingUrl.value) openingUrl.value = `/api/crafts/${craftId}/image`;
      page.value = "lab";
      stage.value = "connecting";
      await nextTick();
      await attachManaged(data.session, generation);
    } catch { /* Preserve the existing craft and allow a later recovery poll. */ }
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
    if (session?.managed) {
      const current = session;
      await api(`/live/${current.id}/stop`, {}).catch(failure);
      stage.value = "stopped";
      statusCode.value = "managedSaving";
      saveState.value = "saving";
      cancelPendingAdditions();
      return;
    }
    if (stopTask) return stopTask;
    // A managed archive has already detached its viewer. Repeated stop/leave
    // must not reinterpret that server-owned recording as a missing local blob.
    if (saved.value && !session && !player && !connectingPlayer) return;
    cancelPendingAdditions();
    voiceGeneration++;
    const unusedAudio = pendingAudio;
    pendingAudio = undefined;
    if (unusedAudio && unusedAudio.state !== "closed")
      void unusedAudio.close().catch(() => undefined);
    const captured = session;
    session = null;
    // Release the paid session immediately, without blocking local recording or upload.
    if (captured) void api(`/live/${captured.id}/stop`, {}).catch(() => undefined);
    generation++;
    clearInterval(timer);
    clearInterval(heartbeat);
    const instance = player;
    const pendingConnection = connectingPlayer;
    connectingPlayer = null;
    player = null;
    if ((instance || pendingConnection) && hadPlayback) saveState.value = "saving";
    const capturedCover = instance || pendingConnection ? captureCover() : Promise.resolve(null);
    stopTask = (async () => {
      try {
        cover = (await capturedCover) ?? cover;
        const closingPlayer = instance ?? await pendingConnection?.catch(() => null);
        if (closingPlayer) {
          recording = await closingPlayer.close();
          if (recording) {
            if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
            recordingUrl.value = URL.createObjectURL(recording);
            if (videoElement.value) videoElement.value.muted = muted.value;
          }
        }
      } catch (e) {
        failure(e);
      }
      if (stage.value !== "idle") stage.value = "stopped";
      adding.value = false;
      if (recording?.size && !saved.value) await persistCreation();
      else if (hadPlayback && !recording?.size) {
        errorCode.value = "RECORDING_MISSING";
        saveState.value = "missing";
      }
    })().finally(() => {
      stopTask = null;
    });
    return stopTask;
  }
  function back() {
    // Navigation is not a stop command. Keep the same player and recipe alive.
    page.value = "catalog";
    void refresh();
  }
  function cancelPendingAdditions() {
    queueEpoch++;
    for (const item of additionQueue.value) {
      if (item.status === "queued") item.status = "cancelled";
      else if (item.status === "preparing") item.status = "cancelled";
      else if (item.status === "applying") item.status = "uncertain";
    }
    adding.value = false;
  }
  function cancelAddition(id: string) {
    const item = additionQueue.value.find((item) => item.id === id);
    if (item?.status === "queued") item.status = "cancelled";
  }
  function addAction(name: string, kind: "ingredient" | "animal") {
    if (stage.value !== "live" || !player || !session) {
      errorCode.value = "QUEUE_CLOSED";
      return;
    }
    if (
      additionQueue.value.filter((item) =>
        ["queued", "preparing", "applying"].includes(item.status),
      ).length >= 8
    ) {
      errorCode.value = "QUEUE_FULL";
      return;
    }
    if (
      additions.value.length +
        animals.value.length +
        additionQueue.value.filter((item) =>
          ["queued", "preparing", "applying"].includes(item.status),
        ).length >=
      12
    ) {
      errorCode.value = "INGREDIENT_LIMIT";
      return;
    }
    errorCode.value = "";
    // iOS may suspend the context during the long image-generation wait.
    // An addition tap is a fresh user gesture: unlock before the async LLM/TTS
    // requests lose that gesture, while respecting an intentional mute.
    if (audioBlocked.value || !muted.value) {
      const current = player;
      current.setMuted(false);
      void current.resumeAudio().then(() => {
        if (player !== current) return;
        muted.value = false;
        audioBlocked.value = false;
      }).catch(() => {
        if (player !== current) return;
        audioBlocked.value = true;
        muted.value = true;
        current.setMuted(true);
      });
    }
    additionQueue.value.push({ id: randomId(), name, kind, status: "queued" });
    void processAdditions();
  }
  async function processAdditions() {
    if (adding.value || !player || !session) return;
    adding.value = true;
    const epoch = queueEpoch;
    const current = player;
    const liveId = session.id;
    const active = () =>
      epoch === queueEpoch && player === current && stage.value === "live";
    try {
      while (active()) {
        const item = additionQueue.value.find(
          (item) => item.status === "queued",
        );
        if (!item) break;
        if (!session || session.expiresAt - Date.now() < 8000) {
          errorCode.value = "QUEUE_CLOSED";
          await stop();
          return;
        }
        item.status = "preparing";
        statusCode.value = "adding";
        try {
          const action = actionSchema.parse(
            await api(`/live/${liveId}/actions`, {
              id: item.id,
              ingredient: item.name,
              kind: item.kind,
              language: locale.value,
            }),
          );
          if (!active()) return;
          latestAudio = action;
          latestActionId = item.id;
          item.status = "applying";
          if (session?.managed) {
            const until = Date.now() + 45000;
            while (active()) {
              const reply = await api<{ session: { commands: Array<{commandId: string; status: string}> } }>(`/live/${liveId}`);
              const command = reply.session.commands.find(c => c.commandId === item.id);
              if (command?.status === "ack") break;
              if (command && ["failed", "unknown", "cancelled"].includes(command.status)) throw new RequestError("QUEUE_CLOSED");
              if (Date.now() > until) throw new RequestError("NETWORK");
              await wait(1000);
            }
          } else await current.update(action.prompt, audioPrompt());
          if (!active()) return;
          // Capture accepted facts before awaiting persistence, so a concurrent
          // stop saves the same ingredients that were sent to the live model.
          item.status = "sent";
          if (item.kind === "animal") animals.value.push(item.name);
          else additions.value.push(item.name);
          if (opening.value)
            Object.assign(opening.value, {
              title: action.title,
              titleEn: action.titleEn,
              description: action.description,
              descriptionEn: action.descriptionEn,
            });
          await api(`/live/${liveId}/actions/${item.id}/ack`, {});
          if (!active()) return;
          void narrateCurrent(1000);
          // Do not overwrite the scene immediately with the next queued change.
          await wait(6000);
        } catch (e) {
          if (!active()) return;
          item.status = ["sent", "applying"].includes(item.status)
            ? "uncertain"
            : "failed";
          failure(e);
          statusCode.value = session?.managed ? "additionPaused" : "uncertain";
          if (session?.managed) {
            // An addition failure is not a failed video transport. Preserve the
            // running server-owned round; stop this queue without blindly
            // dispatching later changes over an uncertain earlier command.
            for (const queued of additionQueue.value) {
              if (queued.status === "queued") queued.status = "cancelled";
            }
          } else await stop();
          return;
        }
      }
    } finally {
      if (epoch === queueEpoch) {
        adding.value = false;
        if (statusCode.value === "adding") statusCode.value = "";
      }
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
    if (session?.managed) { await stop(); return; }
    if (!image || !opening.value || saved.value) return;
    if (stage.value === "live" || stage.value === "connecting") await stop();
    if (hadPlayback && !recording?.size) {
      errorCode.value = "RECORDING_MISSING";
      return;
    }
    await persistCreation();
  }
  const saveState = ref<"idle" | "saving" | "pending" | "failed" | "saved" | "missing">("idle");
  const pendingSaveCount = ref(0);
  let recoveryTask: Promise<void> | null = null;
  async function persistCreation() {
    if (saveTask) return saveTask;
    if (!image || !opening.value || saved.value) return;
    const id = saveId;
    const details = opening.value;
    const item: PendingCreation = {
      meta: {
        id, dishId: "custom", baseIngredients: [...baseIngredients.value],
        cookware: activeCookware.value, title: details.title, titleEn: details.titleEn,
        description: details.description, descriptionEn: details.descriptionEn,
        ingredients: [...additions.value], animals: [...animals.value], createdAt: Date.now(),
      },
      image, video: recording, cover,
    };
    statusCode.value = "saving";
    saveState.value = "saving";
    saveTask = (async () => {
      let durable = false;
      try {
        await keepPendingCreation(item);
        durable = true;
      } catch { /* Upload can still succeed when local storage is unavailable. */ }
      try {
        await uploadPendingCreation(item);
        if (id === saveId) {
          saved.value = true;
          statusCode.value = "saved";
          if (errorCode.value === "SAVE_FAILED") errorCode.value = "";
        }
        saveState.value = "saved";
        await refresh();
      } catch {
        saveState.value = durable ? "pending" : "failed";
        if (id === saveId) {
          if (!durable) errorCode.value = "SAVE_FAILED";
          statusCode.value = "";
        }
      }
      pendingSaveCount.value = await pendingCreations().then(items => items.length).catch(() => 0);
    })().finally(() => { saveTask = null; });
    return saveTask;
  }
  let memoryRetries = 0;
  function recoverPendingSaves(manual = false): Promise<void> {
    if (recoveryTask) return recoveryTask;
    if (saveTask) return saveTask;
    recoveryTask = (async () => {
      // Memory-only save is retried too when IndexedDB is unavailable.
      if (recording?.size && !saved.value && saveState.value === "failed" && (manual || memoryRetries++ < 5)) await persistCreation();
      const items = await pendingCreations().catch(() => []);
      pendingSaveCount.value = items.length;
      if (!items.length) return;
      const due = items.filter(item => manual || ((item.attempts ?? 0) < 5 && (item.retryAt ?? 0) <= Date.now()));
      if (!due.length) { saveState.value = "pending"; return; }
      saveState.value = "saving";
      for (const item of due) {
        try {
          await uploadPendingCreation(item);
          pendingSaveCount.value--;
          if (item.meta.id === saveId) {
            saved.value = true;
            statusCode.value = "saved";
            if (errorCode.value === "SAVE_FAILED") errorCode.value = "";
          }
        } catch { /* Retain the entry for the next online/visible retry. */ }
      }
      if (!saveTask) saveState.value = pendingSaveCount.value ? "pending" : "saved";
      await refresh();
    })().finally(() => { recoveryTask = null; });
    return recoveryTask;
  }
  async function openFavorite(item: SavedCreation) {
    if (["planning", "imaging", "connecting", "live"].includes(stage.value)) {
      page.value = "lab";
      return;
    }
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
  const recordingDownloadUrl = computed(() => saved.value
    ? `/api/creations/${encodeURIComponent(saveId)}/video`
    : recordingUrl.value);
  function leave() {
    if (session?.managed) return;
    if (session)
      void fetch(`/api/live/${session.id}/stop`, {
        method: "POST",
        keepalive: true,
      });
    void stop();
  }
  const retrySaves = () => {
    if (authenticated.value) void recoverPendingSaves();
  };
  const warnUnsaved = (event: BeforeUnloadEvent) => {
    if (session?.managed) return;
    if (["live", "connecting"].includes(stage.value) || !!saveTask || saveState.value === "saving" || saveState.value === "failed") {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const hidden = () => {
    if (document.hidden) leave();
    else {
      retrySaves();
      if (session?.managed) void pollManaged();
      if (galleryVisible()) void refresh();
    }
  };
  let galleryPoll: ReturnType<typeof setInterval> | undefined;
  let processingPoll: ReturnType<typeof setInterval> | undefined;
  onMounted(async () => {
    if (new URL(window.location.href).searchParams.has("share")) return;
    recordingSupported.value = canRecord();
    try {
      await api("/auth");
      authenticated.value = true;
      await refresh();
      void recoverPendingSaves();
      await restoreCraft();
      await recoverManaged();
    } catch {
      authenticated.value = false;
    } finally {
      authLoading.value = false;
    }
    galleryPoll = setInterval(() => {
      if (!document.hidden) {
        retrySaves();
        if (galleryVisible()) void refresh();
      }
    }, 30_000);
    processingPoll = setInterval(() => {
      if (!document.hidden && galleryVisible() && favorites.value.some(item => item.videoStatus === "pending" || item.videoStatus === "processing")) void refresh();
    }, 3000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", retrySaves);
    window.addEventListener("beforeunload", warnUnsaved);
  });
  onUnmounted(() => {
    clearInterval(managedPoll);
    if (session?.managed) void player?.close();
    clearInterval(galleryPoll);
    clearInterval(processingPoll);
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("online", retrySaves);
    window.removeEventListener("beforeunload", warnUnsaved);
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
    additionQueue,
    cancelAddition,
    remaining,
    muted,
    audioBlocked,
    saved,
    saveState,
    pendingSaveCount,
    retrySaving: recoverPendingSaves,
    favorites,
    galleryLoading,
    galleryError,
    refreshGallery: refresh,
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
    editIngredients,
    start,
    stop,
    back,
    addIngredient,
    addAnimal,
    toggleSound,
    save,
    openFavorite,
    updateCreationLike,
    recordingDownloadUrl,
  };
}
