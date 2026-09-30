<script setup lang="ts">
defineProps<{ id: string; magic?: boolean }>();
</script>
<template>
  <svg
    class="ingredient-art"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
  >
    <g v-if="magic">
      <path
        d="M21 5h7v10l10 15q5 12-13 12T12 30l9-15Z"
        fill="#B49DD0"
        stroke="#D7C4EB"
        stroke-width="2"
      />
      <path
        d="M17 27h16l5 8q0 7-13 7t-13-7Z"
        :fill="
          id === 'dragon'
            ? '#EE9B88'
            : id === 'fairy'
              ? '#8DE0BE'
              : id === 'moon'
                ? '#EED288'
                : '#E9A3D0'
        "
      />
      <path
        d="M20 5h9M20 10h9"
        stroke="#EECC96"
        stroke-width="4"
        stroke-linecap="round"
      />
      <path d="m25 26 2 4 4 1-3 3v4l-4-2-3 2 1-4-3-3 4-1Z" fill="#FFF0C5" />
      <path
        d="M12 13v6m-3-3h6m20-8v6m-3-3h6"
        stroke="#FFE8A7"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'durian'">
      <path d="m23 9 5-5 2 8 7-2 1 7 6 2-3 7 3 5-6 4-1 7-8-1-5 5-5-5-8 1-1-7-6-4 3-6-2-7 7-2 2-7Z" fill="#A8B675" />
      <path d="M24 12C8 19 10 37 24 40c14-4 17-21 0-28" fill="#F2DB9C" />
      <path d="M24 16c-8 7-10 18-2 20 8-4 8-13 2-20" fill="#E7C271" />
      <path d="m24 11 2-7" stroke="#A58261" stroke-width="4" stroke-linecap="round" />
    </g>
    <g v-else-if="id === 'stinky-tofu'">
      <path d="m6 25 23-12 13 10v16l-24 7L6 37Z" fill="#827374" />
      <path d="m6 25 23-12 13 10-24 9Z" fill="#B9A394" />
      <path d="m18 32 24-9v16l-24 7Z" fill="#63585E" />
      <path d="m20 22 9 3m-6-7 4 4" stroke="#AF7465" stroke-width="3" stroke-linecap="round" />
      <path d="M15 15q-5-4 0-8m14 1q-5-4 0-7" stroke="#C6BC9D" stroke-width="2" stroke-linecap="round" />
      <path d="m31 29 5 2m-11 5 4 2" stroke="#C0AB92" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else-if="id === 'century-egg'">
      <path d="M24 5C12 5 4 40 24 42S36 5 24 5" fill="#C5C0A7" />
      <path d="M24 9C15 9 8 37 24 39S34 9 24 9" fill="#6B574F" />
      <ellipse cx="24" cy="29" rx="9" ry="10" fill="#9CA486" />
      <ellipse cx="24" cy="30" rx="5" ry="6" fill="#7C8B72" />
      <path d="m18 15-2 6m15 1 1 5" stroke="#C7AD85" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else-if="id === 'chocolate'">
      <path d="M9 6h27l4 4v32H9Z" fill="#875A50" />
      <path d="M9 6h27v32H9Z" fill="#B17D63" />
      <path d="M22 7v31M10 17h25M10 28h25" stroke="#754D48" stroke-width="2" />
      <path d="M8 29 22 33l14-5 5 5v12H8Z" fill="#D6A5C5" />
      <path d="m8 29 14 4 14-5-3 9-10-1-10 4Z" fill="#F0D6E1" />
      <path d="m13 10 5-1m8 1 5-1m-18 12 5-1m8 1 5-1" stroke="#D2A185" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else-if="id === 'egg'">
      <path d="M24 6C13 6 4 39 24 41S36 6 24 6" fill="#F5DEBD" />
      <ellipse
        cx="19"
        cy="19"
        rx="3"
        ry="5"
        fill="#FFF0D8"
        transform="rotate(20 19 19)"
      />
    </g>
    <g v-else-if="id === 'tomato' || id === 'strawberry' || id === 'chili'">
      <path
        d="M8 25C8 10 23 13 24 14s16-6 16 10-14 19-17 19S8 36 8 25"
        fill="#EA8185"
      />
      <path d="m24 16-9-6 8 1 3-7 2 8 9-1-9 7Z" fill="#8BC599" />
      <path
        d="M14 23q-3 7 1 9"
        stroke="#FFC1BA"
        stroke-width="3"
        stroke-linecap="round"
      />
      <g v-if="id === 'strawberry'" stroke="#FFDBA3" stroke-width="2">
        <path d="m20 23 1 2m9-2 1 2m-7 6 1 2m-7 1 1 2m12-4 1 2" />
      </g>
    </g>
    <g v-else-if="id === 'mushroom'">
      <path d="m19 25-3 15q10 5 18-1l-5-14" fill="#E7D4B6" />
      <path d="M5 27C5 0 43 0 43 27q-20 6-38 0" fill="#D990A3" />
      <circle cx="15" cy="18" r="4" fill="#F4DBCF" />
      <circle cx="28" cy="12" r="3" fill="#F4DBCF" />
      <circle cx="34" cy="23" r="4" fill="#F4DBCF" />
    </g>
    <g v-else-if="id === 'cheese' || id === 'butter' || id === 'tofu'">
      <path
        d="m6 23 23-13 13 9v19L7 37Z"
        :fill="id === 'tofu' ? '#F1DEC7' : '#EFC778'"
      />
      <path
        d="m6 23 24-12 12 8-25 11Z"
        :fill="id === 'tofu' ? '#FFF0D9' : '#FFE1A0'"
      />
      <path
        d="m17 30 25-11v19l-25 7Z"
        :fill="id === 'tofu' ? '#D6C4B3' : '#DDA661'"
      />
      <g v-if="id === 'cheese'" fill="#B8814A">
        <circle cx="24" cy="32" r="3" />
        <circle cx="36" cy="27" r="3" />
        <circle cx="35" cy="35" r="2" />
      </g>
    </g>
    <g v-else-if="id === 'milk' || id === 'coconut'">
      <path d="m13 13 7-8h14l4 8v29H13Z" fill="#E9E4D9" />
      <path d="m13 13 7-8v9h18" fill="#ACD7D3" />
      <path d="M13 20h25v15H13" fill="#B2DAD7" />
      <path d="M26 22q-10 11 0 11t0-11" fill="#F4F0DD" />
    </g>
    <g
      v-else-if="
        id === 'chicken' ||
        id === 'pork' ||
        id === 'beef' ||
        id === 'salmon' ||
        id === 'shrimp'
      "
    >
      <path
        d="M10 21C16 4 44 12 40 31S0 46 10 21Z"
        :fill="id === 'salmon' || id === 'shrimp' ? '#EAA282' : '#CC8590'"
        stroke="#F2C5B2"
        stroke-width="4"
      />
      <path
        d="M18 16q12 9 17 3m-22 5q13 9 23 3m-20 6q8 6 15 2"
        stroke="#F4C3B1"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'potato' || id === 'onion'">
      <path
        d="M13 14c11-9 24-5 27 7s-8 23-22 21S1 24 13 14"
        :fill="id === 'potato' ? '#D5B58A' : '#DEC1CD'"
      />
      <path
        d="M15 18q-9 13 4 18M25 13q-8 16 1 26"
        :stroke="id === 'potato' ? '#B9956F' : '#B696AE'"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path v-if="id === 'onion'" d="m24 13 3-10 4 9" fill="#A3B893" />
    </g>
    <g v-else>
      <path d="M5 26q3 18 20 18t19-18" fill="#B1D3CD" />
      <ellipse cx="24" cy="25" rx="20" ry="8" fill="#E5ECE0" />
      <path
        d="M8 24c-2-10 7-11 8-13 3-8 12-6 15-2 8-1 13 5 10 16Z"
        fill="#F1E1B9"
      />
      <path
        d="m16 16 4 2m7-7 3 2m-7 10 3 2m8-4 3 2"
        stroke="#D6C19A"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
  </svg>
</template>
