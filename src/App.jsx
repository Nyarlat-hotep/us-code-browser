import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import TitleGrid from './components/TitleGrid'
import ChapterList from './components/ChapterList'
import ChapterView from './components/ChapterView'
import SearchResults from './components/SearchResults'
import DiffView from './components/DiffView'

function App() {
  return (
    <BrowserRouter basename="/us-code-browser">
      <Layout>
        <Routes>
          <Route path="/" element={<TitleGrid />} />
          <Route path="/title/:num" element={<ChapterList />} />
          <Route path="/title/:num/chapter/:slug" element={<ChapterView />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/compare" element={<DiffView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
