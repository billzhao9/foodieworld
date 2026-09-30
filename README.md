# Foodie World · 食界狂想

**A little curiosity. A pot of magic.**

Foodie World turns “what if?” into a cooking show you can play. Mix ingredients from East and West, choose your cookware, and watch an AI-generated dish come to life in real-time video. Then change the story: add a little stardust, invite a mischievous animal judge, or push a beautiful meal into glorious culinary chaos. With bilingual comic commentary and a gallery of recorded creations, every experiment becomes a tiny performance worth sharing. Foodie World makes generative video hands-on: your next ingredient becomes the next scene.

## Explore the kitchen

A mobile-friendly, English–Chinese cooking playground with shared-password access, animated food experiments, and real video recording.

- **326 real ingredients and 8 fantasy materials.** Explore staples, meat and seafood, vegetables, fruit, dairy, sauces, oils, and spices. Combine 1–40 ingredients, or try 20 random picks at once. Undo replacements, expand your basket, remove individual items, or clear it. Both initial selection and later additions support bilingual search.
- **24 editable starting combinations.** Begin with pizza, crispy fried chicken, sushi, or a cross-cultural experiment such as mapo pasta or kimchi pizza. Every combination is a starting point you can change.
- **23 cookware choices.** Try a microwave, oven, air fryer, steamer, sushi mat, and more. Cookware shares the ingredient filter and card area to keep the mobile page compact. Your choice is saved with the dish and its collection entry; older creations default to automatic selection.
- **A different setting for each new experiment.** Backgrounds, lighting, and palettes are selected consistently for a given cooking session. Retries retain the same direction, while a new session gets a fresh combination. Combinations may repeat, and generated results can still drift during longer videos.
- **144 animal characters and expression variants.** Browse, search, or invite a random guest. Animals can judge the food, sneak a bite, cause trouble, imitate a chef, or leave a cartoon poop gag. They are saved as characters, never counted as ingredients. Each action's randomized behavior is persisted so a retry does not reroll it.

The experience generates dish names, playful descriptions, and cooking videos—not step-by-step recipes. Ingredients are organized into recognizable main components, sauces, and seasonings; a generated video may not make every individual ingredient visually identifiable. Ingredient names draw on public food information, with an expanded international pantry; recipe prose is not copied.

## Cooking you can influence

Start with an opening image, then watch the scene develop through a live video session. Add real or imaginary ingredients to request the next transformation in the same session. Prompts aim to preserve the existing dish, cookware, characters, and setting while giving each addition a visible physical effect and a comic payoff.

A three-stage progress display shows elapsed time and an estimated remaining range. Estimates use recent successful generation times in the current browser and exclude obvious cache hits. This is an estimate, not an upstream completion percentage. Longer waits receive a clear status message; generation is only marked complete when video actually starts playing.

Each visitor can run one live session at a time, with a maximum of two across the app. Sessions last up to 60 seconds. Leaving, losing connectivity, or putting the page in the background stops generation, with server-side timeout cleanup as a fallback.

## Sound and bilingual commentary

Visko receives a separate sound-effects prompt for animal calls and cooking sounds. Host commentary is synthesized as actual WAV speech using the local macOS **Tingting** voice for Mandarin and **Samantha** for English, then mixed into both live playback and the recording.

Switching languages stops the previous narration and plays the corresponding language. Background audio is lowered during speech. Sound is enabled by default; if the browser blocks playback, tap the sound control to unlock it. Muting affects local listening only—the recording retains its audio.

Narration is cached in PostgreSQL. Previously paid creations use compatible fallback lines where necessary, without regenerating their opening images. **Narration currently requires the local macOS service. A cloud TTS integration is needed before deploying this feature on Linux.** Visko's imitation of human speech is not used as a reliable Mandarin voice.

## Record, collect, and share

The gallery displays recorded videos and their animal guests. When the browser supports `MediaRecorder`, the app saves actual video that can be downloaded. Unsupported browsers receive an explicit notice.

Signed-in visitors can create a random share link for an individual creation. Anyone with that link can view that creation without the kitchen password, but cannot generate content or browse the full gallery. Creations remain private until a share link is requested. Localhost links work only on the same machine; sharing with friends requires a deployed site with a reachable domain.

Collection metadata, opening images, recorded videos, and narration audio are stored in PostgreSQL. Temporary live-stream URLs are never treated as permanent creations.

## Run locally

Requirements: **Node.js 22.12+**, **pnpm**, and **PostgreSQL**.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Set `DATABASE_URL` and `MMLONE_API_KEY` in `.env`. The default MML ONE development endpoint is `http://127.0.0.1:3000`.

- Frontend: `http://localhost:5174`
- API: port `4174`
- First launch generates a random access password in `.data/access.json`. You can instead set `APP_PASSWORD` and `APP_SESSION_SECRET`.

Local and cloud instances can share the same PostgreSQL database by using connection strings pointing to that database. The local instance can connect through an SSH tunnel without exposing the database port publicly. Required tables are created when the app starts.

MML ONE must provide enterprise text generation, image jobs, and live-session APIs, with the enterprise service account authorized for `gpt-5.4-mini`, `og-image2-5-flare-low`, and `visko-orbis-stable`. Actual availability must be confirmed through the enterprise model directory and live requests.

## Validate and build

```sh
pnpm typecheck
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost/TEST_DATABASE pnpm test
pnpm build
pnpm start
```

Integration tests run in an isolated temporary database schema. They are skipped if a test database is not configured.

Build before starting production mode. The server serves both the frontend and the API. Set `SECURE_COOKIES=true` for HTTPS. Additional trusted origins can be specified as a comma-separated list in `APP_ORIGINS`.

The application uses Vue 3, TypeScript, Vite, a Hono server, PostgreSQL, and the Reactor SDK. Automated checks cover application behavior and data contracts; visual quality, ingredient fidelity, and continuity still require watching the generated output.

## Repository hygiene

Commit only application source, tests, dependency lockfiles, and operating instructions. Do not commit API keys, passwords, database credentials, SSH files, generated media, logs, AI design documents, or local agent configuration. `.env.example` contains placeholders only.

## References and licenses

Live video is received through the Reactor SDK, with prompts informed by the [Visko Orbis Stable prompting guide](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide).

The animal catalog follows the animal groups in [Unicode Emoji 18.0](https://unicode.org/Public/18.0.0/emoji/emoji-test.txt), including cat-face and monkey-face variants. Characters use native system emoji. Older systems may lack newer glyphs; character names remain visible. See [the Unicode license](licenses/UNICODE.txt).
