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
    private mIndex = 0
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
        while (this.mIndex < this.app.middleware.length) {
            const fn = this.app.middleware[this.mIndex]
            this.mIndex += 1
            await fn(this)
        }
    }
}
