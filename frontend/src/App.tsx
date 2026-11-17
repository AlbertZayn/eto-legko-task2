import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CampaignEditorPage } from './pages/CampaignEditorPage'
import { CreateCampaignPage } from './pages/CreateCampaignPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateCampaignPage />} />
        <Route path="/campaigns/:id" element={<CampaignEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
