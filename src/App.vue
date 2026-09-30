<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
  CirclePause,
  Check,
  X,
  LoaderCircle,
  Star,
  Moon,
  PawPrint,
} from "lucide-vue-next";
import { ingredients, type IngredientCategory } from "../shared/catalog";
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
  login,
  logout,
  selectIngredients,
  start,
  stop,
  back,
  addIngredient,
  addAnimal,
  animals: visitingAnimals,
  toggleSound,
  save,
  openFavorite,
  downloadRecording,
} = useKitchen();
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
const basket = ref<string[]>([]);
const basketCategory = ref<IngredientCategory>("all");
const pantryCategory = ref<IngredientCategory>("all");
function toggleBasket(id: string) {
  basket.value = basket.value.includes(id)
    ? basket.value.filter((x) => x !== id)
    : basket.value.length < 6
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
        i.category === pantryCategory.value),
  ),
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
        <button :class="{ active: page === 'catalog' }" @click="back">
          <BookOpen :size="18" />{{ t("catalog") }}</button
        ><button
          :class="{ active: page === 'lab' }"
          @click="selected ? (page = 'lab') : enterLab()"
          :disabled="!selected && !basket.length"
        >
          <Sparkles :size="18" />{{ t("lab") }}<span class="nav-star">✦</span>
        </button>
      </nav>
      <main v-if="page === 'catalog'" class="catalog-page content-width">
        <section class="welcome">
          <div class="welcome-copy">
            <span class="eyebrow"><Star :size="13" /> {{ t("tagline") }}</span>
            <h1>{{ t("headline") }}</h1>
            <p>{{ t("intro") }}</p>
          </div>
          <KitchenArt variant="witch" /><span class="welcome-sparkle">✧</span>
        </section>
        <div class="catalog-toolbar">
          <div class="collection-tabs">
            <button :class="{ active: tab === 'all' }" @click="tab = 'all'">
              <BookOpen :size="16" />{{ t("all")
              }}<span>{{
                ingredients.filter((i) => i.kind === "real").length
              }}</span></button
            ><button
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
          <label v-if="tab === 'all'" class="search-field"
            ><Search :size="17" /><input
              v-model="search"
              :placeholder="t('search')"
              :aria-label="t('search')" /><button
              v-if="search"
              @click="search = ''"
              :aria-label="l('清除搜索', 'Clear search')"
            >
              <X :size="15" /></button
          ></label>
        </div>
        <template v-if="tab === 'all'">
          <IngredientCategories v-model="basketCategory" />
          <div class="basket-intro">
            <span><Sparkles :size="14" />{{ t("basketHint") }}</span
            ><span>{{ basket.length }} <i>/</i> 6</span>
          </div>
          <div v-if="filteredIngredients.length" class="basket-grid">
            <button
              v-for="(ingredient, index) in filteredIngredients"
              :key="ingredient.id"
              class="basket-ingredient"
              :class="{ chosen: basket.includes(ingredient.id) }"
              :aria-pressed="basket.includes(ingredient.id)"
              :disabled="!basket.includes(ingredient.id) && basket.length >= 6"
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
          <div class="basket-tray">
            <div class="basket-tray-top">
              <span
                >{{ t("yourBasket")
                }}<small>{{ basket.length }} / 6</small></span
              ><button v-if="basket.length" @click="basket = []">
                {{ t("clear") }}
              </button>
            </div>
            <div v-if="basket.length" class="basket-selected">
              <button v-for="id in basket" :key="id" @click="toggleBasket(id)">
                {{ ingredientName(id) }}<X :size="12" />
              </button>
            </div>
            <p v-else class="basket-placeholder">{{ t("basketEmpty") }}</p>
            <button
              class="primary-button"
              :disabled="!basket.length"
              @click="enterLab"
            >
              <WandSparkles :size="18" />{{ t("basketStart")
              }}<ArrowRight :size="17" />
            </button>
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
      <main v-else-if="selected" class="lab-page content-width">
        <button class="back-button" @click="back">
          <ArrowLeft :size="16" />{{ t("back") }}
        </button>
        <section class="lab-heading">
          <div>
            <span class="eyebrow"><Sparkles :size="13" />{{ t("today") }}</span>
            <h1>{{ title || dishName(selected) }}</h1>
            <p>
              {{
                description || l(selected.description, selected.descriptionEn)
              }}
            </p>
          </div>
          <span class="lab-sticker"><Moon :size="22" /></span>
        </section>
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
            </div>
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
                <CirclePause :size="18" />{{ t("stop") }}</button
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
            <button
              v-if="recordingUrl"
              class="recording-button"
              @click="downloadRecording"
            >
              <Download :size="15" />{{ t("recording") }}
            </button>
            <p v-if="!recordingSupported" class="recording-note" role="status">
              {{ t("recordingUnsupported") }}
            </p>
            <div class="pot-notes">
              <span class="notes-label">{{ t("original") }}</span>
              <div class="ingredient-chips">
                <span v-for="id in selected.ingredients" :key="id">{{
                  ingredientName(id)
                }}</span>
              </div>
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
          </section>
          <section class="pantry-panel">
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
            <IngredientCategories
              v-if="ingredientKind === 'real'"
              v-model="pantryCategory"
              compact
            />
            <AnimalPicker
              v-if="ingredientKind === 'animal'"
              :disabled="stage !== 'live'"
              :pending="adding"
              :invite="addAnimal"
            />
            <div v-else class="pantry-grid">
              <button
                v-for="ingredient in pantry"
                :key="ingredient.id"
                :disabled="stage !== 'live' || adding"
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
                :disabled="stage !== 'live' || adding"
              /><button
                :disabled="stage !== 'live' || adding || !custom.trim()"
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
