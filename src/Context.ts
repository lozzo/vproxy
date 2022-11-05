import http from 'http'
import { VProxy } from './VProxy'

interface IContextOptions {
    req: http.IncomingMessage
    resp: http.ServerResponse
    protocol: 'http' | 'https'
    app: VProxy
}

export class Context {
    public req: http.IncomingMessage
    public resp: http.ServerResponse
    public protocol: 'http' | 'https'
    private app: VProxy
    private middlewareIndex = 0
    /**
     * 构造一个上下文，在一次代理的中间的一个上下文
     * @param req 请求对象
     * @param resp 响应对象
     * @param protocol 请求协议
     */
    constructor(options: IContextOptions) {
        this.req = options.req
        this.resp = options.resp
        this.protocol = options.protocol
        this.app = options.app
    }
    public async next() {
        while (this.middlewareIndex < this.app.middleware.length) {
            const fn = this.app.middleware[this.middlewareIndex]
            this.middlewareIndex += 1
            await fn(this)
        }
        this.abort()
    }
    get isAbort(): Boolean {
        return this.middlewareIndex > this.app.middleware.length
    }
    abort() {
        this.middlewareIndex = this.app.middleware.length + 1
    }
    abortWithStatus(code: number) {
        this.resp.statusCode = code
        this.abort()
    }
}
