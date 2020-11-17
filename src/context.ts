import http from "http"

export class Context {
    public req: http.IncomingMessage
    public resp: http.ServerResponse
    public protocol: 'http' | 'https'
    /**
     * 构造一个上下文，在一次代理的中间的一个上下文
     * @param req 请求对象
     * @param resp 响应对象
     * @param protocol 请求协议
     */
    constructor(req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'http' | 'https'){
        this.req = req
        this.resp = resp
        this.protocol = protocol
    }
}