export function isApiEnabled(): boolean {
  return import.meta.env.VITE_TYPING_GAME_API_ENABLED !== 'false'
}
