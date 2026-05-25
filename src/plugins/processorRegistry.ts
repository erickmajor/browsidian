export type CodeBlockHandler = (
  source: string,
  el: HTMLElement,
  ctx: { sourcePath: string; frontmatter: Record<string, any> | null }
) => void | Promise<void>

export type PostProcessorHandler = (
  el: HTMLElement,
  ctx: { sourcePath: string; frontmatter: Record<string, any> | null }
) => void | Promise<void>

export type ViewCreator = (leaf: any) => any

interface CodeBlockEntry { handler: CodeBlockHandler; priority: number }
interface PostProcessorEntry { handler: PostProcessorHandler; priority: number }

export const codeBlockProcessors = new Map<string, CodeBlockEntry>()
export const markdownPostProcessors: PostProcessorEntry[] = []
export const registeredViews = new Map<string, ViewCreator>()
export const registeredExtensions = new Map<string, string>()

export function registerCodeBlockProcessor(
  language: string,
  handler: CodeBlockHandler,
  priority = 0
): void {
  codeBlockProcessors.set(language.toLowerCase(), { handler, priority })
}

export function registerPostProcessor(
  handler: PostProcessorHandler,
  priority = 0
): void {
  markdownPostProcessors.push({ handler, priority })
  markdownPostProcessors.sort((a, b) => a.priority - b.priority)
}

export function registerView(type: string, creator: ViewCreator): void {
  registeredViews.set(type, creator)
}

export function registerExtension(ext: string, viewType: string): void {
  registeredExtensions.set(ext.toLowerCase(), viewType)
}
