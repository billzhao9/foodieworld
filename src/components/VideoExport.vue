<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Download, Share2, LoaderCircle } from 'lucide-vue-next';
import { localized as l } from '../i18n';
const props = defineProps<{ src: string; title: string }>();
const file = ref<File>();
const busy = ref(false);
const hint = ref('');
let controller: AbortController | undefined;
const exportUrl = computed(() => props.src.startsWith('blob:') ? props.src : `${props.src}${props.src.includes('?') ? '&' : '?'}format=mp4`);
const downloadUrl = computed(() => props.src.startsWith('blob:') ? props.src : `${exportUrl.value}&download=1`);
watch(() => props.src, () => { controller?.abort(); file.value = undefined; hint.value = ''; busy.value = false; });
onUnmounted(() => controller?.abort());
async function prepare() {
  if (busy.value) return;
  if (file.value) { await share(); return; }
  const request = new AbortController();
  controller = request;
  busy.value = true;
  hint.value = '';
  try {
    const response = await fetch(exportUrl.value, { credentials: 'same-origin', signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]) });
    if (!response.ok) throw new Error('DOWNLOAD_FAILED');
    if (Number(response.headers.get('content-length')) > 65 * 1024 * 1024) throw new Error('VIDEO_TOO_LARGE');
    const blob = await response.blob();
    if (controller !== request || request.signal.aborted) return;
    if (!blob.size || blob.size > 65 * 1024 * 1024 || !blob.type.startsWith('video/')) throw new Error('INVALID_VIDEO');
    const type = blob.type.split(';')[0]!;
    const extension = type === 'video/mp4' ? 'mp4' : type === 'video/webm' ? 'webm' : 'mkv';
    const candidate = new File([blob], `foodieworld.${extension}`, { type });
    if (!navigator.canShare?.({files: [candidate]})) {
      hint.value = 'unsupported';
      return;
    }
    file.value = candidate;
    // A fresh second tap preserves iOS user activation after the network fetch.
    hint.value = 'ready';
  } catch {
    if (!request.signal.aborted) hint.value = 'failed';
  } finally {
    if (controller === request) busy.value = false;
  }
}
async function share() {
  if (!file.value || busy.value) return;
  busy.value = true;
  try {
    await navigator.share({ files: [file.value], title: props.title });
    hint.value = 'opened'; // The browser cannot confirm which target was chosen.
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) hint.value = 'shareFailed';
  } finally { busy.value = false; }
}
</script>
<template>
  <div class="video-export">
    <div class="video-export-actions">
      <button type="button" :disabled="busy" @click="prepare">
        <LoaderCircle v-if="busy" class="spin" :size="17" /><Share2 v-else :size="17" />
        {{ busy ? l('准备视频…', 'Preparing video…') : file ? l('视频已准备 · 打开系统分享', 'Video ready · Open share sheet') : l('保存到相册 / 分享', 'Save to Photos / Share') }}
      </button>
      <a :href="downloadUrl" download="foodieworld-video" @click="hint = 'files'"><Download :size="17" />{{ l('下载到文件', 'Download file') }}</a>
    </div>
    <p role="status">{{ hint === 'failed' ? l('视频未能下载，请重试。', 'Could not fetch the video. Please retry.')
      : hint === 'unsupported' || hint === 'shareFailed' ? l('此浏览器无法分享视频文件。iPhone 请用 Safari 打开，或下载后在「文件」中点分享 →「存储视频」。', 'This browser cannot share video files. On iPhone, open in Safari, or download and use Files → Share → Save Video.')
      : hint === 'files' ? l('iPhone 下载会进入「文件」。打开视频 → 分享 →「存储视频」，即可加入相册。', 'iPhone downloads go to Files. Open the video → Share → Save Video to add it to Photos.')
      : l('iPhone：打开系统分享后选择「存储视频」。是否有此选项由系统和视频格式决定，网页不能直接写入相册。', 'iPhone: choose Save Video in the system share sheet when available. Websites cannot write directly to Photos.') }}</p>
  </div>
</template>
