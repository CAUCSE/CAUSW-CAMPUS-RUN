import '@causw/core/styles'
import { createRoot } from 'react-dom/client'
import { AdminPage } from './AdminPage'

createRoot(document.getElementById('admin-root')!).render(<AdminPage />)
