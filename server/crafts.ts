import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { Database } from "./db";
import { ApiError, generate, type Upstream } from "./upstream";
import {
  openingPrompt,
  additionPrompt,
  animalPrompt,
  animalBehaviors,
} from "./prompts";
import { animals } from "../shared/animals";
import {
  openingSchema,
  actionSchema,
  type Opening,
  type AlchemyAction,
} from "../shared/contracts";
const craftSchema = z.object({
  dishId: z.string(),
  baseIngredients: z.array(z.string()).min(1).max(6),
  opening: openingSchema.optional(),
  imageJob: z.string().optional(),
  imageUrl: z.string().optional(),
  phase: z.enum(["idle", "planning", "imaging", "ready", "failed"]),
  additions: z.array(z.string()),
  animals: z.array(z.string()).default([]),
  actionOrder: z.array(z.string()).default([]),
  actions: z.record(
    z.string(),
    z.object({
      ingredient: z.string(),
      kind: z.enum(["ingredient", "animal"]).default("ingredient"),
      behavior: z.enum(animalBehaviors).optional(),
      result: actionSchema.optional(),
      state: z.enum(["preparing", "ready", "applied", "failed"]),
    }),
  ),
  busy: z.string().optional(),
  busyUntil: z.number().optional(),
});
export type Craft = z.infer<typeof craftSchema>;
export class Crafts {
  constructor(
    readonly db: Database,
    readonly upstream: Upstream,
  ) {}
  async read(id: string, owner: string): Promise<Craft> {
    const r = await this.db.pool.query(
      "SELECT data FROM fw_records WHERE id=$1 AND owner=$2",
      [id, owner],
    );
    if (!r.rows[0]) throw new ApiError("NOT_FOUND", 404);
    return craftSchema.parse(r.rows[0].data);
  }
  async update<T>(
    id: string,
    owner: string,
    fn: (craft: Craft) => T,
  ): Promise<T> {
    return this.db.transaction(async (c) => {
      const r = await c.query(
        "SELECT data FROM fw_records WHERE id=$1 AND owner=$2 FOR UPDATE",
        [id, owner],
      );
      if (!r.rows[0]) throw new ApiError("NOT_FOUND", 404);
      const state = craftSchema.parse(r.rows[0].data);
      const out = fn(state);
      await c.query(
        "UPDATE fw_records SET data=$1,updated_at=now() WHERE id=$2",
        [JSON.stringify(state), id],
      );
      return out;
    });
  }
  async create(id: string, owner: string, baseIngredients: string[]) {
    await this.db.pool.query(
      "INSERT INTO fw_records(id,owner,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [
        id,
        owner,
        JSON.stringify({
          dishId: "custom",
          baseIngredients,
          phase: "idle",
          additions: [],
          animals: [],
          actionOrder: [],
          actions: {},
        }),
      ],
    );
    const craft = await this.read(id, owner);
    if (
      JSON.stringify(craft.baseIngredients) !== JSON.stringify(baseIngredients)
    )
      throw new ApiError("REQUEST_CONFLICT", 409);
    return craft;
  }
  async prepare(id: string, owner: string) {
    const existing = await this.read(id, owner);
    if (existing.imageJob) return existing;
    const token = randomUUID();
    const craft = await this.update(id, owner, (s) => {
      if (s.busy && (s.busyUntil ?? 0) > Date.now())
        throw new ApiError("IN_PROGRESS", 409);
      s.busy = token;
      s.busyUntil = Date.now() + 240000;
      s.phase = "planning";
      return structuredClone(s);
    });
    try {
      let opening: Opening | undefined = craft.opening;
      if (!opening) {
        opening = await generate(
          this.upstream,
          `fw_${id}_opening`,
          openingPrompt({
            name: "Original dish inspired by the selected ingredients",
            ingredients: craft.baseIngredients,
          }),
          openingSchema,
        );
        await this.update(id, owner, (s) => {
          s.opening = opening;
          s.phase = "imaging";
        });
      }
      const image = z.object({ jobId: z.string() }).parse(
        await this.upstream("/image-jobs", {
          requestId: `fw_${id}_image`,
          prompt: opening.imagePrompt,
          model: "og-image2-5-flare-low",
          aspectRatio: "16:9",
          endUserRef: "_enterprise",
        }),
      );
      await this.update(id, owner, (s) => {
        s.imageJob = image.jobId;
        s.phase = "imaging";
        delete s.busy;
      });
      return this.read(id, owner);
    } catch (e) {
      await this.update(id, owner, (s) => {
        if (s.busy === token) delete s.busy;
        s.phase = "failed";
      });
      throw e;
    }
  }
  async poll(id: string, owner: string) {
    const craft = await this.read(id, owner);
    if (!craft.imageJob || craft.imageUrl) return craft;
    const raw = z
      .object({
        status: z.string(),
        result: z.object({ imageUrl: z.string().url() }).nullish(),
      })
      .parse(
        await this.upstream(
          `/image-jobs/${encodeURIComponent(craft.imageJob)}`,
        ),
      );
    if (raw.result?.imageUrl)
      await this.update(id, owner, (s) => {
        s.imageUrl = raw.result!.imageUrl;
        s.phase = "ready";
      });
    else if (["failed", "cancelled"].includes(raw.status))
      throw new ApiError("IMAGE_FAILED");
    return this.read(id, owner);
  }
  async action(
    id: string,
    owner: string,
    actionId: string,
    ingredient: string,
    kind: "ingredient" | "animal" = "ingredient",
  ): Promise<AlchemyAction> {
    const animal =
      kind === "animal"
        ? animals.find((entry) => entry.id === ingredient)
        : undefined;
    const craft = await this.update(id, owner, (s) => {
      const prior = s.actions[actionId];
      if (prior && (prior.ingredient !== ingredient || prior.kind !== kind))
        throw new ApiError("REQUEST_CONFLICT", 409);
      if (kind === "animal" && !animal)
        throw new ApiError("INVALID_ANIMAL", 400);
      if (prior?.result) return structuredClone(s);
      const position = s.actionOrder.indexOf(actionId);
      if (
        position >= 0 &&
        s.actionOrder
          .slice(position + 1)
          .some((next) => s.actions[next]?.state === "applied")
      )
        throw new ApiError("REQUEST_CONFLICT", 409);
      // Expiring a worker lease cannot skip a prepared/unacknowledged scene
      // transition. Reject before buying another LLM response, across kinds.
      if (
        Object.entries(s.actions).some(
          ([otherId, action]) =>
            otherId !== actionId &&
            (action.state === "preparing" || action.state === "ready"),
        )
      )
        throw new ApiError("IN_PROGRESS", 409);
      if (s.busy && (s.busyUntil ?? 0) > Date.now())
        throw new ApiError("IN_PROGRESS", 409);
      if (s.additions.length + s.animals.length >= 12)
        throw new ApiError("INGREDIENT_LIMIT", 400);
      s.busy = actionId;
      s.busyUntil = Date.now() + 240000;
      s.actions[actionId] = {
        ingredient,
        kind,
        state: "preparing",
        ...(kind === "animal"
          ? {
              behavior:
                prior?.behavior ??
                animalBehaviors[randomInt(animalBehaviors.length)],
            }
          : {}),
      };
      if (!prior) s.actionOrder.push(actionId);
      return structuredClone(s);
    });
    if (craft.actions[actionId]?.result) return craft.actions[actionId].result!;
    try {
      if (!craft.opening) throw new ApiError("NOT_READY", 409);
      const animalNames = craft.animals.map(
        (animalId) =>
          animals.find((entry) => entry.id === animalId)?.nameEn ?? animalId,
      );
      const previousIngredients = [
        ...craft.baseIngredients,
        ...craft.additions,
      ];
      const behavior = craft.actions[actionId].behavior;
      if (kind === "animal" && !behavior) throw new ApiError("NOT_READY", 409);
      const result = await generate(
        this.upstream,
        `fw_${id}_${actionId}`,
        animal && behavior
          ? animalPrompt(
              craft.opening.title,
              previousIngredients,
              animalNames,
              animal.nameEn,
              behavior,
            )
          : additionPrompt(
              craft.opening.title,
              previousIngredients,
              ingredient,
              animalNames,
            ),
        actionSchema,
      );
      await this.update(id, owner, (s) => {
        if (s.busy !== actionId) throw new ApiError("REQUEST_CONFLICT", 409);
        s.actions[actionId] = {
          ...s.actions[actionId],
          result,
          state: "ready",
        };
      });
      return result;
    } catch (e) {
      await this.update(id, owner, (s) => {
        s.actions[actionId].state = "failed";
        if (s.busy === actionId) delete s.busy;
      });
      throw e;
    }
  }
  async acknowledge(id: string, owner: string, actionId: string) {
    return this.update(id, owner, (s) => {
      const a = s.actions[actionId];
      if (!a?.result) throw new ApiError("NOT_READY", 409);
      if (a.state === "applied") return;
      if (s.busy !== actionId) throw new ApiError("REQUEST_CONFLICT", 409);
      const position = s.actionOrder.indexOf(actionId);
      if (
        position >= 0 &&
        s.actionOrder.slice(0, position).some((prior) => {
          const state = s.actions[prior]?.state;
          return state === "preparing" || state === "ready";
        })
      )
        throw new ApiError("IN_PROGRESS", 409);
      a.state = "applied";
      if (a.kind === "animal") s.animals.push(a.ingredient);
      else s.additions.push(a.ingredient);
      if (s.opening)
        Object.assign(s.opening, {
          title: a.result.title,
          titleEn: a.result.titleEn,
          description: a.result.description,
          descriptionEn: a.result.descriptionEn,
        });
      delete s.busy;
    });
  }
}
