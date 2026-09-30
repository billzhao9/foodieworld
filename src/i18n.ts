import { ref, watch } from "vue";
export const locale = ref<"zh" | "en">(
  localStorage.getItem("foodie-locale") === "en" ? "en" : "zh",
);
const copy: Record<string, [string, string]> = {
  categoryAll: ["全部", "All"],
  categoryVegetables: ["蔬菜菌菇", "Vegetables"],
  categoryProtein: ["肉类海鲜", "Meat & seafood"],
  categoryDairy: ["蛋奶", "Eggs & dairy"],
  categoryStaples: ["主食", "Staples"],
  categoryFruit: ["水果", "Fruit"],
  categorySeasoning: ["调味甜食", "Sweet & savory"],
  categoryLabel: ["食材分类", "Ingredient categories"],
  openCreation: ["查看作品", "View creation"],
  gallery: ["魔法画廊", "Gallery"],
  allSaved: ["全部收藏", "Saved"],
  emptyGallery: [
    "第一道奇妙料理，还在酝酿中",
    "Your first curious creation is still brewing",
  ],
  emptyGalleryBody: [
    "完成烹饪并收藏视频，让朋友看看你的脑洞。",
    "Cook, record and save your creation. Then share a little surprise with friends.",
  ],
  recordedCreation: ["料理实录", "Kitchen recording"],
  shareFriends: ["分享给朋友", "Share with friends"],
  sharePreparing: ["准备分享链接…", "Preparing link…"],
  shareCopied: ["链接已复制", "Link copied"],
  shareLink: ["作品链接，可复制发送", "Copy this creation’s link"],
  shareFailed: [
    "分享链接没准备好，请再试一次。",
    "The sharing link could not be created. Please try again.",
  ],
  sharedLoading: [
    "正在打开这份奇妙料理…",
    "Opening a little culinary surprise…",
  ],
  sharedFromFriend: [
    "朋友分享的一锅魔法",
    "A little magic, shared by a friend",
  ],
  shareNotFound: ["这份分享暂时找不到了", "This creation is unavailable"],
  sharedLoadFailed: [
    "这锅魔法还没送到，请稍后重试",
    "This creation could not be loaded. Please try again later.",
  ],
  shareUnavailableHint: [
    "可以请朋友重新发送作品链接。",
    "Ask your friend for a fresh sharing link.",
  ],
  visitKitchen: ["去食界狂想看看", "Explore Foodie World"],
  sharedMadeWith: [
    "诞生于食界狂想，每一锅都有自己的个性。",
    "Created in Foodie World. Every pot has a personality.",
  ],
  sharedSecretRecipe: [
    "这份料理保留了一点神秘感。",
    "This recipe keeps a little mystery.",
  ],
  animalInviteFailed: [
    "小客人还没赶到，请稍后再试。",
    "Your visitor could not arrive. Please try again.",
  ],
  animalTab: ["动物乱入", "Animal guests"],
  animalTitle: ["咦，谁溜进厨房了？", "Who’s sneaking into the kitchen?"],
  animalSubtitle: [
    "请一位小客人，让这锅故事热闹起来。",
    "Invite a little visitor and let the story unfold.",
  ],
  animalAll: ["全部", "All"],
  animalMammals: ["毛茸茸", "Mammals"],
  animalBirds: ["鸟儿", "Birds"],
  animalReptiles: ["爬虫两栖", "Reptiles & frogs"],
  animalOcean: ["海洋", "Ocean"],
  animalBugs: ["小虫", "Little bugs"],
  animalFantasy: ["幻想来客", "Fantasy"],
  animalCategories: ["动物分类", "Animal categories"],
  animalSearch: ["找一只小客人…", "Find a little visitor…"],
  animalClearSearch: ["清除动物搜索", "Clear animal search"],
  animalGuests: ["位小客人", "little visitors"],
  animalRandom: ["随机来一只", "Surprise me"],
  animalInvite: ["邀请", "Invite"],
  animalNoResults: [
    "这位小客人还没现身，换个名字找找吧。",
    "That visitor is hiding. Try another name.",
  ],
  animalStoryHint: [
    "小客人会即兴参与故事；爪印、羽毛等会变成小精灵。",
    "Visitors bring spontaneous stories. Paw prints, feathers and similar symbols become little sprites.",
  ],
  animalStartHint: [
    "点亮炉火后，就可以邀请动物来串门。",
    "Light the stove, then invite an animal to drop by.",
  ],
  animalArriving: ["小客人正在赶来…", "A little visitor is on the way…"],
  animalCast: ["厨房小客人", "Kitchen guests"],
  basketHint: [
    "挑选 1–6 种食材，交给魔法来组合",
    "Choose 1–6 ingredients. Let magic do the mixing.",
  ],
  yourBasket: ["你的食材篮", "Your ingredient basket"],
  clear: ["清空", "Clear"],
  basketEmpty: [
    "点选上方食材，装一点灵感进来。",
    "Pick something above to fill your basket.",
  ],
  basketStart: ["带着食材，开始施法", "Let’s make some magic"],
  brand: ["食界狂想", "Foodie World"],
  brandSubtitle: ["FOODIE WORLD", "COOK · MIX · SURPRISE"],
  tagline: ["一点好奇，一锅魔法。", "A little curiosity. A pot of magic."],
  gateTitle: ["嘘，秘密厨房营业啦", "Psst… the secret kitchen is open"],
  gateBody: [
    "带上你的好奇心，用口令打开这扇门。",
    "Bring your curiosity. A password opens the door.",
  ],
  password: ["厨房口令", "Kitchen password"],
  enter: ["开启美味奇遇", "Let the magic begin"],
  checking: ["正在开门…", "Opening the door…"],
  private: [
    "只为受邀的小小美食魔法师开放",
    "A little hideaway for invited food magicians",
  ],
  catalog: ["食材篮", "Ingredient basket"],
  lab: ["炼金台", "Alchemy table"],
  all: ["挑选食材", "Pick ingredients"],
  favorites: ["作品集", "Collection"],
  headline: ["今天，把什么变成美味？", "What shall we conjure today?"],
  intro: [
    "挑几样新鲜食材，创造独一无二的美味狂想。",
    "Pick a few fresh ingredients. Your witch will dream up something delicious.",
  ],
  search: ["找找厨房里有什么…", "Explore the pantry…"],
  count: ["道美味，等你唤醒", "delicious possibilities"],
  cook: ["去施魔法", "Make magic"],
  noResults: ["没有找到这种食材", "No ingredients found"],
  trySearch: [
    "换个名字，再试一次吧。",
    "Try another name or ingredient category.",
  ],
  emptySaved: ["作品集还在等第一颗星星", "Your first little star is waiting"],
  emptySavedBody: [
    "在炼金台创造一道美味，把喜欢的瞬间收藏起来。",
    "Create something in the kitchen, then save your favorite moment.",
  ],
  back: ["返回食材篮", "Back to ingredients"],
  today: ["今日魔法菜单", "Today’s spell"],
  start: ["点亮炉火，开始烹饪", "Light the stove"],
  prestart: [
    "准备好了吗？让这道美味动起来。",
    "Ready? Let’s bring this dish to life.",
  ],
  live: ["魔法进行中", "Magic in motion"],
  idle: ["等你点亮炉火", "Waiting for a little spark"],
  stopped: ["炉火暂歇，灵感不散", "The stove is resting"],
  failed: ["魔法遇到了一点小意外", "A little magical mishap"],
  retry: ["重新点亮炉火", "Try again"],
  ingredients: ["给锅里加点惊喜", "A pinch of possibility"],
  ingredientHint: [
    "加入真实食材，或试一味异世界的灵感。",
    "Something from the pantry, or a pinch of the impossible.",
  ],
  real: ["厨房食材", "From the pantry"],
  magic: ["魔法材料", "A little magic"],
  custom: ["也可以自己想一味…", "Dream up your own ingredient…"],
  add: ["加入", "Add"],
  adding: ["正在加料…", "Stirring it in…"],
  addHint: [
    "炉火点亮后，就可以随时加料啦。",
    "Once the stove is lit, add a new ingredient anytime.",
  ],
  added: ["这一锅的灵感", "In your cauldron"],
  original: ["原始食材", "The starting ingredients"],
  save: ["收藏这锅魔法", "Save this creation"],
  saved: ["已收入收藏", "Saved to your collection"],
  stop: ["收起炉火", "Stop cooking"],
  soundOn: ["开启声音", "Turn sound on"],
  soundOff: ["关闭声音", "Mute sound"],
  recording: ["下载录制视频", "Download recording"],
  replay: ["珍藏回放", "Saved replay"],
  recordingUnsupported: [
    "当前浏览器不支持录制视频，仍可观看直播并收藏画面与食材。",
    "This browser cannot record video. You can still watch live and save the image and ingredients.",
  ],
  remaining: ["本轮剩余", "Time left"],
  seconds: ["秒", "sec"],
  logout: ["离开厨房", "Leave kitchen"],
  page: ["页", "page"],
  previous: ["上一页", "Previous page"],
  next: ["下一页", "Next page"],
  savedRecipe: ["珍藏灵感", "Saved inspiration"],
  view: ["再来一锅", "Cook again"],
  wait: ["魔法正在酝酿", "Something lovely is brewing"],
  waitBody: [
    "正在为你准备厨房画面，请稍候。",
    "Preparing your kitchen scene. Just a little moment.",
  ],
  pausedBody: [
    "继续探索，下一锅会有什么惊喜？",
    "What will you discover in your next creation?",
  ],
  allCuisine: ["全部", "All cuisines"],
};
export function t(key: string) {
  return copy[key]?.[locale.value === "zh" ? 0 : 1] ?? key;
}
export const localized = (zh: string, en: string) =>
  locale.value === "zh" ? zh : en;

watch(
  locale,
  (value) => {
    localStorage.setItem("foodie-locale", value);
    document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
    document.title =
      value === "zh" ? "食界狂想 · Foodie World" : "Foodie World";
  },
  { immediate: true },
);
