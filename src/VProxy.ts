import { FakeHttpsServer } from './FakeHttpsServer'
import { Context } from './Context'
import { ICAStore } from './CA'
import http from 'http'
import https from 'https'
import net from 'net'
import url from 'url'
import { EventEmitter } from 'events'
import fs from 'fs'
import { getPipeline } from './middleware/pipeline'
import initCycleTLS from 'cycletls';

interface MitmProxyOptions {
    /**
     * 假的https服务器的端口,用于转发https请求和响应，如果不设置则会随机启动一个
     */
    fakeServerPort?: number
    /**
     * http代理的端口,对外使用的
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
    use(middleware: MiddlewareFunc): this
}

export type MiddlewareFunc = (ctx: Context) => Promise<void>

export class VProxy extends EventEmitter {
    private httpTunnel: http.Server
    private fakeHttpsServer: FakeHttpsServer
    public middleware: Array<MiddlewareFunc> = []
    constructor(httpTunnel: http.Server, fakeHttpsServer: FakeHttpsServer) {
        super()
        this.httpTunnel = httpTunnel
        this.fakeHttpsServer = fakeHttpsServer
        this.httpTunnel.on('connect', (req: http.IncomingMessage, cltSocket: net.Socket, head: Buffer) => {
            const srvUrl = url.parse(`https://${req.url}`)
            console.debug(`CONNECT ${srvUrl.hostname}:${srvUrl.port}`)
            const srvSocket = net.connect(fakeHttpsServer.port, 'a.test.com', () => {
                cltSocket.write('HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: VPROXY-MITM\r\n' + '\r\n')
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
        const vproxyIns = new VProxy(httpTunnel, fakeHttpsServer)
        console.log(`fake https server port: ${fakeHttpsServer.port}`)
        console.log(`http tunnel port: ${options.httpTunnelPort}`)
        return vproxyIns
    }

    private async _request(req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'http' | 'https') {
        const ctx = new Context({
            req,
            resp,
            protocol,
            app: this,
        })
        ctx.resp.setHeader('VProxy', 'true')
        await ctx.next()
    }

    async start() {
        return new Promise<void>((resv) => {
            this.httpTunnel.listen(8081, () => {
                resv()
            })
        })
    }
    public use(fn: MiddlewareFunc) {
        this.middleware.push(fn)
        return this
    }
}

; (async () => {
    const a = await VProxy.create({
        httpTunnelPort: 8081,
    })
    const cycleTLS = await initCycleTLS();
    const pipeline = getPipeline({
        timeOut: 2000,
        maxHttpSockets: 4,
        maxHttpsSockets: 4
    })

    const cycleTLSProxy = async (ctx: Context) => {
        const { req, resp } = ctx
        const getBody = async (req: http.IncomingMessage) => {
            return new Promise<string>((resv) => {
                let body: any[] = [];
                req.on('data', (chunk) => {
                    body.push(chunk);
                })
                req.on('end', () => {
                    let _body = Buffer.concat(body).toString();
                    resv(_body)
                });
            })
        }

        const url = `${ctx.protocol}://${req.headers.host}${req.url}`
        console.log(`request url: ${url}, method: ${req.method}`)
        delete req.headers['accept-encoding']
        delete req.headers['content-length']
        const options = {
            url: url,
            method: req.method,
            headers: req.headers,
            body: await getBody(req),
            ja3: '771,49196-49195-49200-49199-159-158-49188-49187-49192-49191-49162-49161-49172-49171-157-156-61-60-53-47-10,0-10-11-13-35-23-65281,29-23-24,0',
            userAgent: req.headers['user-agent'] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",

        }

        // const _resp = await https.p
        const _resp = await cycleTLS(url, options)
        // 删除一些不必要的头
        if (_resp.headers['Content-Encoding'] === 'gzip') {
            delete _resp.headers['Content-Encoding']
            delete _resp.headers['Content-Length']
            delete _resp.headers['Etag']
        }
        if (_resp.headers['Content-Length']) {
            delete _resp.headers['Content-Length']
        }
        delete _resp.headers['Transfer-Encoding']
        if (_resp.headers['content-encoding'] === 'gzip') {
            delete _resp.headers['content-encoding']
            delete _resp.headers['content-length']
            delete _resp.headers['etag']
        }
        resp.writeHead(_resp.status || 200, _resp.headers)
        if (_resp.status !== 200) {
            debugger
        }
        const xbody = typeof _resp.body === 'string' ? _resp.body : JSON.stringify(_resp.body)
        resp.end(xbody)
        if (req.url?.indexOf('ic-logo.svg') !== -1) {
            console.log(1)
        }
    }



    const filter = async (ctx: Context) => {
        if (ctx.req.url === '/' && ctx.req.headers.host === 'www.ti.com.cn') {
            // ctx.resp.setHeader('Content-Type', 'text/html')
            ctx.resp.write(fs.readFileSync('/home/lozzow/workdir/vproxy/px(4).html'))
            return ctx.abort()
        }
        await ctx.next()
    }
    a.use(filter).use(pipeline)
    await a.start()
})()
