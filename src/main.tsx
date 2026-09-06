import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import 'antd/dist/reset.css'
import { App } from './app/App'
import './styles/global.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
