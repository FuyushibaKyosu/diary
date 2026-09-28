export const blocks = [
  {
    id: "text",
    label: "正文",
    description: "从一段普通文字开始",
    keywords: "text paragraph wenben zhengwen",
  },
  {
    id: "h1",
    label: "一级标题",
    description: "醒目的大标题",
    keywords: "heading h1 title biaoti 1",
  },
  {
    id: "h2",
    label: "二级标题",
    description: "划分文章的小节",
    keywords: "heading h2 title biaoti 2",
  },
  {
    id: "h3",
    label: "三级标题",
    description: "更细一级的小标题",
    keywords: "heading h3 title biaoti 3",
  },
  {
    id: "bullet",
    label: "无序列表",
    description: "逐条记录想法",
    keywords: "bullet list ul liebiao wuxu",
  },
  {
    id: "ordered",
    label: "有序列表",
    description: "按顺序列出步骤",
    keywords: "ordered numbered list ol liebiao youxu",
  },
  {
    id: "task",
    label: "待办清单",
    description: "可以勾选的任务",
    keywords: "todo task checklist daiban",
  },
  {
    id: "quote",
    label: "引用",
    description: "摘录一句值得留下的话",
    keywords: "quote blockquote yinyong",
  },
  {
    id: "code",
    label: "代码块",
    description: "保留缩进的代码或文字",
    keywords: "code pre daima",
  },
  {
    id: "divider",
    label: "分隔线",
    description: "让内容自然分段",
    keywords: "divider hr line fengexian",
  },
  {
    id: "image",
    label: "图片",
    description: "从设备上传图片",
    keywords: "image photo picture tupian",
  },
] as const;

export type BlockId = (typeof blocks)[number]["id"];

// Only a slash at the start of a text block is a command; URLs and prose are not.
export function slashQuery(textBeforeCursor: string): string | null {
  return /^\/([^/\n]{0,40})$/.exec(textBeforeCursor)?.[1] ?? null;
}

export function filterBlocks(query: string) {
  const term = query.trim().toLowerCase();
  return blocks.filter((block) =>
    `${block.label} ${block.keywords}`.toLowerCase().includes(term),
  );
}
