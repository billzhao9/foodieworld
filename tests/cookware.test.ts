import { describe, expect, it } from "vitest";
import { cookware, cookwareSchema } from "../shared/cookware";

describe("cookware catalog", () => {
  it("provides unique bilingual utensils and accepts every offered ID", () => {
    expect(cookware).toHaveLength(23);
    expect(new Set(cookware.map((item) => item.id)).size).toBe(cookware.length);
    for (const item of cookware) {
      expect(cookwareSchema.parse(item.id)).toBe(item.id);
      expect(item.name).toMatch(/\p{Script=Han}/u);
      expect(item.nameEn).toMatch(/[A-Za-z]/);
      expect(item.emoji).toBeTruthy();
    }
  });
  it("keeps old records optional while rejecting invented or empty IDs", () => {
    expect(cookwareSchema.parse(undefined)).toBeUndefined();
    for (const invalid of ["", "imaginary-cooker", "锅", null, 1]) {
      expect(cookwareSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
