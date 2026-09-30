<script setup lang="ts">
import { ref } from "vue";
import { Share2, Check, LoaderCircle, Copy } from "lucide-vue-next";
import { t } from "../i18n";
const props = defineProps<{
  creationId?: string;
  url?: string;
  title: string;
}>();
const pending = ref(false),
  copied = ref(false),
  failed = ref(false),
  link = ref(props.url || "");
async function share() {
  if (pending.value) return;
  pending.value = true;
  failed.value = false;
  copied.value = false;
  try {
    if (!link.value) {
      const response = await fetch(
        `/api/creations/${encodeURIComponent(props.creationId!)}/share`,
        {
          method: "POST",
          credentials: "same-origin",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("SHARE_FAILED");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("url" in result) ||
        typeof result.url !== "string"
      )
        throw new Error("SHARE_INVALID");
      const absolute = new URL(result.url, window.location.origin);
      if (!["https:", "http:"].includes(absolute.protocol))
        throw new Error("SHARE_INVALID");
      link.value = absolute.href;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: props.title, url: link.value });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link.value);
      copied.value = true;
    } catch {
      /* The selectable field below is the fallback when clipboard access is unavailable. */
    }
  } catch {
    failed.value = true;
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="share-creation">
    <button class="share-button" :disabled="pending" @click="share">
      <LoaderCircle v-if="pending" class="spin" :size="15" /><Check
        v-else-if="copied"
        :size="15"
      /><Share2 v-else :size="15" />{{
        t(pending ? "sharePreparing" : copied ? "shareCopied" : "shareFriends")
      }}
    </button>
    <p v-if="failed" class="share-error" role="alert">{{ t("shareFailed") }}</p>
    <label v-if="link" class="share-link"
      ><span><Copy :size="12" />{{ t("shareLink") }}</span
      ><input
        :value="link"
        readonly
        :aria-label="t('shareLink')"
        @focus="($event.target as HTMLInputElement).select()"
    /></label>
  </div>
</template>
