<script setup lang="ts">
withDefaults(defineProps<{ variant?: "witch" | "pot"; active?: boolean }>(), {
  variant: "pot",
  active: false,
});
</script>
<template>
  <svg
    class="kitchen-art"
    viewBox="0 0 300 270"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g stroke="#FFD66B" stroke-width="3" stroke-linecap="round">
      <path d="M42 58v13m-6-6h12M251 104v14m-7-7h14M238 30v10m-5-5h10" />
      <path d="m72 17 4 8 9 2-7 6 1 9-7-5-8 4 2-9-6-6 9-1Z" fill="#FFD66B" />
    </g>
    <circle cx="259" cy="66" r="12" fill="#B9A1DF" />
    <circle cx="264" cy="61" r="11" fill="#2E2150" />
    <template v-if="variant === 'witch'">
      <path
        d="M114 115c-27 9-29 64-14 89l98 1c20-37 8-89-26-96Z"
        fill="#B7A1DB"
        stroke="#1E1433"
        stroke-width="4"
      />
      <path
        d="M110 133c0-29 76-32 77 0v23c0 50-78 52-77 0Z"
        fill="#FFE3CD"
        stroke="#1E1433"
        stroke-width="4"
      />
      <path
        d="M108 143c16 0 30-7 38-22 8 15 27 19 43 20v-25l-65-9Z"
        fill="#B7A1DB"
      />
      <path
        d="m87 121 44-89 39 24 18 58"
        fill="#544176"
        stroke="#1E1433"
        stroke-width="5"
        stroke-linejoin="round"
      />
      <path
        d="m130 34 38-13-4 37"
        fill="#544176"
        stroke="#1E1433"
        stroke-width="5"
        stroke-linejoin="round"
      />
      <path d="m105 90 75 10 8 19-91-3Z" fill="#FF8FC7" />
      <ellipse
        cx="147"
        cy="120"
        rx="77"
        ry="15"
        fill="#544176"
        stroke="#1E1433"
        stroke-width="5"
      />
      <path d="m149 86 4 7 8 1-6 6 1 8-7-4-7 4 2-8-6-6 8-1Z" fill="#FFD66B" />
      <path
        d="M129 150v7m37-7v7"
        stroke="#493244"
        stroke-width="5"
        stroke-linecap="round"
      />
      <path
        d="M143 164q6 6 12 0"
        stroke="#493244"
        stroke-width="3"
        stroke-linecap="round"
      />
      <ellipse cx="122" cy="164" rx="8" ry="5" fill="#FFAAC0" />
      <ellipse cx="173" cy="164" rx="8" ry="5" fill="#FFAAC0" />
    </template>
    <g :class="{ 'pot-bubble': active }">
      <circle
        cx="123"
        :cy="variant === 'witch' ? 188 : 105"
        r="8"
        fill="#7FE3C4"
      />
      <circle
        cx="166"
        :cy="variant === 'witch' ? 186 : 80"
        r="5"
        fill="#FF8FC7"
      />
      <circle
        cx="187"
        :cy="variant === 'witch' ? 196 : 123"
        r="10"
        fill="#7FE3C4"
      />
    </g>
    <g
      :transform="
        variant === 'witch'
          ? 'translate(0 36) scale(1 .84)'
          : 'translate(0 -16)'
      "
    >
      <path
        d="M112 240 105 253m83-13 8 13"
        stroke="#A28CCA"
        stroke-width="12"
        stroke-linecap="round"
      />
      <path
        d="M97 168c-31-18-36 30-6 28m112-28c31-18 36 30 6 28"
        stroke="#A28CCA"
        stroke-width="10"
      />
      <path
        d="M95 163c-25 59-7 86 55 86s80-27 55-86"
        fill="#65518C"
        stroke="#1E1433"
        stroke-width="5"
      />
      <ellipse
        cx="150"
        cy="163"
        rx="61"
        ry="17"
        fill="#A28CCA"
        stroke="#1E1433"
        stroke-width="5"
      />
      <ellipse cx="150" cy="164" rx="49" ry="10" fill="#7FE3C4" />
      <path
        d="M121 189c-5 11-4 21 2 27"
        stroke="#A994C8"
        stroke-width="6"
        stroke-linecap="round"
      />
      <path d="M166 195a14 14 0 1 0 10 24 15 15 0 0 1-10-24Z" fill="#FFD66B" />
    </g>
  </svg>
</template>
