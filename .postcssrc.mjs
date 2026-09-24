import tailwindcss from '@tailwindcss/postcss'
import { capraTokenPostcssPlugin } from '@capra/dx-tokens-postcss-plugin'
import { allTokens } from '@capra/theme/dx/tokens-minimal'

export default {
  plugins: [tailwindcss(), capraTokenPostcssPlugin({ tokens: allTokens })],
}
