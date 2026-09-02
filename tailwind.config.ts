import type { Config } from 'tailwindcss'
import { causwPreset } from '@causw/tokens/config'

export default {
  content: ['./index.html', './play.html', './result.html', './src/**/*.{ts,tsx}'],
  presets: [causwPreset],
} satisfies Config
