<script setup lang="ts">
import { computed } from "vue";
import type { Dish } from "../../shared/catalog";
const props = defineProps<{ dish: Dish }>();
const variant = computed(() =>
  [
    "pizza",
    "burger",
    "sushi",
    "dumpling",
    "croissant",
    "pancake",
    "crepe",
  ].includes(props.dish.id)
    ? props.dish.id
    : props.dish.id.includes("soup") ||
        ["ramen", "tom-yum", "kimchi"].includes(props.dish.id)
      ? "soup"
      : props.dish.id.includes("rice") ||
          ["curry", "risotto", "bibimbap"].includes(props.dish.id)
        ? "rice"
        : "plate",
);
</script>
<template>
  <svg viewBox="0 0 220 158" fill="none" aria-hidden="true" class="dish-art">
    <ellipse cx="110" cy="130" rx="76" ry="10" fill="#251A36" opacity=".15" />
    <ellipse cx="110" cy="103" rx="85" ry="41" fill="#F8EAD4" />
    <ellipse cx="110" cy="101" rx="70" ry="31" fill="#E8D6BF" />
    <g v-if="variant === 'pizza'">
      <ellipse cx="110" cy="96" rx="65" ry="34" fill="#BE743E" />
      <ellipse cx="110" cy="91" rx="62" ry="33" fill="#F3C470" />
      <ellipse cx="110" cy="89" rx="53" ry="27" fill="#D36C50" />
      <path
        d="m75 83 21-12 15 18-20 10Zm45 16 18-22 13 17-16 16Z"
        fill="#FCE8A5"
      />
      <circle cx="117" cy="77" r="7" fill="#C85547" />
      <circle cx="84" cy="102" r="7" fill="#C85547" />
      <path d="M102 106q-18-20 5-14m24-22q-15 9 0 13" fill="#70985B" />
    </g>
    <g v-else-if="variant === 'burger'">
      <path d="M61 101h98v12q-45 20-98-1Z" fill="#E7A55D" />
      <path
        d="m58 96 17-8 18 7 19-7 24 8 23-5 8 10-19 7-22-4-15 5-20-7-21 4Z"
        fill="#71995A"
      />
      <rect x="58" y="83" width="104" height="17" rx="8" fill="#85523C" />
      <path d="m67 79 75-3 12 12-44 8Z" fill="#FFD36B" />
      <path d="M58 80c0-62 104-62 104 0Z" fill="#EFB773" />
      <path
        d="m88 55 5 3m23-13 5 3m14 14 5-2m-33 8 5-2"
        stroke="#FFF0C9"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="variant === 'sushi'">
      <g
        v-for="(x, i) in [55, 104, 80]"
        :key="i"
        :transform="`translate(${x} ${i === 2 ? 89 : 60})`"
      >
        <rect width="63" height="29" rx="12" fill="#FFF8E9" />
        <path d="M0 8Q30-11 63 8v13Q31 7 0 21Z" fill="#F29578" />
        <path d="m16 0 9 16m9-17 9 15" stroke="#FBC0A1" stroke-width="4" />
      </g>
    </g>
    <g v-else-if="variant === 'croissant'">
      <path
        d="M60 104q-25-19 0-38l21-9 29-9 31 10 20 11q22 22-3 38l-7-24-16 22-27 8-27-11-15-17Z"
        fill="#D79A55"
      />
      <path
        d="m80 60 3 36m25-45 3 54m28-45-5 38"
        stroke="#F2C581"
        stroke-width="8"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="variant === 'pancake' || variant === 'crepe'">
      <ellipse
        v-for="i in 3"
        :key="i"
        cx="110"
        :cy="114 - i * 12"
        :rx="57 - i * 2"
        ry="23"
        fill="#DCAC67"
        stroke="#F6D799"
        stroke-width="6"
      />
      <path d="M90 67q14-13 34-3l4 14-31 5Z" fill="#FFD575" />
      <path d="m136 57 16 8-10 21-17-18Z" fill="#DB687C" />
      <path d="m134 57 5-9 4 9 9-4-3 9Z" fill="#729B66" />
    </g>
    <g v-else-if="variant === 'dumpling'">
      <g
        v-for="(x, i) in [48, 96, 74]"
        :key="i"
        :transform="`translate(${x} ${i === 2 ? 85 : 65})`"
      >
        <path
          d="M0 26Q2-19 55 26q-24 22-55 0Z"
          fill="#FFF3DC"
          stroke="#D6C19D"
          stroke-width="2"
        />
        <path
          d="m12 8 3 12m10-20 2 17m11-11-1 13"
          stroke="#D6C19D"
          stroke-width="2"
        />
      </g>
    </g>
    <g v-else-if="variant === 'soup'">
      <path d="M45 88q3 50 65 50t65-50" fill="#BCA3D4" />
      <ellipse cx="110" cy="85" rx="65" ry="29" fill="#F6DDB8" />
      <ellipse cx="110" cy="85" rx="57" ry="22" fill="#CF8A56" />
      <path
        d="M70 86q18-17 38 1t40-2M74 93q18-17 38 1t40-2"
        stroke="#F6D58B"
        stroke-width="4"
      />
      <ellipse cx="132" cy="76" rx="16" ry="12" fill="#FFF5D9" />
      <ellipse cx="132" cy="76" rx="8" ry="7" fill="#F0B857" />
      <path d="m79 64 10 19m-1-22 10 19" stroke="#789158" stroke-width="5" />
      <path
        d="M90 43q-9-10 0-20m25 17q-9-10 0-20"
        stroke="#FFF2DD"
        stroke-width="4"
        stroke-linecap="round"
        opacity=".6"
      />
    </g>
    <g v-else-if="variant === 'rice'">
      <path d="M71 97q0-66 72-15l12 20q-34 24-84-5Z" fill="#FFF4D4" />
      <path
        d="M48 96q3-28 40-22l12 27 43-5 21 6q-38 34-104 12Z"
        fill="#D29B57"
      />
      <rect x="62" y="91" width="17" height="14" rx="4" fill="#EDB969" />
      <rect x="116" y="106" width="14" height="10" rx="3" fill="#E1AD62" />
      <path
        d="m123 72 13 5m-27-15 10 4m-21 11 10 4"
        stroke="#E8D8B5"
        stroke-width="3"
      />
    </g>
    <g v-else>
      <g
        v-for="(x, i) in [62, 91, 119, 78, 110, 137]"
        :key="i"
        :transform="`translate(${x} ${i < 3 ? 69 : 91}) rotate(${i * 13})`"
      >
        <rect
          width="30"
          height="23"
          rx="7"
          :fill="
            dish.id === 'tomato-egg'
              ? i % 2
                ? '#F5CB65'
                : '#DD715C'
              : dish.id === 'mapo-tofu'
                ? '#E9C290'
                : i % 2
                  ? '#BC7851'
                  : '#E1A65F'
          "
        />
        <path d="m6 5 10-1" stroke="#FFE6BD" stroke-width="3" opacity=".4" />
      </g>
      <path
        d="m73 80 9 8m44-23-5 10m-11 23 13 2m-27 14 8-8"
        stroke="#769A58"
        stroke-width="5"
        stroke-linecap="round"
      />
    </g>
  </svg>
</template>
