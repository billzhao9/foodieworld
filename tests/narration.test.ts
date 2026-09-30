import { describe, expect, it } from "vitest";
import { narrationText } from "../server/narration";

describe("spoken narration language boundary", () => {
  it("keeps genuine Mandarin and English lines separate", () => {
    const lines = {
      narrationZh: "评委先别跑，这锅的惊喜还在后头！",
      narrationEn: "Judges, stay seated. The chaos is just getting started!",
    };
    expect(narrationText(lines, "zh")).toBe(lines.narrationZh);
    expect(narrationText(lines, "en")).toBe(lines.narrationEn);
  });
  it("replaces missing or obviously swapped languages and strips speech control markup", () => {
    expect(narrationText({ narrationZh: "Not Chinese" }, "zh")).toMatch(
      /\p{Script=Han}/u,
    );
    expect(narrationText({ narrationEn: "不是英文" }, "en")).not.toMatch(
      /\p{Script=Han}/u,
    );
    expect(
      narrationText(
        { narrationZh: "[[rate 999]]<voice>评委先别跑！</voice>" },
        "zh",
      ),
    ).toBe("评委先别跑！");
    expect(narrationText({}, "zh")).toMatch(/\p{Script=Han}/u);
  });
});
