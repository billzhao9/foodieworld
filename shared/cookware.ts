import { z } from "zod";

const entries = [
  ["wok", "炒锅", "Wok", "🍳"],
  ["skillet", "平底锅", "Skillet", "🍳"],
  ["stockpot", "汤锅", "Stockpot", "🍲"],
  ["steamer", "蒸笼", "Steamer", "🥟"],
  ["oven-tray", "烤盘", "Oven tray", "🍕"],
  ["air-fryer", "空气炸锅", "Air fryer", "🍟"],
  ["deep-fryer", "油炸锅", "Deep fryer", "🍗"],
  ["grill", "烧烤架", "Grill", "🔥"],
  ["griddle", "铁板", "Griddle", "🥞"],
  ["claypot", "砂锅", "Clay pot", "🍲"],
  ["rice-cooker", "电饭煲", "Rice cooker", "🍚"],
  ["pressure-cooker", "压力锅", "Pressure cooker", "🍲"],
  ["waffle-maker", "华夫饼机", "Waffle maker", "🧇"],
  ["takoyaki-pan", "章鱼烧锅", "Takoyaki pan", "🐙"],
  ["sushi-mat", "寿司竹帘", "Sushi mat", "🍣"],
  ["mixing-bowl", "搅拌碗", "Mixing bowl", "🥣"],
  ["microwave", "微波炉", "Microwave", "📡"],
  ["oven", "烤箱", "Oven", "🍞"],
  ["toaster", "烤面包机", "Toaster", "🍞"],
  ["blender", "料理机", "Blender", "🥤"],
  ["stand-mixer", "厨师机", "Stand mixer", "🧁"],
  ["hotpot", "火锅", "Hot pot", "🍲"],
  ["panini-press", "三明治压烤机", "Panini press", "🥪"],
] as const;
export type CookwareId = (typeof entries)[number][0];
export const cookware = entries.map(([id, name, nameEn, emoji]) => ({
  id,
  name,
  nameEn,
  emoji,
}));
export const cookwareSchema = z
  .enum(entries.map((entry) => entry[0]) as [CookwareId, ...CookwareId[]])
  .optional();
