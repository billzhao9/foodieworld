<script setup lang="ts">
import VideoExport from "./VideoExport.vue";
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  Sparkles,
  LoaderCircle,
  ArrowLeft,
  Heart,
  Film,
} from "lucide-vue-next";
import type { SavedCreation } from "../../shared/contracts";
import { ingredients } from "../../shared/catalog";
import { t, localized as l } from "../i18n";
import AnimalRoster from "./AnimalRoster.vue";
import ShareCreation from "./ShareCreation.vue";
const props = defineProps<{ token: string }>();
const item = ref<SavedCreation | null>(null),
  loading = ref(true),
  failure = ref("");
const controller = new AbortController();
const videoUrl = computed(
  () => `/api/shared/${encodeURIComponent(props.token)}/video`,
);
const shareUrl = new URL(
  `/?share=${encodeURIComponent(props.token)}`,
  location.origin,
).href;
function ingredientName(name: string) {
  const known = ingredients.find(
    (i) => i.id === name || i.name === name || i.nameEn === name,
  );
  return known ? l(known.name, known.nameEn) : name;
}
onMounted(async () => {
  try {
    const response = await fetch(
      `/api/shared/${encodeURIComponent(props.token)}`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
    );
    if (!response.ok) {
      failure.value =
        response.status === 404 ? "shareNotFound" : "sharedLoadFailed";
      return;
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("title" in data) ||
      !("imageUrl" in data) ||
      !("ingredients" in data) ||
      !Array.isArray(data.ingredients)
    )
      throw new Error("INVALID_CREATION");
    item.value = data as SavedCreation;
  } catch {
    if (!controller.signal.aborted) failure.value = "sharedLoadFailed";
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => controller.abort());
</script>
<template>
  <main class="public-creation content-width">
    <div v-if="loading" class="empty-state shared-loading" role="status">
      <LoaderCircle class="spin" :size="30" />
      <h2>{{ t("sharedLoading") }}</h2>
    </div>
    <div v-else-if="failure" class="empty-state">
      <Heart :size="30" />
      <h1>{{ t(failure) }}</h1>
      <p>{{ t("shareUnavailableHint") }}</p>
      <a class="shared-home" href="/"
        ><ArrowLeft :size="15" />{{ t("visitKitchen") }}</a
      >
    </div>
    <template v-else-if="item">
      <div class="shared-intro">
        <span class="eyebrow"
          ><Sparkles :size="14" />{{ t("sharedFromFriend") }}</span
        >
        <h1>{{ l(item.title, item.titleEn || item.title) }}</h1>
        <p>{{ l(item.description, item.descriptionEn || item.description) }}</p>
      </div>
      <div class="shared-player">
        <video
          v-if="item.hasVideo"
          :src="videoUrl"
          :poster="item.imageUrl"
          controls
          playsinline
          preload="metadata"
          :aria-label="l(item.title, item.titleEn || item.title)"
        /><img
          v-else
          :src="item.imageUrl"
          :alt="l(item.title, item.titleEn || item.title)"
        />
      </div>
      <VideoExport v-if="item.hasVideo" :src="videoUrl" :title="l(item.title, item.titleEn || item.title)" />
      <div class="shared-caption">
        <Film v-if="item.hasVideo" :size="14" /><Heart v-else :size="14" />{{
          t(item.hasVideo ? "recordedCreation" : "savedRecipe")
        }}
      </div>
      <div class="shared-details">
        <div class="pot-notes">
          <template v-if="item.baseIngredients?.length"
            ><span class="notes-label">{{ t("original") }}</span>
            <div class="ingredient-chips">
              <span
                v-for="(name, index) in item.baseIngredients"
                :key="index"
                >{{ ingredientName(name) }}</span
              >
            </div></template
          ><template v-if="item.ingredients.length"
            ><span class="notes-label additions-label"
              ><Sparkles :size="12" />{{ t("added") }}</span
            >
            <div class="ingredient-chips added-chips">
              <span v-for="(name, index) in item.ingredients" :key="index">{{
                ingredientName(name)
              }}</span>
            </div></template
          >
          <AnimalRoster :ids="item.animals" />
          <p
            v-if="
              !item.baseIngredients?.length &&
              !item.ingredients.length &&
              !item.animals?.length
            "
            class="shared-no-ingredients"
          >
            {{ t("sharedSecretRecipe") }}
          </p>
        </div>
        <ShareCreation
          :url="shareUrl"
          :title="l(item.title, item.titleEn || item.title)"
        />
      </div>
      <p class="shared-footnote">
        <Sparkles :size="13" />{{ t("sharedMadeWith") }}
      </p>
    </template>
  </main>
</template>
