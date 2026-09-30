<script setup lang="ts">
import { computed } from "vue";
import { PawPrint } from "lucide-vue-next";
import { animals } from "../../shared/animals";
import { t, localized as l } from "../i18n";
const props = defineProps<{ ids?: string[]; compact?: boolean }>();
const visitors = computed(() =>
  (props.ids || [])
    .map((id) => animals.find((animal) => animal.id === id))
    .filter((animal) => !!animal),
);
const visible = computed(() =>
  props.compact ? visitors.value.slice(0, 3) : visitors.value,
);
</script>
<template>
  <div v-if="visitors.length" class="animal-roster" :class="{ compact }">
    <span class="notes-label"
      ><PawPrint :size="12" />{{ t("animalCast") }}</span
    >
    <div class="animal-guest-chips">
      <span v-for="(animal, index) in visible" :key="index"
        ><span class="animal-emoji" aria-hidden="true">{{ animal.emoji }}</span
        >{{ l(animal.name, animal.nameEn) }}</span
      ><span v-if="compact && visitors.length > 3"
        >+{{ visitors.length - 3 }}</span
      >
    </div>
  </div>
</template>
