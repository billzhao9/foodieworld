<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { animals as animalCatalog } from "../shared/animals";
import { combinations } from "../shared/combinations";
import { cookware } from "../shared/cookware";
import {
  BookOpen,
  Film,
  Sparkles,
  Heart,
  Search,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Flame,
  Volume2,
  VolumeX,
  Download,
  LogOut,
  LockKeyhole,
  WandSparkles,
  CircleStop,
  Check,
  X,
  LoaderCircle,
  Star,
  Moon,
  PawPrint,
  Shuffle,
  Undo2,
  ChevronDown,
  ChevronUp,
  CookingPot,
} from "lucide-vue-next";
import { MAX_BASE_INGREDIENTS } from "../shared/limits";
import { ingredients, type IngredientCategory } from "../shared/catalog";
import VideoExport from "./components/VideoExport.vue";
import IngredientEditor from "./components/IngredientEditor.vue";
import IngredientCategories from "./components/IngredientCategories.vue";
import { locale, t, localized as l } from "./i18n";
import { useKitchen } from "./useKitchen";
import CreationCard from "./components/CreationCard.vue";
import PublicCreation from "./components/PublicCreation.vue";
import GenerationProgress from "./components/GenerationProgress.vue";
import KitchenArt from "./components/KitchenArt.vue";
import AnimalPicker from "./components/AnimalPicker.vue";
import AnimalRoster from "./components/AnimalRoster.vue";
import IngredientArt from "./components/IngredientArt.vue";
const {
  authenticated,
  authLoading,
  passwordError,
  page,
  tab,
  selected,
  selectedCookware,
  activeCookware,
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
  retrySaving,
  favorites,
  galleryLoading,
  galleryError,
  refreshGallery,
  videoElement,
  recordingSupported,
  recordingUrl,
  login,
  logout,
  selectIngredients,
  editIngredients,
  start,
  stop,
  back,
  addIngredient,
  addAnimal,
  animals: visitingAnimals,
  toggleSound,
  save,
  openFavorite,
  updateCreationLike,
  recordingDownloadUrl,
} = useKitchen();
async function previewLocalRecording() {
  page.value = "lab";
  // Playback is requested in the tap gesture; scrolling waits for the view update.
  void videoElement.value?.play().catch(() => {});
  await nextTick();
  videoElement.value?.scrollIntoView({block: "center", behavior: "smooth"});
}
const pantryPanel = ref<HTMLElement>();
const additionHintDismissed = ref(false);
watch(stage, (value) => {
  if (value === "planning" || value === "idle") additionHintDismissed.value = false;
});
function showPantry() {
  additionHintDismissed.value = true;
  pantryPanel.value?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  pantryPanel.value?.focus({ preventScroll: true });
}
const ingredientEditor = ref<InstanceType<typeof IngredientEditor>>();
const sharedToken = new URLSearchParams(window.location.search).get("share");
const collectionMode = ref<"gallery" | "all">("gallery");
const galleryCount = computed(
  () => favorites.value.filter((item) => item.hasVideo).length,
);
const collectionItems = computed(() =>
  collectionMode.value === "gallery"
    ? favorites.value.filter((item) => item.hasVideo)
    : favorites.value,
);
const selectedCookwareItem = computed(() =>
  cookware.find((item) => item.id === selectedCookware.value),
);
const activeCookwareItem = computed(() =>
  cookware.find((item) => item.id === activeCookware.value),
);
const basket = ref<string[]>([]);
const basketExpanded = ref(false);
const labIngredientsExpanded = ref(false);
const shownLabIngredients = computed(() =>
  labIngredientsExpanded.value
    ? (selected.value?.ingredients ?? [])
    : (selected.value?.ingredients ?? []).slice(0, 6),
);
const basketUndo = ref<string[] | null>(null);
const basketPreviewCount = 6;
const shownBasket = computed(() =>
  basketExpanded.value
    ? basket.value
    : basket.value.slice(0, basketPreviewCount),
);
const basketHint = computed(() =>
  t("basketHint").replace("{max}", String(MAX_BASE_INGREDIENTS)),
);
const basketLimitHint = computed(() =>
  t("basketLimit").replace("{max}", String(MAX_BASE_INGREDIENTS)),
);
function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
function randomizeBasket() {
  const real = ingredients.filter((item) => item.kind === "real");
  const categories = shuffled([...new Set(real.map((item) => item.category))]);
  const pools = categories.map((category) =>
    shuffled(
      real.filter((item) => item.category === category).map((item) => item.id),
    ),
  );
  const selection: string[] = [];
  const target = Math.min(20, MAX_BASE_INGREDIENTS, real.length);
  while (selection.length < target) {
    for (const pool of pools) {
      const id = pool.pop();
      if (id) selection.push(id);
      if (selection.length === target) break;
    }
  }
  basketUndo.value = [...basket.value];
  basket.value = selection;
  basketExpanded.value = false;
}
function chooseCombination(ids: readonly string[]) {
  basketUndo.value = [...basket.value];
  basket.value = [...ids];
  basketExpanded.value = false;
  search.value = "";
  basketCategory.value = "all";
  cookwareSelected.value = false;
}
function undoRandomBasket() {
  if (basketUndo.value === null) return;
  basket.value = [...basketUndo.value];
  basketUndo.value = null;
  basketExpanded.value = false;
}
function clearBasket() {
  basket.value = [];
  basketUndo.value = null;
  basketExpanded.value = false;
}
const basketCategory = ref<IngredientCategory>("all");
const cookwareSelected = ref(false);
const filteredCookware = computed(() =>
  cookware.filter((item) =>
    `${item.name} ${item.nameEn}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const pantryCategory = ref<IngredientCategory>("all");
function toggleBasket(id: string) {
  basketUndo.value = null;
  basket.value = basket.value.includes(id)
    ? basket.value.filter((x) => x !== id)
    : basket.value.length < MAX_BASE_INGREDIENTS
      ? [...basket.value, id]
      : basket.value;
}
function enterLab() {
  if (basket.value.length)
    selectIngredients(
      basket.value.map((id) => ingredients.find((i) => i.id === id)!.name),
    );
}
const filteredIngredients = computed(() =>
  ingredients.filter(
    (i) =>
      i.kind === "real" &&
      (basketCategory.value === "all" || i.category === basketCategory.value) &&
      `${i.name} ${i.nameEn}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
const password = ref("");
const search = ref("");
const pantrySearch = ref("");
const pageIndex = ref(0);
const ingredientKind = ref<"real" | "magic" | "animal">("real");
const custom = ref("");
const busy = computed(() =>
  ["planning", "imaging", "connecting"].includes(stage.value),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(collectionItems.value.length / 6)),
);
const shownFavorites = computed(() =>
  collectionItems.value.slice(pageIndex.value * 6, pageIndex.value * 6 + 6),
);
const pantry = computed(() =>
  ingredients.filter(
    (i) =>
      i.kind === ingredientKind.value &&
      (ingredientKind.value === "magic" ||
        pantryCategory.value === "all" ||
        i.category === pantryCategory.value) &&
      `${i.name} ${i.nameEn}`
        .toLowerCase()
        .includes(pantrySearch.value.trim().toLowerCase()),
  ),
);
watch(selected, () => {
  labIngredientsExpanded.value = false;
});
watch(ingredientKind, () => {
  pantrySearch.value = "";
});
watch(
  () => basket.value.length,
  (count) => {
    if (count <= basketPreviewCount) basketExpanded.value = false;
  },
);
watch([search, tab, collectionMode], () => (pageIndex.value = 0));
const dishName = (dish: { name: string; nameEn: string }) =>
  l(dish.name, dish.nameEn);
const ingredientName = (id: string) => {
  const i = ingredients.find(
    (i) => i.id === id || i.name === id || i.nameEn === id,
  );
  return i ? l(i.name, i.nameEn) : id;
};
function queuedName(item: { name: string; kind: string }) {
  const animal =
    item.kind === "animal"
      ? animalCatalog.find((a) => a.id === item.name)
      : undefined;
  return animal
    ? `${animal.emoji} ${l(animal.name, animal.nameEn)}`
    : translateAddition(item.name);
}
function queueStatus(status: string) {
  const labels: Record<string, [string, string]> = {
    queued: ["等待中", "Queued"],
    preparing: ["正在构思", "Preparing"],
    applying: ["正在发送", "Sending"],
    sent: ["模型已接收，留意画面变化", "Model received it — watch for changes"],
    failed: ["失败", "Failed"],
    cancelled: ["未发送", "Not sent"],
    uncertain: ["结果待确认", "Unconfirmed"],
  };
  const label = labels[status]!;
  return l(label[0], label[1]);
}
function translateAddition(value: string) {
  const i = ingredients.find((i) => i.name === value || i.nameEn === value);
  return i ? l(i.name, i.nameEn) : value;
}
async function addCustom() {
  if (custom.value.trim()) {
    await addIngredient(custom.value.trim());
    custom.value = "";
  }
}
</script>
<template>
  <div class="app-world">
    <div class="sky-star sky-star-one">✧</div>
    <div class="sky-star sky-star-two">✦</div>
    <header class="site-header">
      <button
        class="brand"
        @click="authenticated && back()"
        :aria-label="t('brand')"
      >
        <span class="brand-symbol"
          ><Moon :size="23" /><Sparkles :size="13" /></span
        ><span
          >{{ t("brand") }}<small>{{ t("brandSubtitle") }}</small></span
        >
      </button>
      <div class="header-actions">
        <button
          class="language-button"
          @click="locale = locale === 'zh' ? 'en' : 'zh'"
          aria-label="Switch language"
        >
          <span :class="{ selected: locale === 'zh' }">中</span><i>/</i
          ><span :class="{ selected: locale === 'en' }">EN</span></button
        ><button
          v-if="authenticated && !sharedToken"
          class="icon-button logout"
          @click="logout"
          :aria-label="t('logout')"
        >
          <LogOut :size="18" />
        </button>
      </div>
    </header>
    <PublicCreation v-if="sharedToken !== null" :token="sharedToken" />
    <main v-else-if="!authenticated" class="gate">
      <div class="gate-illustration">
        <span class="orbit-label"><Star :size="12" /> {{ t("tagline") }}</span
        ><KitchenArt variant="witch" />
      </div>
      <div class="gate-copy">
        <div class="eyebrow"><Sparkles :size="14" /> {{ t("brand") }}</div>
        <h1>{{ t("gateTitle") }}</h1>
        <p>{{ t("gateBody") }}</p>
        <form @submit.prevent="login(password)" class="gate-form">
          <label for="password">{{ t("password") }}</label>
          <div class="password-field">
            <LockKeyhole :size="18" /><input
              id="password"
              v-model="password"
              type="password"
              :placeholder="t('password')"
              autocomplete="current-password"
              required
            />
          </div>
          <p v-if="passwordError" class="error-text" role="alert">
            {{ passwordError }}
          </p>
          <button class="primary-button" :disabled="authLoading">
            <LoaderCircle
              v-if="authLoading"
              class="spin"
              :size="18"
            /><WandSparkles v-else :size="18" />{{
              t(authLoading ? "checking" : "enter")
            }}<ArrowRight :size="18" />
          </button>
        </form>
        <small class="gate-footnote"
          ><LockKeyhole :size="12" />{{ t("private") }}</small
        >
      </div>
    </main>
    <template v-else>
      <nav class="main-nav" :aria-label="l('主导航', 'Main navigation')">
        <button :class="{ active: page === 'catalog' && tab === 'all' }" :aria-current="page === 'catalog' && tab === 'all' ? 'page' : undefined" @click="tab = 'all'; back()">
          <BookOpen :size="18" />{{ l("食材篮", "Ingredients") }}</button
        ><button
          :class="{ active: page === 'lab' }"
          :aria-current="page === 'lab' ? 'page' : undefined"
          @click="selected ? (page = 'lab') : enterLab()"
          :disabled="!selected && !basket.length"
        >
          <Sparkles :size="18" />{{ l("炼金台", "Kitchen") }}<span class="nav-star">✦</span>
        </button>
        <button :class="{ active: page === 'catalog' && tab === 'favorites' }" :aria-current="page === 'catalog' && tab === 'favorites' ? 'page' : undefined" @click="tab = 'favorites'; collectionMode = 'gallery'; back()">
          <Film :size="18" />{{ t('gallery') }}
        </button>
      </nav>
      <div v-if="saveState !== 'idle'" class="save-notice content-width" role="status" aria-live="polite">
        <LoaderCircle v-if="saveState === 'saving'" class="spin" :size="18" />
        <Check v-else-if="saveState === 'saved'" :size="18" />
        <span>{{ saveState === 'saving'
          ? recordingUrl ? l('录像已录好，正在上传。可以先播放。', 'Recording ready. Uploading — you can watch now.') : l('正在收尾录像…', 'Finishing the recording…')
          : saveState === 'pending'
            ? l(`本机保留了 ${pendingSaveCount} 个待上传作品，将自动重试；仍未上传可点重试。`, `${pendingSaveCount} creations are kept on this device. Upload retries automatically; you can also retry below.`)
            : saveState === 'missing'
              ? l('浏览器没有交付录像，视频未能保存。请使用支持录制的 Safari 或 Chrome，并保持页面打开直到保存完成。', 'The browser did not return a recording; no video was saved. Use a recording-capable Safari or Chrome browser and keep the page open until saving finishes.')
            : saveState === 'failed'
              ? l('上传失败，本机备份也未成功。请保持此页打开并重试，或下载录像。', 'Upload and local backup failed. Keep this page open and retry, or download your recording.')
              : l('作品已保存到共享画廊', 'Creation saved to the shared gallery') }}</span>
        <button v-if="recordingUrl && ['saving', 'pending', 'failed'].includes(saveState)" @click="previewLocalRecording">{{ l('先看录像', 'Watch now') }}</button>
        <button v-if="saveState === 'pending' || saveState === 'failed'" @click="retrySaving(true)">
          {{ l('重试上传', 'Retry upload') }}
        </button>
      </div>
      <div v-if="page === 'catalog' && selected && ['planning', 'imaging', 'connecting', 'live'].includes(stage)" class="ongoing-round content-width">
        <span>{{ stage === 'live' ? l('你的料理正在直播，随时加料改变剧情', 'Your dish is live — add a twist anytime') : l('你的料理正在生成，可自由逛画廊', 'Your dish is being prepared — feel free to browse') }}</span>
        <button @click="page = 'lab'">{{ l('返回这锅', 'Back to your dish') }} <ArrowRight :size="16" /></button>
      </div>
      <main v-show="page === 'catalog'" class="catalog-page content-width">
        <section v-if="tab === 'all'" class="welcome">
          <div class="welcome-copy">
            <span class="eyebrow"><Star :size="13" /> {{ t("tagline") }}</span>
            <h1>{{ t("headline") }}</h1>
            <p>{{ t("intro") }}</p>
          </div>
          <KitchenArt variant="witch" /><span class="welcome-sparkle">✧</span>
        </section>
        <header v-if="tab === 'favorites'" class="gallery-heading">
          <h1>{{ t('gallery') }}</h1>
          <p>{{ l('每一锅都有新故事，给喜欢的脑洞点个赞。', 'Every dish has a story. Like your favorite kitchen creations.') }}</p>
        </header>
        <div class="catalog-toolbar">
          <div v-if="tab === 'favorites'" class="collection-tabs">
            <button
              :class="{
                active: tab === 'favorites' && collectionMode === 'gallery',
              }"
              @click="
                tab = 'favorites';
                collectionMode = 'gallery';
              "
            >
              <Film :size="16" />{{ t("gallery")
              }}<span>{{ galleryCount }}</span></button
            ><button
              :class="{
                active: tab === 'favorites' && collectionMode === 'all',
              }"
              @click="
                tab = 'favorites';
                collectionMode = 'all';
              "
            >
              <Heart :size="16" />{{ t("allSaved")
              }}<span>{{ favorites.length }}</span>
            </button>
          </div>
          <div v-if="tab === 'favorites'" class="gallery-sync">
            <p role="status">{{ galleryError
              ? l('暂时无法更新，已保留现有作品，请重试。', 'Could not update. Your current collection is still here; please retry.')
              : l('共享画廊 · 看看大家的料理脑洞', 'Shared gallery · Explore everyone’s kitchen creations') }}</p>
            <button type="button" :disabled="galleryLoading" @click="refreshGallery">
              <LoaderCircle v-if="galleryLoading" class="spin" :size="16" />
              {{ galleryLoading ? l('更新中…', 'Refreshing…') : l('刷新作品', 'Refresh') }}
            </button>
          </div>
          <label v-if="tab === 'all'" class="search-field"
            ><Search :size="17" /><input
              v-model="search"
              :placeholder="
                cookwareSelected
                  ? l('搜索厨具', 'Search cookware')
                  : t('search')
              "
              :aria-label="
                cookwareSelected
                  ? l('搜索厨具', 'Search cookware')
                  : t('search')
              " /><button
              v-if="search"
              @click="search = ''"
              :aria-label="l('清除搜索', 'Clear search')"
            >
              <X :size="15" /></button
          ></label>
        </div>
        <template v-if="tab === 'all'">
          <IngredientCategories
            v-model="basketCategory"
            include-cookware
            :cookware-selected="cookwareSelected"
            @cookware="
              cookwareSelected = true;
              search = '';
            "
            @food="cookwareSelected = false"
          />
          <div class="basket-intro">
            <span><Sparkles :size="14" />{{ basketHint }}</span
            ><span
              >{{ basket.length }} <i>/</i> {{ MAX_BASE_INGREDIENTS }}</span
            >
          </div>
          <div class="basket-tools">
            <button class="random-basket-button" @click="randomizeBasket">
              <Shuffle :size="17" />{{ t("basketRandom20") }}
            </button>
            <p>{{ t("basketRandomHint") }}</p>
          </div>
          <details class="combination-picker">
            <summary>
              {{ l("灵感组合 · 中西厨房", "Inspiration · East meets West")
              }}<span>{{
                l(`${combinations.length}款`, `${combinations.length} picks`)
              }}</span>
            </summary>
            <p>
              {{
                l(
                  "点选会替换食材篮，可撤销，也可以继续加减。",
                  "Pick a starting mix to replace your basket. Undo it or make it your own.",
                )
              }}
            </p>
            <div class="combination-grid">
              <button
                v-for="mix in combinations"
                :key="mix.id"
                @click="chooseCombination(mix.ingredients)"
              >
                <span aria-hidden="true">{{ mix.emoji }}</span
                >{{ l(mix.name, mix.nameEn) }}
              </button>
            </div>
          </details>
          <div class="basket-tray">
            <div class="basket-tray-content">
              <div class="basket-tray-top">
                <span
                  >{{ t("yourBasket")
                  }}<small
                    >{{ basket.length }} / {{ MAX_BASE_INGREDIENTS }}</small
                  ></span
                ><button v-if="basket.length" @click="clearBasket">
                  {{ t("clear") }}
                </button>
              </div>
              <span class="basket-cookware-summary"
                ><CookingPot :size="14" />{{ l("厨具", "Cookware") }} ·
                {{
                  selectedCookwareItem
                    ? `${selectedCookwareItem.emoji} ${l(selectedCookwareItem.name, selectedCookwareItem.nameEn)}`
                    : l("自动选择", "Automatic")
                }}</span
              >
              <div
                v-if="basket.length"
                id="selected-basket-items"
                class="basket-selected"
                :class="{ expanded: basketExpanded }"
              >
                <button
                  v-for="id in shownBasket"
                  :key="id"
                  @click="toggleBasket(id)"
                  :aria-label="`${t('basketRemove')} ${ingredientName(id)}`"
                >
                  {{ ingredientName(id) }}<X :size="13" />
                </button>
              </div>
              <p v-else class="basket-placeholder">{{ t("basketEmpty") }}</p>
              <div v-if="basket.length" class="basket-selection-tools">
                <span>{{ t("basketRemoveHint") }}</span
                ><button
                  v-if="basket.length > basketPreviewCount"
                  :aria-expanded="basketExpanded"
                  aria-controls="selected-basket-items"
                  @click="basketExpanded = !basketExpanded"
                >
                  <ChevronUp v-if="basketExpanded" :size="15" /><ChevronDown
                    v-else
                    :size="15"
                  />{{
                    basketExpanded
                      ? t("basketCollapse")
                      : t("basketExpand").replace(
                          "{count}",
                          String(basket.length),
                        )
                  }}
                </button>
              </div>
              <div v-if="basketUndo !== null" class="basket-undo" role="status">
                <span>{{ t("basketRandomApplied") }}</span
                ><button @click="undoRandomBasket">
                  <Undo2 :size="14" />{{ t("basketUndo") }}
                </button>
              </div>
            </div>
            <button
              class="primary-button"
              :disabled="!basket.length"
              @click="enterLab"
            >
              <WandSparkles :size="18" />{{ ["planning", "imaging", "connecting", "live"].includes(stage) ? l("返回正在烹饪的料理", "Return to your active kitchen") : t("basketStart")
              }}<ArrowRight :size="17" />
            </button>
          </div>
          <p
            v-if="basket.length >= MAX_BASE_INGREDIENTS"
            class="basket-limit-note"
            role="status"
          >
            {{ basketLimitHint }}
          </p>
          <div
            v-if="cookwareSelected"
            class="basket-grid cookware-grid"
            role="group"
            :aria-label="l('厨具类别', 'Cookware options')"
          >
            <button
              class="cookware-auto"
              :class="{ chosen: !selectedCookware }"
              :aria-pressed="!selectedCookware"
              :disabled="busy || stage === 'live'"
              @click="selectedCookware = undefined"
            >
              <Sparkles :size="23" /><span
                ><strong>{{ l("自动选择", "Automatic") }}</strong
                ><small>{{
                  l(
                    "交给厨房搭配合适的厨具",
                    "Let the kitchen choose the right tool",
                  )
                }}</small></span
              ><Check
                v-if="!selectedCookware"
                class="cookware-check"
                :size="15"
              />
            </button>
            <button
              v-for="item in filteredCookware"
              :key="item.id"
              :class="{ chosen: selectedCookware === item.id }"
              :aria-pressed="selectedCookware === item.id"
              :disabled="busy || stage === 'live'"
              @click="selectedCookware = item.id"
            >
              <span class="cookware-emoji" aria-hidden="true">{{
                item.emoji
              }}</span
              ><span>{{ l(item.name, item.nameEn) }}</span
              ><Check
                v-if="selectedCookware === item.id"
                class="cookware-check"
                :size="14"
              />
            </button>
          </div>
          <div v-else-if="filteredIngredients.length" class="basket-grid">
            <button
              v-for="(ingredient, index) in filteredIngredients"
              :key="ingredient.id"
              class="basket-ingredient"
              :class="{ chosen: basket.includes(ingredient.id) }"
              :aria-pressed="basket.includes(ingredient.id)"
              :disabled="
                !basket.includes(ingredient.id) &&
                basket.length >= MAX_BASE_INGREDIENTS
              "
              :style="{ '--card-delay': `${index * 15}ms` }"
              @click="toggleBasket(ingredient.id)"
            >
              <IngredientArt :id="ingredient.id" /><span>{{
                l(ingredient.name, ingredient.nameEn)
              }}</span
              ><span class="basket-check"
                ><Check v-if="basket.includes(ingredient.id)" :size="12" /><Plus
                  v-else
                  :size="12"
              /></span>
            </button>
          </div>
          <div v-else class="empty-state">
            <Search :size="28" />
            <h2>{{ t("noResults") }}</h2>
            <p>{{ t("trySearch") }}</p>
          </div>
        </template>
        <div
          v-else-if="tab === 'favorites' && shownFavorites.length"
          class="dish-grid"
        >
          <CreationCard
            v-for="item in shownFavorites"
            :key="item.id"
            :item="item"
            @open="openFavorite"
            @liked="updateCreationLike"
          />
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">
            <Heart v-if="tab === 'favorites'" :size="32" /><Search
              v-else
              :size="32"
            />
          </div>
          <h2>
            {{
              t(
                tab === "favorites"
                  ? collectionMode === "gallery"
                    ? "emptyGallery"
                    : "emptySaved"
                  : "noResults",
              )
            }}
          </h2>
          <p>
            {{
              t(
                tab === "favorites"
                  ? collectionMode === "gallery"
                    ? "emptyGalleryBody"
                    : "emptySavedBody"
                  : "trySearch",
              )
            }}
          </p>
        </div>
        <div v-if="tab === 'favorites' && pageCount > 1" class="pagination">
          <button
            :disabled="pageIndex === 0"
            @click="pageIndex--"
            :aria-label="t('previous')"
          >
            <ChevronLeft :size="18" /></button
          ><span>{{ pageIndex + 1 }} <i>/</i> {{ pageCount }}</span
          ><button
            :disabled="pageIndex >= pageCount - 1"
            @click="pageIndex++"
            :aria-label="t('next')"
          >
            <ChevronRight :size="18" />
          </button>
        </div>
      </main>
      <main v-if="selected" v-show="page === 'lab'" class="lab-page content-width">
        <IngredientEditor
          ref="ingredientEditor"
          :names="selected.ingredients"
          :cookware="activeCookware"
          :has-creation="!!openingUrl"
          :error="error"
          :apply="editIngredients"
        />
        <button class="back-button" @click="back">
          <ArrowLeft :size="16" />{{ t("back") }}
        </button>
        <section class="lab-heading">
          <div>
            <span class="eyebrow"><Sparkles :size="13" />{{ t("today") }}</span>
            <h1>{{ title || dishName(selected) }}</h1>
            <p :class="{ 'lab-ingredient-summary': !openingUrl }">
              {{
                description || l(selected.description, selected.descriptionEn)
              }}
            </p>
          </div>
          <span class="lab-sticker"><Moon :size="22" /></span>
        </section>
        <div class="lab-cookware">
          <div>
            <CookingPot :size="16" /><span>{{
              l("本轮厨具", "This creation’s cookware")
            }}</span
            ><strong
              ><span
                v-if="activeCookwareItem"
                class="cookware-emoji"
                aria-hidden="true"
                >{{ activeCookwareItem.emoji }}</span
              >{{
                activeCookwareItem
                  ? l(activeCookwareItem.name, activeCookwareItem.nameEn)
                  : l("自动选择", "Automatic")
              }}</strong
            >
          </div>
          <p>
            {{
              l(
                "可在下方食材列表点编辑，为下一锅更换。",
                "Use Edit below the video to change ingredients and cookware for the next dish.",
              )
            }}
          </p>
        </div>
        <div class="lab-layout">
          <section class="cooking-area">
            <div class="video-stage" :class="{ live: stage === 'live' }">
              <video
                ref="videoElement"
                :src="recordingUrl || undefined"
                :autoplay="stage === 'live'"
                playsinline
                :controls="!!recordingUrl && stage !== 'live'"
                class="cooking-video"
                :class="{ 'video-visible': stage === 'live' || !!recordingUrl }"
                :poster="openingUrl || undefined"
              />
              <img
                v-if="openingUrl && stage !== 'live' && !recordingUrl"
                :src="openingUrl"
                class="opening-image"
                :alt="title || dishName(selected)"
              />
              <div
                v-if="(!openingUrl && !recordingUrl) || busy"
                class="stage-center"
                :class="{ 'over-image': !!openingUrl }"
              >
                <KitchenArt :active="busy" /><template v-if="busy"
                  ><h2>{{ t("wait") }}</h2>
                  <p>{{ status || t("waitBody") }}</p></template
                ><template v-else
                  ><h2>
                    {{
                      t(
                        stage === "stopped"
                          ? "stopped"
                          : stage === "error"
                            ? "failed"
                            : "idle",
                      )
                    }}
                  </h2>
                  <p>
                    {{ t(stage === "stopped" ? "pausedBody" : "prestart") }}
                  </p></template
                >
              </div>
              <div class="video-topline">
                <span class="live-label" :class="{ active: stage === 'live' }"
                  ><span />{{
                    t(
                      stage === "live"
                        ? "live"
                        : busy
                          ? "wait"
                          : recordingUrl
                            ? "replay"
                            : "today",
                    )
                  }}</span
                ><span v-if="stage === 'live'" class="time-left"
                  >{{ Math.max(0, Math.ceil(remaining))
                  }}{{ t("seconds") }}</span
                >
              </div>
              <button
                v-if="stage === 'live'"
                class="sound-button"
                @click="toggleSound"
                :aria-label="t(muted ? 'soundOn' : 'soundOff')"
              >
                <VolumeX v-if="muted" :size="19" /><Volume2 v-else :size="19" />
              </button>
              <button v-if="stage === 'live' && !additionHintDismissed" class="live-add-cta" @click="showPantry">
                <Sparkles :size="17" />{{ l('加点料，改变视频！', 'Add a twist — change the video!') }}
              </button>
            </div>
            <div class="cooking-details">
              <GenerationProgress :stage="stage" />
              <div v-if="error" class="error-banner" role="alert">
                <span>{{ error }}</span>
              </div>
              <p
                v-if="stage === 'live' && audioBlocked"
                class="recording-note"
                role="status"
              >
                {{ t("audioBlocked") }}
              </p>
              <p v-else-if="stage === 'live'" class="recording-note">
                {{ t("audioShow") }}
              </p>
              <div class="stage-actions">
                <button
                  v-if="stage !== 'live'"
                  class="primary-button start-button"
                  :disabled="busy"
                  @click="start"
                >
                  <LoaderCircle v-if="busy" class="spin" :size="18" /><Flame
                    v-else
                    :size="18"
                  />{{
                    t(busy ? "wait" : stage === "error" ? "retry" : "start")
                  }}</button
                ><button v-else class="secondary-button" @click="stop">
                  <CircleStop :size="18" />{{ t("stop") }}</button
                ><button
                  class="save-button"
                  :disabled="!openingUrl || saved || busy"
                  @click="save"
                >
                  <Check v-if="saved" :size="18" /><Heart
                    v-else
                    :size="18"
                    :fill="saved ? 'currentColor' : 'none'"
                  />{{ t(saved ? "saved" : "save") }}
                </button>
              </div>
              <VideoExport v-if="recordingUrl" :src="recordingDownloadUrl" :title="title" />
              <p v-if="!recordingSupported" class="recording-note" role="status">
                {{ t("recordingUnsupported") }}
              </p>
              <div class="pot-notes">
                <div class="ingredient-list-heading">
                  <span class="notes-label">{{ t("original") }}</span
                  ><button :disabled="busy" @click="ingredientEditor?.open()">
                    {{ l("编辑食材与厨具", "Edit ingredients & cookware") }}
                  </button>
                </div>
                <div
                  class="ingredient-chips base-ingredient-chips"
                  :class="{ expanded: labIngredientsExpanded }"
                  id="lab-base-ingredients"
                >
                  <span v-for="id in shownLabIngredients" :key="id">{{
                    ingredientName(id)
                  }}</span>
                </div>
                <button
                  v-if="selected.ingredients.length > 6"
                  class="lab-ingredients-toggle"
                  :aria-expanded="labIngredientsExpanded"
                  aria-controls="lab-base-ingredients"
                  @click="labIngredientsExpanded = !labIngredientsExpanded"
                >
                  <ChevronUp
                    v-if="labIngredientsExpanded"
                    :size="15"
                  /><ChevronDown v-else :size="15" />{{
                    labIngredientsExpanded
                      ? t("basketCollapse")
                      : t("basketExpand").replace(
                          "{count}",
                          String(selected.ingredients.length),
                        )
                  }}
                </button>
                <template v-if="additions.length"
                  ><span class="notes-label additions-label"
                    ><Sparkles :size="12" />{{ t("added") }}</span
                  >
                  <div class="ingredient-chips added-chips">
                    <span v-for="(a, i) in additions" :key="i">{{
                      translateAddition(a)
                    }}</span>
                  </div></template
                >
                <AnimalRoster :ids="visitingAnimals" />
              </div>
            </div>
          </section>
          <section ref="pantryPanel" class="pantry-panel" tabindex="-1">
            <div class="pantry-heading">
              <span class="small-wand"><WandSparkles :size="23" /></span>
              <div>
                <h2>
                  {{
                    t(
                      ingredientKind === "animal"
                        ? "animalTitle"
                        : "ingredients",
                    )
                  }}
                </h2>
                <p>
                  {{
                    t(
                      ingredientKind === "animal"
                        ? "animalSubtitle"
                        : "ingredientHint",
                    )
                  }}
                </p>
              </div>
            </div>
            <div class="ingredient-tabs">
              <button
                :class="{ active: ingredientKind === 'real' }"
                @click="ingredientKind = 'real'"
              >
                {{ t("real") }}</button
              ><button
                :class="{ active: ingredientKind === 'magic' }"
                @click="ingredientKind = 'magic'"
              >
                <Sparkles :size="13" />{{ t("magic") }}</button
              ><button
                :class="{ active: ingredientKind === 'animal' }"
                @click="ingredientKind = 'animal'"
              >
                <PawPrint :size="13" />{{ t("animalTab") }}
              </button>
            </div>
            <label
              v-if="ingredientKind !== 'animal'"
              class="pantry-search search-field"
              ><Search :size="17" /><input
                v-model="pantrySearch"
                :placeholder="t('pantrySearch')"
                :aria-label="t('pantrySearch')" /><button
                v-if="pantrySearch"
                @click="pantrySearch = ''"
                :aria-label="t('clearSearch')"
              >
                <X :size="16" /></button
            ></label>
            <IngredientCategories
              v-if="ingredientKind === 'real'"
              v-model="pantryCategory"
              compact
            />
            <div
              v-if="additionQueue.length"
              class="addition-queue"
              aria-live="polite"
            >
              <strong>{{ l("加料队列", "Addition queue") }}</strong>
              <p>
                {{
                  l(
                    "可以连续点选；按顺序变化。已发送表示模型已接收，具体效果请看画面。本轮结束后未发送项会取消。",
                    "Keep picking; changes run in order. Sent means accepted by the model, not a verified visual result. Unsent items are cancelled when this round ends.",
                  )
                }}
              </p>
              <ol>
                <li v-for="item in additionQueue" :key="item.id">
                  <span>{{ queuedName(item) }}</span
                  ><small>{{ queueStatus(item.status) }}</small
                  ><button
                    v-if="item.status === 'queued'"
                    :aria-label="l('取消 ', 'Cancel ') + queuedName(item)"
                    @click="cancelAddition(item.id)"
                  >
                    <X :size="14" />
                  </button>
                </li>
              </ol>
            </div>
            <AnimalPicker
              v-if="ingredientKind === 'animal'"
              :disabled="stage !== 'live'"
              :invite="addAnimal"
            />
            <div v-else-if="pantry.length" class="pantry-grid">
              <button
                v-for="ingredient in pantry"
                :key="ingredient.id"
                :disabled="stage !== 'live'"
                @click="addIngredient(ingredient.name)"
                :class="{ magical: ingredient.kind === 'magic' }"
              >
                <IngredientArt
                  :id="ingredient.id"
                  :magic="ingredient.kind === 'magic'"
                /><span>{{ l(ingredient.name, ingredient.nameEn) }}</span
                ><Plus :size="13" class="ingredient-plus" />
              </button>
            </div>
            <p v-else class="pantry-empty">{{ t("pantryNoResults") }}</p>
            <form
              v-if="ingredientKind !== 'animal'"
              class="custom-ingredient"
              @submit.prevent="addCustom"
            >
              <input
                v-model="custom"
                :placeholder="t('custom')"
                :aria-label="t('custom')"
                maxlength="80"
                :disabled="stage !== 'live'"
              /><button
                :disabled="stage !== 'live' || !custom.trim()"
                :aria-label="t('add')"
              >
                <LoaderCircle v-if="adding" class="spin" :size="18" /><Plus
                  v-else
                  :size="18"
                />
              </button>
            </form>
            <p class="pantry-footnote">
              <Sparkles :size="13" />{{
                adding
                  ? t(ingredientKind === "animal" ? "animalArriving" : "adding")
                  : stage === "live"
                    ? status
                    : t(
                        ingredientKind === "animal"
                          ? "animalStartHint"
                          : "addHint",
                      )
              }}
            </p>
          </section>
        </div>
      </main>
      <footer class="site-footer">
        <Moon :size="12" />{{ t("tagline") }}<Star :size="10" />
      </footer>
    </template>
  </div>
</template>
