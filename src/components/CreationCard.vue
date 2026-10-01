<script setup lang="ts">
import { setCreationLike } from "../lib/storage";
import { ref } from "vue";
import { ArrowRight, Film, Heart } from "lucide-vue-next";
import type { SavedCreation } from "../../shared/contracts";
import { t, localized as l } from "../i18n";
import AnimalRoster from "./AnimalRoster.vue";
import ReplayPlayer from "./ReplayPlayer.vue";
import ShareCreation from "./ShareCreation.vue";
const props = defineProps<{ item: SavedCreation }>();
const replay = ref<InstanceType<typeof ReplayPlayer>>();
const emit = defineEmits<{ open: [item: SavedCreation]; liked: [id: string, result: {liked: boolean; likeCount: number}] }>();
const liking = ref(false);
const likeError = ref(false);
async function toggleLike() {
  if (liking.value) return;
  liking.value = true;
  likeError.value = false;
  try { emit("liked", props.item.id, await setCreationLike(props.item.id, !props.item.liked)); }
  catch { likeError.value = true; }
  finally { liking.value = false; }
}
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
      <button class="creation-like" :class="{ liked: item.liked }" :aria-pressed="!!item.liked" :disabled="liking" :title="item.liked ? l('取消点赞', 'Unlike') : l('喜欢这道料理？点个赞', 'Like this creation')" @click="toggleLike">
        <Heart :size="18" :fill="item.liked ? 'currentColor' : 'none'" />
        {{ item.liked ? l('已点赞', 'Liked') : l('点赞', 'Like') }} <span>{{ item.likeCount || 0 }}</span>
      </button>
      <p v-if="likeError" class="like-error" role="status">{{ l('点赞未成功，请再试一次。', 'Could not update your like. Please retry.') }}</p>
      <button class="card-link creation-open" @click="item.hasVideo ? replay?.open() : $emit('open', item)">
        {{ t("openCreation") }}<ArrowRight :size="15" /></button
      ><ShareCreation
        :creation-id="item.id"
        :title="l(item.title, item.titleEn || item.title)"
      />
    </div>
  </article>
</template>
