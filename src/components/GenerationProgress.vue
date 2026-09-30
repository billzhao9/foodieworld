<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { Check, Sparkles, Clock3 } from "lucide-vue-next";
import {
  GenerationProgressTracker,
  generationStages,
  formatGenerationRange,
  type ProgressStorage,
} from "../lib/generation-progress";
import { locale, t } from "../i18n";
const props = defineProps<{ stage: string }>();
let storage: ProgressStorage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Storage is optional. */
}
const tracker = new GenerationProgressTracker(storage);
const state = ref(tracker.snapshot(performance.now()));
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.stage,
  (stage) => {
    state.value = tracker.transition(stage, performance.now());
    clearInterval(timer);
    if (state.value.active)
      timer = setInterval(() => {
        state.value = tracker.snapshot(performance.now());
      }, 1000);
  },
  { immediate: true, flush: "sync" },
);
onUnmounted(() => {
  clearInterval(timer);
  tracker.transition("stopped", performance.now());
});
const stageIndex = computed(() =>
  generationStages.indexOf(
    state.value.stage as (typeof generationStages)[number],
  ),
);
const percentage = computed(() => Math.floor(state.value.progress));
const labels = ["progressPlanning", "progressImaging", "progressConnecting"];
const elapsed = computed(() => {
  const seconds = state.value.elapsedSeconds,
    minutes = Math.floor(seconds / 60),
    rest = seconds % 60;
  return locale.value === "zh"
    ? minutes
      ? `${minutes}分${rest}秒`
      : `${rest}秒`
    : minutes
      ? `${minutes}m ${rest}s`
      : `${rest}s`;
});
const remaining = computed(() =>
  formatGenerationRange(
    state.value.remainingSeconds.low,
    state.value.remainingSeconds.high,
    locale.value,
  ),
);
const progressText = computed(
  () =>
    `${t("progressEstimate")} ${percentage.value}%. ${t(labels[stageIndex.value] || "progressConnecting")}. ${t("progressElapsed")} ${elapsed.value}`,
);
</script>
<template>
  <section
    v-if="state.active"
    class="generation-progress"
    :aria-label="t('progressTitle')"
  >
    <div class="generation-progress-heading">
      <span><Sparkles :size="14" />{{ t("progressTitle") }}</span
      ><span class="estimated-label">{{ t("progressEstimate") }}</span>
    </div>
    <ol class="generation-steps">
      <li
        v-for="(step, index) in generationStages"
        :key="step"
        :class="{ current: index === stageIndex, done: index < stageIndex }"
        :aria-current="index === stageIndex ? 'step' : undefined"
      >
        <span class="step-symbol"
          ><Check v-if="index < stageIndex" :size="12" /><span v-else>{{
            index + 1
          }}</span></span
        >{{ t(labels[index]!) }}
      </li>
    </ol>
    <div
      class="estimated-progress-track"
      role="progressbar"
      :aria-label="t('progressEstimate')"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="percentage"
      :aria-valuetext="progressText"
    >
      <span :style="{ width: `${state.progress}%` }" />
    </div>
    <p v-if="state.overdue" class="generation-overdue" role="status">
      {{ t("progressSlower") }}
    </p>
    <div v-else class="generation-eta">
      <span>{{ t("progressEta") }}</span
      ><strong>{{ remaining }}</strong>
    </div>
    <div class="generation-time">
      <span
        ><Clock3 :size="12" />{{ t("progressElapsed") }}
        <time :datetime="`PT${state.elapsedSeconds}S`">{{
          elapsed
        }}</time></span
      ><span>{{
        t(state.hasHistory ? "progressHistory" : "progressDefault")
      }}</span>
    </div>
  </section>
</template>
