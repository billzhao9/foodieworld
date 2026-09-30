<script setup lang="ts">
import { computed, ref } from "vue";
import { X, Check, Search } from "lucide-vue-next";
import { ingredients, type IngredientCategory } from "../../shared/catalog";
import { cookware, type CookwareId } from "../../shared/cookware";
import { MAX_BASE_INGREDIENTS } from "../../shared/limits";
import { localized as l } from "../i18n";
import IngredientCategories from "./IngredientCategories.vue";
const props = defineProps<{
  names: string[];
  cookware?: CookwareId;
  hasCreation: boolean;
  error?: string;
  apply: (names: string[], cookware?: CookwareId) => Promise<boolean>;
}>();
const dialog = ref<HTMLDialogElement>();
const draft = ref<string[]>([]),
  search = ref(""),
  category = ref<IngredientCategory>("all");
const tools = ref(false),
  appliance = ref<CookwareId>(),
  saving = ref(false);
const filtered = computed(() =>
  ingredients.filter(
    (i) =>
      (category.value === "all" || i.category === category.value) &&
      `${i.name} ${i.nameEn}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
function label(name: string) {
  const item = ingredients.find((i) => i.name === name);
  return item ? l(item.name, item.nameEn) : name;
}
function toggle(name: string) {
  draft.value = draft.value.includes(name)
    ? draft.value.filter((n) => n !== name)
    : draft.value.length < MAX_BASE_INGREDIENTS
      ? [...draft.value, name]
      : draft.value;
}
function open() {
  draft.value = [...props.names];
  appliance.value = props.cookware;
  search.value = "";
  category.value = "all";
  tools.value = false;
  dialog.value?.showModal();
}
async function apply() {
  if (saving.value || !draft.value.length) return;
  saving.value = true;
  try {
    if (await props.apply([...draft.value], appliance.value))
      dialog.value?.close();
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="ingredient-editor"
      :aria-label="l('编辑这一锅', 'Edit this dish')"
      @cancel="saving && $event.preventDefault()"
    >
      <header>
        <h2>{{ l("编辑这一锅", "Edit this dish") }}</h2>
        <button
          :disabled="saving"
          :aria-label="l('取消编辑', 'Cancel editing')"
          @click="dialog?.close()"
        >
          <X :size="22" />
        </button>
      </header>
      <p>
        {{
          hasCreation
            ? l(
                "应用修改会结束当前一轮并保存已有录像，再准备新的一锅。",
                "Applying changes ends this round and saves its recording, then prepares a new dish.",
              )
            : l(
                "加减食材、换个厨具，留在这里继续施法。",
                "Adjust ingredients or cookware, then keep cooking right here.",
              )
        }}
      </p>
      <div class="editor-selected">
        <button
          v-for="name in draft"
          :key="name"
          :disabled="saving"
          :aria-label="`${l('移除', 'Remove')} ${label(name)}`"
          @click="toggle(name)"
        >
          {{ label(name) }}<X :size="12" />
        </button>
      </div>
      <div class="editor-count" aria-live="polite">
        {{ draft.length }} / {{ MAX_BASE_INGREDIENTS }} ·
        {{ l("种食材", "ingredients") }}
      </div>
      <IngredientCategories
        v-model="category"
        include-cookware
        :cookware-selected="tools"
        @cookware="tools = true"
        @food="tools = false"
      />
      <label v-if="!tools" class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          :placeholder="l('搜索食材', 'Search ingredients')"
          :aria-label="l('搜索食材', 'Search ingredients')"
      /></label>
      <div
        class="editor-options"
        :aria-label="l('可选材料', 'Available ingredients')"
      >
        <template v-if="tools"
          ><button
            :disabled="saving"
            :aria-pressed="!appliance"
            @click="appliance = undefined"
          >
            {{ l("自动选择", "Automatic") }}</button
          ><button
            v-for="item in cookware"
            :key="item.id"
            :disabled="saving"
            :aria-pressed="appliance === item.id"
            @click="appliance = item.id"
          >
            {{ item.emoji }} {{ l(item.name, item.nameEn) }}
          </button></template
        >
        <template v-else
          ><button
            v-for="item in filtered"
            :key="item.id"
            :disabled="
              saving ||
              (!draft.includes(item.name) &&
                draft.length >= MAX_BASE_INGREDIENTS)
            "
            :aria-pressed="draft.includes(item.name)"
            @click="toggle(item.name)"
          >
            {{ l(item.name, item.nameEn)
            }}<Check v-if="draft.includes(item.name)" :size="14" />
          </button>
          <p v-if="!filtered.length">
            {{
              l("没有找到，换个关键词试试。", "No matches. Try another search.")
            }}
          </p></template
        >
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <footer>
        <button
          class="secondary-button"
          :disabled="saving"
          @click="dialog?.close()"
        >
          {{ l("取消", "Cancel") }}</button
        ><button
          class="primary-button"
          :disabled="saving || !draft.length"
          @click="apply"
        >
          {{
            saving ? l("保存中…", "Saving…") : l("应用修改", "Apply changes")
          }}
        </button>
      </footer>
    </dialog></Teleport
  >
</template>
