/// <reference types="vite/client" />

import type { SoccerApi } from '@shared/types'

declare global {
  interface Window {
    soccerApi: SoccerApi
  }
}

export {}
