<script setup lang="ts">
import {
  ingredientCategories,
  type IngredientCategory,
} from "../../shared/catalog";
import { localized as l, t } from "../i18n";
const category = defineModel<IngredientCategory>({ required: true });
defineProps<{
  compact?: boolean;
  includeCookware?: boolean;
  cookwareSelected?: boolean;
}>();
const emit = defineEmits<{ cookware: []; food: [] }>();
const labels: Record<IngredientCategory, string> = {
  all: "categoryAll",
  vegetables: "categoryVegetables",
  protein: "categoryProtein",
  dairy: "categoryDairy",
  staples: "categoryStaples",
  fruit: "categoryFruit",
  seasoning: "categorySeasoning",
};
</script>
<template>
  <div
    class="ingredient-categories"
    :class="{ compact }"
    role="group"
    :aria-label="t('categoryLabel')"
  >
    <button
      v-for="item in ingredientCategories"
      :key="item"
      :class="{ active: !cookwareSelected && category === item }"
      :aria-pressed="!cookwareSelected && category === item"
      @click="
        category = item;
        emit('food');
      "
    >
      {{ t(labels[item]) }}
    </button>
    <button
      v-if="includeCookware"
      :class="{ active: cookwareSelected }"
      :aria-pressed="!!cookwareSelected"
      @click="emit('cookware')"
    >
      {{ l("厨具", "Cookware") }}
    </button>
  </div>
</template>
