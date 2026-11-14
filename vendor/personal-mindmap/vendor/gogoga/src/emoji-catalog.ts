export interface EmojiCategory {
  id: string;
  name: string;
  emojis: string[];
}

/** Quick picks shown above the categories, matching the study-workflow order. */
export const COMMON_ICONS = [
  "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣",
  "✅", "❌", "⏳", "📅", "🕐", "📋", "🎁", "💡", "🪄", "📖", "❤️",
  "⭐", "❗", "❓", "🔥", "📌", "🚩",
];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "face", name: "表情 & 人物",
    emojis: ["😀", "😄", "😊", "🙂", "😉", "😍", "🤔", "🤨", "😮", "😢", "😡", "😴", "🤯", "🥳", "🤓", "🧐", "🙈", "🙉", "🤖", "👻", "👤", "👥", "💪", "👍", "👎", "👏", "🙏", "🧠"],
  },
  {
    id: "nature", name: "动物 & 自然",
    emojis: ["🌱", "🌿", "🍀", "🌵", "🌲", "🌸", "🌻", "🌈", "☀️", "🌙", "⭐", "🌟", "⚡", "❄️", "🔥", "💧", "🌊", "🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦋", "🐝", "🐞", "🐢", "🐍", "🐙", "🦀", "🐟", "🐬", "🐳"],
  },
  {
    id: "food", name: "食物 & 饮料",
    emojis: ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥕", "🌽", "🍞", "🧀", "🍗", "🍖", "🍔", "🍟", "🍕", "🍜", "🍣", "🍰", "🍩", "🍪", "🍫", "🍬", "☕", "🍵", "🥤", "🍺", "🍷"],
  },
  {
    id: "activity", name: "活动",
    emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🏸", "🥊", "🎯", "🎮", "🎲", "🧩", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎸", "🎻", "🏆", "🥇", "🥈", "🥉", "🎉", "🎊", "🎈"],
  },
  {
    id: "travel", name: "旅行 & 地点",
    emojis: ["🚗", "🚕", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚲", "🛴", "🚂", "✈️", "🚀", "🚁", "⛵", "🚢", "🏠", "🏡", "🏢", "🏥", "🏫", "🏛️", "🏰", "⛰️", "🏔️", "🌋", "🏖️", "🏝️", "🗺️", "🧭"],
  },
  {
    id: "object", name: "物品",
    emojis: ["💻", "🖥️", "⌨️", "🖱️", "📱", "☎️", "📷", "🎥", "📺", "📻", "⏰", "⌚", "💡", "🔦", "🔋", "🔌", "💾", "💿", "📀", "📦", "📫", "📮", "✏️", "🖊️", "🖋️", "📝", "📄", "📃", "📚", "📕", "📗", "📘", "📙", "📓", "📔", "📒", "📖", "🔖", "📌", "📎", "✂️", "🔒", "🔑", "🔨", "🛠️", "⚙️", "🧪", "🧬", "🔬", "🔭", "💊", "💉", "🩺", "🧰", "🧲", "💰", "💳", "🧾"],
  },
  {
    id: "symbol", name: "符号",
    emojis: ["✅", "❌", "⭕", "❗", "❓", "⚠️", "♻️", "✳️", "❇️", "©️", "®️", "™️", "🔰", "🔱", "〽️", "⚜️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "💠"],
  },
  {
    id: "flag", name: "旗帜",
    emojis: ["🚩", "🏳️", "🏴", "🏁", "🎌", "🏳️‍🌈"],
  },
];

const KEYWORDS: Record<string, string> = {
  "1️⃣": "一 第一 优先级1 one first priority",
  "2️⃣": "二 第二 优先级2 two second priority",
  "3️⃣": "三 第三 优先级3 three third priority",
  "4️⃣": "四 第四 优先级4 four fourth priority",
  "5️⃣": "五 第五 优先级5 five fifth priority",
  "✅": "完成 正确 对 勾 通过 check done yes correct",
  "❌": "错误 不对 错 叉 失败 wrong no fail",
  "⏳": "等待 进行中 时间 hourglass wait pending",
  "📅": "日期 日历 计划 date calendar plan",
  "🕐": "时间 时钟 几点 time clock",
  "📋": "清单 列表 任务 clipboard list task",
  "🎁": "礼物 奖励 gift reward",
  "💡": "想法 提示 重点 idea tip light",
  "🪄": "魔法 技巧 记忆 magic trick",
  "📖": "书 阅读 学习 book read study",
  "❤️": "喜欢 心 重点 love heart",
  "⭐": "星 重点 收藏 star favorite",
  "🌟": "亮点 重点 星 star highlight",
  "❗": "重要 感叹 注意 important",
  "❓": "问题 疑问 不懂 question",
  "🔥": "热门 重要 火 fire hot",
  "📌": "固定 重点 标记 pin",
  "🚩": "旗帜 目标 重点 flag goal",
  "🧠": "记忆 大脑 思考 brain memory",
  "🩺": "诊断 医疗 医生 stethoscope doctor",
  "💊": "药 药物 medicine pill",
  "💉": "针 注射 injection",
  "🧪": "实验 化学 experiment lab",
  "🔬": "显微镜 研究 microscope",
  "📝": "笔记 记录 写作 note write",
  "🔍": "查找 搜索 search",
  "🔒": "锁定 秘密 lock",
  "🔑": "钥匙 关键 key",
  "⚠️": "警告 注意 warning",
  "🎯": "目标 重点 target",
  "🏆": "冠军 完成 奖杯 trophy",
  "🥇": "第一 金牌 gold",
  "🗺️": "地图 路线 map",
  "🧭": "方向 指南针 compass",
  "📚": "书 学习 知识 books",
  "🔖": "书签 标记 bookmark",
  "✂️": "剪切 删除 scissors cut",
  "⚙️": "设置 齿轮 settings gear",
  "🧩": "拼图 组合 puzzle",
  "🎨": "颜色 设计 art",
  "🎬": "视频 电影 movie",
  "🎵": "音乐 music",
  "💻": "电脑 工作 computer",
  "📱": "手机 phone",
  "☕": "咖啡 休息 coffee",
  "🍵": "茶 休息 tea",
  "🌱": "学习 成长 新芽 sprout",
  "🌈": "希望 彩虹 rainbow",
  "☀️": "太阳 白天 sun",
  "🌙": "月亮 晚上 moon",
  "🐱": "猫 cat",
  "🐶": "狗 dog",
  "🙈": "答案 遮挡 背诵 answer recite",
};

const CATEGORY_OF = new Map<string, string>();
for (const category of EMOJI_CATEGORIES) {
  for (const emoji of category.emojis) if (!CATEGORY_OF.has(emoji)) CATEGORY_OF.set(emoji, category.name);
}

const ALL_EMOJIS = [...new Set([...COMMON_ICONS, ...EMOJI_CATEGORIES.flatMap(category => category.emojis)])];

function isEmoji(segment: string): boolean {
  return /^(?:\p{Extended_Pictographic}|[0-9#*]\uFE0F?\u20E3)/u.test(segment);
}

/** Split the leading emoji markers from the rest of a node's text. */
export function splitLeadingIcons(text: string): { icons: string[]; rest: string } {
  type Seg = { segment(s: string): Iterable<{ segment: string }> };
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => Seg }).Segmenter;
  const parts = Segmenter
    ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(part => part.segment)
    : Array.from(text);
  const icons: string[] = [];
  let index = 0;
  while (index < parts.length) {
    const part = parts[index];
    if (/^\s+$/.test(part)) {
      index++;
      continue;
    }
    if (!isEmoji(part)) break;
    icons.push(part);
    index++;
  }
  return { icons, rest: parts.slice(index).join("").replace(/^\s+/, "") };
}

/** Toggle a plain leading emoji. Canvas layers group-exclusive markers on top. */
export function togglePlainIcon(text: string, emoji: string): string {
  if (!emoji) return text;
  const { icons, rest } = splitLeadingIcons(text);
  const next = icons.includes(emoji) ? icons.filter(icon => icon !== emoji) : [...icons, emoji];
  return [...next, rest].filter(Boolean).join(" ");
}

export function clearNodeIcons(text: string): string {
  return splitLeadingIcons(text).rest;
}

/** Search by Chinese/English keywords, category name, or a pasted emoji. */
export function searchIcons(query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return ALL_EMOJIS;
  if (isEmoji(needle)) return [needle, ...ALL_EMOJIS.filter(emoji => emoji !== needle)];
  return ALL_EMOJIS.filter(emoji => {
    const keywords = KEYWORDS[emoji] ?? "";
    const category = CATEGORY_OF.get(emoji) ?? "";
    return keywords.toLocaleLowerCase().includes(needle) || category.toLocaleLowerCase().includes(needle);
  });
}
