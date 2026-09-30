import { describe, expect, it } from "vitest";
import { openingSchema, actionSchema } from "../shared/contracts";
import {
  openingPrompt,
  additionPrompt,
  animalPrompt,
  animalBehaviors,
} from "../server/prompts";

const oldOpening = {
  title: "芝士饭",
  titleEn: "Cheese rice",
  description: "芝士融化啦",
  descriptionEn: "Melting cheese",
  imagePrompt: "A skillet of rice and cheese.",
  videoPrompt: "The spatula folds cheese into rice.",
};
const oldAction = {
  title: "猫咪评审饭",
  titleEn: "Cat judge rice",
  description: "猫咪点评啦",
  descriptionEn: "A cat judges the rice",
  prompt: "A cat recoils beside the skillet with an exaggerated judging stare.",
};

describe("backward-compatible audio captions", () => {
  it("reads already paid opening and action receipts without commissioning replacement text", () => {
    expect(openingSchema.parse(oldOpening)).toEqual({
      ...oldOpening,
      audioPromptZh: "",
      audioPromptEn: "",
      effectsPrompt: "",
      narrationZh: "",
      narrationEn: "",
    });
    expect(actionSchema.parse(oldAction)).toEqual({
      ...oldAction,
      audioPromptZh: "",
      audioPromptEn: "",
      effectsPrompt: "",
      narrationZh: "",
      narrationEn: "",
    });
  });
  it("preserves exact Mandarin and English spoken lines and fills a missing legacy caption", () => {
    const zh =
      "前景一声清晰猫叫，低低锅铲声中画外主持人用普通话调侃：“这评委只收鱼干”";
    const en =
      'A clear meow precedes a warm offscreen host saying in English, "This judge accepts only fish", over quiet spatula scraping.';
    expect(
      actionSchema.parse({
        ...oldAction,
        audioPromptZh: zh,
        audioPromptEn: en,
      }),
    ).toMatchObject({ audioPromptZh: zh, audioPromptEn: en });
    expect(
      openingSchema.parse({ ...oldOpening, audioPromptEn: en }),
    ).toMatchObject({ audioPromptZh: "", audioPromptEn: en });
  });
  it("rejects malformed audio data without weakening the existing visual contract", () => {
    expect(
      actionSchema.safeParse({ ...oldAction, audioPromptZh: 123 }).success,
    ).toBe(false);
    expect(
      openingSchema.safeParse({
        ...oldOpening,
        audioPromptEn: "x".repeat(1601),
      }).success,
    ).toBe(false);
    expect(
      openingSchema.safeParse({ ...oldOpening, videoPrompt: "" }).success,
    ).toBe(false);
  });
  it("keeps sound-only effects and exact plain TTS lines independent of legacy mixed captions", () => {
    const effectsPrompt =
      "A clear cat meow and tiny paw taps in the foreground over quiet spatula scraping, no human speech or music.";
    const narrationZh =
      "这位猫评委一口还没尝到呢，就先把我们的米其林改成喵其林了。";
    const narrationEn =
      "This cat judge hasn't tasted dinner, but already demands payment in fish.";
    const parsed = actionSchema.parse({
      ...oldAction,
      effectsPrompt,
      narrationZh,
      narrationEn,
    });
    expect(parsed).toMatchObject({
      effectsPrompt,
      narrationZh,
      narrationEn,
      audioPromptZh: "",
      audioPromptEn: "",
    });
    expect(
      narrationZh.match(/\p{Script=Han}/gu)!.length,
    ).toBeGreaterThanOrEqual(20);
    expect(narrationZh.match(/\p{Script=Han}/gu)!.length).toBeLessThanOrEqual(
      35,
    );
    expect(narrationEn.split(/\s+/).length).toBeGreaterThanOrEqual(8);
    expect(narrationEn.split(/\s+/).length).toBeLessThanOrEqual(18);
    expect(parsed.narrationZh).not.toContain("猫叫");
    expect(parsed.narrationEn).not.toContain("meow");
    expect(
      actionSchema.safeParse({
        ...oldAction,
        narrationZh: { text: narrationZh },
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ ...oldAction, effectsPrompt: null }).success,
    ).toBe(false);
  });
});

describe("scene-specific sound prompt instructions", () => {
  const prompts = [
    openingPrompt({ name: "Cheese rice", ingredients: ["rice", "cheese"] }),
    additionPrompt("Cheese rice", ["rice", "cheese"], "pepper", ["cat"]),
    animalPrompt(
      "Cheese rice",
      ["rice", "cheese"],
      ["dog"],
      "cat",
      animalBehaviors[0],
    ),
  ];
  it.each(prompts)(
    "separates speech-free effects from language-locked plain-text host lines",
    (prompt) => {
      expect(prompt).not.toContain("audioPromptZh");
      expect(prompt).not.toContain("audioPromptEn");
      expect(prompt).toContain("effectsPrompt, narrationZh and narrationEn");
      expect(prompt).toContain("ONE concise English sound-only sentence");
      expect(prompt).toContain("natural Mandarin Chinese");
      expect(prompt).toContain("natural English");
      expect(prompt).toContain("20-35 Chinese characters");
      expect(prompt).toContain("8-18 words");
      expect(prompt).toContain(
        "equivalent specific joke tied to this dish's immediate change",
      );
      expect(prompt).toContain("no language switching");
      expect(prompt).toContain(
        "no human speech, human voices, words, narration, singing or music",
      );
      expect(prompt).toContain(
        "without sound-effect instructions, stage directions, speaker labels, SSML",
      );
      expect(prompt).toContain("no visual setup, camera, host appearance");
    },
  );
  it("grounds animal sound in the persisted behavior while preserving prior characters", () => {
    expect(prompts[2]).toContain(JSON.stringify(animalBehaviors[0]));
    expect(prompts[2]).toContain('Existing animal characters: ["dog"]');
    expect(prompts[2]).toContain('Arriving animal: "cat"');
    expect(prompts[2]).toContain(
      "recognizable vocalization or characteristic foley clearly audible in the foreground",
    );
    expect(prompts[2]).toContain("matched to its persisted comic behavior");
    expect(prompts[2]).toContain("a cat meows and a dog barks");
    expect(prompts[2]).toContain("a quiet fish can make comic bubbles");
    expect(prompts[2]).toContain("a butterfly can make playful fluttering");
    expect(prompts[2]).toContain("must not replace the chosen comic behavior");
    expect(prompts[1]).toContain('Existing animal characters: ["cat"]');
    expect(prompts[1]).toContain("never invent a new animal");
    expect(prompts[0]).toContain("do not invent an animal that is absent");
  });
  it("retains the existing opening and transition visual word limits", () => {
    expect(prompts[0]).toContain("Video: at most 55 English words");
    expect(prompts[1]).toContain("prompt (English <=45 words)");
    expect(prompts[2]).toContain("prompt (English <=45 words)");
  });
});
