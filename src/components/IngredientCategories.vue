<script setup lang="ts">
import {
  ingredientCategories,
  type IngredientCategory,
} from "../../shared/catalog";
import { t } from "../i18n";
const category = defineModel<IngredientCategory>({ required: true });
defineProps<{ compact?: boolean }>();
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
      :class="{ active: category === item }"
      :aria-pressed="category === item"
      @click="category = item"
    >
      {{ t(labels[item]) }}
    </button>
  </div>
</template>
