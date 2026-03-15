import express from 'express'
import 'dotenv/config'
import { generateRoute } from './routes/generate'
import { refineRoute } from './routes/refine'
import { dataRoute } from './routes/data'
import { dataStreamRoute } from './routes/data-stream'
import { dataWriteRoute } from './routes/data-write'

const app = express()
app.use(express.json())

// CORS preflight for all /api/data routes
app.options('/api/data', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(204).end()
})

app.post('/api/generate', generateRoute)
app.post('/api/refine', refineRoute)
app.get('/api/data', dataRoute)
app.get('/api/data/stream', dataStreamRoute)
app.post('/api/data', dataWriteRoute)
app.get('/health', (_, res) => res.json({ ok: true, service: 'vizion' }))

app.listen(process.env.PORT ?? 3000, () =>
  console.log(`vizion running on :${process.env.PORT ?? 3000}`)
)
