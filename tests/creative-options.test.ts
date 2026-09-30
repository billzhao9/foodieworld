import { describe, it, expect } from "vitest";
import { combinations } from "../shared/combinations";
import { ingredients } from "../shared/catalog";
import { MAX_BASE_INGREDIENTS } from "../shared/limits";
import { openingPrompt } from "../server/prompts";
import { visualDirection } from "../server/visual-direction";

describe("editable cooking combinations", () => {
  it("offers distinct complete mixtures using selectable real ingredients", () => {
    expect(combinations).toHaveLength(24);
    expect(new Set(combinations.map((c) => c.id)).size).toBe(
      combinations.length,
    );
    for (const c of combinations) {
      expect(c.ingredients.length).toBeGreaterThan(0);
      expect(c.ingredients.length).toBeLessThanOrEqual(MAX_BASE_INGREDIENTS);
      expect(new Set(c.ingredients).size).toBe(c.ingredients.length);
      for (const id of c.ingredients)
        expect(
          ingredients.find((i) => i.id === id)?.kind,
          `${c.id}/${id}`,
        ).toBe("real");
    }
    for (const [category, min] of [
      ["staples", 50],
      ["protein", 75],
      ["fruit", 50],
    ] as const) {
      expect(
        ingredients.filter((i) => i.category === category).length,
      ).toBeGreaterThanOrEqual(min);
    }
  });
  it("keeps the retry scene stable while producing varied new scene directions", () => {
    expect(visualDirection("same-craft")).toBe(visualDirection("same-craft"));
    expect(
      new Set(
        Array.from({ length: 40 }, (_, i) => visualDirection(`craft-${i}`)),
      ).size,
    ).toBeGreaterThan(30);
  });
  it("passes explicit appliances and food structure to the actual opening instruction", () => {
    const prompt = openingPrompt({
      name: "Test",
      ingredients: ["鸡腿", "面粉"],
      cookware: "air-fryer",
      variationKey: "craft-1",
    });
    expect(prompt).toContain("explicitly selected Air fryer");
    expect(prompt).toContain(visualDirection("craft-1"));
    expect(prompt).toContain("perforated pull-out basket");
    expect(prompt).toContain("crispy coated fried chicken");
    expect(prompt).toContain("intact pizza base");
    expect(openingPrompt({ name: "Test", ingredients: ["草莓"] })).toContain(
      "No appliance was specified",
    );
  });
});
