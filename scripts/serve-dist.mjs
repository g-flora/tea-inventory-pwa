import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize } from 'node:path'

const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '0.0.0.0'
const root = join(process.cwd(), 'dist')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const requestedPath = join(root, safePath)
  const filePath = existsSync(requestedPath) && (await stat(requestedPath)).isFile()
    ? requestedPath
    : join(root, 'index.html')

  response.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath).pipe(response)
}).listen(port, host, () => {
  console.log(`Static preview: http://localhost:${port}`)
  for (const address of getLocalIpv4Addresses()) {
    console.log(`Phone preview:  http://${address}:${port}`)
  }
})

function getLocalIpv4Addresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((network) => network?.family === 'IPv4' && !network.internal)
    .map((network) => network.address)
}
