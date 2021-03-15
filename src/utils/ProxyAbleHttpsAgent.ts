import https from 'https'
import tls from 'tls'
import net from 'net'
import url from 'url'
import http from 'http'

interface ProxyAbleHttpsAgentOPtions {
    host: string
    port: number
    headers: http.IncomingHttpHeaders
    servername: string
}
export class ProxyAbleHttpsAgent extends https.Agent {
    private static _keybuf = Buffer.from('\r\n\r\n')
    private static _okcode = Buffer.from('200')

    private _proxy?: { host: string; port: number }

    constructor(options?: https.AgentOptions) {
        super(options)
    }
    public createConnection(
        opts: ProxyAbleHttpsAgentOPtions,
        callback: (err?: Error | null, stream?: net.Socket | null) => void,
    ) {
        if (!this._proxy) {
            const sock = tls.connect({
                host: opts.host,
                port: opts.port,
                rejectUnauthorized: false,
            })
            callback(null, sock)
            return
        }
        const onerror = (err: Error) => {
            cleanup()
            callback(err)
        }
        let socket = net.connect(this._proxy)

        const buf = Buffer.allocUnsafeSlow(256)
        let buffersLength = 0
        const ondata = (b: Buffer) => {
            b.copy(buf, buffersLength, 0, b.length)
            buffersLength += b.length
            if (!buf.includes(ProxyAbleHttpsAgent._keybuf)) {
                socket.readable ? read() : socket.once('data', ondata)
                return
            }
            const okCode = buf.slice(0, 16).includes(ProxyAbleHttpsAgent._okcode, 0)
            if (okCode) {
                socket.removeAllListeners()
                socket = tls.connect({
                    host: opts.servername,
                    socket: socket,
                    rejectUnauthorized: false,
                })
                callback(null, socket)
            } else {
                cleanup()
                callback(new Error('porxy connect error'), undefined)
            }
        }
        const read = () => {
            const b = socket.read()
            b ? ondata(b) : socket.once('readable', read)
        }

        const cleanup = () => {
            socket.removeAllListeners()
            socket.destroy()
        }
        socket.on('error', onerror)
        socket.readable ? read() : socket.once('data', ondata)

        const rawHeaders = opts.headers
        const hostname = rawHeaders['Host']
        let msg = 'CONNECT ' + hostname + ' HTTP/1.1\r\n'
        const headers = Object.assign({}, rawHeaders)
        Object.keys(headers).forEach(function (name) {
            msg += name + ': ' + headers[name] + '\r\n'
        })
        socket.write(msg + '\r\n')
    }
    /**
     * 给agent设置目标代理地址
     * @param proxyUrl 代理的地址
     */
    public setProxy(proxyUrl: string | undefined) {
        if (proxyUrl) {
            const _proxy = url.parse(proxyUrl)
            if (_proxy.hostname && _proxy.port) {
                this._proxy = { host: _proxy.hostname, port: +_proxy.port }
            }
        } else {
            this._proxy = undefined
        }
    }
}
