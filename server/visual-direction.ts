import { createHash } from "node:crypto";

const settings = [
  "a sunlit Mediterranean terrace kitchen with terracotta tiles and blurred citrus trees",
  "a rain-kissed tiny Japanese noodle shop with warm wood and softly glowing paper lanterns",
  "a whimsical woodland cottage kitchen with moss-green tiles and fern silhouettes",
  "a French patisserie with cream stone, fluted glass and a softly blurred pastry shelf",
  "a miniature Hong Kong night-market stall with teal and rose neon reflections, no readable signage",
  "a seaside kitchen with pale blue shutters, pearly shells and a distant sparkling ocean",
  "a Sichuan courtyard kitchen with red lacquer, bamboo shadows and weathered stone",
  "a dreamy rooftop cafe with mauve evening sky and distant golden city bokeh",
  "a retro American diner with cherry-red accents, chrome details and cream checker tiles",
  "a Nordic bakery with pale oak, sage ceramics and a frost-softened window",
  "a moonlit magical observatory kitchen with indigo arches and tiny brass stars",
  "a tropical garden food stand with coral tiles, banana-leaf shadows and woven textures",
  "a tiny Tuscan farmhouse kitchen with olive-green cabinetry and warm limestone",
  "a playful candy-colored food laboratory with rounded pastel cabinets and clear glass jars",
  "an autumn mountain teahouse kitchen with amber leaves outside and dark walnut trim",
  "a floating cloud cafe with peach clouds, ivory counters and delicate gold details",
];
const lighting = [
  "soft golden morning side light",
  "warm pendant light balanced by cool rainy window light",
  "gentle peach sunset rim light",
  "diffused daylight with soft leaf shadows",
  "cinematic amber food lighting against a cooler background",
  "luminous overcast window light",
  "a warm focused countertop glow with soft jewel-toned background bokeh",
];
const accents = [
  "sage and cream",
  "strawberry pink and warm ivory",
  "terracotta and mint",
  "powder blue and butter yellow",
  "plum and brushed brass",
  "coral and turquoise",
  "peach and lavender",
];

/** Stable per craft so network retries do not redesign an already paid scene. */
export function visualDirection(key: string) {
  const hash = createHash("sha256").update(key).digest();
  return `Set this round in ${settings[hash[0]! % settings.length]}. Use ${lighting[hash[1]! % lighting.length]} and ${accents[hash[2]! % accents.length]} accents. Invent a few small coordinated background props and ceramic details unique to this round; all remain secondary and softly out of focus. Make the food bright, tactile and appetizing, with rich natural colors and believable material contrast. Keep the same cute miniature 3D visual language. No text, brands, unrelated animals or background crowds. Lock this setting, lighting, camera and props for the entire continuous session; later additions change the food, not the room.`;
}
