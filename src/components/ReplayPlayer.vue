<script setup lang="ts">
import VideoExport from "./VideoExport.vue";
import { ref, onUnmounted } from "vue";
import { beginReplay } from "../lib/replay-start";
import { Play, Maximize, X } from "lucide-vue-next";
import { localized as l } from "../i18n";
const props = defineProps<{ src: string; poster: string; title: string }>();
const dialog = ref<HTMLDialogElement>();
const video = ref<HTMLVideoElement>();
const state = ref<"loading" | "playing" | "blocked" | "error">("loading");
let dispose: (() => void) | undefined;
function open() {
  dispose?.();
  dialog.value?.showModal();
  if (video.value)
    dispose = beginReplay(
      video.value,
      props.src,
      (value) => (state.value = value),
    );
}
function close() {
  dispose?.();
  dispose = undefined;
  dialog.value?.close();
}
onUnmounted(() => dispose?.());
function fullscreen() {
  const element = video.value as
    | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
    | undefined;
  if (element?.webkitEnterFullscreen) element.webkitEnterFullscreen();
  else if (element?.requestFullscreen)
    void element.requestFullscreen().catch(() => {});
  // The full-viewport dialog remains usable when native fullscreen is unavailable.
}
defineExpose({ open });
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
      @close="dispose?.()"
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
        :poster="poster"
        :aria-label="title"
        controls
        playsinline
        preload="none"
        @waiting="state = 'loading'"
        @playing="state = 'playing'"
      />
      <footer>
        <p v-if="state === 'loading'" role="status">
          {{ l("正在缓冲视频…", "Buffering video…") }}
        </p>
        <p v-if="state === 'error'" role="alert">
          {{
            l(
              "视频加载失败，请关闭后重试。",
              "Video could not load. Close and try again.",
            )
          }}
        </p>
        <button v-if="state === 'blocked' || state === 'error'" @click="open">
          <Play :size="18" />{{ l("点击播放", "Tap to play") }}
        </button>
        <button @click="fullscreen">
          <Maximize :size="18" />{{ l("全屏播放", "Fullscreen") }}
        </button>
      </footer>
      <VideoExport v-if="state !== 'error'" :src="src" :title="title" />
    </dialog>
  </Teleport>
</template>
