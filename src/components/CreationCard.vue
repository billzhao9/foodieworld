<script setup lang="ts">
import { ArrowRight, Film, Heart } from "lucide-vue-next";
import type { SavedCreation } from "../../shared/contracts";
import { t, localized as l } from "../i18n";
import AnimalRoster from "./AnimalRoster.vue";
import ShareCreation from "./ShareCreation.vue";
defineProps<{ item: SavedCreation }>();
defineEmits<{ open: [item: SavedCreation] }>();
</script>
<template>
  <article class="dish-card favorite-card creation-card">
    <div class="dish-picture creation-media">
      <video
        v-if="item.hasVideo"
        :src="`/api/creations/${encodeURIComponent(item.id)}/video`"
        :poster="item.imageUrl"
        :aria-label="l(item.title, item.titleEn || item.title)"
        controls
        playsinline
        preload="none"
      />
      <button v-else class="creation-image-button" @click="$emit('open', item)">
        <img
          :src="item.imageUrl"
          :alt="l(item.title, item.titleEn || item.title)"
          loading="lazy"
        />
      </button>
      <span class="creation-kind"
        ><Film v-if="item.hasVideo" :size="12" /><Heart v-else :size="12" />{{
          t(item.hasVideo ? "recordedCreation" : "savedRecipe")
        }}</span
      >
    </div>
    <div class="dish-info">
      <h2>{{ l(item.title, item.titleEn || item.title) }}</h2>
      <p>{{ l(item.description, item.descriptionEn || item.description) }}</p>
      <AnimalRoster :ids="item.animals" compact />
      <button class="card-link creation-open" @click="$emit('open', item)">
        {{ t("openCreation") }}<ArrowRight :size="15" /></button
      ><ShareCreation
        v-if="item.hasVideo"
        :creation-id="item.id"
        :title="l(item.title, item.titleEn || item.title)"
      />
    </div>
  </article>
</template>
