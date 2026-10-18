/** "claude-haiku-5-5" -> "Claude Haiku 5.5" */
export function modelLabel(id: string | null | undefined): string {
  if (!id) return "rules engine";
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?$/);
  if (!m) return id;
  return `Claude ${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

export function activeModel(): string | null {
  return process.env.ANTHROPIC_API_KEY ? process.env.SWITCHBOARD_MODEL ?? "claude-haiku-5-5" : null;
}
