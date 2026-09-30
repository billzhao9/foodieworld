import { describe, expect, it } from "vitest";
import { dishes, ingredientCategories, ingredients } from "../shared/catalog";
import { readFileSync } from "node:fs";

const oldIds = "egg rice tomato chicken beef pork shrimp salmon noodle flour cheese milk potato mushroom tofu chili onion coconut strawberry butter durian stinky-tofu century-egg chocolate carrot broccoli cabbage cucumber corn pumpkin spinach eggplant duck bacon sausage squid crab clam yogurt cream condensed-milk bread pasta oats rice-cake banana apple lemon mango pineapple blueberry watermelon salt sugar soy-sauce vinegar honey coffee mustard chili-oil moon stardust rainbow dragon cloud fairy comet crystal".split(" ");

describe("ingredient pantry", () => {
  it("offers at least 160 real ingredients and 35 dedicated sauces, oils or spices", () => {
    expect(ingredients.filter(item => item.kind === "real").length).toBeGreaterThanOrEqual(160);
    expect(ingredients.filter(item => item.category === "seasoning" && ["bottle", "jar", "herb", "spice"].includes(item.art ?? "")).length).toBeGreaterThanOrEqual(35);
  });
  it("preserves saved ingredient IDs and the existing filter categories", () => {
    const ids = new Set(ingredients.map(item => item.id));
    for (const id of oldIds) expect(ids.has(id), id).toBe(true);
    expect(ingredientCategories).toEqual(["all", "vegetables", "protein", "dairy", "staples", "fruit", "seasoning"]);
    for (const dish of dishes) for (const id of dish.ingredients) expect(ids.has(id), `${dish.id}: ${id}`).toBe(true);
  });
  it("has unique stable IDs and complete bilingual names", () => {
    expect(new Set(ingredients.map(item => item.id)).size).toBe(ingredients.length);
    expect(new Set(ingredients.map(item => item.name)).size).toBe(ingredients.length);
    for (const item of ingredients) {
      expect(item.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(item.name).toMatch(/\p{Script=Han}/u);
      expect(item.nameEn).toMatch(/[A-Za-z]/);
      expect(ingredientCategories).toContain(item.category);
      if (item.kind === "real") expect(item.category).not.toBe("all");
    }
  });
  it("gives every new ingredient a supported illustration instead of the legacy fallback", () => {
    const art = readFileSync(new URL("../src/components/PantryExpansionArt.vue", import.meta.url), "utf8");
    const router = readFileSync(new URL("../src/components/IngredientArt.vue", import.meta.url), "utf8");
    expect(router).toContain('v-else-if="expansionArt.has(id)"');
    for (const item of ingredients.filter(item => !oldIds.includes(item.id))) {
      expect(item.art, item.id).toBeTruthy();
      expect(art, item.id).toContain(`kind === '${item.art}'`);
    }
  });
});
