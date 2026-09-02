import '@causw/core/styles'
import { createRoot } from 'react-dom/client'
import { LobbyPage } from './LobbyPage'

createRoot(document.getElementById('lobby-root')!).render(<LobbyPage />)
