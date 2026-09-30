<script setup lang="ts">
defineProps<{ id: string }>();
</script>
<template>
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <g v-if="id === 'carrot'">
      <path d="m17 13 18 9L9 43Z" fill="#EEAE79" />
      <path d="m22 17 1-12 5 10 7-9-3 15" fill="#9EC891" />
      <path
        d="m17 25 6 3m-9 6 5 2"
        stroke="#CA8661"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'broccoli'">
      <path d="m20 21-3 21h15l-4-21" fill="#A6C795" />
      <path d="m24 27 12-12M23 29 11 19" stroke="#A6C795" stroke-width="5" />
      <path
        d="M8 24C-2 17 6 5 14 10 13-1 32-1 33 10 43 4 51 22 39 26Z"
        fill="#7EAC8C"
      />
      <path
        d="M10 15q5-5 8-1m6-8q6 0 7 5"
        stroke="#B6D5A5"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'cabbage' || id === 'spinach'">
      <path
        d="M24 42C5 43 3 24 9 18 4 3 24 2 26 11c13-9 21 6 16 15 2 10-9 18-18 16"
        fill="#9EC8A0"
      />
      <path
        d="M24 40V15m0 19L12 22m12 5 11-9"
        stroke="#D5E3B6"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="M10 24q-2 13 12 16m15-13q0 10-11 13"
        stroke="#78A687"
        stroke-width="2"
      />
    </g>
    <g v-else-if="id === 'cucumber'">
      <rect
        x="17"
        y="3"
        width="16"
        height="43"
        rx="8"
        transform="rotate(25 24 24)"
        fill="#84AE86"
      />
      <path
        d="m26 9-10 26"
        stroke="#B5D2A2"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="m30 15-1 2m-4 8-1 2m-4 8-1 2"
        stroke="#5B876C"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'corn'">
      <ellipse cx="25" cy="21" rx="11" ry="18" fill="#F1CF82" />
      <path
        d="M20 6v28m7-29v29M15 13h19M14 20h21M15 27h19"
        stroke="#D9AB62"
        stroke-width="1.5"
      />
      <path
        d="M6 19q3 24 19 27L24 29q-8-14-18-10m37 2q-2 21-18 25l3-17q6-10 15-8"
        fill="#9BBF8D"
      />
    </g>
    <g v-else-if="id === 'pumpkin'">
      <path d="m22 11 2-8 5 1-2 8" fill="#99AF80" />
      <ellipse cx="24" cy="27" rx="20" ry="16" fill="#E4A46E" />
      <ellipse cx="24" cy="27" rx="11" ry="16" fill="#F0BD7F" />
      <path d="M24 13v28" stroke="#DEA168" stroke-width="2" />
    </g>
    <g v-else-if="id === 'eggplant'">
      <path d="M31 12C52 30 26 49 13 42-1 33 22 32 21 16Z" fill="#AE96C5" />
      <path d="m22 19-4-9 9 1 7-6-1 9 8 5-12 1Z" fill="#95BE94" />
      <path d="m30 12 3-8" stroke="#7BA481" stroke-width="3" />
      <path
        d="M33 26q1 7-6 10"
        stroke="#D6BDDB"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'duck'">
      <path
        d="m13 31-7 6m0-1-2 4m3-3 1 5"
        stroke="#E4D3B7"
        stroke-width="5"
        stroke-linecap="round"
      />
      <path d="M16 34C-1 21 21 4 37 11s4 34-21 23" fill="#BC8566" />
      <path
        d="M19 17q9-7 17 1"
        stroke="#E9BC89"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'bacon'">
      <path d="m8 8 9-2 8 7 9-4 7 6-7 27-10-4-8 5-10-5Z" fill="#D79799" />
      <path
        d="m12 9 1 28m7-24 4 24m11-23-6 22"
        stroke="#F4CEBC"
        stroke-width="4"
      />
    </g>
    <g v-else-if="id === 'sausage'">
      <path
        d="m10 34-4 4m30-25 5-5"
        stroke="#C48478"
        stroke-width="6"
        stroke-linecap="round"
      />
      <path
        d="M12 34C7 20 17 7 34 12"
        stroke="#C58478"
        stroke-width="15"
        stroke-linecap="round"
      />
      <path
        d="m16 14 6 5m-10 3 7 3"
        stroke="#E9B7A1"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'squid'">
      <path d="m9 23 6-11 9-9 10 9 6 11-9-3H18Z" fill="#E4ADB5" />
      <path d="M15 19h18v10H15" fill="#EFC2C2" />
      <path
        d="M16 27q-9 16-2 16m7-16q-3 17 2 16m4-16q-1 17 5 16m0-16q9 17 11 9"
        stroke="#E4ADB5"
        stroke-width="4"
        stroke-linecap="round"
      />
      <circle cx="20" cy="25" r="2" fill="#725165" />
      <circle cx="28" cy="25" r="2" fill="#725165" />
    </g>
    <g v-else-if="id === 'crab'">
      <path
        d="m13 25-8-5m7 11-9 3m10 3-7 7m29-19 8-5m-7 11 9 3m-10 3 7 7"
        stroke="#D88F85"
        stroke-width="3"
        stroke-linecap="round"
      />
      <ellipse cx="24" cy="30" rx="15" ry="11" fill="#E8A193" />
      <path
        d="M9 22C-1 15 3 5 7 6v7l7-5q4 10-5 14m30 0c10-7 6-17 2-16v7l-7-5q-4 10 5 14"
        fill="#E8A193"
      />
      <path d="M20 21v-5m8 5v-5" stroke="#D88F85" stroke-width="3" />
      <circle cx="20" cy="16" r="2" fill="#725165" />
      <circle cx="28" cy="16" r="2" fill="#725165" />
    </g>
    <g v-else-if="id === 'clam'">
      <path d="M8 32C-8 10 12 2 24 9 40-2 53 17 40 33l-15 12Z" fill="#D5B2C5" />
      <path
        d="m24 39-12-25m12 25V12m0 27 13-23"
        stroke="#F0D6DC"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path d="m15 40 9-4 9 4-4 5H20Z" fill="#AC8AA5" />
    </g>
    <g v-else-if="['yogurt', 'cream', 'condensed-milk'].includes(id)">
      <path
        d="m10 17 4 27h21l4-27"
        :fill="
          id === 'yogurt' ? '#BDDAD5' : id === 'cream' ? '#E5BED1' : '#F0D298'
        "
      />
      <path d="M9 15h31v6H9Z" fill="#F7E9D9" />
      <path
        v-if="id === 'cream'"
        d="M14 14q-1-8 7-7 9-14 12 3l4 4Z"
        fill="#F7E9D9"
      />
      <path v-else d="M14 6h21v9H14Z" fill="#C7B1D5" />
      <ellipse cx="25" cy="32" rx="7" ry="6" fill="#F9EADA" />
      <path d="m22 31 3-3 3 3-3 4Z" fill="#D7AEC6" />
    </g>
    <g v-else-if="id === 'bread'">
      <path d="M11 22C-3 13 11 0 24 6 39 0 50 15 37 22v21H11Z" fill="#D7A577" />
      <path d="M15 23C6 15 13 8 24 11c12-3 19 5 9 12v15H15Z" fill="#F1D7A5" />
      <circle cx="19" cy="22" r="2" fill="#DEC18D" />
      <circle cx="28" cy="29" r="2" fill="#DEC18D" />
    </g>
    <g v-else-if="id === 'pasta'">
      <path
        d="m8 11 30 3-1 5-30-3Zm2 12 30 3-1 5-30-3Zm-4 12 30 3-1 5-30-3Z"
        fill="#E6C485"
      />
      <path
        d="m12 9 22 7M14 21l21 7M10 33l21 7"
        stroke="#F5DEAE"
        stroke-width="2"
      />
    </g>
    <g v-else-if="id === 'oats'">
      <path d="M12 10h26l-3 34H9Z" fill="#D9BC91" />
      <path d="M12 8h26v7H12" fill="#EDDAAE" />
      <ellipse cx="24" cy="28" rx="9" ry="11" fill="#F5E5C5" />
      <path d="m21 36 6-18" stroke="#B99C75" stroke-width="2" />
      <path
        d="m24 24-5-4m7 5 5-2m-8 7-6-3m7 4 6-1"
        stroke="#D2B385"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'rice-cake'">
      <rect
        x="7"
        y="11"
        width="11"
        height="28"
        rx="5"
        transform="rotate(-15 7 11)"
        fill="#EEE1CF"
      />
      <rect
        x="22"
        y="8"
        width="11"
        height="31"
        rx="5"
        transform="rotate(10 22 8)"
        fill="#F7ECD9"
      />
      <rect
        x="30"
        y="23"
        width="11"
        height="21"
        rx="5"
        transform="rotate(25 30 23)"
        fill="#DDD4C2"
      />
    </g>
    <g v-else-if="id === 'banana'">
      <path d="M10 5q2 28 27 19l3 5C20 54 0 33 6 7Z" fill="#F1D68A" />
      <path
        d="M9 13q1 24 23 19"
        stroke="#D8B96D"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="m6 7 4-4m28 21 3 4"
        stroke="#A9916A"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'apple'">
      <path
        d="M24 15C5 3 0 26 10 37s15 4 15 4 13 5 18-13-7-22-19-13"
        fill="#DC8C94"
      />
      <path d="M23 15 25 5" stroke="#A07E66" stroke-width="3" />
      <path d="M25 10q3-10 13-7-2 9-13 7" fill="#A3C299" />
      <path
        d="M12 20q-3 6 0 11"
        stroke="#F2BDC0"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'lemon' || id === 'mango'">
      <path
        d="M7 23C7 7 27 3 35 10l7 8-5 12C25 49 6 40 7 23"
        :fill="id === 'lemon' ? '#ECDD90' : '#EDBC81'"
      />
      <path
        d="M13 22q1-9 10-10"
        :stroke="id === 'lemon' ? '#F6ECC0' : '#F8D7A4'"
        stroke-width="4"
        stroke-linecap="round"
      />
      <path
        v-if="id === 'mango'"
        d="M33 10q-1-9 10-8-1 8-10 8"
        fill="#A2BB8D"
      />
    </g>
    <g v-else-if="id === 'pineapple'">
      <path d="m15 17-5-12 10 7 4-12 5 12 10-7-5 12" fill="#97B88A" />
      <rect x="10" y="15" width="29" height="31" rx="13" fill="#E6C381" />
      <path
        d="m13 20 22 20m-22-10 15 14m-9-28 18 16m-2-12-23 20m21-9-14 14m8-29-15 15"
        stroke="#C4A06C"
        stroke-width="1.5"
      />
    </g>
    <g v-else-if="id === 'blueberry'">
      <circle cx="17" cy="19" r="11" fill="#9CA4D0" />
      <circle cx="32" cy="24" r="11" fill="#8994C6" />
      <circle cx="19" cy="35" r="11" fill="#ADB1D6" />
      <path
        d="m14 14 3 1 3-2-1 4 2 3-4-1-3 2 1-4Zm15 6 3 1 3-2-1 4 2 3-4-1-3 2 1-4Zm-13 11 3 1 3-2-1 4 2 3-4-1-3 2 1-4Z"
        fill="#747CA9"
      />
    </g>
    <g v-else-if="id === 'watermelon'">
      <path d="m4 13 40 2C41 50 9 51 4 13" fill="#8FB796" />
      <path d="m7 15 34 2C35 45 11 44 7 15" fill="#DADCAE" />
      <path d="m10 17 28 2C32 39 14 39 10 17" fill="#DE929A" />
      <path
        d="m16 21 1 3m9-4v4m6-1-1 3m-7 3v3"
        stroke="#845D68"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="['salt', 'sugar'].includes(id)">
      <path d="M15 12h20l5 29q-15 7-30 0Z" fill="#D7DFD9" />
      <path d="M14 6q11-5 22 0v9H14Z" fill="#B5A7C7" />
      <path d="M12 28h26l2 13q-16 5-30 0Z" fill="#F2E9D7" />
      <circle cx="21" cy="8" r="1" fill="#7B6C8E" />
      <circle cx="27" cy="7" r="1" fill="#7B6C8E" />
      <circle cx="31" cy="10" r="1" fill="#7B6C8E" />
    </g>
    <g v-else-if="['soy-sauce', 'vinegar', 'chili-oil'].includes(id)">
      <path
        d="M19 8h13v9l6 6v21H12V23l7-6Z"
        :fill="
          id === 'chili-oil'
            ? '#BD7B6A'
            : id === 'vinegar'
              ? '#AD9381'
              : '#88746B'
        "
      />
      <path
        d="M18 4h15v8H18Z"
        :fill="id === 'chili-oil' ? '#D4A591' : '#CDBA9C'"
      />
      <path d="M12 26h26v12H12Z" fill="#EAD5AD" />
      <path
        d="m23 28 4 4-3 4-4-4Z"
        :fill="id === 'chili-oil' ? '#C27F70' : '#9C8C76'"
      />
    </g>
    <g v-else-if="id === 'honey'">
      <path d="M12 16h25l4 20q0 10-15 10T9 36Z" fill="#D8B06E" />
      <path d="M11 10h27v10H11Z" fill="#B89970" />
      <path d="M10 26h29v12H10Z" fill="#F3DDA9" />
      <path d="m24 28 6 3v5l-6 3-5-3v-5Z" fill="#D4AA67" />
    </g>
    <g v-else-if="id === 'coffee'">
      <path d="M36 20c16-4 13 16-1 12" stroke="#BBA9C8" stroke-width="4" />
      <path d="M7 16h29v18q-14 15-29 0Z" fill="#C8B6D3" />
      <ellipse cx="22" cy="16" rx="15" ry="5" fill="#9B7D6C" />
      <path
        d="M17 9q-3-4 1-7m9 7q-3-4 1-7"
        stroke="#DECFDD"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M11 23v8"
        stroke="#E7DAE5"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="id === 'mustard'">
      <path d="m21 3 7 1 1 10 7 7v23H11V21l9-7Z" fill="#C4CD90" />
      <path d="M19 12h11v7H19Z" fill="#E1D8B2" />
      <path d="M12 28h23v11H12Z" fill="#F0E7C8" />
      <path d="M22 37q-5-8 6-7-1 7-6 7" fill="#91AB79" />
    </g>
  </svg>
</template>
