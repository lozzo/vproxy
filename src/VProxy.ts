import { FakeHttpsServer } from './FakeHttpsServer'
import { Context } from './Context'
import { ICAStore } from './CA'
import http from 'http'
import https from 'https'
import net from 'net'
import url from 'url'
import { EventEmitter } from 'events'

interface MitmProxyOptions {
    /**
     * 假的https服务器的端口
     */
    fakeServerPort?: number
    /**
     * http代理的端口
     */
    httpTunnelPort: number
    /**
     * 实现证书存储接口的接口，默认是使用文件放置到$HOME/.soveietironfist 目录下
     */
    caStore?: ICAStore
}
export interface VProxy extends EventEmitter {
    /**
     * 使用中间件，使用上类似于koa的中间件，也是一个洋葱模型，只不过没那么溜
     * @param middleware 中间件函数
     */
    // use(middleware: (cxt:Context) => void): this
}

export class VProxy extends EventEmitter {
    private httpTunnel: http.Server
    private fakeHttpsServer: FakeHttpsServer
    public middleware: Array<Function> = []
    constructor(httpTunnel: http.Server, fakeHttpsServer: FakeHttpsServer) {
        super()
        this.httpTunnel = httpTunnel
        this.fakeHttpsServer = fakeHttpsServer
        this.httpTunnel.on('connect', (req: http.IncomingMessage, cltSocket: net.Socket, head: Buffer) => {
            const srvUrl = url.parse(`https://${req.url}`)
            console.debug(`CONNECT ${srvUrl.hostname}:${srvUrl.port}`)
            const srvSocket = net.connect(fakeHttpsServer.port, '127.0.0.1', () => {
                cltSocket.write(
                    'HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: SOVITE-MITM-proxy\r\n' + '\r\n',
                )
                srvSocket.write(head)
                srvSocket.pipe(cltSocket)
                cltSocket.pipe(srvSocket)
                const clearup = () => {
                    cltSocket.unpipe()
                    srvSocket.unpipe()
                    cltSocket.removeAllListeners()
                    cltSocket.destroy()
                    srvSocket.removeAllListeners()
                    srvSocket.destroy()
                }
                cltSocket.on('error', (error) => {
                    clearup()
                })
                srvSocket.on('error', (error) => {
                    clearup()
                })
            })
        })
        this.httpTunnel.on('request', async (req: http.IncomingMessage, resp: http.ServerResponse) => {
            await this._request(req, resp, 'http')
        })
        this.fakeHttpsServer.on(
            'request',
            (req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'https') => {
                this._request(req, resp, protocol)
            },
        )
    }

    static async create(options: MitmProxyOptions) {
        const fakeHttpsServer = await FakeHttpsServer.create(options.fakeServerPort || 0, options.caStore)
        const httpTunnel = new http.Server()
        return new VProxy(httpTunnel, fakeHttpsServer)
    }

    private async _request(req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'http' | 'https') {
        const ctx = new Context({
            req,
            resp,
            protocol,
            app: this,
        })
        await ctx.next()
        ctx.resp.end()
    }

    async start() {
        return new Promise<void>((resv) => {
            this.httpTunnel.listen(8080, () => {
                resv()
            })
        })
    }
    public use(fn: (ctx: Context) => void) {
        this.middleware.push(fn)
        return this
    }
}

; (async () => {
    const a = await VProxy.create({
        fakeServerPort: 12345,
        httpTunnelPort: 8080,
    })
    a.use(async (ctx: Context) => {
        ctx.resp.write('1\r\n')
        await ctx.next()
        ctx.resp.write('6\r\n')
    })
        .use(async (ctx: Context) => {
            ctx.resp.write('2\r\n')
            await ctx.next()
            ctx.resp.write('5\r\n')
        })
        .use(async (ctx) => {
            ctx.resp.write('3\r\n')
        })
        .use(async (ctx) => {
            ctx.resp.write('4\r\n')
        })
    await a.start()
})()
