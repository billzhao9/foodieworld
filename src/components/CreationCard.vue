<script setup lang="ts">
import { ref } from "vue";
import { ArrowRight, Film, Heart } from "lucide-vue-next";
import type { SavedCreation } from "../../shared/contracts";
import { t, localized as l } from "../i18n";
import AnimalRoster from "./AnimalRoster.vue";
import ReplayPlayer from "./ReplayPlayer.vue";
import ShareCreation from "./ShareCreation.vue";
defineProps<{ item: SavedCreation }>();
const replay = ref<InstanceType<typeof ReplayPlayer>>();
defineEmits<{ open: [item: SavedCreation] }>();
</script>
<template>
  <article class="dish-card favorite-card creation-card">
    <div class="dish-picture creation-media">
      <ReplayPlayer
        ref="replay"
        v-if="item.hasVideo"
        :src="`/api/creations/${encodeURIComponent(item.id)}/video`"
        :poster="item.imageUrl"
        :title="l(item.title, item.titleEn || item.title)"
      />
      <button v-else class="creation-image-button" @click="item.hasVideo ? replay?.open() : $emit('open', item)">
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
      <button class="card-link creation-open" @click="item.hasVideo ? replay?.open() : $emit('open', item)">
        {{ t("openCreation") }}<ArrowRight :size="15" /></button
      ><ShareCreation
        :creation-id="item.id"
        :title="l(item.title, item.titleEn || item.title)"
      />
    </div>
  </article>
</template>
