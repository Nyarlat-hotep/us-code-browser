import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter basename="/us-code-browser">
      <Routes>
        <Route path="/" element={<div>Home placeholder</div>} />
        <Route path="/title/:num" element={<div>Chapter list placeholder</div>} />
        <Route path="/title/:num/chapter/:slug" element={<div>Chapter view placeholder</div>} />
        <Route path="/search" element={<div>Search placeholder</div>} />
        <Route path="/compare" element={<div>Compare placeholder</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
