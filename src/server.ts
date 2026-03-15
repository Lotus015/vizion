import express from 'express'
import 'dotenv/config'
import { generateRoute } from './routes/generate'
import { refineRoute } from './routes/refine'
import { dataRoute } from './routes/data'

const app = express()
app.use(express.json())

app.post('/api/generate', generateRoute)
app.post('/api/refine', refineRoute)
app.get('/api/data', dataRoute)
app.options('/api/data', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(204).end()
})
app.get('/health', (_, res) => res.json({ ok: true, service: 'vizion' }))

app.listen(process.env.PORT ?? 3000, () =>
  console.log(`vizion running on :${process.env.PORT ?? 3000}`)
)
