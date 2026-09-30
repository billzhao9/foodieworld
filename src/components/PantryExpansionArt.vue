<script setup lang="ts">
import { computed } from "vue";
import type { IngredientArtKind } from "../../shared/catalog";
const props = defineProps<{ kind: IngredientArtKind; id: string }>();
const tone = computed(() => {
  if (/chili|paprika|ketchup|gochujang|douban|cherry|raspberry|peach/.test(props.id)) return "#E59A8E";
  if (/soy|balsamic|black|oyster|hoisin|cinnamon|clove/.test(props.id)) return "#AA826B";
  if (/oil|honey|turmeric|corn|orange|papaya/.test(props.id)) return "#EAC879";
  if (/lime|avocado|kiwi|pea|bean|herb|mint/.test(props.id)) return "#A9C49C";
  return "#C6B0CB";
});
</script>
<template>
  <g stroke-linecap="round" stroke-linejoin="round">
    <g v-if="kind === 'bottle'">
      <path d="M19 8h10v9l7 7v17H12V24l7-7Z" :fill="tone" />
      <rect x="18" y="4" width="12" height="7" rx="2" fill="#E8DCC8" />
      <rect x="14" y="26" width="20" height="11" rx="3" fill="#FFF0D8" />
      <path d="M24 27q-8 9 0 9t0-9" :fill="tone" />
      <path d="M16 22v4m0 12v2" stroke="#FFF5E1" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'jar'">
      <rect x="10" y="12" width="28" height="30" rx="8" :fill="tone" />
      <rect x="9" y="7" width="30" height="8" rx="3" fill="#ADC9BB" />
      <rect x="13" y="23" width="22" height="12" rx="4" fill="#F6E7D0" />
      <path d="M18 28q6-5 12 0m-9 3h6" :stroke="tone" stroke-width="2" />
      <path d="M15 17v3" stroke="#FFEEDA" stroke-width="3" />
    </g>
    <g v-else-if="kind === 'spice'">
      <path d="M13 14h22l3 26q-14 6-28 0Z" :fill="tone" />
      <rect x="12" y="7" width="24" height="9" rx="3" fill="#D8C9A9" />
      <path d="M18 10h1m4 0h1m4 0h1" stroke="#927E67" stroke-width="2" />
      <rect x="14" y="23" width="20" height="11" rx="4" fill="#F7E9CD" />
      <path d="m23 25 2 3 4 1-4 2-2 3-1-4-3-1 3-1Z" :fill="tone" />
    </g>
    <g v-else-if="kind === 'herb'">
      <path d="M17 42 30 7m-9 27L10 20m16 2 12-7" stroke="#739B7F" stroke-width="3" />
      <path d="M24 27Q6 30 7 14q16-1 17 13M28 20Q17 8 25 3q13 5 3 17M23 34q1-18 18-12-2 16-18 12" fill="#9AC5A3" />
      <path d="m12 20 9 8m8 2 7-4" stroke="#D7E5BC" stroke-width="2" />
      <path d="m14 38 9 3" stroke="#DCB89A" stroke-width="3" />
    </g>
    <g v-else-if="kind === 'leaf'">
      <path d="M23 40C1 36 0 11 12 10q2-12 13-4 14-8 15 9 13 17-15 25Z" fill="#A5C29A" />
      <path d="m24 42 1-30m-1 15-12-9m12 17 12-12" stroke="#E0E3B7" stroke-width="3" />
    </g>
    <g v-else-if="kind === 'root'">
      <path d="M23 14q-9-13-13-6l11 10m5-4q13-14 14-5l-12 9" fill="#A7C4A0" />
      <path d="M10 22q2-14 16-9t11 19L23 43Q8 37 10 22" fill="#E2C5A1" />
      <path d="m15 23 7 3m5 3 6 2m-14 2 6 3" stroke="#BE9F87" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'mushroom'">
      <path d="m14 24-2 16h11l-2-16m10 1-2 17h10l-2-17" fill="#E7D3B4" />
      <path d="M4 25q0-25 23-13 6 6 4 13Z" fill="#B99B8A" />
      <path d="M23 28q-1-21 17-13 6 4 5 13Z" fill="#D4B295" />
      <path d="m11 18 5-4m16 7 5-2" stroke="#EDDAC0" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'pod'">
      <path d="M7 35Q9 10 40 9 37 38 13 41Z" fill="#9ABA91" />
      <path d="M12 35 34 15" stroke="#D3E1B7" stroke-width="2" />
      <circle cx="17" cy="31" r="5" fill="#C0D7A1" /><circle cx="25" cy="24" r="5" fill="#C0D7A1" /><circle cx="33" cy="17" r="4" fill="#C0D7A1" />
    </g>
    <g v-else-if="kind === 'fish'">
      <path d="m33 23 12-11v25L33 29Q12 47 4 25q12-22 29-2" fill="#A8C7D0" />
      <path d="m18 13 7-7 4 9m-9 21 8 5v-9" fill="#D4B3C8" />
      <path d="M15 17q7 8 0 16" stroke="#E8E8DC" stroke-width="2" />
      <circle cx="10" cy="23" r="2" fill="#5C6265" />
    </g>
    <g v-else-if="kind === 'shell'">
      <path d="M22 41 5 22Q0 13 10 13 9 2 19 7q5-10 11 0 11-4 10 7 11 0 4 11L27 41Z" fill="#D5B3BD" />
      <path d="m10 18 13 20m-4-26 5 26m7-26-6 26m13-19L26 38" stroke="#F2D7CB" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'meat'">
      <path d="M7 24C10 6 37 5 41 23S25 47 11 39Q4 35 7 24" fill="#D8949C" stroke="#F2CEBE" stroke-width="4" />
      <path d="m13 24 8 3 6-11m-9 18 9-4 8 4" stroke="#F2CDBD" stroke-width="3" />
    </g>
    <g v-else-if="kind === 'cube'">
      <path d="m6 20 24-10 13 9v20L20 45 6 34Z" fill="#D9C6A8" />
      <path d="m6 20 24-10 13 9-23 11Z" fill="#F0E3C6" />
      <path d="m20 30 23-11v20l-23 6Z" fill="#C7B393" />
      <path d="m12 21 15-6" stroke="#FFF1D9" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'grain'">
      <path d="M5 28q2 16 19 16t19-16Z" fill="#A4C4C1" />
      <ellipse cx="24" cy="27" rx="19" ry="8" fill="#E7D8BA" />
      <g :fill="tone"><ellipse cx="14" cy="25" rx="4" ry="3" /><ellipse cx="25" cy="22" rx="4" ry="3" /><ellipse cx="33" cy="28" rx="4" ry="3" /><ellipse cx="21" cy="30" rx="4" ry="3" /></g>
      <path d="m16 15 2-5m10 4 2-5" stroke="#E8D4AE" stroke-width="3" />
    </g>
    <g v-else-if="kind === 'fruit'">
      <path d="M23 15C3 5 0 31 13 40q10 8 22-1 17-21-1-27-6-2-11 3" :fill="tone" />
      <path d="M23 14q-1-10 9-10 0 9-9 10" fill="#9CBF92" />
      <path d="m24 14-3-8" stroke="#A18670" stroke-width="3" />
      <path d="M12 22q-3 7 1 10" stroke="#FFE3CD" stroke-width="3" />
    </g>
  </g>
</template>
