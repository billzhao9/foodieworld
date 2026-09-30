<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, Shuffle, PawPrint, LoaderCircle, X } from "lucide-vue-next";
import {
  animals,
  animalCategories,
  type AnimalCategory,
} from "../../shared/animals";
import { t, localized as l } from "../i18n";
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    pending?: boolean;
    invite: (id: string) => void | Promise<unknown>;
  }>(),
  { disabled: false, pending: false },
);
const choosing = ref(false),
  inviteFailed = ref(false);
async function choose(id: string) {
  if (props.disabled || props.pending || choosing.value) return;
  choosing.value = true;
  inviteFailed.value = false;
  try {
    await props.invite(id);
  } catch {
    inviteFailed.value = true;
  } finally {
    choosing.value = false;
  }
}
const search = ref(""),
  category = ref<AnimalCategory | "all">("all");
const labels: Record<AnimalCategory | "all", string> = {
  all: "animalAll",
  mammal: "animalMammals",
  bird: "animalBirds",
  reptile: "animalReptiles",
  ocean: "animalOcean",
  bug: "animalBugs",
  fantasy: "animalFantasy",
};
const filtered = computed(() =>
  animals.filter(
    (animal) =>
      (category.value === "all" || animal.category === category.value) &&
      `${animal.name} ${animal.nameEn}`
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
  ),
);
function randomAnimal() {
  const pool = filtered.value;
  if (pool.length)
    void choose(pool[Math.floor(Math.random() * pool.length)]!.id);
}
</script>
<template>
  <div class="animal-picker">
    <label class="animal-search"
      ><Search :size="16" /><input
        v-model="search"
        :placeholder="t('animalSearch')"
        :aria-label="t('animalSearch')" /><button
        v-if="search"
        @click="search = ''"
        :aria-label="t('animalClearSearch')"
      >
        <X :size="15" /></button
    ></label>
    <div
      class="animal-categories"
      role="group"
      :aria-label="t('animalCategories')"
    >
      <button
        v-for="item in animalCategories"
        :key="item"
        :class="{ active: category === item }"
        :aria-pressed="category === item"
        @click="category = item"
      >
        {{ t(labels[item]) }}
      </button>
    </div>
    <div class="animal-picker-toolbar">
      <span
        ><PawPrint :size="12" />{{ filtered.length }}
        {{ t("animalGuests") }}</span
      ><button
        :disabled="disabled || pending || choosing || !filtered.length"
        @click="randomAnimal"
      >
        <LoaderCircle v-if="pending" class="spin" :size="15" /><Shuffle
          v-else
          :size="15"
        />{{ t("animalRandom") }}
      </button>
    </div>
    <div v-if="filtered.length" class="animal-grid">
      <button
        v-for="animal in filtered"
        :key="animal.id"
        :disabled="disabled || pending || choosing"
        :aria-label="`${t('animalInvite')} ${l(animal.name, animal.nameEn)}`"
        @click="choose(animal.id)"
      >
        <span class="animal-emoji" aria-hidden="true">{{ animal.emoji }}</span
        ><span>{{ l(animal.name, animal.nameEn) }}</span>
      </button>
    </div>
    <div v-else class="animal-empty">
      <PawPrint :size="25" />
      <p>{{ t("animalNoResults") }}</p>
    </div>
    <p v-if="inviteFailed" class="share-error" role="alert">
      {{ t("animalInviteFailed") }}
    </p>
    <p class="animal-picker-note">{{ t("animalStoryHint") }}</p>
  </div>
</template>
