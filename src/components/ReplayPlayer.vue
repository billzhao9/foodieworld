<script setup lang="ts">
import { ref, nextTick } from "vue";
import { Play, Maximize, X } from "lucide-vue-next";
import { localized as l } from "../i18n";
const props = defineProps<{ src: string; poster: string; title: string }>();
const dialog = ref<HTMLDialogElement>();
const video = ref<HTMLVideoElement>();
const error = ref(false);
async function open() {
  error.value = false;
  dialog.value?.showModal();
  await nextTick();
  void video.value?.play().catch(() => {
    /* Native controls remain available. */
  });
}
function close() {
  video.value?.pause();
  dialog.value?.close();
}
function fullscreen() {
  const element = video.value as
    | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
    | undefined;
  if (element?.webkitEnterFullscreen) element.webkitEnterFullscreen();
  else if (element?.requestFullscreen)
    void element.requestFullscreen().catch(() => {});
  // The full-viewport dialog remains usable when native fullscreen is unavailable.
}
</script>
<template>
  <button
    class="replay-cover"
    :aria-label="l('播放录像：', 'Play recording: ') + title"
    @click="open"
  >
    <img :src="poster" :alt="title" loading="lazy" />
    <span
      ><Play :size="22" fill="currentColor" />{{
        l("播放 · 放大", "Play · Expand")
      }}</span
    >
  </button>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="replay-dialog"
      :aria-label="title"
      @close="video?.pause()"
      @click="
        (event) => {
          if (event.target === dialog) close();
        }
      "
    >
      <header>
        <h2>{{ title }}</h2>
        <button @click="close" :aria-label="l('关闭播放器', 'Close player')">
          <X />
        </button>
      </header>
      <video
        ref="video"
        :src="src"
        :poster="poster"
        :aria-label="title"
        controls
        playsinline
        preload="none"
        @error="error = true"
      />
      <footer>
        <p v-if="error" role="alert">
          {{
            l(
              "视频加载失败，请关闭后重试。",
              "Video could not load. Close and try again.",
            )
          }}
        </p>
        <button @click="fullscreen">
          <Maximize :size="18" />{{ l("全屏播放", "Fullscreen") }}
        </button>
      </footer>
    </dialog>
  </Teleport>
</template>
