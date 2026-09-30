import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
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
  recordingSupported as canRecord,
  type LivePlayer,
} from "./lib/live";
import { saveCreation, listCreations, getVideo, getImage } from "./lib/storage";
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
  INGREDIENT_LIMIT: [
    "这一锅已经有很多材料啦，先保存作品吧。",
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
  const errorCode = ref(""),
    statusCode = ref(""),
    openingUrl = ref(""),
    opening = ref<Opening | null>(null),
    additions = ref<string[]>([]),
    baseIngredients = ref<string[]>([]),
    adding = ref(false),
    remaining = ref(60),
    muted = ref(true),
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
    recording: Blob | null = null,
    generation = 0,
    timer: ReturnType<typeof setInterval> | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined,
    stopTask: Promise<void> | null = null,
    saveId = randomId();
  function randomId() {
    return crypto.randomUUID();
  }
  function failure(e: unknown) {
    errorCode.value = e instanceof RequestError ? e.code : "generic";
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
    image = null;
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
    if (!names.length || names.length > 6) return;
    reset();
    baseIngredients.value = [...names];
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
    selectIngredients(dish.ingredients.slice(0, 6));
  }
  async function start() {
    if (
      !selected.value ||
      ["planning", "imaging", "connecting", "live"].includes(stage.value)
    )
      return;
    if (stage.value === "stopped") {
      const names = [...baseIngredients.value];
      selectIngredients(names);
    }
    const run = ++generation;
    const runCraftId = craftId;
    const runIngredients = [...baseIngredients.value];
    errorCode.value = "";
    statusCode.value = "";
    recording = null;
    saved.value = false;
    try {
      stage.value = "planning";
      await api("/crafts", { id: runCraftId, ingredients: runIngredients });
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
      const livePlayer = await connectLive({
        connection: opened.connection,
        image,
        prompt: opening.value!.videoPrompt,
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
    } catch (e) {
      if (run !== generation) return;
      failure(e);
      await stop();
      stage.value = "error";
    }
  }
  async function stop() {
    if (stopTask) return stopTask;
    const captured = session;
    session = null;
    generation++;
    clearInterval(timer);
    clearInterval(heartbeat);
    const instance = player;
    player = null;
    stopTask = (async () => {
      try {
        if (instance) {
          recording = await instance.close();
          if (recording) {
            if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
            recordingUrl.value = URL.createObjectURL(recording);
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
  async function addIngredient(name: string) {
    if (adding.value || stage.value !== "live" || !player || !session) return;
    adding.value = true;
    statusCode.value = "adding";
    errorCode.value = "";
    const current = player;
    const liveId = session.id;
    const id = randomId();
    try {
      const action = actionSchema.parse(
        await api(`/live/${liveId}/actions`, { id, ingredient: name }),
      );
      if (player !== current) return;
      await current.update(action.prompt);
      await api(`/live/${liveId}/actions/${id}/ack`, {});
      additions.value.push(name);
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
  function toggleSound() {
    muted.value = !muted.value;
    if (videoElement.value) {
      videoElement.value.muted = muted.value;
      void videoElement.value.play().catch(() => undefined);
    }
  }
  async function save() {
    if (!image || !opening.value) return;
    if (stage.value === "live" || stage.value === "connecting") await stop();
    statusCode.value = "saving";
    try {
      await saveCreation(
        {
          id: saveId,
          dishId: "custom",
          baseIngredients: [...baseIngredients.value],
          title: opening.value.title,
          titleEn: opening.value.titleEn,
          description: opening.value.description,
          descriptionEn: opening.value.descriptionEn,
          ingredients: [...additions.value],
          createdAt: Date.now(),
        },
        image,
        recording,
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
    await stop();
    selectIngredients(
      item.baseIngredients?.length ? item.baseIngredients : ["魔法料理"],
    );
    try {
      image = await getImage(item.id);
      if (!image) throw new Error("Missing image");
      openingUrl.value = URL.createObjectURL(image);
      opening.value = {
        title: item.title,
        titleEn: item.titleEn || item.title,
        description: item.description,
        descriptionEn: item.descriptionEn || item.description,
        imagePrompt: "",
        videoPrompt: "",
      };
      additions.value = [...item.ingredients];
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
    recordingSupported.value = canRecord();
    try {
      await api("/auth");
      authenticated.value = true;
      await refresh();
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
    saved,
    favorites,
    videoElement,
    recordingSupported,
    recordingUrl,
    baseIngredients,
    login,
    logout,
    selectDish,
    selectIngredients,
    start,
    stop,
    back,
    addIngredient,
    toggleSound,
    save,
    openFavorite,
    downloadRecording,
  };
}
